import type { Rng } from '../core/rng';

export type FloatArray = Float32Array | Float64Array;
export type FloatCtor = Float32ArrayConstructor | Float64ArrayConstructor;

/** Sum over layers of out * in + out. */
export function paramCount(sizes: number[]): number {
  let n = 0;
  for (let l = 0; l + 1 < sizes.length; l++) n += sizes[l + 1]! * sizes[l]! + sizes[l + 1]!;
  return n;
}

/** Fully connected net with a linear output layer. Parameters per layer: weights row-major [out][in], then biases. */
export class Mlp {
  readonly params: FloatArray;
  readonly grads: FloatArray;
  readonly offsets: number[] = [];
  /** Filled by forward1: one array per layer including input and output. */
  lastActivations: FloatArray[];
  private acts: FloatArray[] = [];
  private deltas: FloatArray[] = [];
  private cap = 0;

  constructor(readonly sizes: number[], readonly hidden: 'tanh' | 'relu', private F: FloatCtor = Float32Array) {
    let off = 0;
    for (let l = 0; l + 1 < sizes.length; l++) { this.offsets.push(off); off += sizes[l + 1]! * sizes[l]! + sizes[l + 1]!; }
    this.params = new F(off);
    this.grads = new F(off);
    this.lastActivations = sizes.map((n) => new F(n));
  }

  /** W ~ N(0, 1/fanIn), biases 0; the last layer's weights are multiplied by lastLayerScale. */
  init(rng: Rng, lastLayerScale = 1): void {
    const L = this.sizes.length - 1, p = this.params;
    p.fill(0);
    for (let l = 0; l < L; l++) {
      const nin = this.sizes[l]!, n = nin * this.sizes[l + 1]!, w0 = this.offsets[l]!;
      const sd = Math.sqrt(1 / nin) * (l === L - 1 ? lastLayerScale : 1);
      for (let i = 0; i < n; i++) p[w0 + i] = rng.gaussian() * sd;
    }
  }

  private ensure(batch: number): void {
    if (batch <= this.cap) return;
    this.cap = batch;
    this.acts = this.sizes.map((n) => new this.F(batch * n));
    this.deltas = this.sizes.map((n) => new this.F(batch * n));
  }

  /** Returns batch x sizes[last]; the buffer is reused by the next call. */
  forward(x: FloatArray, batch: number): FloatArray {
    this.ensure(batch);
    this.acts[0]!.set(x.subarray(0, batch * this.sizes[0]!));
    const L = this.sizes.length - 1, p = this.params, tanh = this.hidden === 'tanh';
    for (let l = 0; l < L; l++) {
      const nin = this.sizes[l]!, nout = this.sizes[l + 1]!, w0 = this.offsets[l]!, b0 = w0 + nin * nout;
      const a = this.acts[l]!, z = this.acts[l + 1]!, last = l === L - 1;
      for (let b = 0; b < batch; b++) {
        const ab = b * nin, zb = b * nout;
        for (let o = 0; o < nout; o++) {
          let s = p[b0 + o]!; const wr = w0 + o * nin;
          for (let i = 0; i < nin; i++) s += p[wr + i]! * a[ab + i]!;
          z[zb + o] = last ? s : tanh ? Math.tanh(s) : s > 0 ? s : 0;
        }
      }
    }
    return this.acts[L]!.subarray(0, batch * this.sizes[L]!);
  }

  /** forward(x, 1) that also fills lastActivations. */
  forward1(x: FloatArray): FloatArray {
    const out = this.forward(x, 1);
    for (let l = 0; l < this.sizes.length; l++) this.lastActivations[l]!.set(this.acts[l]!.subarray(0, this.sizes[l]!));
    return out;
  }

  zeroGrad(): void { this.grads.fill(0); }

  /** dOut = dLoss/dOutput for the last forward(); accumulates into grads. */
  backward(dOut: FloatArray, batch: number): void {
    const L = this.sizes.length - 1, p = this.params, g = this.grads, tanh = this.hidden === 'tanh';
    let delta: FloatArray = dOut;
    for (let l = L - 1; l >= 0; l--) {
      const nin = this.sizes[l]!, nout = this.sizes[l + 1]!, w0 = this.offsets[l]!, b0 = w0 + nin * nout;
      const a = this.acts[l]!, prev = this.deltas[l]!;
      if (l > 0) prev.fill(0, 0, batch * nin);
      for (let b = 0; b < batch; b++) {
        const ab = b * nin, db = b * nout;
        for (let o = 0; o < nout; o++) {
          const d = delta[db + o]!; if (d === 0) continue;
          g[b0 + o]! += d; const wr = w0 + o * nin;
          if (l > 0) for (let i = 0; i < nin; i++) { g[wr + i]! += d * a[ab + i]!; prev[ab + i]! += p[wr + i]! * d; }
          else for (let i = 0; i < nin; i++) g[wr + i]! += d * a[ab + i]!;
        }
      }
      if (l > 0) {
        for (let k = 0; k < batch * nin; k++) { const v = a[k]!; prev[k]! *= tanh ? 1 - v * v : v > 0 ? 1 : 0; }
        delta = prev;
      }
    }
  }

  copyParamsFrom(other: Mlp): void { this.params.set(other.params); }
}
