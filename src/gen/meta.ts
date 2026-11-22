import type { HumanSpec, RewardPreset, RewardTermSpec } from '../env/types';

/** The metadata block of a generated concept (spec section 12.3). */
export interface GeneratedMeta {
  name: string;                 // <= 40 chars
  tagline: string;              // <= 80 chars
  description: string;
  fps: number;                  // integer 10..60
  maxSteps: number;             // integer 50..5000
  observation: { labels: string[] };          // 1..32
  action: { type: 'discrete' | 'continuous'; labels: string[] };  // discrete 2..8, continuous 1..6
  rewardTerms: RewardTermSpec[];              // 1..8, at least one of kind 'reward'
  presets: RewardPreset[];                    // 'default', 'aggressive', 'survivalist'
  human: HumanSpec;                           // 1..8 keys
}

const PRESET_NAMES = ['default', 'aggressive', 'survivalist'];
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const got = (v: unknown) => (typeof v === 'string' ? `"${v.length > 30 ? `${v.slice(0, 30)}...` : v}"` : Array.isArray(v) ? 'an array' : v === null ? 'null' : typeof v === 'object' ? 'an object' : String(v));

/** Check 2 of spec section 12.6. One sentence per problem, each naming the offending field; empty when the metadata is usable. */
export function validateMeta(meta: unknown): string[] {
  if (!isObj(meta)) return [`metadata must be a JSON object (got ${got(meta)})`];
  const errors: string[] = [];
  const text = (v: unknown, field: string, max?: number): v is string => {
    if (typeof v !== 'string' || !v.trim()) { errors.push(`${field} must be a non-empty string (got ${got(v)})`); return false; }
    if (max && v.length > max) { errors.push(`${field} must be at most ${max} characters (got ${v.length})`); return false; }
    return true;
  };
  const int = (v: unknown, field: string, lo: number, hi: number) => {
    if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) errors.push(`${field} must be an integer from ${lo} to ${hi} (got ${got(v)})`);
  };
  /** True when v is a list of lo..hi items. */
  const list = (v: unknown, field: string, lo: number, hi: number): v is unknown[] => {
    if (Array.isArray(v) && v.length >= lo && v.length <= hi) return true;
    errors.push(`${field} must have ${lo} to ${hi} entries (got ${Array.isArray(v) ? v.length : got(v)})`);
    return false;
  };
  const labels = (v: unknown, field: string, lo: number, hi: number) => {
    if (list(v, field, lo, hi)) v.forEach((l, i) => text(l, `${field}[${i}]`));
  };

  text(meta.name, 'name', 40); text(meta.tagline, 'tagline', 80); text(meta.description, 'description');
  int(meta.fps, 'fps', 10, 60); int(meta.maxSteps, 'maxSteps', 50, 5000);

  if (!isObj(meta.observation)) errors.push(`observation must be an object with a labels array (got ${got(meta.observation)})`);
  else labels(meta.observation.labels, 'observation.labels', 1, 32);

  const action = meta.action;
  if (!isObj(action)) errors.push(`action must be an object with type and labels (got ${got(action)})`);
  else if (action.type !== 'discrete' && action.type !== 'continuous') errors.push(`action.type must be "discrete" or "continuous" (got ${got(action.type)})`);
  else if (action.type === 'discrete') labels(action.labels, 'action.labels', 2, 8);
  else labels(action.labels, 'action.labels', 1, 6);

  const weights = new Map<string, number>();     // term key -> defaultWeight
  const terms = meta.rewardTerms;
  if (list(terms, 'rewardTerms', 1, 8)) {
    terms.forEach((t, i) => {
      const f = `rewardTerms[${i}]`;
      if (!isObj(t)) { errors.push(`${f} must be an object (got ${got(t)})`); return; }
      if (typeof t.key !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(t.key)) errors.push(`${f}.key must be a camelCase identifier (got ${got(t.key)})`);
      else if (weights.has(t.key)) errors.push(`${f}.key "${t.key}" is used twice - term keys must be unique`);
      if (t.kind !== 'reward' && t.kind !== 'penalty') errors.push(`${f}.kind must be "reward" or "penalty" (got ${got(t.kind)})`);
      text(t.description, `${f}.description`);
      const w = t.defaultWeight;
      if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) errors.push(`${f}.defaultWeight must be a finite number >= 0 (got ${got(w)})`);
      if (typeof t.key === 'string' && !weights.has(t.key)) weights.set(t.key, w as number);
    });
    if (!terms.some((t) => isObj(t) && t.kind === 'reward')) errors.push('rewardTerms must contain at least one term of kind "reward"');
  }

  const presets = meta.presets;
  if (!Array.isArray(presets)) errors.push(`presets must be an array (got ${got(presets)})`);
  else {
    for (const name of PRESET_NAMES) if (!presets.some((p) => isObj(p) && p.name === name)) errors.push(`presets must include a preset named "${name}"`);
    presets.forEach((p, i) => {
      const f = `presets[${i}]`;
      if (!isObj(p)) { errors.push(`${f} must be an object (got ${got(p)})`); return; }
      if (!PRESET_NAMES.includes(p.name as string)) errors.push(`${f}.name must be "default", "aggressive" or "survivalist" (got ${got(p.name)})`);
      text(p.description, `${f}.description`);
      if (!isObj(p.weights)) { errors.push(`${f}.weights must be an object of term key to number (got ${got(p.weights)})`); return; }
      if (!Array.isArray(terms)) return;
      for (const [k, w] of Object.entries(p.weights)) {
        if (!weights.has(k)) errors.push(`${f}.weights.${k} does not match any rewardTerms key`);
        else if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) errors.push(`${f}.weights.${k} must be a finite number >= 0 (got ${got(w)})`);
        else if (p.name === 'default' && w !== weights.get(k)) errors.push(`${f}.weights.${k} is ${w} but the "default" preset must equal the defaultWeight (${weights.get(k)})`);
      }
      if (p.name === 'default') for (const k of weights.keys()) if (!(k in p.weights)) errors.push(`${f}.weights.${k} is missing - the "default" preset must list every term with its defaultWeight`);
    });
  }

  const human = meta.human;
  if (!isObj(human)) errors.push(`human must be an object with hint and keys (got ${got(human)})`);
  else {
    text(human.hint, 'human.hint');
    if (list(human.keys, 'human.keys', 1, 8)) human.keys.forEach((k, i) => {
      if (!isObj(k)) { errors.push(`human.keys[${i}] must be an object with code and label (got ${got(k)})`); return; }
      text(k.code, `human.keys[${i}].code`); text(k.label, `human.keys[${i}].label`);
    });
  }
  return errors;
}

/** `gen-<kebab of name, max 24 chars>-<4 hex>`; a valid EnvMeta id. */
export function slugId(name: string, rng: () => number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 24).replace(/-+$/, '') || 'concept';
  return `gen-${slug}-${Math.floor(rng() * 0x10000).toString(16).padStart(4, '0')}`;
}
