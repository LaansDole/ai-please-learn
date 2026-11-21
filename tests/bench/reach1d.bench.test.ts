import { expect, it } from 'vitest';
import { reach1d } from '../../src/envs/reach1d';
import { resolveConfig } from '../../src/learner/config';
import { runHeadless } from '../../src/trainer/headless';
import { last5, report } from './helpers';

it('NEAT learns reach1d: last5 >= 12 and population mean improves by >= 2', async () => {
  const t0 = performance.now();
  const stats = await runHeadless({ def: reach1d, learner: resolveConfig('neat', reach1d), seed: 1, iterations: 20 });
  const ms = performance.now() - t0;
  report('neat/reach1d', stats, ms);
  expect(last5(stats)).toBeGreaterThanOrEqual(12);
  expect(stats.at(-1)!.mean).toBeGreaterThanOrEqual(stats[0]!.mean + 2);
  expect(ms).toBeLessThan(20000);
});
