import { prepareEnv } from '../env/registry';
import { defaultReward } from '../env/reward';
import type { EnvDefinition, RewardConfig } from '../env/types';
import type { LearnerConfig } from '../learner/config';
import { createLearner } from '../learner/index';
import type { IterationStats } from '../learner/types';

export interface HeadlessOptions {
  def: EnvDefinition; learner: LearnerConfig; reward?: RewardConfig; seed: number;
  iterations: number; maxEnvSteps?: number; onIteration?(s: IterationStats): void;
}

/** Trains flat out with no worker, scheduler or frames. Used by Node tests and benchmarks. */
export async function runHeadless(o: HeadlessOptions): Promise<IterationStats[]> {
  await prepareEnv(o.def);
  const learner = createLearner(o.learner, o.def, o.reward ?? defaultReward(o.def), o.seed);
  const out: IterationStats[] = [];
  try {
    while (out.length < o.iterations) {
      if (!learner.tick()) continue;
      const s = learner.stats();
      out.push(s);
      o.onIteration?.(s);
      if (o.maxEnvSteps !== undefined && s.envSteps >= o.maxEnvSteps) break;
    }
  } finally {
    learner.dispose();
  }
  return out;
}
