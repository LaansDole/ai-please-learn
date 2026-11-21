import { Rng } from '../core/rng';
import { RecordingDraw2D, RecordingScene3D } from './draw2d';
import type { Action, DrawCmd, Env, EnvDefinition } from './types';

export interface ConformanceReport { errors: string[]; warnings: string[]; steps: number; episodes: number; termsChanged: boolean[] }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function randomAction(def: EnvDefinition, env: Env, rng: Rng): Action {
  const a = def.action;
  if (a.type === 'discrete') return rng.int(a.labels.length);
  if (a.type === 'continuous') return Float32Array.from(a.labels, () => rng.range(-1, 1));
  return rng.int(env.candidates!().length);
}

/** Null when every value is finite and (if given) within +/-bound. */
function badVector(name: string, v: ArrayLike<number>, bound = Infinity): string | null {
  for (let i = 0; i < v.length; i++) {
    const x = v[i]!;
    if (!Number.isFinite(x)) return `${name}[${i}] is ${x}; every value must be a finite number.`;
    if (Math.abs(x) > bound) return `${name}[${i}] is ${x}; observations must stay within +/-${bound} (scale them to about [-1, 1]).`;
  }
  return null;
}

function badState(def: EnvDefinition, env: Env, bound: number): string | null {
  if (typeof env.done !== 'boolean') return 'done must be a boolean.';
  const bad = badVector('observe()', env.observe(), bound) ?? badVector('terms', env.terms);
  if (bad || env.done || def.action.type !== 'candidates') return bad;
  for (const c of env.candidates!()) { const b = badVector('candidates()', c, bound); if (b) return b; }
  return null;
}

function cmdsFinite(cmds: DrawCmd[]): boolean {
  return cmds.every((c) => c.every((v) => (typeof v === 'number' ? Number.isFinite(v) : Array.isArray(v) ? v.every(Number.isFinite) : true)));
}

function checkRender(def: EnvDefinition, env: Env, when: string, errors: string[]): void {
  if (def.meta.dims === '3d') {
    const scene = new RecordingScene3D();
    env.render({ kind: '3d', scene, ghost: false });
    if (scene.bodies.length < 1) errors.push(`render ${when} added no bodies; add at least one.`);
    else if (!scene.bodies.every((b) => [...b.size, ...b.pos, ...b.quat].every(Number.isFinite))) errors.push(`render ${when} produced a body with a non-finite number.`);
    return;
  }
  const draw = new RecordingDraw2D();
  env.render({ kind: '2d', draw, ghost: false });
  if (draw.cmds.length < 1 || draw.cmds.length > 5000) errors.push(`render ${when} produced ${draw.cmds.length} draw commands; it must produce 1 to 5000.`);
  else if (draw.cmds[0]![0] !== 'c') errors.push(`render ${when} must call draw.clear() first.`);
  if (!cmdsFinite(draw.cmds)) errors.push(`render ${when} produced a draw command with a non-finite number.`);
  if (!def.meta.ghosts) return;
  const ghost = new RecordingDraw2D();
  env.render({ kind: '2d', draw: ghost, ghost: true });
  if (ghost.cmds.some((c) => c[0] === 'c')) errors.push(`render ${when} with ghost = true must not call draw.clear().`);
  if (ghost.cmds.length > 500) errors.push(`render ${when} with ghost = true produced ${ghost.cmds.length} draw commands; the limit is 500.`);
  if (!cmdsFinite(ghost.cmds)) errors.push(`render ${when} with ghost = true produced a draw command with a non-finite number.`);
}

function validAction(def: EnvDefinition, env: Env, a: Action | null): boolean {
  if (a === null) return true;
  const spec = def.action;
  if (spec.type === 'continuous') return typeof a !== 'number' && a.length === spec.labels.length && Array.from(a).every((v) => v >= -1 && v <= 1);
  const n = spec.type === 'discrete' ? spec.labels.length : env.candidates!().length;
  return typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < n;
}

/** Checks 5 to 11 of spec section 12.6 for any definition. Each error is one sentence. */
export function checkConformance(def: EnvDefinition, opts: { steps?: number; seed?: number; obsBound?: number } = {}): ConformanceReport {
  const steps = opts.steps ?? 2000, seed = opts.seed ?? 12345, bound = opts.obsBound ?? 100;
  const errors: string[] = [], warnings: string[] = [];
  const nObs = def.observation.labels.length, nTerms = def.rewardTerms.length, maxSteps = def.meta.maxSteps;
  const report: ConformanceReport = { errors, warnings, steps: 0, episodes: 0, termsChanged: new Array<boolean>(nTerms).fill(false) };
  const made: Env[] = [];
  const create = () => { const e = def.create(); made.push(e); return e; };

  try {
    // 5. Shape
    const env = create();
    env.reset(1);
    const obs = env.observe();
    if (obs.length !== nObs) errors.push(`observe() returned ${obs.length} values but observation.labels has ${nObs}.`);
    if (env.terms.length !== nTerms) errors.push(`terms has ${env.terms.length} entries but rewardTerms has ${nTerms}.`);
    if (env.done !== false) errors.push('done must be false right after reset().');
    if (def.action.type === 'candidates') {
      const cands = env.candidates!();
      if (cands.length < 1) errors.push('candidates() must return at least one entry while the episode is running.');
      else if (cands.some((c) => c.length !== nObs)) errors.push(`every candidates() entry must have ${nObs} values (observation.labels.length).`);
    }
    if (errors.length) return report;

    // 6. Random play
    const rng = new Rng(seed);
    env.reset(seed);
    let base = Array.from(env.terms), epLen = 0, endedEarly = false;
    const lengths: number[] = [];
    for (let n = 1; n <= steps; n++) {
      try { env.step(randomAction(def, env, rng)); } catch (e) { errors.push(`step ${n} threw: ${message(e)}`); break; }
      report.steps = n; epLen++;
      const bad = badState(def, env, bound);
      if (bad) { errors.push(`After step ${n}: ${bad}`); break; }
      for (let k = 0; k < nTerms; k++) if (env.terms[k] !== base[k]) report.termsChanged[k] = true;
      if (env.done || epLen >= maxSteps) {
        if (env.done && epLen < maxSteps) endedEarly = true;
        lengths.push(epLen); report.episodes++;
        env.reset(seed + report.episodes); base = Array.from(env.terms); epLen = 0;
      }
    }
    if (errors.length) return report;

    // 7, 8. Episodes and reward signal
    if (lengths.length > 0 && lengths.every((l) => l < 2)) errors.push('Every episode ended in fewer than 2 steps; the episode must not end immediately.');
    if (!endedEarly) warnings.push(`No episode ended before maxSteps (${maxSteps}).`);
    if (!report.termsChanged.includes(true)) errors.push(`No reward term changed during ${report.steps} steps; step() must update terms.`);

    // 9. Render
    const r = create();
    r.reset(1);
    checkRender(def, r, 'after reset', errors);
    const rr = new Rng(seed);
    for (let i = 0; i < 50 && !r.done; i++) r.step(randomAction(def, r, rr));
    checkRender(def, r, 'after 50 steps', errors);

    // 10. Determinism
    const a = create(), b = create(), ar = new Rng(99);
    a.reset(7); b.reset(7);
    for (let n = 1; n <= 300 && !a.done; n++) {
      const act = randomAction(def, a, ar);
      a.step(act); b.step(act);
      if (JSON.stringify([Array.from(a.observe()), Array.from(a.terms), a.done]) !== JSON.stringify([Array.from(b.observe()), Array.from(b.terms), b.done])) {
        errors.push(`Not deterministic: two instances with the same seed and actions differ after step ${n}; use only the seeded rng.`);
        break;
      }
    }

    // 11. Human controls
    if (def.human) {
      const h = create();
      h.reset(1);
      for (const held of [[], ...def.human.keys.map((k) => [k.code])]) {
        if (!validAction(def, h, h.humanAct!({ held: new Set(held), pressed: new Set() }))) {
          errors.push(`humanAct with ${held.length ? `"${held[0]}" held` : 'no keys held'} must return null or a valid action.`);
        }
      }
    }
  } catch (e) {
    errors.push(`The environment threw: ${message(e)}`);
  } finally {
    for (const e of made) e.dispose?.();
  }
  return report;
}
