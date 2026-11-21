import type { Action, Draw2D, Env, EnvDefinition, HumanInput } from '../env/types';
import type { GeneratedMeta } from './meta';
import { makeSdk, type GeneratedSdk } from './sdk';

/** What createEnv(sdk) returns in a generated module. Nothing here is trusted: the adapter below coerces every value. */
export interface RawGeneratedEnv {
  reset(seed: number): void;
  step(action: unknown): void;
  observe(): ArrayLike<number>;
  readonly done: unknown;
  terms: ArrayLike<number>;
  render(draw: Draw2D, ghost: boolean): void;
  humanAct(input: HumanInput): unknown;
}

const PRESET_ORDER = ['default', 'aggressive', 'survivalist'];

/** Generated code may pass anything to draw; frames are painted on the main thread, so only well-typed commands may leave the worker. */
function safeDraw(d: Draw2D): Draw2D {
  return {
    clear: (c) => d.clear(String(c)),
    rect: (x, y, w, h, c) => d.rect(+x, +y, +w, +h, String(c)),
    circle: (x, y, r, c) => d.circle(+x, +y, +r, String(c)),
    line: (x1, y1, x2, y2, c, width) => d.line(+x1, +y1, +x2, +y2, String(c), width === undefined ? undefined : +width),
    poly: (pts, c, fill) => d.poly(Array.from((pts ?? []) as ArrayLike<unknown>, Number), String(c), fill !== false),
    text: (s, x, y, c, size) => d.text(String(s).slice(0, 200), +x, +y, String(c), size === undefined ? undefined : +size),
  };
}

export function toDefinition(id: string, meta: GeneratedMeta, createEnv: (sdk: GeneratedSdk) => unknown): EnvDefinition {
  const nObs = meta.observation.labels.length, nTerms = meta.rewardTerms.length, continuous = meta.action.type === 'continuous';
  const sdk = makeSdk();
  return {
    meta: {
      id, name: meta.name, tagline: meta.tagline, description: meta.description, dims: '2d', fps: meta.fps, maxSteps: meta.maxSteps,
      learners: continuous ? ['neat', 'ppo'] : ['neat', 'dqn', 'ppo'], ghosts: true, generated: true,
    },
    observation: { labels: [...meta.observation.labels] },
    action: { type: meta.action.type, labels: [...meta.action.labels] },
    rewardTerms: meta.rewardTerms,
    // EnvDefinition wants 'default' first; the metadata may list the presets in any order.
    presets: [...meta.presets].sort((a, b) => PRESET_ORDER.indexOf(a.name) - PRESET_ORDER.indexOf(b.name)),
    human: meta.human,
    create(): Env {
      const inner = createEnv(sdk) as RawGeneratedEnv;
      const terms = new Float32Array(nTerms), obs = new Float32Array(nObs);
      const act: number[] = new Array<number>(meta.action.labels.length).fill(0);   // continuous actions arrive as a plain array, as the prompt promises
      const sync = () => { for (let k = 0; k < nTerms; k++) terms[k] = inner.terms[k]!; };
      return {
        reset(seed) { inner.reset(seed); sync(); },
        step(action: Action) {
          if (typeof action === 'number') inner.step(action);
          else { for (let i = 0; i < act.length; i++) act[i] = action[i]!; inner.step(act); }
          sync();
        },
        observe() { const raw = inner.observe(); for (let i = 0; i < nObs; i++) obs[i] = raw[i]!; return obs; },
        get done() { return inner.done === true; },
        terms,
        render(view) { if (view.kind === '2d') inner.render(safeDraw(view.draw), view.ghost); },
        humanAct(input) {
          const a = inner.humanAct(input);
          return a === null || a === undefined ? null : typeof a === 'number' ? a : Float32Array.from(a as ArrayLike<number>);
        },
      };
    },
  };
}
