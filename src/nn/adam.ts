import type { FloatArray } from './mlp';

export class Adam {
  private m: Float64Array;
  private v: Float64Array;
  private t = 0;
  constructor(private params: FloatArray, public lr: number, private beta1 = 0.9, private beta2 = 0.999, private eps = 1e-8) {
    this.m = new Float64Array(params.length);
    this.v = new Float64Array(params.length);
  }
  step(grads: FloatArray): void {
    const { params: p, m, v, beta1: b1, beta2: b2 } = this;
    this.t++;
    const alpha = (this.lr * Math.sqrt(1 - b2 ** this.t)) / (1 - b1 ** this.t);   // bias corrections folded into the step size
    for (let i = 0; i < p.length; i++) {
      const g = grads[i]!;
      const mi = (m[i] = b1 * m[i]! + (1 - b1) * g), vi = (v[i] = b2 * v[i]! + (1 - b2) * g * g);
      p[i]! -= (alpha * mi) / (Math.sqrt(vi) + this.eps);
    }
  }
}

/** Scales in place when the L2 norm exceeds maxNorm; returns the pre-clip norm. */
export function clipGradNorm(grads: FloatArray, maxNorm: number): number {
  let ss = 0;
  for (let i = 0; i < grads.length; i++) ss += grads[i]! * grads[i]!;
  const norm = Math.sqrt(ss);
  if (norm > maxNorm) { const k = maxNorm / norm; for (let i = 0; i < grads.length; i++) grads[i]! *= k; }
  return norm;
}
