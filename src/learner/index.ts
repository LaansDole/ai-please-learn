import type { EnvDefinition, RewardConfig } from '../env/types';
import type { LearnerConfig } from './config';
import { DqnLearner } from './dqnLearner';
import { NeatLearner } from './neatLearner';
import { PpoLearner } from './ppoLearner';
import type { Learner } from './types';

export function createLearner(cfg: LearnerConfig, def: EnvDefinition, reward: RewardConfig, seed: number): Learner {
  if (cfg.kind === 'neat') return new NeatLearner(cfg.neat, def, reward, seed);
  if (cfg.kind === 'dqn') return new DqnLearner(cfg.dqn, def, reward, seed);
  return new PpoLearner(cfg.ppo, def, reward, seed);
}
