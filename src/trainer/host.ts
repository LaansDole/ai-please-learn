import { getEnv, prepareEnv } from '../env/registry';
import type { EnvDefinition } from '../env/types';
import { registerBuiltins } from '../envs/index';
import { toDefinition } from '../gen/generatedEnv';
import { validateMeta, type GeneratedMeta } from '../gen/meta';
import { compileGenerated, lockdown } from '../gen/sandbox';
import { scanSource } from '../gen/scan';
import { validateModule } from '../gen/validator';
import type { EnvRef, ToWorker } from './protocol';
import { TrainRunner, type Post, type Scheduler } from './runner';
import { StageRunner } from './stage';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Generated modules get the worker locked down first, then pass the metadata check and the static scan again before they are compiled. */
async function loadRef(ref: EnvRef, scope: Record<string, unknown>): Promise<EnvDefinition> {
  if (ref.kind === 'builtin') { registerBuiltins(); return getEnv(ref.id); }
  lockdown(scope);
  const error = validateMeta(ref.meta)[0] ?? scanSource(ref.source)[0];
  if (error) throw new Error(error);
  return toDefinition(ref.id, ref.meta as GeneratedMeta, compileGenerated(ref.source));
}

/**
 * The worker's message handler, free of worker globals so it runs in Node tests. Never throws: failures are posted as 'error'.
 * `scope` is the global that lockdown strips for generated code (tests pass a plain object).
 */
export function createHost(
  post: Post, sched: Scheduler, loadEnv?: (ref: EnvRef) => Promise<EnvDefinition>, scope: Record<string, unknown> = globalThis as never,
): (msg: ToWorker) => Promise<void> {
  loadEnv ??= (ref) => loadRef(ref, scope);
  let train: TrainRunner | null = null, stage: StageRunner | null = null;
  // Work the runners defer (ticks, env code) reports failures the same way as message handlers.
  const guarded: Scheduler = {
    now: sched.now,
    defer: (fn, ms) => sched.defer(() => { try { fn(); } catch (e) { post({ t: 'error', message: message(e) }); } }, ms),
  };
  return async (msg) => {
    try {
      if (msg.t === 'validate') {
        lockdown(scope);
        post({ t: 'validated', report: validateModule(msg.source, msg.meta) });
      } else if (msg.t === 'init') {
        const def = await loadEnv(msg.env);
        await prepareEnv(def);
        train = new TrainRunner(def, post, guarded);
        stage = new StageRunner(def, post, guarded);
        const { meta, observation, action, rewardTerms, presets, human, train: trainDefaults } = def;
        post({ t: 'ready', spec: { meta, observation, action, rewardTerms, presets, human, train: trainDefaults } });
      } else if (!train || !stage) throw new Error('init must be the first message');
      else if (msg.t.startsWith('train/')) train.handle(msg);
      else stage.handle(msg);
    } catch (e) {
      post({ t: 'error', message: message(e) });
    }
  };
}
