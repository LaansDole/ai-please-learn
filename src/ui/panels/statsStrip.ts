import { iterationLabel } from '../../learner/types';
import { paramCount } from '../../nn/mlp';
import type { RunPrefs } from '../../persist/storage';
import { fmt, h } from '../dom';
import type { Session } from '../session';

/**
 * Labelled readouts for the latest completed iteration (spec section 11.5); the cells depend on the learning method.
 * `head` is the iteration counter, shown large in the run header; `el` is the ruled row of the rest.
 * `setRecord` is fed by the Learn panel, which owns the record (it restarts when the rewards change).
 */
export function createStatsStrip(session: Session, prefs: RunPrefs): { el: HTMLElement; head: HTMLElement; setRecord(value: number, iteration: number | null): void; refresh(): void; dispose(): void } {
  const cell = (id: string, label: string, help: string) => {
    const name = h('span', { class: 'stat-label' }, label), value = h('span', { class: 'num stat-value' }, '-');
    return { el: h('div', { class: 'stat', testid: `stat-${id}`, title: help }, name, value), name, value };
  };
  const iteration = cell('iteration', 'Generation', 'How many rounds of learning have finished');
  const cells = {
    record: cell('record', 'Record', 'The best fitness any network has reached in this run, and when'),
    best: cell('best', 'Champion', 'Fitness of the best network in the latest iteration'), mean: cell('mean', 'Mean', 'Average fitness in the latest iteration'),
    species: cell('species', 'Species', 'Families of similar networks, protected so new ideas get time to improve'),
    population: cell('population', 'Population', 'Networks playing at once'),
    explore: cell('explore', 'Epsilon', 'How much the network still experiments instead of doing what it thinks is best'),
    nodes: cell('nodes', 'Nodes', 'Neurons in the champion, inputs and outputs included'), conns: cell('conns', 'Connections', 'Enabled connections in the champion'),
    params: cell('params', 'Parameters', 'Adjustable numbers (weights and biases) in the network'), sps: cell('sps', 'Steps per second', 'Game steps simulated per second, all networks together'),
  };
  iteration.el.className = 'gen'; cells.record.el.classList.add('stat-wide');
  // The heartbeat of a run: the iteration counter flashes on every tick, the record only when it is beaten.
  const pen = getComputedStyle(document.documentElement).getPropertyValue('--rec').trim();
  const flash = (el: HTMLElement) => { if (el.getAnimations().length === 0) el.animate([{ color: pen, offset: 0 }], { duration: 600, easing: 'ease-out' }); };
  const recordValue = h('span'), recordWhen = h('small');
  cells.record.value.replaceChildren(recordValue, recordWhen);
  let record = NaN;
  const el = h('section', { class: 'stats', 'aria-label': 'Run statistics' }, ...Object.values(cells).map((c) => c.el));
  let ticksPerSec = 0;
  // Measured env steps per second between the last two iterations; ticks x population overstates it once agents die.
  let measured = 0, measuredAt = -Infinity, prev: { t: number; steps: number } | null = null;
  const sync = () => {
    const s = session.history.at(-1), run = session.run, cfg = run?.learner, kind = cfg?.kind ?? prefs.learner, neat = kind === 'neat';
    iteration.name.textContent = iterationLabel(kind);
    const count = String(s?.iteration ?? 0);
    if (iteration.value.textContent !== count) { iteration.value.textContent = count; if (s) flash(iteration.value); }
    // NEAT: population, species, champion size. PPO: envs, entropy, parameters. DQN: epsilon, parameters (buffer fill is not reported).
    cells.population.el.hidden = kind === 'dqn'; cells.species.el.hidden = !neat; cells.explore.el.hidden = neat;
    cells.nodes.el.hidden = cells.conns.el.hidden = !neat; cells.params.el.hidden = neat;
    cells.population.name.textContent = neat ? 'Population' : 'Envs';
    cells.population.value.textContent = s?.neat ? String(s.neat.population) : cfg?.kind === 'ppo' ? String(cfg.ppo.nEnvs) : '-';
    cells.species.value.textContent = s?.neat ? String(s.neat.species.length) : '-';
    cells.explore.name.textContent = kind === 'ppo' ? 'Entropy' : 'Epsilon';
    const explore = kind === 'ppo' ? s?.rl?.entropy : s?.rl?.epsilon;
    cells.explore.value.textContent = explore === undefined ? '-' : explore.toFixed(2);
    cells.best.value.textContent = s ? fmt(s.best) : '-';
    cells.mean.value.textContent = s ? fmt(s.mean) : '-';
    cells.nodes.value.textContent = s?.neat ? String(s.neat.nodes) : '-';
    cells.conns.value.textContent = s?.neat ? String(s.neat.conns) : '-';
    const champion = session.hof.at(-1)?.policy;
    cells.params.value.textContent = champion?.kind === 'mlp' ? String(paramCount(champion.sizes)) : '-';
    // One tick steps every live env: the whole population for NEAT, nEnvs for PPO.
    const envs = cfg?.kind === 'neat' ? cfg.neat.populationSize : cfg?.kind === 'ppo' ? cfg.ppo.nEnvs : 1;
    const rate = performance.now() - measuredAt < 3000 ? measured : ticksPerSec * envs;
    cells.sps.value.textContent = session.state === 'running' ? fmt(rate) : '-';
  };
  const offStatus = session.on('status', (m) => { ticksPerSec = m.ticksPerSec; sync(); });
  const offIteration = session.on('iteration', (m) => {
    const now = performance.now(), steps = m.stats.envSteps;
    // Iterations arrive in batches at MAX: measure over at least 250 ms, never between two messages of one batch.
    if (!prev) prev = { t: now, steps };
    else if (now - prev.t >= 250) {
      if (steps > prev.steps) { measured = ((steps - prev.steps) * 1000) / (now - prev.t); measuredAt = now; }
      prev = { t: now, steps };
    }
  });
  const offChange = session.onChange(sync);
  sync();
  return {
    el, head: iteration.el, refresh: sync,
    setRecord(value, at) {
      if (at === null) { recordValue.textContent = '-'; recordWhen.textContent = ''; record = NaN; return; }
      if (value > record) flash(recordValue);
      record = value;
      recordValue.textContent = fmt(value);
      recordWhen.textContent = `${iterationLabel(session.run?.learner.kind ?? prefs.learner).toLowerCase()} ${at}`;
    },
    dispose() { offStatus(); offIteration(); offChange(); },
  };
}
