import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DEFAULT_NEAT } from './config';
import { createInitialGenome, hiddenCount } from './genome';
import { InnovationTracker } from './innovation';
import { addConnection, addNode, mutate, reaches } from './mutation';
import { compile } from './network';

const setup = (seed = 1) => {
  const rng = new Rng(seed); const innov = new InnovationTracker(3, 2);
  return { rng, innov, g: createInitialGenome(1, 3, 2, 'tanh', rng, DEFAULT_NEAT) };
};

describe('mutation', () => {
  it('addNode splits a connection: old disabled, in-weight 1, out-weight preserved', () => {
    const { g, rng, innov } = setup();
    const before = g.conns.map((c) => ({ ...c }));
    expect(addNode(g, rng, DEFAULT_NEAT, innov)).toBe(true);
    expect(hiddenCount(g)).toBe(1);
    const disabled = g.conns.find((c) => !c.enabled)!;
    const hid = g.nodes.find((n) => n.type === 'hidden')!;
    const inC = g.conns.find((c) => c.to === hid.id)!, outC = g.conns.find((c) => c.from === hid.id)!;
    expect(inC).toMatchObject({ from: disabled.from, weight: 1 });
    expect(outC).toMatchObject({ to: disabled.to, weight: before.find((c) => c.innov === disabled.innov)!.weight });
    expect(g.conns.map((c) => c.innov)).toEqual([...g.conns.map((c) => c.innov)].sort((x, y) => x - y));
  });
  it('the same split in two genomes yields the same node id and innovations', () => {
    const innov = new InnovationTracker(1, 1);
    const g1 = createInitialGenome(1, 1, 1, 'tanh', new Rng(1), DEFAULT_NEAT);
    const g2 = createInitialGenome(2, 1, 1, 'tanh', new Rng(2), DEFAULT_NEAT);
    addNode(g1, new Rng(3), DEFAULT_NEAT, innov); addNode(g2, new Rng(4), DEFAULT_NEAT, innov);
    expect(g1.nodes.at(-1)!.id).toBe(g2.nodes.at(-1)!.id);
    expect(g1.conns.map((c) => c.innov)).toEqual(g2.conns.map((c) => c.innov));
  });
  it('addConnection never targets an input, never leaves an output, never duplicates', () => {
    const { g, rng, innov } = setup();
    for (let i = 0; i < 30; i++) { addNode(g, rng, DEFAULT_NEAT, innov); addConnection(g, rng, DEFAULT_NEAT, innov); }
    const types = new Map(g.nodes.map((n) => [n.id, n.type]));
    const keys = new Set<string>();
    for (const c of g.conns) {
      expect(types.get(c.to)).not.toBe('input'); expect(types.get(c.from)).not.toBe('output');
      expect(keys.has(`${c.from}>${c.to}`)).toBe(false); keys.add(`${c.from}>${c.to}`);
    }
  });
  it('stays acyclic and compilable under 10000 random mutations and respects maxHidden and weight clamp', () => {
    const { g, rng, innov } = setup(9);
    const cfg = { ...DEFAULT_NEAT, pAddConn: 0.5, pAddNode: 0.3, pToggle: 0.2, maxHidden: 12 };
    for (let i = 0; i < 10000; i++) mutate(g, rng, cfg, innov);
    for (const c of g.conns) { c.enabled = true; expect(Math.abs(c.weight)).toBeLessThanOrEqual(cfg.weightClamp); }
    expect(() => compile(g)).not.toThrow();           // even with every connection enabled
    expect(hiddenCount(g)).toBeLessThanOrEqual(12);
    expect(reaches(g, g.nodes[0]!.id, g.nodes[3]!.id)).toBe(true);
  });
});
