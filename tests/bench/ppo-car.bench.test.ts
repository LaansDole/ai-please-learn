import { expect, it } from 'vitest';
import { car } from '../../src/envs/car/car';
import { resolveConfig } from '../../src/learner/config';
import { runHeadless } from '../../src/trainer/headless';
import { meanOf } from './helpers';

it('PPO learns to drive: mean return of the last 10 updates beats the first 10 by 10', async () => {
  const t0 = performance.now();
  const stats = await runHeadless({ def: car, learner: resolveConfig('ppo', car), seed: 1, iterations: 150 });
  const ms = performance.now() - t0;
  const m = stats.map((s) => s.mean);
  console.log(`[bench] ppo/car first10=${meanOf(m.slice(0, 10)).toFixed(2)} last10=${meanOf(m.slice(-10)).toFixed(2)} s=${(ms / 1000).toFixed(1)}`);
  expect(meanOf(m.slice(-10))).toBeGreaterThanOrEqual(meanOf(m.slice(0, 10)) + 10);
  expect(ms).toBeLessThan(240000);
});
