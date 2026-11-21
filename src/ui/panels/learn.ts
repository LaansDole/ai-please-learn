import type { RewardConfig } from '../../env/types';
import { resolveConfig } from '../../learner/config';
import { argmax } from '../../learner/policy';
import { loadRunPrefs } from '../../persist/storage';
import { createOutputsBar } from '../../viz/barChart';
import { createLineChart, type ChartMarker } from '../../viz/lineChart';
import { stackShares } from '../../viz/scale';
import { createStackedArea } from '../../viz/stackedArea';
import { h } from '../dom';
import type { Session } from '../session';
import { createHallOfFame } from './hallOfFame';
import { createSpeedBar } from './speedBar';
import { createStatsStrip } from './statsStrip';

/** "hit 1 -> 2, score 5 -> 0" for the weights that differ. */
function weightChanges(prev: RewardConfig, next: RewardConfig): string {
  const keys = Object.keys({ ...prev.weights, ...next.weights }).filter((k) => prev.weights[k] !== next.weights[k]);
  return keys.map((k) => `${k} ${prev.weights[k] ?? '-'} -> ${next.weights[k] ?? '-'}`).join(', ') || 'weights changed';
}

/** Step 4, everything below the stage: run controls, stats, charts and the outputs bar. */
export function createLearnPanel(session: Session): { lower: HTMLElement; dispose(): void } {
  const { spec } = session, prefs = loadRunPrefs(spec);
  const start = () => {
    session.start(resolveConfig(prefs.learner, spec, { populationSize: prefs.population }), prefs.seed);
    session.setSpeed(prefs.speed);
  };
  const speedBar = createSpeedBar(session, prefs, start), stats = createStatsStrip(session);
  const fitness = createLineChart({
    testid: 'fitness-chart', title: 'Fitness',
    series: [
      { key: 'best', label: 'best', color: '--series-best' },
      { key: 'mean', label: 'mean', color: '--series-mean', dash: [6, 4] },
      { key: 'median', label: 'median', color: '--series-median', dash: [2, 3] },
    ],
  });
  const species = createStackedArea({ testid: 'species-chart', title: 'Species (share of population)' });
  const discrete = spec.action.type === 'discrete';
  const outputs = createOutputsBar(spec.action.type === 'candidates' ? [spec.action.scoreLabel] : spec.action.labels);
  const hof = createHallOfFame(session);
  const bottom = h('div', { class: 'learn-row' }, hof.el, h('section', { class: 'panel' }, h('h3', null, 'Outputs'), outputs.el));
  const lower = h('div', { class: 'learn' }, speedBar.el, stats.el, h('div', { class: 'learn-row' }, fitness.el, species.el), bottom);

  // Marker labels: the reward in force when a marker first shows up, against the one before it.
  const markerLabels = new Map<number, string>();
  let lastReward = session.reward, raf = 0;
  const render = () => {
    raf = 0;
    const hist = session.history;
    if (session.rewardMarkers.length === 0) { markerLabels.clear(); lastReward = session.reward; }
    const markers: ChartMarker[] = session.rewardMarkers.map((x) => {
      if (!markerLabels.has(x)) { markerLabels.set(x, weightChanges(lastReward, session.reward)); lastReward = session.reward; }
      return { x, label: markerLabels.get(x)! };
    });
    fitness.setData(hist.map((s) => s.iteration), { best: hist.map((s) => s.best), mean: hist.map((s) => s.mean), median: hist.map((s) => s.median) }, markers);
    const shares = stackShares(hist.flatMap((s) => (s.neat ? [s.neat] : [])));
    species.setData(shares.ids, shares.rows);
  };
  // History can grow hundreds of times per second at MAX; charts repaint once per frame.
  const offChange = session.onChange(() => { if (!raf) raf = requestAnimationFrame(render); });
  const offFrame = session.on('frame', (m) => { if (m.outputs) outputs.set(m.outputs, discrete ? argmax(m.outputs) : undefined); });
  render();

  return {
    lower,
    dispose() { cancelAnimationFrame(raf); offChange(); offFrame(); speedBar.dispose(); stats.dispose(); hof.dispose(); },
  };
}
