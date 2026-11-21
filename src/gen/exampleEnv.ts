import { reach1d } from '../envs/reach1d';
import type { GeneratedMeta } from './meta';

/** The reach1d definition as generated-concept metadata: the example the system prompt teaches from. */
export const EXAMPLE_META: GeneratedMeta = {
  name: reach1d.meta.name,
  tagline: reach1d.meta.tagline,
  description: reach1d.meta.description,
  fps: reach1d.meta.fps,
  maxSteps: reach1d.meta.maxSteps,
  observation: reach1d.observation,
  action: { type: 'discrete', labels: ['left', 'stay', 'right'] },
  rewardTerms: reach1d.rewardTerms,
  presets: reach1d.presets,
  human: reach1d.human!,
};

export const EXAMPLE_META_JSON = JSON.stringify(EXAMPLE_META, null, 2);

/** reach1d in the generated-module dialect. No backticks and no banned identifiers: it must pass our own scan and validator. */
export const EXAMPLE_MODULE_JS = `function createEnv(sdk) {
  var STEPS = 120, MOVE = 0.05;
  var rng, x, target, t, done;
  var terms = [0, 0, 0];                 // closeness, arrived, effort (same order as rewardTerms)
  var obs = [0, 0];                      // dot x, target x (same order as observation.labels)
  function px(v) { return sdk.W / 2 + v * 340; }
  return {
    reset: function (seed) {
      rng = sdk.rng(seed);
      x = 0;
      target = rng.range(0.2, 0.9) * (rng.next() < 0.5 ? -1 : 1);
      t = 0; done = false;
      terms[0] = 0; terms[1] = 0; terms[2] = 0;
    },
    step: function (action) {
      if (done) return;
      var move = action - 1;             // 0 left, 1 stay, 2 right
      x = sdk.clamp(x + move * MOVE, -1, 1);
      var d = Math.abs(target - x);
      terms[0] += Math.max(0, 1 - d) / STEPS;
      if (d < 0.05) terms[1] += 1 / STEPS;
      if (move !== 0) terms[2] += 1 / STEPS;
      t += 1;
      if (t >= STEPS) done = true;
    },
    observe: function () { obs[0] = x; obs[1] = target; return obs; },
    get done() { return done; },
    terms: terms,
    render: function (draw, ghost) {
      if (!ghost) {
        draw.clear(sdk.colors.bg);
        draw.line(60, 250, 740, 250, sdk.colors.dim, 2);
        draw.circle(px(target), 250, 16, sdk.colors.dim);
        draw.circle(px(target), 250, 10, sdk.colors.good);
      }
      draw.circle(px(x), 250, 8, sdk.colors.accent);
    },
    humanAct: function (input) {
      if (input.held.has('ArrowLeft')) return 0;
      if (input.held.has('ArrowRight')) return 2;
      return 1;
    }
  };
}
`;
