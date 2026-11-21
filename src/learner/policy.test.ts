import { describe, expect, it } from 'vitest';
import { defaultReward } from '../env/reward';
import type { Env } from '../env/types';
import { reach1d } from '../envs/reach1d';
import type { Genome } from '../neat/genome';
import { compile } from '../neat/network';
import { resolveConfig } from './config';
import { createLearner } from './index';
import { argmax, createPolicy, netAct } from './policy';

describe('policy', () => {
  it('argmax returns the lowest index on ties', () => {
    expect(argmax(new Float32Array([0.2, 0.9, 0.9]))).toBe(1);
    expect(argmax(new Float32Array([0, 0, 0]))).toBe(0);
  });
  it('a NEAT policy replays its champion deterministically', () => {
    const l = createLearner(resolveConfig('neat', reach1d, { populationSize: 20, episodesPerGenome: 1 }), reach1d, defaultReward(reach1d), 1);
    while (!l.tick());
    const policy = createPolicy(l.stats().champion, reach1d);
    const rollout = () => {
      const env = reach1d.create(); env.reset(123);
      while (!env.done) env.step(policy.act(env));
      return Array.from(env.terms);
    };
    const first = rollout();
    expect(first[0]).toBeGreaterThan(0);
    expect(rollout()).toEqual(first);
    expect(policy.activations().length).toBe(policy.network().nodes.length);
    expect(policy.outputs().length).toBe(3);
  });
  it('mlp snapshots are rejected until chunk C6', () => {
    expect(() => createPolicy({ kind: 'mlp', algo: 'dqn', sizes: [2, 3], hidden: 'relu', params: new Float32Array(9) }, reach1d)).toThrow(/C6/);
  });
  it('netAct picks the best-scoring candidate', () => {
    const g: Genome = {
      id: 1, fitness: 0, speciesId: -1,
      nodes: [{ id: 0, type: 'input', bias: 0, act: 'identity' }, { id: 1, type: 'output', bias: 0, act: 'identity' }],
      conns: [{ innov: 0, from: 0, to: 1, weight: 1, enabled: true }],
    };
    const env = { candidates: () => [[0.1], [0.9], [0.5]].map((c) => Float32Array.from(c)) } as unknown as Env;
    const net = compile(g);
    expect(netAct(net, env, { type: 'candidates', scoreLabel: 'score' })).toBe(1);
    expect(net.values[0]).toBeCloseTo(0.9, 6);                // the chosen candidate's activations stay in the network
  });
});
