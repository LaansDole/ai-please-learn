import type { Rng } from '../core/rng';

/** Central differences on sampled parameter indices; returns the max relative error against the analytic gradient. */
export function gradCheck(loss: () => number, params: Float64Array, analytic: Float64Array, rng: Rng, opts: { eps?: number; samples?: number } = {}): number {
  const eps = opts.eps ?? 1e-5, samples = Math.min(opts.samples ?? 60, params.length);
  let worst = 0;
  for (let s = 0; s < samples; s++) {
    const i = samples === params.length ? s : rng.int(params.length), old = params[i]!;
    params[i] = old + eps; const lp = loss();
    params[i] = old - eps; const lm = loss();
    params[i] = old;
    const num = (lp - lm) / (2 * eps), ana = analytic[i]!;
    const rel = Math.abs(num - ana) / Math.max(1e-8, Math.abs(num) + Math.abs(ana));
    if (Math.abs(num) + Math.abs(ana) > 1e-7 && rel > worst) worst = rel;
  }
  return worst;
}
