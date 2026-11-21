import { defaultReward, validateReward, type RewardSpec } from '../env/reward';
import type { EnvSpecMsg, LearnerKind, RewardConfig } from '../env/types';
import { resolveConfig } from '../learner/config';
import type { Speed, SpeedMult } from '../trainer/protocol';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function memoryStore(): Store {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
}
function defaultStore(): Store {
  try { if (typeof localStorage !== 'undefined' && localStorage) return localStorage; } catch { /* blocked storage: fall through */ }
  return memoryStore();
}
let store = defaultStore();

/** Tests and embedders swap the backing store. */
export function setStorage(s: Store): void { store = s; }

/** Undefined for missing or corrupt values (spec section 13: they are replaced with defaults). */
function read(key: string): unknown {
  try { const raw = store.getItem(key); return raw === null ? undefined : JSON.parse(raw); } catch { return undefined; }
}
function write(key: string, value: unknown): void {
  try { store.setItem(key, JSON.stringify(value)); } catch { /* quota or blocked storage: preferences just do not persist */ }
}

export function loadReward(spec: RewardSpec): RewardConfig {
  const r = validateReward(spec, read(`evolab.reward.v1.${spec.meta.id}`));
  return r.ok ? r.cfg : defaultReward(spec);
}
export function saveReward(cfg: RewardConfig): void { write(`evolab.reward.v1.${cfg.envId}`, cfg); }

export interface RunPrefs { learner: LearnerKind; seed: number; population: number; ghosts: boolean; speed: Speed }
export const POPULATION_MIN = 10, POPULATION_MAX = 500;
const MULTS = [1, 2, 5, 10, 100, 1000];

/** Each invalid field falls back to its default on its own. `paused` is never a stored preference. */
export function loadRunPrefs(spec: EnvSpecMsg): RunPrefs {
  const neat = resolveConfig('neat', spec);
  const out: RunPrefs = {
    learner: spec.meta.learners[0]!, seed: 1, population: neat.kind === 'neat' ? neat.neat.populationSize : 150,
    ghosts: true, speed: { mode: 'live', mult: 1 },
  };
  const v = read(`evolab.run.v1.${spec.meta.id}`);
  if (typeof v !== 'object' || v === null) return out;
  const p = v as Record<string, unknown>, speed = p.speed as { mode?: unknown; mult?: unknown } | null | undefined;
  if (spec.meta.learners.includes(p.learner as LearnerKind)) out.learner = p.learner as LearnerKind;
  if (Number.isInteger(p.seed) && (p.seed as number) >= 0) out.seed = p.seed as number;
  if (Number.isInteger(p.population) && (p.population as number) >= POPULATION_MIN && (p.population as number) <= POPULATION_MAX) out.population = p.population as number;
  if (typeof p.ghosts === 'boolean') out.ghosts = p.ghosts;
  if (speed?.mode === 'max') out.speed = { mode: 'max' };
  else if (speed?.mode === 'live' && MULTS.includes(speed.mult as number)) out.speed = { mode: 'live', mult: speed.mult as SpeedMult };
  return out;
}
export function saveRunPrefs(envId: string, p: RunPrefs): void { write(`evolab.run.v1.${envId}`, p); }
