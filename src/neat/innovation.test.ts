import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DEFAULT_NEAT } from './config';
import { createInitialGenome } from './genome';
import { InnovationTracker } from './innovation';

const genome = (id: number) => createInitialGenome(id, 3, 2, 'tanh', new Rng(id), DEFAULT_NEAT);

describe('InnovationTracker', () => {
  it('pre-registers initial pairs as i * nOut + o', () => {
    const t = new InnovationTracker(3, 2);
    expect(t.conn(0, 3)).toBe(0);
    expect(t.conn(1, 4)).toBe(3);
  });
  it('gives a new pair the next number and repeats it', () => {
    const t = new InnovationTracker(3, 2);
    expect(t.conn(0, 9)).toBe(6);
    expect(t.conn(0, 9)).toBe(6);
  });
  it('splitting the same connection yields the same node id across genomes', () => {
    const t = new InnovationTracker(3, 2);
    expect(t.split(2, genome(1))).toBe(5);
    expect(t.split(2, genome(2))).toBe(5);
  });
  it('allocates a fresh, larger id when the genome already has the shared node', () => {
    const t = new InnovationTracker(3, 2);
    const g = genome(1);
    g.nodes.push({ id: t.split(2, g), type: 'hidden', bias: 0, act: 'tanh' });
    expect(t.split(2, g)).toBeGreaterThan(5);
  });
});
