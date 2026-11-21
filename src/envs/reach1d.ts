import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import type { Env, EnvDefinition, HumanInput, RenderView } from '../env/types';

// 1. Constants of your world.
const STEPS = 120, MOVE = 0.05;

function create(): Env {
  // 2. All state lives in this closure. Many instances run side by side.
  let x = 0, target = 0, t = 0, done = false;
  const terms = new Float32Array(3);          // same order as rewardTerms below: closeness, arrived, effort
  const obs = new Float32Array(2);            // same order as observation.labels
  return {
    // 3. reset: all randomness comes from the seed.
    reset(seed) {
      const rng = new Rng(seed);
      x = 0; target = rng.range(0.2, 0.9) * (rng.next() < 0.5 ? -1 : 1);
      t = 0; done = false; terms.fill(0);
    },
    // 4. step: apply the action, update raw reward-term counters (never weights), decide if the episode is over.
    step(action) {
      if (done) return;
      const move = (action as number) - 1;    // 0 left, 1 stay, 2 right
      x = clamp(x + move * MOVE, -1, 1);
      const d = Math.abs(target - x);
      terms[0]! += Math.max(0, 1 - d) / STEPS;
      if (d < 0.05) terms[1]! += 1 / STEPS;
      if (move !== 0) terms[2]! += 1 / STEPS;
      if (++t >= STEPS) done = true;
    },
    // 5. observe: numbers the network sees, scaled to about [-1, 1].
    observe() { obs[0] = x; obs[1] = target; return obs; },
    get done() { return done; },
    terms,
    // 6. render: 800 x 500 logical canvas. With view.ghost draw only the agent (no clear, no background).
    render(view: RenderView) {
      if (view.kind !== '2d') return;
      const d = view.draw, px = (v: number) => 400 + v * 340;
      if (!view.ghost) {
        d.clear('#0d121b');
        d.line(60, 250, 740, 250, '#2a3446', 2);
        d.circle(px(target), 250, 16, '#2a3446'); d.circle(px(target), 250, 10, '#82d173');
      }
      d.circle(px(x), 250, 8, '#4de1c1');
    },
    // 7. humanAct: translate held keys into the same action shape step() takes.
    humanAct(input: HumanInput) { return input.held.has('ArrowLeft') ? 0 : input.held.has('ArrowRight') ? 2 : 1; },
  };
}

export const reach1d: EnvDefinition = {
  meta: {
    id: 'reach1d', name: 'Reach the Target', tagline: 'Slide the dot onto the target.',
    description: 'A dot on a rail must move onto a target and stay there. The simplest thing a network can learn.',
    dims: '2d', fps: 30, maxSteps: STEPS, learners: ['neat', 'dqn', 'ppo'], ghosts: true, hidden: true,
  },
  observation: { labels: ['dot x', 'target x'] },
  action: { type: 'discrete', labels: ['left', 'stay', 'right'] },
  rewardTerms: [
    { key: 'closeness', kind: 'reward', description: 'Average closeness to the target over the episode (0 to 1)', defaultWeight: 10 },
    { key: 'arrived', kind: 'reward', description: 'Fraction of the episode spent on the target', defaultWeight: 5 },
    { key: 'effort', kind: 'penalty', description: 'Fraction of steps spent moving', defaultWeight: 0.5 },
  ],
  presets: [
    { name: 'default', description: 'Get close, then stay.', weights: { closeness: 10, arrived: 5, effort: 0.5 } },
    { name: 'aggressive', description: 'Only arriving matters.', weights: { closeness: 5, arrived: 15, effort: 0 } },
    { name: 'survivalist', description: 'Move as little as possible.', weights: { closeness: 10, arrived: 2, effort: 3 } },
  ],
  human: { hint: 'Arrow keys move the dot.', keys: [{ code: 'ArrowLeft', label: 'left' }, { code: 'ArrowRight', label: 'right' }] },
  // ppo gamma: the observation has no clock, so the value net cannot predict a long-horizon return and the advantages get noisy.
  train: { neat: { populationSize: 50, episodesPerGenome: 4 }, ppo: { gamma: 0.95 } },
  create,
};
