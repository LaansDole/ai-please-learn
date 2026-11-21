import type { EnvSpecMsg, RewardConfig, RenderFrame } from '../env/types';
import type { LearnerConfig } from '../learner/config';
import type { IterationStats, NetworkSnapshot, PolicySnapshot } from '../learner/types';
import type { ValidationReport } from '../gen/validator';

export type EnvRef =
  | { kind: 'builtin'; id: string }
  | { kind: 'generated'; id: string; source: string; meta: unknown };   // meta = parsed metadata JSON (section 12.3)

export type SpeedMult = 1 | 2 | 5 | 10 | 100 | 1000;
export type Speed = { mode: 'paused' } | { mode: 'live'; mult: SpeedMult } | { mode: 'max' };

export type ToWorker =
  | { t: 'init'; env: EnvRef }
  | { t: 'train/start'; learner: LearnerConfig; reward: RewardConfig; seed: number; speed: Speed; ghosts: boolean; runId: number }
  | { t: 'train/speed'; speed: Speed }
  | { t: 'train/step' }                                   // run to the end of the current iteration, then pause
  | { t: 'train/reward'; reward: RewardConfig }           // applies from the next iteration
  | { t: 'train/ghosts'; ghosts: boolean }
  | { t: 'train/stop' }
  | { t: 'stage/play'; seed: number; reward: RewardConfig }
  | { t: 'stage/input'; held: string[]; pressed: string[] }
  | { t: 'stage/replay'; policy: PolicySnapshot; seed: number; reward: RewardConfig }
  | { t: 'stage/reward'; reward: RewardConfig }
  | { t: 'stage/stop' }
  | { t: 'validate'; source: string; meta: unknown };

export interface FrameMsg {
  t: 'frame';
  source: 'train' | 'play' | 'replay';
  runId?: number;               // train frames: the run they belong to
  frame: RenderFrame;
  tick: number;                 // env step within the featured episode
  fitness: number;              // featured agent, current episode, current reward config
  terms: number[];              // featured agent's cumulative reward terms
  activations?: Float32Array;   // aligned with the last 'network' message's nodes
  outputs?: Float32Array;       // output activations | Q-values | action probabilities | action means
}

export type FromWorker =
  | { t: 'ready'; spec: EnvSpecMsg }
  | FrameMsg
  | { t: 'network'; source: 'train' | 'replay'; runId?: number; net: NetworkSnapshot }
  | { t: 'iteration'; runId: number; stats: IterationStats }
  | { t: 'status'; runId: number; state: 'idle' | 'running' | 'paused'; iteration: number; ticksPerSec: number; effectiveMult: number }
  | { t: 'episode'; source: 'play' | 'replay'; fitness: number; terms: number[]; steps: number }
  | { t: 'validated'; report: ValidationReport }
  | { t: 'error'; message: string };
