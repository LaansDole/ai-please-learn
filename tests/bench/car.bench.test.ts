import { expect, it } from 'vitest';
import { car } from '../../src/envs/car/car';
import { createPolicy } from '../../src/learner/policy';
import { benchNeat, last5 } from './helpers';

it('NEAT learns Car: generation 1 flails, later champions drive laps', async () => {
  const stats = await benchNeat(car, { iterations: 30, margin: 20, budgetMs: 180000 });
  expect(last5(stats)).toBeGreaterThanOrEqual(2 * stats[0]!.best);       // a real improvement, not a lucky first generation
  const best = stats.slice(-5).reduce((a, b) => (b.best > a.best ? b : a));
  const env = car.create(), policy = createPolicy(best.champion, car);
  env.reset(1);
  for (let i = 0; i < car.meta.maxSteps && !env.done; i++) env.step(policy.act(env));
  console.log(`[bench] neat/car champion replay: ${env.terms[1]} laps, ${env.terms[0]} checkpoints, crash ${env.terms[2]}`);
  expect(env.terms[1]).toBeGreaterThanOrEqual(3);                        // the evolved champion visibly drives laps
});
