import type { EnvDefinition, RewardConfig } from './types';

export function applyPreset(def: EnvDefinition, name: string): RewardConfig {
  const preset = def.presets.find((p) => p.name === name);
  if (!preset) throw new Error(`unknown preset: ${name}`);
  return { version: 1, envId: def.meta.id, preset: name, weights: { ...preset.weights } };
}

export function defaultReward(def: EnvDefinition): RewardConfig { return applyPreset(def, 'default'); }

/** Magnitudes become signed: reward terms +w, penalty terms -w. Missing keys fall back to defaultWeight. */
export function signedWeights(def: EnvDefinition, cfg: RewardConfig): Float32Array {
  return Float32Array.from(def.rewardTerms, (t) => {
    const w = cfg.weights[t.key] ?? t.defaultWeight;
    return t.kind === 'penalty' ? -w : w;
  });
}

export function fitness(terms: Float32Array, signed: Float32Array): number {
  let f = 0;
  for (let i = 0; i < signed.length; i++) f += signed[i]! * terms[i]!;
  return f;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateReward(def: EnvDefinition, json: unknown): { ok: true; cfg: RewardConfig } | { ok: false; errors: string[] } {
  if (!isObject(json)) return { ok: false, errors: ['Reward config must be a JSON object.'] };
  const errors: string[] = [];
  if (json.version !== 1) errors.push('"version" must be 1.');
  if (json.envId !== def.meta.id) errors.push(`"envId" must be "${def.meta.id}".`);
  const weights: Record<string, number> = {};
  if (!isObject(json.weights)) errors.push('"weights" must be an object.');
  else {
    const known = new Set(def.rewardTerms.map((t) => t.key));
    for (const [key, w] of Object.entries(json.weights)) {
      if (!known.has(key)) errors.push(`Unknown reward term "${key}".`);
      else if (typeof w !== 'number' || !Number.isFinite(w)) errors.push(`Weight "${key}" must be a finite number.`);
      else if (w < 0) errors.push(`Weight "${key}" must be >= 0 (the sign comes from the term kind).`);
      else weights[key] = w;
    }
  }
  if (errors.length) return { ok: false, errors };
  const preset = typeof json.preset === 'string' && def.presets.some((p) => p.name === json.preset) ? json.preset : null;
  return { ok: true, cfg: { version: 1, envId: def.meta.id, preset, weights } };
}
