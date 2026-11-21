import { expect, it } from 'vitest';
import { walker } from '../../src/envs/walker/walker';
import { createPolicy } from '../../src/learner/policy';
import { benchNeat } from './helpers';

it('NEAT learns to move the walker forward', async () => {
  const stats = await benchNeat(walker, { iterations: 40, margin: 5, budgetMs: 300000 });
  const best = stats.reduce((a, b) => (b.best > a.best ? b : a));
  const env = walker.create(); const policy = createPolicy(best.champion, walker);
  env.reset(1);
  for (let i = 0; i < walker.meta.maxSteps && !env.done; i++) env.step(policy.act(env));
  console.log(`[bench] neat/walker champion replay: ${env.terms[0]!.toFixed(2)} m, upright ${env.terms[1]!.toFixed(1)} s, fell ${env.terms[3]}`);
  expect(env.terms[0]).toBeGreaterThanOrEqual(1.0);          // torso moved at least 1 m forward
  env.dispose!();
});
