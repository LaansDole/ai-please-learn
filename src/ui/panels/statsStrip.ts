import { iterationLabel } from '../../learner/types';
import { paramCount } from '../../nn/mlp';
import type { RunPrefs } from '../../persist/storage';
import { fmt, h } from '../dom';
import type { Session } from '../session';

/** One row of labelled mono readouts for the latest completed iteration (spec section 11.5); the cells depend on the learning method. */
export function createStatsStrip(session: Session, prefs: RunPrefs): { el: HTMLElement; refresh(): void; dispose(): void } {
  const cell = (id: string, label: string) => {
    const name = h('span', { class: 'stat-label' }, label), value = h('span', { class: 'num stat-value' }, '-');
    return { el: h('div', { class: 'stat', testid: `stat-${id}` }, name, value), name, value };
  };
  const cells = {
    iteration: cell('iteration', 'Generation'), population: cell('population', 'Population'), species: cell('species', 'Species'),
    explore: cell('explore', 'Epsilon'), best: cell('best', 'Best'), mean: cell('mean', 'Mean'),
    nodes: cell('nodes', 'Nodes'), conns: cell('conns', 'Connections'), params: cell('params', 'Parameters'), sps: cell('sps', 'Steps / s'),
  };
  const el = h('section', { class: 'panel stats', 'aria-label': 'Run statistics' }, ...Object.values(cells).map((c) => c.el));
  let ticksPerSec = 0;
  // Measured env steps per second between the last two iterations; ticks x population overstates it once agents die.
  let measured = 0, measuredAt = -Infinity, prev: { t: number; steps: number } | null = null;
  const sync = () => {
    const s = session.history.at(-1), run = session.run, cfg = run?.learner, kind = cfg?.kind ?? prefs.learner, neat = kind === 'neat';
    cells.iteration.name.textContent = iterationLabel(kind);
    cells.iteration.value.textContent = String(s?.iteration ?? 0);
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
  return { el, refresh: sync, dispose() { offStatus(); offIteration(); offChange(); } };
}
