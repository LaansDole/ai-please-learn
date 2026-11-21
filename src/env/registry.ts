import type { EnvDefinition } from './types';

const registry = new Map<string, EnvDefinition>();

/** One sentence per problem; empty when the definition is usable. */
export function validateDefinition(def: EnvDefinition): string[] {
  const errors: string[] = [];
  const { meta, action } = def;
  if (!/^[a-z][a-z0-9-]*$/.test(meta.id)) errors.push(`meta.id "${meta.id}" must match /^[a-z][a-z0-9-]*$/.`);
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
    for (const k of Object.keys(p.weights)) if (!keys.has(k)) errors.push(`Preset "${p.name}" references unknown reward term "${k}".`);
  }

  // ponytail: an instance is only created when a method must be checked; envs needing prepare() first must not also need these checks before it.
  if (action.type === 'candidates' || def.human) {
    const env = def.create();
    if (action.type === 'candidates' && typeof env.candidates !== 'function') errors.push('A candidates action requires env.candidates().');
    if (def.human && typeof env.humanAct !== 'function') errors.push('A human spec requires env.humanAct().');
    env.dispose?.();
  }
  return errors;
}

export function registerEnv(def: EnvDefinition): void {
  if (registry.has(def.meta.id)) throw new Error(`duplicate environment: ${def.meta.id}`);
  const errors = validateDefinition(def);
  if (errors.length) throw new Error(`invalid environment ${def.meta.id}: ${errors.join(' ')}`);
  registry.set(def.meta.id, def);
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
