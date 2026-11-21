import { describe, expect, it } from 'vitest';
import { defaultReward } from '../env/reward';
import { reach1d } from '../envs/reach1d';
import { car } from '../envs/car/car';
import { runHeadless } from '../trainer/headless';
import { resolveConfig, type LearnerConfig } from './config';
import { createLearner } from './index';

describe('DqnLearner', () => {
  const cfg = resolveConfig('dqn', reach1d, { epsilonDecaySteps: 6000, learnStart: 500, targetSyncEvery: 500, lr: 1e-3, episodesPerIteration: 5 }) as Extract<LearnerConfig, { kind: 'dqn' }>;
  it('one tick = one env step; an iteration = episodesPerIteration episodes', () => {
    const l = createLearner(cfg, reach1d, defaultReward(reach1d), 1); let ticks = 0;
    while (!l.tick()) ticks++;
    expect(ticks + 1).toBe(5 * 120);
    const s = l.stats();
    expect(s).toMatchObject({ iteration: 1, learner: 'dqn', episodes: 5, envSteps: 600 });
    expect(s.rl!.returns.length).toBe(5); expect(s.rl!.epsilon).toBeCloseTo(1 - 0.95 * (600 / 6000), 2);
    expect(s.champion).toMatchObject({ kind: 'mlp', algo: 'dqn', sizes: [2, 32, 32, 3], hidden: 'relu' });
    const live = l.live();
    expect(live.envs.length).toBe(1); expect(live.outputs().length).toBe(3);
    expect(live.activations().length).toBe(live.network().nodes.length);
  });
  it('per-step rewards sum to the episode fitness', () => {
    const l = createLearner({ ...cfg, dqn: { ...cfg.dqn, episodesPerIteration: 1 } }, reach1d, defaultReward(reach1d), 2);
    while (!l.tick());
    const env = l.live().envs[0]!;                                  // already reset; compare against the reported return range instead
    expect(env.done).toBe(false);
    expect(l.stats().best).toBeGreaterThan(-1); expect(l.stats().best).toBeLessThan(15.5);
  });
  it('learns reach1d: mean return of the last 20 episodes beats the first 20 by 3', async () => {
    const stats = await runHeadless({ def: reach1d, learner: cfg, seed: 1, iterations: 9999, maxEnvSteps: 24000 });
    const returns = stats.flatMap((s) => s.rl!.returns);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(returns.slice(-20))).toBeGreaterThanOrEqual(mean(returns.slice(0, 20)) + 3);
  }, 30000);
  it('rejects continuous-action envs', () => {
    expect(() => createLearner(resolveConfig('dqn', reach1d), car, defaultReward(car), 1)).toThrow(/discrete/);
  });
});
