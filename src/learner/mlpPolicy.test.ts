import { describe, expect, it } from 'vitest';
import type { Env } from '../env/types';
import { car } from '../envs/car/car';
import { reach1d } from '../envs/reach1d';
import { createMlpPolicy, mlpSnapshot, outputLabels } from './mlpPolicy';

const envSeeing = (obs: number[]) => ({ observe: () => Float32Array.from(obs) }) as unknown as Env;

describe('mlpSnapshot', () => {
  const params = Float32Array.from({ length: 2 * 3 + 3 + 3 * 2 + 2 }, (_, i) => (i + 1) / 10);
  it('lays the MLP out layer by layer with labels on inputs and outputs only', () => {
    const s = mlpSnapshot([2, 3, 2], params, ['a', 'b'], ['x', 'y']);
    expect(s.nodes.map((n) => n.depth)).toEqual([0, 0, 1, 1, 1, 2, 2]);
    expect(s.nodes.map((n) => n.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.nodes.map((n) => n.label)).toEqual(['a', 'b', undefined, undefined, undefined, 'x', 'y']);
    expect(s.nodes.map((n) => n.type)).toEqual(['input', 'input', 'hidden', 'hidden', 'hidden', 'output', 'output']);
    expect(s.maxDepth).toBe(2);
    expect(s.edges.length).toBe(12);
    expect(s.edges[0]).toMatchObject({ from: 0, to: 2, weight: params[0], enabled: true });
    expect(s.edges[6]).toMatchObject({ from: 2, to: 5, weight: params[9] });    // second layer starts after 6 weights + 3 biases
  });
  it('marks how much each weight changed relative to the largest change', () => {
    const prev = params.slice(); prev[0]! += 0.5;
    const s = mlpSnapshot([2, 3, 2], params, ['a', 'b'], ['x', 'y'], prev);
    expect(s.edges[0]!.delta).toBe(1);
    expect(s.edges.slice(1).every((e) => e.delta === 0)).toBe(true);
    expect(mlpSnapshot([2, 3, 2], params, ['a', 'b'], ['x', 'y'], params).edges.every((e) => e.delta === 0)).toBe(true);
  });
});

describe('createMlpPolicy', () => {
  it('DQN picks the argmax Q-value', () => {
    const params = new Float32Array(2 * 3 + 3); params.set([0.1, 0.9, 0.3], 6);       // biases only
    const p = createMlpPolicy({ kind: 'mlp', algo: 'dqn', sizes: [2, 3], hidden: 'relu', params }, reach1d);
    expect(p.act(envSeeing([0.5, -0.5]))).toBe(1);
    expect(Array.from(p.outputs())).toEqual(Array.from(Float32Array.from([0.1, 0.9, 0.3])));
    expect(p.activations().length).toBe(p.network().nodes.length);
    expect(p.network().nodes.at(-1)!.label).toBe('right');
  });
  it('PPO continuous returns the clipped means and labels the value output', () => {
    const params = new Float32Array(8 * 3 + 3); params.set([3, -0.25, 0.7], 24);
    const p = createMlpPolicy({ kind: 'mlp', algo: 'ppo', sizes: [8, 3], hidden: 'tanh', params }, car);
    expect(Array.from(p.act(envSeeing(new Array(8).fill(0))) as Float32Array)).toEqual([1, -0.25]);
    expect(Array.from(p.outputs())).toEqual([3, -0.25]);
    expect(outputLabels(car, 'ppo')).toEqual(['steer', 'throttle', 'value']);
    expect(p.activations().length).toBe(11);
  });
  it('PPO discrete takes the argmax logit and reports probabilities', () => {
    const params = new Float32Array(2 * 4 + 4); params.set([0, Math.log(3), 0, 9], 8);  // the value output (9) is not an action
    const p = createMlpPolicy({ kind: 'mlp', algo: 'ppo', sizes: [2, 4], hidden: 'tanh', params }, reach1d);
    expect(p.act(envSeeing([0, 0]))).toBe(1);
    expect(p.outputs().length).toBe(3);
    expect(p.outputs()[1]).toBeCloseTo(0.6, 5);
  });
});
