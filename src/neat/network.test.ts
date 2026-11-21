import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DEFAULT_NEAT } from './config';
import { createInitialGenome, type Genome } from './genome';
import { compile } from './network';

const hand: Genome = {
  id: 1, fitness: 0, speciesId: -1,
  nodes: [
    { id: 0, type: 'input', bias: 0, act: 'identity' }, { id: 1, type: 'input', bias: 0, act: 'identity' },
    { id: 2, type: 'output', bias: 0.1, act: 'tanh' }, { id: 3, type: 'hidden', bias: -0.2, act: 'tanh' },
  ],
  conns: [
    { innov: 0, from: 0, to: 2, weight: 0.5, enabled: true },
    { innov: 1, from: 1, to: 2, weight: 9, enabled: false },
    { innov: 2, from: 1, to: 3, weight: 2, enabled: true },
    { innov: 3, from: 3, to: 2, weight: -1.5, enabled: true },
  ],
};

describe('network', () => {
  it('matches a hand-computed forward pass and ignores disabled connections', () => {
    const net = compile(hand);
    const h = Math.tanh(-0.2 + 2 * 0.3);
    const o = Math.tanh(0.1 + 0.5 * 1 + -1.5 * h);
    expect(net.activate(new Float32Array([1, 0.3]))[0]).toBeCloseTo(o, 6);
    expect(net.values[3]).toBeCloseTo(h, 6);
  });
  it('assigns depths: inputs 0, hidden 1, outputs last', () => {
    const net = compile(hand);
    expect(Array.from(net.depths)).toEqual([0, 0, 2, 1]);
    expect(net.maxDepth).toBe(2);
  });
  it('initial genome is fully connected with aligned innovations and maxDepth 1', () => {
    const g = createInitialGenome(1, 3, 2, 'tanh', new Rng(1), DEFAULT_NEAT);
    expect(g.conns.map((c) => c.innov)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(g.conns.find((c) => c.innov === 3)).toMatchObject({ from: 1, to: 4 });
    expect(compile(g).maxDepth).toBe(1);
  });
  it('throws on a cycle', () => {
    const bad: Genome = { ...hand, conns: [...hand.conns, { innov: 4, from: 2, to: 3, weight: 1, enabled: true }] };
    expect(() => compile(bad)).toThrow(/cycle/);
  });
});
