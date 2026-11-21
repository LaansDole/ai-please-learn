import { iterationLabel } from '../../learner/types';
import { fmt, h } from '../dom';
import type { Session } from '../session';

/** One row of labelled mono readouts for the latest completed iteration (spec section 11.5). */
export function createStatsStrip(session: Session): { el: HTMLElement; dispose(): void } {
  const cell = (id: string, label: string) => {
    const name = h('span', { class: 'stat-label' }, label), value = h('span', { class: 'num stat-value' }, '-');
    return { el: h('div', { class: 'stat', testid: `stat-${id}` }, name, value), name, value };
  };
  const cells = {
    iteration: cell('iteration', 'Generation'), population: cell('population', 'Population'), species: cell('species', 'Species'),
    best: cell('best', 'Best'), mean: cell('mean', 'Mean'), nodes: cell('nodes', 'Nodes'), conns: cell('conns', 'Connections'), sps: cell('sps', 'Steps / s'),
  };
  const el = h('section', { class: 'panel stats', 'aria-label': 'Run statistics' }, ...Object.values(cells).map((c) => c.el));
  let ticksPerSec = 0;
  // Measured env steps per second between the last two iterations; ticks x population overstates it once agents die.
  let measured = 0, measuredAt = -Infinity, prev: { t: number; steps: number } | null = null;
  const sync = () => {
    const s = session.history.at(-1), run = session.run;
    cells.iteration.name.textContent = iterationLabel(run?.learner.kind ?? session.spec.meta.learners[0]!);
    cells.iteration.value.textContent = String(s?.iteration ?? 0);
    cells.population.value.textContent = s?.neat ? String(s.neat.population) : '-';
    cells.species.value.textContent = s?.neat ? String(s.neat.species.length) : '-';
    cells.best.value.textContent = s ? fmt(s.best) : '-';
    cells.mean.value.textContent = s ? fmt(s.mean) : '-';
    cells.nodes.value.textContent = s?.neat ? String(s.neat.nodes) : '-';
    cells.conns.value.textContent = s?.neat ? String(s.neat.conns) : '-';
    // One tick steps every live env: the whole population for NEAT.
    const envs = run?.learner.kind === 'neat' ? run.learner.neat.populationSize : 1;
    const rate = performance.now() - measuredAt < 3000 ? measured : ticksPerSec * envs;
    cells.sps.value.textContent = session.state === 'running' ? fmt(rate) : '-';
  };
  const offStatus = session.on('status', (m) => { ticksPerSec = m.ticksPerSec; sync(); });
  const offIteration = session.on('iteration', (m) => {
    const now = performance.now(), steps = m.stats.envSteps;
    if (prev && steps > prev.steps && now > prev.t) { measured = ((steps - prev.steps) * 1000) / (now - prev.t); measuredAt = now; }
    prev = { t: now, steps };
  });
  const offChange = session.onChange(sync);
  sync();
  return { el, dispose() { offStatus(); offIteration(); offChange(); } };
}
