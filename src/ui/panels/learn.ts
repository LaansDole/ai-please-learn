import type { RewardConfig } from '../../env/types';
import { argmax } from '../../learner/policy';
import type { RunPrefs } from '../../persist/storage';
import { createOutputsBar } from '../../viz/barChart';
import { createLineChart, type ChartMarker } from '../../viz/lineChart';
import { sampleEvenly, stackShares } from '../../viz/scale';
import { createStackedArea } from '../../viz/stackedArea';
import { h } from '../dom';
import type { RunInfo, Session } from '../session';
import { createHallOfFame } from './hallOfFame';
import { createRlPanels } from './rlPanels';
import { createSpeedBar } from './speedBar';
import { createStatsStrip } from './statsStrip';

/** "hit 1 -> 2, score 5 -> 0" for the weights that differ. */
function weightChanges(prev: RewardConfig, next: RewardConfig): string {
  const keys = Object.keys({ ...prev.weights, ...next.weights }).filter((k) => prev.weights[k] !== next.weights[k]);
  return keys.map((k) => `${k} ${prev.weights[k] ?? '-'} -> ${next.weights[k] ?? '-'}`).join(', ') || 'weights changed';
}

const SPECIES_COLUMNS = 240, SMOOTHING = 0.9;
type Column = (number | null)[];

/** Step 4, everything below the stage: run controls, stats, charts and the outputs bar. `start` begins a run from `prefs`. */
export function createLearnPanel(session: Session, prefs: RunPrefs, start: () => void): { lower: HTMLElement; refresh(): void; dispose(): void } {
  const { spec } = session;
  const speedBar = createSpeedBar(session, prefs, start), stats = createStatsStrip(session, prefs);
  const fitness = createLineChart({
    testid: 'fitness-chart', title: 'Fitness',
    series: [
      { key: 'episode', label: 'episode', color: '--muted', dots: true },
      { key: 'best', label: 'best', color: '--series-best' },
      { key: 'mean', label: 'mean', color: '--series-mean', dash: [6, 4] },
      { key: 'median', label: 'median', color: '--series-median', dash: [2, 3] },
      { key: 'smoothed', label: 'smoothed', color: '--text' },
    ],
  });
  const species = createStackedArea({ testid: 'species-chart', title: 'Species (share of population)' });
  const rlPanels = createRlPanels(session);
  const discrete = spec.action.type === 'discrete';
  const outputs = createOutputsBar(spec.action.type === 'candidates' ? [spec.action.scoreLabel] : spec.action.labels);
  const outputsTitle = h('h3', null, 'Outputs');
  const hof = createHallOfFame(session);
  const bottom = h('div', { class: 'learn-row' }, hof.el, h('section', { class: 'panel' }, outputsTitle, outputs.el));
  const lower = h('div', { class: 'learn' }, speedBar.el, stats.el, h('div', { class: 'learn-row' }, fitness.el, species.el, rlPanels.el), bottom);

  // DQN/PPO: one x position per finished episode. Appended to as history grows; a new run starts over.
  const rl = { run: null as RunInfo | null, n: 0, seen: false, smooth: 0, x: [] as number[], episode: [] as Column, smoothed: [] as Column, best: [] as Column, mean: [] as Column, median: [] as Column };
  const extendRl = () => {
    const hist = session.history;
    if (rl.run !== session.run || hist.length < rl.n) {
      rl.run = session.run; rl.n = 0; rl.seen = false;
      for (const col of [rl.x, rl.episode, rl.smoothed, rl.best, rl.mean, rl.median]) col.length = 0;
    }
    for (; rl.n < hist.length; rl.n++) {
      const s = hist[rl.n]!, returns = s.rl?.returns ?? [];
      const point = (x: number, ret: number | null) => {
        if (ret !== null) { rl.smooth = rl.seen ? SMOOTHING * rl.smooth + (1 - SMOOTHING) * ret : ret; rl.seen = true; }
        rl.x.push(x); rl.episode.push(ret); rl.smoothed.push(rl.seen ? rl.smooth : null);
        rl.best.push(s.best); rl.mean.push(s.mean); rl.median.push(s.median);
      };
      if (returns.length === 0) point(s.iteration, null);              // a PPO update in which no episode ended
      else returns.forEach((ret, k) => point(s.iteration - 1 + (k + 1) / returns.length, ret));
    }
  };

  // Marker labels: the reward in force when a marker first shows up, against the one before it.
  const markerLabels = new Map<number, string>();
  let lastReward = session.reward, raf = 0;
  const render = () => {
    raf = 0;
    const hist = session.history, kind = session.run?.learner.kind ?? prefs.learner;
    if (session.rewardMarkers.length === 0) { markerLabels.clear(); lastReward = session.reward; }
    const markers: ChartMarker[] = session.rewardMarkers.map((x) => {
      if (!markerLabels.has(x)) { markerLabels.set(x, weightChanges(lastReward, session.reward)); lastReward = session.reward; }
      return { x, label: markerLabels.get(x)! };
    });
    species.el.hidden = kind !== 'neat'; rlPanels.el.hidden = kind === 'neat';
    outputsTitle.textContent = kind === 'neat' ? 'Output activations' : kind === 'dqn' ? 'Q-values' : discrete ? 'Action probabilities' : 'Action means';
    if (kind !== 'neat') {
      extendRl();
      fitness.setData(rl.x, { episode: rl.episode, smoothed: rl.smoothed, best: rl.best, mean: rl.mean, median: rl.median }, markers);
      rlPanels.update();
      return;
    }
    fitness.setData(hist.map((s) => s.iteration), { best: hist.map((s) => s.best), mean: hist.map((s) => s.mean), median: hist.map((s) => s.median) }, markers);
    // Long runs are drawn from a bounded sample of generations: the chart is ~500 px wide and repaints every frame at MAX.
    const neat = hist.flatMap((s) => (s.neat ? [s.neat] : []));
    const shares = stackShares(sampleEvenly(neat, SPECIES_COLUMNS));
    species.setData(shares.ids, shares.rows, neat.length);
  };
  // History can grow hundreds of times per second at MAX; charts repaint once per frame.
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  const offChange = session.onChange(schedule);
  const offFrame = session.on('frame', (m) => { if (m.outputs) outputs.set(m.outputs, discrete ? argmax(m.outputs) : undefined); });
  render();

  return {
    lower,
    refresh() { speedBar.refresh(); stats.refresh(); schedule(); },
    dispose() { cancelAnimationFrame(raf); offChange(); offFrame(); speedBar.dispose(); stats.dispose(); hof.dispose(); rlPanels.dispose(); },
  };
}
