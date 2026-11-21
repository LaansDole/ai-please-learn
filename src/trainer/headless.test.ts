import { describe, expect, it } from 'vitest';
import { reach1d } from '../envs/reach1d';
import { resolveConfig } from '../learner/config';
import { runHeadless } from './headless';

const learner = resolveConfig('neat', reach1d, { populationSize: 10, episodesPerGenome: 1 });

describe('runHeadless', () => {
  it('runs the requested iterations and reports each one', async () => {
    let calls = 0;
    const stats = await runHeadless({ def: reach1d, learner, seed: 1, iterations: 3, onIteration: () => { calls++; } });
    expect(stats.map((s) => s.iteration)).toEqual([1, 2, 3]);
    expect(calls).toBe(3);
  });
  it('stops once maxEnvSteps is reached', async () => {
    expect((await runHeadless({ def: reach1d, learner, seed: 1, iterations: 99, maxEnvSteps: 1 })).length).toBe(1);
  });
});
