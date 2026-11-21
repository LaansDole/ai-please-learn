import type { EnvDefinition, LearnerKind } from '../env/types';
import { DEFAULT_NEAT, type NeatConfig } from '../neat/config';

/** Fields and defaults: spec section 8.2. */
export interface DqnConfig {
  hidden: number[]; gamma: number; lr: number; batchSize: number; bufferSize: number; learnStart: number; trainEvery: number;
  epsilonStart: number; epsilonEnd: number; epsilonDecaySteps: number; targetSyncEvery: number; maxGradNorm: number;
  episodesPerIteration: number;
}
/** Fields and defaults: spec section 8.3. */
export interface PpoConfig {
  hidden: number[]; nEnvs: number; rolloutLen: number; gamma: number; lambda: number; lr: number;
  clipEps: number; epochs: number; minibatchSize: number; valueCoef: number; entropyCoef: number; maxGradNorm: number;
}

export type LearnerConfig =
  | { kind: 'neat'; neat: NeatConfig }
  | { kind: 'dqn'; dqn: DqnConfig }
  | { kind: 'ppo'; ppo: PpoConfig };
export interface TrainDefaults { neat?: Partial<NeatConfig>; dqn?: Partial<DqnConfig>; ppo?: Partial<PpoConfig> }

export const DEFAULT_DQN: DqnConfig = {
  hidden: [32, 32], gamma: 0.99, lr: 5e-4, batchSize: 32, bufferSize: 50000, learnStart: 1000, trainEvery: 4,
  epsilonStart: 1.0, epsilonEnd: 0.05, epsilonDecaySteps: 30000, targetSyncEvery: 1000, maxGradNorm: 10,
  episodesPerIteration: 5,
};
export const DEFAULT_PPO: PpoConfig = {
  hidden: [32, 32], nEnvs: 8, rolloutLen: 256, gamma: 0.99, lambda: 0.95, lr: 3e-4,
  clipEps: 0.2, epochs: 4, minibatchSize: 256, valueCoef: 0.5, entropyCoef: 0.01, maxGradNorm: 0.5,
};

/** Later layers win; only keys that exist in `base` are taken, so overrides for other learners are ignored. */
function layer<T extends object>(base: T, ...layers: (object | undefined)[]): T {
  const out = { ...base };
  for (const l of layers) {
    if (!l) continue;
    for (const k of Object.keys(base) as (keyof T)[]) {
      const v = (l as Partial<T>)[k];
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

export function resolveConfig(
  kind: LearnerKind, def: Pick<EnvDefinition, 'train' | 'action'>, overrides?: Partial<NeatConfig & DqnConfig & PpoConfig>,
): LearnerConfig {
  switch (kind) {
    case 'neat': return { kind, neat: layer(DEFAULT_NEAT, def.train?.neat, overrides) };
    case 'dqn': return { kind, dqn: layer(DEFAULT_DQN, def.train?.dqn, overrides) };
    case 'ppo': {
      const base = { ...DEFAULT_PPO, entropyCoef: def.action.type === 'continuous' ? 0 : DEFAULT_PPO.entropyCoef };
      return { kind, ppo: layer(base, def.train?.ppo, overrides) };
    }
  }
}
