import { describe, expect, it } from 'vitest';
import { defaultReward } from '../env/reward';
import { reach1d } from '../envs/reach1d';
import { resolveConfig } from './config';
import { createLearner } from './index';
import type { IterationStats } from './types';

const run = (seed: number, iters: number, hook?: (l: ReturnType<typeof createLearner>, i: number) => void) => {
  const l = createLearner(resolveConfig('neat', reach1d, { populationSize: 20, episodesPerGenome: 2 }), reach1d, defaultReward(reach1d), seed);
  const out: IterationStats[] = []; let ticks = 0;
  while (out.length < iters) { ticks++; if (l.tick()) { out.push(l.stats()); hook?.(l, out.length); } }
  return { out, ticks, l };
};

describe('NeatLearner', () => {
  it('one iteration = population x episodes, in lockstep ticks', () => {
    const { out, ticks } = run(1, 1);
    expect(ticks).toBe(2 * 120);                               // 2 episodes of 120 steps, all 20 envs stepped per tick
    expect(out[0]).toMatchObject({ iteration: 1, learner: 'neat', episodes: 40, envSteps: 20 * 240, rewardVersion: 0 });
    expect(out[0]!.neat!.population).toBe(20);
    expect(out[0]!.neat!.species.reduce((a, s) => a + s.size, 0)).toBe(20);
    expect(out[0]!.best).toBeGreaterThanOrEqual(out[0]!.median);
    expect(out[0]!.champion.kind).toBe('neat');
  });
  it('is deterministic for a seed and differs across seeds', () => {
    const a = run(5, 3).out.map((s) => [s.best, s.mean, s.median]);
    expect(run(5, 3).out.map((s) => [s.best, s.mean, s.median])).toEqual(a);
    expect(run(6, 3).out.map((s) => [s.best, s.mean, s.median])).not.toEqual(a);
  });
  it('setReward is staged until the next iteration boundary', () => {
    const { out } = run(1, 3, (l, i) => { if (i === 1) l.setReward({ version: 1, envId: 'reach1d', preset: null, weights: { closeness: 0, arrived: 0, effort: 1 } }); });
    expect(out.map((s) => s.rewardVersion)).toEqual([0, 0, 1]);   // staged during iteration 2, active from iteration 3
    expect(out[2]!.best).toBeLessThanOrEqual(0);              // only a penalty remains
  });
  it('live view exposes all envs, a featured alive agent and aligned activations', () => {
    const { l } = run(1, 1);
    l.tick();
    const live = l.live();
    expect(live.envs.length).toBe(20); expect(live.alive[live.featured]).toBe(true);
    const net = live.network();
    expect(net.nodes.filter((n) => n.type === 'input').map((n) => n.label)).toEqual(['dot x', 'target x']);
    expect(net.nodes.filter((n) => n.type === 'output').map((n) => n.label)).toEqual(['left', 'stay', 'right']);
    expect(live.activations().length).toBe(net.nodes.length); expect(live.outputs().length).toBe(3);
  });
});
