import type { ActionSpec, EnvSpecMsg, RewardConfig } from '../env/types';
import type { LearnerConfig } from '../learner/config';
import type { IterationStats, PolicySnapshot } from '../learner/types';
import type { Genome } from '../neat/genome';

export interface ChampionExport {
  format: 'evolab-champion'; version: 1; exportedAt: string;           // ISO 8601
  env: { id: string; observationSize: number; action: ActionSpec };
  learner: LearnerConfig; reward: RewardConfig; seed: number; iteration: number;
  stats: { best: number; mean: number; median: number };
  policy: { kind: 'neat'; genome: Genome } | { kind: 'mlp'; algo: 'dqn' | 'ppo'; sizes: number[]; hidden: 'tanh' | 'relu'; params: number[] };
}

export function toExport(
  spec: EnvSpecMsg, run: { learner: LearnerConfig; seed: number; reward: RewardConfig },
  stats: Pick<IterationStats, 'iteration' | 'best' | 'mean' | 'median'>, policy: PolicySnapshot, now: Date,
): ChampionExport {
  return {
    format: 'evolab-champion', version: 1, exportedAt: now.toISOString(),
    env: { id: spec.meta.id, observationSize: spec.observation.labels.length, action: spec.action },
    learner: run.learner, reward: run.reward, seed: run.seed, iteration: stats.iteration,
    stats: { best: stats.best, mean: stats.mean, median: stats.median },
    policy: policy.kind === 'neat' ? policy : { ...policy, params: Array.from(policy.params) },
  };
}

export function exportFileName(e: ChampionExport): string { return `evolab-${e.env.id}-${e.learner.kind}-g${e.iteration}.json`; }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Structural check of an untrusted genome; null when it can be compiled for this env. */
function genomeError(g: unknown, nIn: number, nOut: number): string | null {
  if (!isObj(g) || !Array.isArray(g.nodes) || !Array.isArray(g.conns)) return 'The genome must have "nodes" and "conns" arrays.';
  const ids = new Set<number>();
  let ins = 0, outs = 0;
  for (const n of g.nodes as unknown[]) {
    if (!isObj(n) || !Number.isInteger(n.id) || !num(n.bias) || !['input', 'output', 'hidden'].includes(n.type as string) || !['tanh', 'identity'].includes(n.act as string)) return 'The genome has a malformed node.';
    if (ids.has(n.id as number)) return `The genome repeats node id ${String(n.id)}.`;
    ids.add(n.id as number);
    if (n.type === 'input') ins++; else if (n.type === 'output') outs++;
  }
  if (ins !== nIn || outs !== nOut) return `This concept expects ${nIn} inputs and ${nOut} outputs. The genome has ${ins} and ${outs}.`;
  for (const c of g.conns as unknown[]) {
    if (!isObj(c) || !Number.isInteger(c.innov) || !num(c.weight) || typeof c.enabled !== 'boolean' || !ids.has(c.from as number) || !ids.has(c.to as number)) return 'The genome has a malformed connection.';
  }
  return null;
}

/** Import validation of spec section 13. The returned policy is ready for `stage/replay`. */
export function parseExport(json: unknown, spec: EnvSpecMsg): { ok: true; value: ChampionExport; policy: PolicySnapshot } | { ok: false; errors: string[] } {
  if (!isObj(json)) return { ok: false, errors: ['The file is not an EvoLab champion (expected a JSON object).'] };
  const errors: string[] = [];
  if (json.format !== 'evolab-champion') errors.push('"format" must be "evolab-champion".');
  if (json.version !== 1) errors.push('"version" must be 1; this file was written by a different EvoLab.');
  const env = isObj(json.env) ? json.env : {}, nIn = spec.observation.labels.length;
  const nOut = spec.action.type === 'candidates' ? 1 : spec.action.labels.length;
  if (env.id !== spec.meta.id) errors.push(`This champion is for "${String(env.id)}", not "${spec.meta.id}".`);
  else {
    if (env.observationSize !== nIn) errors.push(`This concept has ${nIn} observations. The file was made with ${String(env.observationSize)}.`);
    if (JSON.stringify(env.action) !== JSON.stringify(spec.action)) errors.push('The actions in the file do not match this concept.');
  }
  if (!isObj(json.stats) || !num(json.stats.best)) errors.push('"stats.best" must be a number.');

  let policy: PolicySnapshot | null = null;
  const p = json.policy;
  if (isObj(p) && p.kind === 'neat') {
    const e = genomeError(p.genome, nIn, nOut);
    if (e) errors.push(e); else policy = { kind: 'neat', genome: p.genome as Genome };
  } else if (isObj(p) && p.kind === 'mlp') {
    const sizes = p.sizes, params = p.params;
    if (!Array.isArray(sizes) || sizes.length < 2 || !sizes.every((s) => Number.isInteger(s) && s > 0)) errors.push('"policy.sizes" must list at least two positive layer sizes.');
    else if (sizes[0] !== nIn) errors.push(`The network expects ${String(sizes[0])} inputs. This concept has ${nIn}.`);
    else if ((p.algo !== 'dqn' && p.algo !== 'ppo') || (p.hidden !== 'tanh' && p.hidden !== 'relu')) errors.push('"policy.algo" must be dqn or ppo and "policy.hidden" tanh or relu.');
    else {
      let expected = 0;
      for (let i = 0; i + 1 < sizes.length; i++) expected += sizes[i] * sizes[i + 1] + sizes[i + 1];
      if (!Array.isArray(params) || params.length !== expected || !params.every(num)) errors.push(`"policy.params" must hold ${expected} numbers for layer sizes ${sizes.join(', ')}.`);
      else policy = { kind: 'mlp', algo: p.algo, sizes: sizes as number[], hidden: p.hidden, params: Float32Array.from(params as number[]) };
    }
  } else errors.push('"policy.kind" must be "neat" or "mlp".');

  if (errors.length || !policy) return { ok: false, errors };
  return { ok: true, value: json as unknown as ChampionExport, policy };
}
