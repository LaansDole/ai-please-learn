import type { RewardConfig } from '../../env/types';
import { argmax } from '../../learner/policy';
import { iterationLabel } from '../../learner/types';
import type { RunPrefs } from '../../persist/storage';
import { createOutputsBar } from '../../viz/barChart';
import { createLineChart, type ChartMarker } from '../../viz/lineChart';
import { runningBest, sampleEvenly, speciesBands } from '../../viz/scale';
import { createStackedArea } from '../../viz/stackedArea';
import { trend, verdict, type Mark } from '../../viz/trend';
import { fmt, h } from '../dom';
import type { RunInfo, Session } from '../session';
import { createHallOfFame } from './hallOfFame';
import { createRlPanels } from './rlPanels';
import { createSpeedBar } from './speedBar';
import { createStatsStrip } from './statsStrip';
import { createTower } from './tower';

/** "hit 1 -> 2, score 5 -> 0" for the weights that differ. */
function weightChanges(prev: RewardConfig, next: RewardConfig): string {
  const keys = Object.keys({ ...prev.weights, ...next.weights }).filter((k) => prev.weights[k] !== next.weights[k]);
  return keys.map((k) => `${k} ${prev.weights[k] ?? '-'} -> ${next.weights[k] ?? '-'}`).join(', ') || 'weights changed';
}

const SPECIES_COLUMNS = 240, SMOOTHING = 0.9, STRIP = 60;
const STRIP_KEY: [Mark, string][] = [['rec', 'new record'], ['imp', 'improved'], ['flat', 'no gain']];
type Column = (number | null)[];

/**
 * Step 4 around the stage. `upper`: the run header (iteration, verdict, last-60 strip) and the stats row. `tower`: standings
 * and recent iterations. `controls`: the run controls under the stage. `lower`: the charts. `start` begins a run from `prefs`.
 */
export function createLearnPanel(session: Session, prefs: RunPrefs, start: () => void): { upper: HTMLElement; tower: HTMLElement; controls: HTMLElement; lower: HTMLElement; refresh(): void; dispose(): void } {
  const { spec } = session;
  const speedBar = createSpeedBar(session, prefs, start), stats = createStatsStrip(session, prefs);
  const fitness = createLineChart({
    testid: 'fitness-chart', title: 'Fitness', yLabel: 'fitness',
    series: [
      { key: 'episode', label: 'episode', color: '--muted', dots: true },
      { key: 'best', label: 'champion', color: '--muted', faint: true },
      { key: 'mean', label: 'mean', color: '--series-mean', dash: [2, 3] },
      { key: 'median', label: 'median', color: '--series-median', dash: [6, 4] },
      { key: 'smoothed', label: 'average', color: '--text' },
      { key: 'record', label: 'record', color: '--rec', step: true },
    ],
  });
  const species = createStackedArea({
    testid: 'species-chart', title: 'Species',
    note: 'A species is a family of networks alike enough to breed. Band height is its share of the population. '
      + 'The number is the species id, counted up as new ones appear. Each generation shows its six largest and the rest share the grey band.',
  });
  const tower = createTower(species.colour);
  const rlPanels = createRlPanels(session);
  const discrete = spec.action.type === 'discrete';
  const outputs = createOutputsBar(spec.action.type === 'candidates' ? [spec.action.scoreLabel] : spec.action.labels);
  const outputsTitle = h('h3', null, 'Outputs'), outputsNote = h('p', { class: 'chart-note' });
  const hof = createHallOfFame(session);
  const hint = h('p', { class: 'learn-hint', testid: 'learn-hint' });
  const verdictLead = h('b'), verdictRest = h('span'), verdictEl = h('p', { class: 'verdict', testid: 'run-verdict', 'aria-live': 'polite' }, verdictLead, verdictRest);
  const strip = h('div', { class: 'strip', testid: 'run-strip', role: 'img' }), stripLabel = h('span');
  const upper = h('div', { class: 'learn-upper' },
    h('section', { class: 'run-head', 'aria-label': 'Is it learning' },
      stats.head,
      h('div', { class: 'run-read' },
        verdictEl,
        h('div', { class: 'run-trend' }, stripLabel, strip,
          h('ul', { class: 'strip-key', 'aria-hidden': 'true' }, ...STRIP_KEY.map(([mark, label]) => h('li', null, h('i', { class: mark }), label)))))),
    stats.el, hint);
  const keysHint = h('p', { class: 'keys-hint' }, 'Keyboard:', h('kbd', null, 'Space'), 'pause or resume', h('kbd', null, '.'), 'one step', h('kbd', null, '['), h('kbd', null, ']'), 'slower or faster');
  const controls = h('div', { class: 'run-controls' }, speedBar.el, keysHint);
  const bottom = h('div', { class: 'learn-row' }, hof.el, h('section', { class: 'panel chart' }, outputsTitle, outputsNote, outputs.el));
  const lower = h('div', { class: 'learn' }, h('div', { class: 'learn-row' }, fitness.el, species.el, rlPanels.el), bottom);
  // Plain-language reading aids, worded for the method in use.
  const describe = (kind: 'neat' | 'dqn' | 'ppo') => {
    hint.hidden = session.state !== 'idle' || session.history.length > 0;
    if (!hint.hidden) {
      const text = kind === 'neat' ? 'Nothing has learned yet. Start evolving to create a population of random networks. Every generation, the best are kept, bred and mutated.'
        : kind === 'dqn' ? 'Nothing has learned yet. Start learning and one network plays round after round, correcting itself from its own memories.'
          : 'Nothing has learned yet. Start learning and one network plays several copies of the game at once, correcting itself after every batch.';
      if (hint.textContent !== text) hint.textContent = text;
    }
    fitness.setNote(kind === 'neat' ? 'Fitness is the weighted sum of your rewards from step 2. The blue line is the record: each step up is a network that beat every one before it. The thin grey line is each generation\'s champion. Mean and median are the whole crowd.'
      : 'Fitness is the weighted sum of your rewards from step 2. Each dot is one finished episode. The dark line is their running average. Up is better.');
    const out = kind === 'neat' ? 'What the network on stage wants to do right now.'
      : kind === 'dqn' ? 'How good the network expects each action to be from here.'
        : discrete ? 'How likely the network is to take each action from here.' : 'The value the network sets for each control right now.';
    const text = discrete ? `${out} The marked row is the action it takes.` : out;
    if (outputsNote.textContent !== text) outputsNote.textContent = text;
  };

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
  let lastReward = session.reward, raf = 0, shownRun = session.run, headKey = '';
  const render = () => {
    raf = 0;
    if (session.run !== shownRun) { shownRun = session.run; outputs.reset(); }
    const hist = session.history, kind = session.run?.learner.kind ?? prefs.learner;
    if (session.rewardMarkers.length === 0) { markerLabels.clear(); lastReward = session.reward; }
    const markers: ChartMarker[] = session.rewardMarkers.map((x) => {
      if (!markerLabels.has(x)) { markerLabels.set(x, weightChanges(lastReward, session.reward)); lastReward = session.reward; }
      return { x, label: markerLabels.get(x)! };
    });
    species.el.hidden = kind !== 'neat'; rlPanels.el.hidden = kind === 'neat';
    describe(kind);
    outputsTitle.textContent = kind === 'neat' ? 'Output activations' : kind === 'dqn' ? 'Q-values' : discrete ? 'Action probabilities' : 'Action means';
    const unit = iterationLabel(kind).toLowerCase(), n = hist.length;
    fitness.setXLabel(unit);

    // New rewards rescale fitness: the record, and with it the verdict, starts over at the last reward change.
    const best = hist.map((s) => s.best), changed = new Set(session.rewardMarkers);
    const lastChange = session.rewardMarkers.at(-1), from = lastChange === undefined ? 0 : Math.max(0, hist.findIndex((s) => s.iteration === lastChange));
    const t = trend(best, STRIP, from), holder = hist[t.recordAt];
    // The header and tower change once per iteration, not once per frame.
    const key = `${kind}|${n}|${from}`, ticked = key !== headKey;
    if (ticked) {
      headKey = key;
      const v = verdict(t, n, unit), [lead, ...rest] = v.text.split(' - ');
      verdictEl.dataset.state = v.state;
      verdictLead.textContent = lead!; verdictRest.textContent = rest.length ? ` - ${rest.join(' - ')}` : '';
      stripLabel.textContent = `Last ${STRIP} ${unit}s`;
      strip.replaceChildren(...t.marks.map((m) => h('i', { class: m })));
      const count = (m: Mark) => t.marks.filter((x) => x === m).length;
      strip.setAttribute('aria-label', `Last ${t.marks.length} ${unit}s: ${count('rec')} new records, ${count('imp')} improved, ${count('flat')} no gain`);
      stats.setRecord(t.record, holder?.iteration ?? null);
    }

    if (kind !== 'neat') {
      extendRl();
      // A DQN round is one episode: its best, mean and median are the dot itself, three lines drawn on top of each other.
      fitness.setData(rl.x, { episode: rl.episode, smoothed: rl.smoothed, ...(kind === 'ppo' && { best: rl.best, mean: rl.mean, median: rl.median }) }, markers);
      rlPanels.update(kind);
      if (ticked) tower.update(hist, kind, t);
      return;
    }
    fitness.setData(hist.map((s) => s.iteration), {
      best, mean: hist.map((s) => s.mean), median: hist.map((s) => s.median),
      record: runningBest(best, (i) => changed.has(hist[i]!.iteration)),
    }, markers, holder && { x: holder.iteration, y: t.record, text: `record ${fmt(t.record)}, ${unit} ${holder.iteration}` });
    // Long runs are drawn from a bounded sample of generations: the chart is ~500 px wide and repaints every frame at MAX.
    const neat = hist.flatMap((s) => (s.neat ? [s.neat] : []));
    const bands = speciesBands(sampleEvenly(neat, SPECIES_COLUMNS));
    species.setData(bands.ids, bands.rows, neat.length, bands.pooled);
    if (ticked) tower.update(hist, kind, t);                           // after the chart, which hands out the species colours
  };
  // History can grow hundreds of times per second at MAX; charts repaint once per frame.
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  const offChange = session.onChange(schedule);
  const offFrame = session.on('frame', (m) => { if (m.outputs) outputs.set(m.outputs, discrete ? argmax(m.outputs) : undefined); });
  render();

  return {
    upper, tower: tower.el, controls, lower,
    refresh() { speedBar.refresh(); stats.refresh(); schedule(); },
    dispose() { cancelAnimationFrame(raf); offChange(); offFrame(); speedBar.dispose(); stats.dispose(); hof.dispose(); rlPanels.dispose(); },
  };
}
