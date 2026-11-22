import type { Action, Env, LearnerKind, RewardConfig } from '../env/types';
import type { Genome } from '../neat/genome';

export interface NetworkSnapshot {
  nodes: { id: number; type: 'input' | 'hidden' | 'output'; depth: number; label?: string }[];  // depth: integer layer, inputs 0
  edges: { from: number; to: number; weight: number; enabled: boolean; delta?: number }[];      // delta in [0,1]: |weight change| in the last update / max
  maxDepth: number;
}

export type PolicySnapshot =
  | { kind: 'neat'; genome: Genome }
  | { kind: 'mlp'; algo: 'dqn' | 'ppo'; sizes: number[]; hidden: 'tanh' | 'relu'; params: Float32Array };
  // mlp output layout: dqn -> one Q per discrete action. ppo discrete -> logits then value. ppo continuous -> means then value.

export interface IterationStats {
  iteration: number;                 // 1-based; NEAT generation | PPO rollout+update | DQN episodesPerIteration episodes
  learner: LearnerKind;
  best: number; mean: number; median: number;   // episode fitness/return over the episodes finished in this iteration; NaN when none finished (PPO)
  episodes: number;
  envSteps: number;                  // cumulative
  rewardVersion: number;             // increments each time a staged reward config is applied
  champion: PolicySnapshot;          // NEAT: best genome of the generation. RL: weights at the end of the iteration
  neat?: { population: number; species: { id: number; size: number; best: number }[]; nodes: number; conns: number };
  rl?: { policyLoss?: number; valueLoss?: number; tdLoss?: number; entropy?: number; epsilon?: number; returns: number[] };
}

export interface LiveView {
  envs: readonly Env[];              // every env currently being stepped
  alive: readonly boolean[];
  featured: number;                  // index into envs: the agent drawn solid and shown in the NN graph
  network(): NetworkSnapshot;        // featured agent
  networkVersion: number;            // changes whenever network() would return different topology/weights
  activations(): Float32Array;       // aligned with network().nodes
  outputs(): Float32Array;           // output activations | Q-values | action probabilities | action means
  fitness(): number;                 // featured agent, current episode
}

export interface Learner {
  readonly kind: LearnerKind;
  readonly iteration: number;        // completed iterations
  tick(): boolean;                   // step every live env once (plus any learning due); true when this tick completed an iteration
  stats(): IterationStats;           // of the most recently completed iteration; throws before the first
  setReward(cfg: RewardConfig): void; // staged; applied at the next iteration boundary
  live(): LiveView;
  dispose(): void;
}

export interface Policy {            // deterministic replay of a snapshot
  act(env: Env): Action;             // reads env.observe() or env.candidates()
  network(): NetworkSnapshot;
  activations(): Float32Array;
  outputs(): Float32Array;
}

const ITERATION_LABELS = { neat: 'Generation', ppo: 'Update', dqn: 'Round' } as const;
export function iterationLabel(kind: LearnerKind): 'Generation' | 'Update' | 'Round' { return ITERATION_LABELS[kind]; }
