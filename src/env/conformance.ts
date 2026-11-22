import { Rng } from '../core/rng';
import { RecordingDraw2D, RecordingScene3D } from './draw2d';
import { defaultReward, fitness, signedWeights } from './reward';
import type { Action, DrawCmd, Env, EnvDefinition } from './types';

export interface ConformanceReport { errors: string[]; warnings: string[]; steps: number; episodes: number; termsChanged: boolean[] }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function randomAction(def: EnvDefinition, env: Env, rng: Rng): Action {
  const a = def.action;
  if (a.type === 'discrete') return rng.int(a.labels.length);
  if (a.type === 'continuous') return Float32Array.from(a.labels, () => rng.range(-1, 1));
  return rng.int(env.candidates!().length);
}

/** Null when every value is finite and (if given) within +/-bound. `what`: 'observation', 'term' or 'candidates() value'. */
function badVector(what: string, v: ArrayLike<number>, n: number, bound = Infinity): string | null {
  for (let i = 0; i < v.length; i++) {
    const x = v[i]!;
    if (!Number.isFinite(x)) return `${what} ${i} at step ${n} is not a finite number (got ${x}).`;
    if (Math.abs(x) > bound) return `${what} ${i} at step ${n} is ${x}; observations must stay within +/-${bound} (scale them to about [-1, 1]).`;
  }
  return null;
}

function badState(def: EnvDefinition, env: Env, n: number, bound: number): string | null {
  if (typeof env.done !== 'boolean') return `done must be a boolean (got ${typeof env.done} at step ${n}).`;
  const bad = badVector('observation', env.observe(), n, bound) ?? badVector('term', env.terms, n);
  if (bad || env.done || def.action.type !== 'candidates') return bad;
  for (const c of env.candidates!()) { const b = badVector('candidates() value', c, n, bound); if (b) return b; }
  return null;
}

function cmdsFinite(cmds: DrawCmd[]): boolean {
  return cmds.every((c) => c.every((v) => (typeof v === 'number' ? Number.isFinite(v) : Array.isArray(v) ? v.every(Number.isFinite) : true)));
}

function checkRender(def: EnvDefinition, env: Env, when: string, errors: string[]): void {
  if (def.meta.dims === '3d') {
    const scene = new RecordingScene3D();
    env.render({ kind: '3d', scene, ghost: false });
    if (scene.bodies.length < 1) errors.push(`render ${when} added no bodies. Add at least one.`);
    else if (!scene.bodies.every((b) => [...b.size, ...b.pos, ...b.quat].every(Number.isFinite))) errors.push(`render ${when} produced a body with a non-finite number.`);
    return;
  }
  const draw = new RecordingDraw2D();
  env.render({ kind: '2d', draw, ghost: false });
  if (draw.cmds.length < 1 || draw.cmds.length > 5000) errors.push(`render ${when} produced ${draw.cmds.length} draw commands. It must produce 1 to 5000.`);
  else if (draw.cmds[0]![0] !== 'c') errors.push(`render ${when}: the first draw command must be draw.clear(color).`);
  if (!cmdsFinite(draw.cmds)) errors.push(`render ${when} produced a draw command with a non-finite number.`);
  if (!def.meta.ghosts) return;
  const ghost = new RecordingDraw2D();
  env.render({ kind: '2d', draw: ghost, ghost: true });
  if (ghost.cmds.some((c) => c[0] === 'c')) errors.push(`render ${when} with ghost = true must not call draw.clear().`);
  if (ghost.cmds.length > 500) errors.push(`render ${when} with ghost = true produced ${ghost.cmds.length} draw commands. The limit is 500.`);
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
      const bad = badState(def, env, n, bound);
      if (bad) { errors.push(bad); break; }
      for (let k = 0; k < nTerms; k++) if (env.terms[k] !== base[k]) report.termsChanged[k] = true;
      if (env.done || epLen >= maxSteps) {
        if (env.done && epLen < maxSteps) endedEarly = true;
        lengths.push(epLen); report.episodes++;
        env.reset(seed + report.episodes); base = Array.from(env.terms); epLen = 0;
      }
    }
    if (errors.length) return report;

    // 7, 8. Episodes and reward signal
    if (lengths.length > 0 && lengths.every((l) => l < 2)) errors.push('Every episode ended in fewer than 2 steps. The episode must not end immediately.');
    if (!endedEarly) warnings.push(`No episode ended before maxSteps (${maxSteps}).`);
    if (!report.termsChanged.includes(true)) errors.push(`no reward term ever changed during ${report.steps} random steps. step() must update terms.`);

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
        errors.push(`the environment is not deterministic: the same seed and actions gave different results at step ${n}; use only the seeded rng and keep all state inside the instance.`);
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

/** An untrained policy as NEAT's first generation has them: one random linear layer from the observation to the action. */
function randomNet(def: EnvDefinition, rng: Rng): (env: Env) => Action {
  const a = def.action, nObs = def.observation.labels.length, nOut = a.type === 'candidates' ? 1 : a.labels.length;
  const w = Array.from({ length: nOut }, () => Array.from({ length: nObs + 1 }, () => rng.gaussian()));
  const out = (o: ArrayLike<number>, k: number) => { let s = w[k]![nObs]!; for (let i = 0; i < nObs; i++) s += w[k]![i]! * o[i]!; return s; };
  const argmax = (n: number, score: (k: number) => number) => { let b = 0; for (let k = 1; k < n; k++) if (score(k) > score(b)) b = k; return b; };
  if (a.type === 'continuous') return (env) => { const o = env.observe(); return Float32Array.from(w, (_, k) => Math.tanh(out(o, k))); };
  if (a.type === 'discrete') return (env) => { const o = env.observe(); return argmax(nOut, (k) => out(o, k)); };
  return (env) => { const c = env.candidates!(); return argmax(c.length, (k) => out(c[k]!, 0)); };
}

const NET_EPISODES = 32, NET_SURVIVORS = 4;
/** One batch of rollouts: `full` episodes lasted to maxSteps; `bestIsFull` when one of those has the best fitness. */
interface Rollouts { fits: number[]; n: number; best: number; full: number; bestIsFull: boolean }

/**
 * Can anything be learned here? Plays seeded episodes (each at most maxSteps long) under the default weights, up to 64 with
 * random actions and 32 with random one-layer networks, and returns one repair sentence for the first problem:
 *  - every random-action episode scored the same fitness: the reward carries no signal;
 *  - failure is possible, yet an untrained policy lasted to maxSteps and took the top score, so the best fitness is at its
 *    ceiling from the first generation (the "Dodge Falling Rocks" case: best 11.9 from generation 1 to 418). Either one
 *    random-action episode does it, or at least NET_SURVIVORS of the 32 networks do.
 * Measured on that module: 1 random-action episode in 20 survives (12 or 16 episodes missed it on most seeds, hence 64) and
 * 7 to 11 networks of 32 do. The network rule needs 4 because one lucky network in 32 also survives in pong, tetris and
 * walker, where surviving is far from the best score a learner reaches.
 * Bounded by `maxTotalSteps` per batch (no new episode starts past it); the expensive case, long surviving episodes, is the
 * one the check is looking for. Deterministic. The env must be prepared (prepareEnv) and conformant.
 * ponytail: an episode of fixed length (no failure) has no observable ceiling and always passes the second rule.
 */
export function checkLearnability(def: EnvDefinition, opts: { maxTotalSteps?: number; seed?: number } = {}): string[] {
  const seed = opts.seed ?? 4242, budget = opts.maxTotalSteps ?? 60000, maxSteps = def.meta.maxSteps;
  const signed = signedWeights(def, defaultReward(def)), rng = new Rng(seed), env = def.create();
  /** Fitness and length of each episode; `policy` is drawn afresh per episode. */
  const play = (episodes: number, policy: () => (env: Env) => Action): Rollouts => {
    const fits: number[] = [], lengths: number[] = [];
    for (let e = 0, total = 0; e < episodes && total < budget; e++) {
      const act = policy();
      env.reset(seed + e);
      let n = 0;
      while (!env.done && n < maxSteps) { env.step(act(env)); n++; }
      fits.push(fitness(env.terms, signed)); lengths.push(n); total += n;
    }
    const best = Math.max(...fits), full = lengths.filter((l) => l >= maxSteps).length;
    return { fits, n: fits.length, best, full, bestIsFull: fits.some((f, i) => f === best && lengths[i]! >= maxSteps) };
  };
  let random: Rollouts, nets: Rollouts;
  try {
    random = play(64, () => (e) => randomAction(def, e, rng));
    nets = play(NET_EPISODES, () => randomNet(def, rng));
  } finally { env.dispose?.(); }

  const fmt = (v: number) => String(Math.round(v * 100) / 100);
  if (random.best - Math.min(...random.fits) < 1e-9) {
    return [`all ${random.n} random-play episodes scored exactly the same fitness (${fmt(random.best)}), so there is no signal to learn from. `
      + 'At least one reward term must depend on how well the agent plays (progress, accuracy or time survived).'];
  }
  const canFail = random.full < random.n || nets.full < nets.n;
  const harder = 'Make it harder: ramp the difficulty up over time (faster, denser or narrower) until untrained play always fails well before maxSteps, '
    + 'and keep paying a reward per step survived so skilled play scores clearly higher.';
  if (canFail && random.full > 0 && random.bestIsFull) {
    return [`random play already survives the whole episode: ${random.full} of ${random.n} random episodes lasted to maxSteps (${maxSteps}) and one of them took the best `
      + `fitness (${fmt(random.best)}), so a learner has nothing to improve. ${harder}`];
  }
  if (canFail && nets.full >= NET_SURVIVORS && nets.bestIsFull) {
    return [`an untrained network already survives the whole episode: ${nets.full} of ${nets.n} random one-layer networks lasted to maxSteps (${maxSteps}) and one of them took the best `
      + `fitness (${fmt(nets.best)}), so a learner has nothing to improve. ${harder}`];
  }
  return [];
}
