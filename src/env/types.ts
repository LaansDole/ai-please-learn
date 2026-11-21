import type { TrainDefaults } from '../learner/config';

export type LearnerKind = 'neat' | 'dqn' | 'ppo';

/** discrete: index into labels. continuous: Float32Array(labels.length), each in [-1, 1]. candidates: index into env.candidates(). */
export type Action = number | Float32Array;

export type ActionSpec =
  | { type: 'discrete'; labels: string[] }
  | { type: 'continuous'; labels: string[] }
  | { type: 'candidates'; scoreLabel: string };

export interface ObservationSpec { labels: string[] }           // observation size = labels.length

export interface RewardTermSpec {
  key: string;                    // /^[a-z][a-zA-Z0-9]*$/
  kind: 'reward' | 'penalty';
  description: string;            // plain language, shown next to the slider
  defaultWeight: number;          // >= 0; the sign comes from kind
  max?: number;                   // slider maximum; default max(1, 4 * defaultWeight)
}
export interface RewardPreset { name: string; description: string; weights: Record<string, number> }
export interface RewardConfig { version: 1; envId: string; preset: string | null; weights: Record<string, number> }

export interface KeyBinding { code: string; label: string }     // KeyboardEvent.code, e.g. 'ArrowUp', 'Space'
export interface HumanSpec { keys: KeyBinding[]; hint: string }
export interface HumanInput { held: ReadonlySet<string>; pressed: ReadonlySet<string> }  // pressed = went down since the last tick

export interface EnvMeta {
  id: string;                     // /^[a-z][a-z0-9-]*$/; generated ids start with 'gen-'
  name: string;
  tagline: string;                // <= 80 chars, gallery card
  description: string;            // one paragraph, concept page
  dims: '2d' | '3d';
  fps: number;                    // env steps per second at x1
  maxSteps: number;               // the harness truncates episodes at this many steps
  learners: LearnerKind[];        // compatible learning methods
  ghosts: boolean;                // true if render(view) supports view.ghost
  hidden?: boolean;               // not listed in the gallery
  generated?: boolean;
}

/** 2D logical canvas is always 800 x 500, origin top-left, y down. Colours are CSS colour strings. */
export interface Draw2D {
  clear(color: string): void;
  rect(x: number, y: number, w: number, h: number, color: string): void;
  circle(x: number, y: number, r: number, color: string): void;
  line(x1: number, y1: number, x2: number, y2: number, color: string, width?: number): void;
  poly(points: number[], color: string, fill?: boolean): void;      // [x0,y0,x1,y1,...]
  text(s: string, x: number, y: number, color: string, size?: number): void;
}
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];                // x, y, z, w
export interface Scene3D {
  body(id: string, shape: 'box' | 'capsule' | 'sphere', size: Vec3, pos: Vec3, quat: Quat, color?: string): void;
}
/** ghost = true: draw only this agent's own elements (no clear, no background); the harness applies transparency. */
export type RenderView =
  | { kind: '2d'; draw: Draw2D; ghost: boolean }
  | { kind: '3d'; scene: Scene3D; ghost: boolean };

export type DrawCmd =
  | ['c', string] | ['r', number, number, number, number, string] | ['o', number, number, number, string]
  | ['l', number, number, number, number, string, number] | ['p', number[], string, boolean]
  | ['t', string, number, number, string, number] | ['a', number];  // 'a' = set global alpha
export interface Body3D { id: string; shape: 'box' | 'capsule' | 'sphere'; size: Vec3; pos: Vec3; quat: Quat; color?: string; ghost: boolean }
// size: box = half-extents [x, y, z]; capsule = [radius, halfHeight, 0] along local Y; sphere = [radius, 0, 0]
export type RenderFrame = { kind: '2d'; cmds: DrawCmd[] } | { kind: '3d'; bodies: Body3D[] };

export interface Env {
  reset(seed: number): void;
  step(action: Action): void;                 // no-op once done
  observe(): Float32Array;                    // length = observation.labels.length, values roughly in [-1, 1]; may be an internal buffer
  readonly done: boolean;
  readonly terms: Float32Array;               // cumulative since reset, index-aligned with rewardTerms
  render(view: RenderView): void;
  candidates?(): Float32Array[];              // required iff action.type === 'candidates'; >= 1 entry while !done
  humanAct?(input: HumanInput): Action | null; // required iff def.human; null = do not step this tick (turn-based input)
  dispose?(): void;                           // release native resources (Rapier worlds); learners and runners call it when dropping an env
}

export interface EnvDefinition {
  meta: EnvMeta;
  observation: ObservationSpec;
  action: ActionSpec;
  rewardTerms: RewardTermSpec[];
  presets: RewardPreset[];                    // first preset is named 'default' and equals the defaultWeights
  human?: HumanSpec;
  train?: TrainDefaults;                      // per-env learner overrides
  prepare?(): Promise<void>;                  // one-time async init (Rapier WASM); awaited before create()
  create(): Env;
}

/** The JSON-safe part of a definition, sent in the worker's 'ready' message. */
export type EnvSpecMsg = Pick<EnvDefinition, 'meta' | 'observation' | 'action' | 'rewardTerms' | 'presets' | 'human' | 'train'>;
