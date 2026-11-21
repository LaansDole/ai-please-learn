import { getEnv, prepareEnv } from '../env/registry';
import type { EnvDefinition } from '../env/types';
import { registerBuiltins } from '../envs/index';
import type { EnvRef, ToWorker } from './protocol';
import { TrainRunner, type Post, type Scheduler } from './runner';
import { StageRunner } from './stage';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function loadBuiltin(ref: EnvRef): Promise<EnvDefinition> {
  if (ref.kind !== 'builtin') throw new Error('generated environments are added in chunk C7');
  registerBuiltins();
  return getEnv(ref.id);
}

/** The worker's message handler, free of worker globals so it runs in Node tests. Never throws: failures are posted as 'error'. */
export function createHost(post: Post, sched: Scheduler, loadEnv: (ref: EnvRef) => Promise<EnvDefinition> = loadBuiltin): (msg: ToWorker) => Promise<void> {
  let train: TrainRunner | null = null, stage: StageRunner | null = null;
  // Work the runners defer (ticks, env code) reports failures the same way as message handlers.
  const guarded: Scheduler = {
    now: sched.now,
    defer: (fn, ms) => sched.defer(() => { try { fn(); } catch (e) { post({ t: 'error', message: message(e) }); } }, ms),
  };
  return async (msg) => {
    try {
      if (msg.t === 'init') {
        const def = await loadEnv(msg.env);
        await prepareEnv(def);
        train = new TrainRunner(def, post, guarded);
        stage = new StageRunner(def, post, guarded);
        const { meta, observation, action, rewardTerms, presets, human, train: trainDefaults } = def;
        post({ t: 'ready', spec: { meta, observation, action, rewardTerms, presets, human, train: trainDefaults } });
      } else if (!train || !stage) throw new Error('init must be the first message');
      else if (msg.t === 'validate') throw new Error('validation is added in chunk C7');
      else if (msg.t.startsWith('train/')) train.handle(msg);
      else stage.handle(msg);
    } catch (e) {
      post({ t: 'error', message: message(e) });
    }
  };
}
