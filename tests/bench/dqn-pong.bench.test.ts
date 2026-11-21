import { expect, it } from 'vitest';
import { pong } from '../../src/envs/pong';
import { resolveConfig } from '../../src/learner/config';
import { runHeadless } from '../../src/trainer/headless';
import { meanOf } from './helpers';

it('DQN learns Pong: last 20% of episodes beat the first 20% by 5', async () => {
  const t0 = performance.now();
  // 160k env steps, 2x the spec's 80k (allowed by spec 14.2): at 80k the paddle has only just started to track the ball (+3.1).
  const stats = await runHeadless({ def: pong, learner: resolveConfig('dqn', pong), seed: 1, iterations: 1e9, maxEnvSteps: 160000 });
  const ms = performance.now() - t0;
  const r = stats.flatMap((s) => s.rl!.returns), k = Math.max(1, Math.floor(r.length / 5));
  console.log(`[bench] dqn/pong episodes=${r.length} first=${meanOf(r.slice(0, k)).toFixed(2)} last=${meanOf(r.slice(-k)).toFixed(2)} s=${(ms / 1000).toFixed(1)}`);
  expect(r.length).toBeGreaterThanOrEqual(10);
  expect(meanOf(r.slice(-k))).toBeGreaterThanOrEqual(meanOf(r.slice(0, k)) + 5);
  expect(ms).toBeLessThan(240000);
});
