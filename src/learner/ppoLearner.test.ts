import { describe, expect, it } from 'vitest';
import { defaultReward } from '../env/reward';
import { reach1d } from '../envs/reach1d';
import { tetris } from '../envs/tetris/tetris';
import { runHeadless } from '../trainer/headless';
import { resolveConfig } from './config';
import { createLearner } from './index';
import { toyDial } from './toyDial';

const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('PpoLearner', () => {
  it('one tick steps every env; an iteration is rolloutLen ticks plus an update', () => {
    const l = createLearner(resolveConfig('ppo', reach1d, { nEnvs: 4, rolloutLen: 64 }), reach1d, defaultReward(reach1d), 1);
    let ticks = 1;
    while (!l.tick()) ticks++;
    expect(ticks).toBe(64);
    const s = l.stats();
    expect(s).toMatchObject({ iteration: 1, learner: 'ppo', envSteps: 256 });
    for (const v of [s.rl!.policyLoss, s.rl!.valueLoss, s.rl!.entropy]) expect(Number.isFinite(v)).toBe(true);
    expect(s.rl!.entropy).toBeLessThanOrEqual(Math.log(3) + 1e-6);
    expect(s.champion).toMatchObject({ kind: 'mlp', algo: 'ppo', sizes: [2, 32, 32, 4], hidden: 'tanh' });
    const live = l.live();
    expect(live.envs.length).toBe(4); expect(live.outputs().length).toBe(3);
    expect(meanOf(Array.from(live.outputs())) * 3).toBeCloseTo(1, 4);
    expect(live.activations().length).toBe(live.network().nodes.length);
  });
  it('iterations without a finished episode report 0 at first and carry the previous values later', async () => {
    const stats = await runHeadless({ def: reach1d, learner: resolveConfig('ppo', reach1d, { rolloutLen: 16 }), seed: 1, iterations: 9 });
    expect(stats[0]).toMatchObject({ best: 0, mean: 0, median: 0, episodes: 0 });
    expect(stats[7]!.episodes).toBe(8);                               // episodes last 120 steps: all 8 envs finish in ticks 113..128
    expect(stats[7]!.rl!.returns.length).toBe(8);
    expect(stats[8]).toMatchObject({ best: stats[7]!.best, mean: stats[7]!.mean, median: stats[7]!.median, episodes: 0 });
  });
  it('learns reach1d: mean return of the last 5 updates beats the first by 3', async () => {
    const m = (await runHeadless({ def: reach1d, learner: resolveConfig('ppo', reach1d), seed: 1, iterations: 40 })).map((s) => s.mean);
    expect(meanOf(m.slice(-5))).toBeGreaterThanOrEqual(m[0]! + 3);
  }, 30000);
  it('learns toyDial (continuous actions)', async () => {
    const cfg = resolveConfig('ppo', toyDial, { nEnvs: 8, rolloutLen: 64, minibatchSize: 128 });
    const m = (await runHeadless({ def: toyDial, learner: cfg, seed: 1, iterations: 40 })).map((s) => s.mean);
    expect(meanOf(m.slice(-5))).toBeGreaterThanOrEqual(m[0]! + 0.2);
  }, 30000);
  it('is deterministic for a seed', async () => {
    const run = async () => (await runHeadless({ def: reach1d, learner: resolveConfig('ppo', reach1d, { rolloutLen: 128 }), seed: 7, iterations: 3 })).map((s) => s.mean);
    expect(await run()).toEqual(await run());
  });
  it('rejects candidate-scoring envs', () => {
    expect(() => createLearner(resolveConfig('ppo', reach1d), tetris, defaultReward(tetris), 1)).toThrow(/discrete or continuous/);
  });
});
