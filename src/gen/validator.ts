import { checkConformance, checkLearnability } from '../env/conformance';
import { toDefinition } from './generatedEnv';
import { validateMeta, type GeneratedMeta } from './meta';
import { compileGenerated } from './sandbox';
import { scanSource } from './scan';
import { makeSdk, type GeneratedSdk } from './sdk';

export interface ValidationReport { ok: boolean; errors: string[]; warnings: string[]; stats?: { steps: number; episodes: number; ms: number } }

const MAX_ERRORS = 8, BUDGET_MS = 3000;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fail = (errors: string[]): ValidationReport => ({ ok: false, errors: errors.slice(0, MAX_ERRORS), warnings: [] });

/**
 * Checks 2 to 12 of spec section 12.6, then the learnability check, stopping at the first failing group. Executes the module: call it only inside a worker
 * (or in Node tests). `now` is used only for stats.ms and the time budget.
 */
export function validateModule(source: string, meta: unknown, now: () => number = () => performance.now()): ValidationReport {
  const t0 = now();
  const metaErrors = validateMeta(meta);
  if (metaErrors.length) return fail(metaErrors);
  const m = meta as GeneratedMeta;
  const scan = scanSource(source);
  if (scan.length) return fail(scan);

  let createEnv: (sdk: GeneratedSdk) => unknown;
  try { createEnv = compileGenerated(source); } catch (e) { return fail([`the module failed to load: ${message(e)}`]); }
  let raw: Record<string, unknown>;
  try {
    const made = createEnv(makeSdk());
    if (typeof made !== 'object' || made === null) return fail(['createEnv(sdk) must return an object with reset, step, observe, done, terms, render and humanAct']);
    raw = made as Record<string, unknown>;
  } catch (e) { return fail([`createEnv(sdk) threw: ${message(e)}`]); }

  const errors: string[] = [];
  for (const name of ['reset', 'step', 'observe', 'render', 'humanAct']) if (typeof raw[name] !== 'function') errors.push(`${name} must be a function`);
  const lengthOf = (v: unknown) => (typeof v === 'object' && v !== null && typeof (v as { length?: unknown }).length === 'number' ? (v as ArrayLike<number>).length : -1);
  if (lengthOf(raw.terms) < 0) errors.push('terms must be an array of numbers');
  if (!('done' in raw)) errors.push('done must be readable (define it as "get done() { return done; }")');
  if (errors.length) return fail(errors);

  try {
    (raw.reset as (seed: number) => void)(1);
    const nObs = lengthOf((raw.observe as () => unknown)());
    if (nObs < 0) errors.push('observe() must return an array of numbers');
    else if (nObs !== m.observation.labels.length) errors.push(`observe() returned ${nObs} values but observation.labels has ${m.observation.labels.length}`);
    if (lengthOf(raw.terms) !== m.rewardTerms.length) errors.push(`terms has ${lengthOf(raw.terms)} entries but rewardTerms has ${m.rewardTerms.length}`);
    if (typeof raw.done !== 'boolean') errors.push(`done must be a boolean (got ${typeof raw.done})`);
    else if (raw.done) errors.push('done must be false right after reset');
  } catch (e) { errors.push(`reset(1) or observe() threw: ${message(e)}`); }
  if (errors.length) return fail(errors);

  const def = toDefinition('gen-validate', m, createEnv);
  const rep = checkConformance(def, { steps: 2000, seed: 12345, obsBound: 100 });
  errors.push(...rep.errors);
  if (!errors.length) {
    try { errors.push(...checkLearnability(def)); } catch (e) { errors.push(`random play threw: ${message(e)}`); }
  }
  const ms = now() - t0;
  if (ms > BUDGET_MS) errors.unshift(`validation took too long (${Math.round(ms)} ms); make step() and render() cheaper`);
  return { ok: errors.length === 0, errors: errors.slice(0, MAX_ERRORS), warnings: rep.warnings, stats: { steps: rep.steps, episodes: rep.episodes, ms } };
}
