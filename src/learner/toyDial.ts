import { Rng } from '../core/rng';
import type { Env, EnvDefinition } from '../env/types';

const STEPS = 8;

function create(): Env {
  let target = 0, t = 0, done = false;
  const terms = new Float32Array(2), obs = new Float32Array(1);
  return {
    reset(seed) { target = new Rng(seed).range(-0.8, 0.8); t = 0; done = false; terms.fill(0); },
    step(action) {
      if (done) return;
      const miss = Math.abs((action as Float32Array)[0]! - target);
      terms[0]! += (1 - miss) / STEPS; terms[1]! += miss / STEPS;
      if (++t >= STEPS) done = true;
    },
    observe() { obs[0] = target; return obs; },
    get done() { return done; },
    terms,
    render() {},
  };
}

/** Test-only continuous env (not registered): turn one dial to the value shown. */
export const toyDial: EnvDefinition = {
  meta: {
    id: 'toy-dial', name: 'Toy Dial', tagline: 'Turn the dial to the target.', description: 'Test-only continuous-action environment.',
    dims: '2d', fps: 30, maxSteps: STEPS, learners: ['neat', 'ppo'], ghosts: false, hidden: true,
  },
  observation: { labels: ['target'] },
  action: { type: 'continuous', labels: ['dial'] },
  rewardTerms: [
    { key: 'match', kind: 'reward', description: 'Closeness of the dial to the target', defaultWeight: 1 },
    { key: 'miss', kind: 'penalty', description: 'Distance of the dial from the target', defaultWeight: 0 },
  ],
  presets: [{ name: 'default', description: 'Match the target.', weights: { match: 1, miss: 0 } }],
  create,
};
