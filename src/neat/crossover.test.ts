import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DEFAULT_NEAT } from './config';
import { crossover } from './crossover';
import { createInitialGenome } from './genome';
import { InnovationTracker } from './innovation';
import { addConnection, addNode } from './mutation';
import { compile } from './network';

describe('crossover', () => {
  it('child topology equals the fitter parent; matching genes come from either parent', () => {
    const innov = new InnovationTracker(2, 1); const rng = new Rng(5);
    const a = createInitialGenome(1, 2, 1, 'tanh', rng, DEFAULT_NEAT);
    const b = createInitialGenome(2, 2, 1, 'tanh', rng, DEFAULT_NEAT);
    for (let i = 0; i < 4; i++) { addNode(a, rng, DEFAULT_NEAT, innov); addConnection(a, rng, DEFAULT_NEAT, innov); addNode(b, rng, DEFAULT_NEAT, innov); }
    const child = crossover(a, b, 3, rng, DEFAULT_NEAT);
    expect(child.conns.map((c) => c.innov)).toEqual(a.conns.map((c) => c.innov));
    expect(child.nodes.map((n) => n.id)).toEqual(a.nodes.map((n) => n.id));
    const bw = new Map(b.conns.map((c) => [c.innov, c.weight]));
    for (const c of child.conns) {
      const aw = a.conns.find((x) => x.innov === c.innov)!.weight;
      expect(c.weight === aw || c.weight === bw.get(c.innov)).toBe(true);
    }
    expect(() => compile(child)).not.toThrow();
    expect(child).toMatchObject({ id: 3, fitness: 0, speciesId: -1 });
  });
  it('a gene disabled in either parent is disabled in the child about 75% of the time', () => {
    const rng = new Rng(1);
    const a = createInitialGenome(1, 1, 1, 'tanh', rng, DEFAULT_NEAT);
    const b = createInitialGenome(2, 1, 1, 'tanh', rng, DEFAULT_NEAT);
    b.conns[0]!.enabled = false;
    let disabled = 0;
    for (let i = 0; i < 2000; i++) if (!crossover(a, b, 3, rng, DEFAULT_NEAT).conns[0]!.enabled) disabled++;
    expect(disabled / 2000).toBeGreaterThan(0.7); expect(disabled / 2000).toBeLessThan(0.8);
  });
});
