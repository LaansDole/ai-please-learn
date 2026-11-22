import type { EnvDefinition } from './types';

const registry = new Map<string, EnvDefinition>();

/**
 * Concept pages live at the top level of the site ("/pong"), next to these: the app's own pages, what the build and the
 * deployment put there (assets, demo), the dev server's own paths (api, src, public) and the old "/c/" prefix.
 * Generated ids always start with "gen-", so only built-in ids can collide.
 */
export const RESERVED_IDS: ReadonlySet<string> = new Set(['create', 'settings', 'assets', 'demo', 'api', 'src', 'public', 'index', 'c']);

function staticErrors(def: EnvDefinition): string[] {
  const errors: string[] = [];
  const { meta, action } = def;
  if (!/^[a-z][a-z0-9-]*$/.test(meta.id)) errors.push(`meta.id "${meta.id}" must match /^[a-z][a-z0-9-]*$/.`);
  if (RESERVED_IDS.has(meta.id)) errors.push(`meta.id "${meta.id}" is reserved for a page or a folder of the site.`);
  if (def.observation.labels.length === 0) errors.push('observation.labels must not be empty.');
  if (action.type !== 'candidates' && action.labels.length === 0) errors.push('action.labels must not be empty.');
  if (meta.learners.length === 0) errors.push('meta.learners must not be empty.');
  if (meta.learners.includes('dqn') && action.type !== 'discrete') errors.push('The dqn learner requires a discrete action.');
  if (meta.learners.includes('ppo') && action.type === 'candidates') errors.push('The ppo learner requires a discrete or continuous action.');

  const keys = new Set<string>();
  if (def.rewardTerms.length === 0) errors.push('rewardTerms must not be empty.');
  for (const t of def.rewardTerms) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(t.key)) errors.push(`Reward term key "${t.key}" must match /^[a-z][a-zA-Z0-9]*$/.`);
    if (keys.has(t.key)) errors.push(`Duplicate reward term key "${t.key}".`);
    keys.add(t.key);
    if (!(t.defaultWeight >= 0)) errors.push(`Reward term "${t.key}" needs a defaultWeight >= 0.`);
  }
  if (def.presets[0]?.name !== 'default') errors.push('The first preset must be named "default".');
  else if (def.rewardTerms.some((t) => def.presets[0]!.weights[t.key] !== t.defaultWeight)) errors.push('The "default" preset must equal the defaultWeights.');
  for (const p of def.presets) {
    for (const [k, w] of Object.entries(p.weights)) {
      if (!keys.has(k)) errors.push(`Preset "${p.name}" references unknown reward term "${k}".`);
      else if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) errors.push(`Preset "${p.name}" needs a finite weight >= 0 for "${k}".`);
    }
  }

  return errors;
}

/** Checks that need a created instance. Only valid once `def.prepare` (if any) has resolved. */
function instanceErrors(def: EnvDefinition): string[] {
  const errors: string[] = [];
  if (def.action.type !== 'candidates' && !def.human) return errors;
  const env = def.create();
  if (def.action.type === 'candidates' && typeof env.candidates !== 'function') errors.push('A candidates action requires env.candidates().');
  if (def.human && typeof env.humanAct !== 'function') errors.push('A human spec requires env.humanAct().');
  env.dispose?.();
  return errors;
}

/** One sentence per problem; empty when the definition is usable. Creates an instance: for envs with `prepare`, call after it resolved. */
export function validateDefinition(def: EnvDefinition): string[] {
  return [...staticErrors(def), ...instanceErrors(def)];
}

/** Envs with `prepare` cannot be instantiated yet, so their instance checks run in `prepareEnv`. */
export function registerEnv(def: EnvDefinition): void {
  if (registry.has(def.meta.id)) throw new Error(`duplicate environment: ${def.meta.id}`);
  const errors = def.prepare ? staticErrors(def) : validateDefinition(def);
  if (errors.length) throw new Error(`invalid environment ${def.meta.id}: ${errors.join(' ')}`);
  registry.set(def.meta.id, def);
}

/** The one way to get a definition ready for `create()`: awaits `prepare` and then finishes the validation `registerEnv` deferred. */
export async function prepareEnv(def: EnvDefinition): Promise<void> {
  if (!def.prepare) return;
  await def.prepare();
  const errors = instanceErrors(def);
  if (errors.length) throw new Error(`invalid environment ${def.meta.id}: ${errors.join(' ')}`);
}

export function getEnv(id: string): EnvDefinition {
  const def = registry.get(id);
  if (!def) throw new Error(`unknown environment: ${id}`);
  return def;
}

/** Registration order. */
export function listEnvs(): EnvDefinition[] { return [...registry.values()]; }

/** Tests only. */
export function clearRegistry(): void { registry.clear(); }
