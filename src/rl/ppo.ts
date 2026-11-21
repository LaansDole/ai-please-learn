import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import type { PpoConfig } from '../learner/config';
import { Adam, clipGradNorm } from '../nn/adam';
import { gaussianLogp, logSoftmaxRow, ppoDiscrete, ppoGaussian, type PpoLossOut } from '../nn/losses';
import { Mlp } from '../nn/mlp';
import { computeGae } from './gae';

const LOG_STD_INIT = -0.5, LOG_STD_MIN = -2.5, LOG_STD_MAX = 0.5;

export class PpoAgent {
  /** Output = [logits | means, value]. */
  readonly net: Mlp;
  /** Length = size for continuous, 0 for discrete. */
  readonly logStd: Float32Array;
  private readonly discrete: boolean;
  private readonly size: number;
  private adam: Adam;
  private adamStd: Adam;
  private t = 0;
  // rollout, time-major rows (index = t * nEnvs + e)
  private obs: Float32Array;
  private actD: Int32Array;
  private actC: Float32Array;
  private logp: Float32Array;
  private val: Float32Array;
  private rew: Float32Array;
  private ends: Uint8Array;
  private boot: Float32Array;
  private adv: Float32Array;
  private ret: Float32Array;
  private order: Int32Array;
  // per-call scratch
  private outD: Int32Array;
  private outC: Float32Array;
  private det: Float32Array;
  private rowLogp: Float32Array;
  private env0: Float32Array;
  private mb: { obs: Float32Array; actD: Int32Array; actC: Float32Array; logp: Float32Array; adv: Float32Array; ret: Float32Array; dOut: Float32Array };
  private dLogStd: Float32Array;

  constructor(private obsSize: number, action: { type: 'discrete' | 'continuous'; size: number }, private cfg: PpoConfig, private rng: Rng) {
    const size = (this.size = action.size), n = cfg.rolloutLen * cfg.nEnvs, B = Math.min(cfg.minibatchSize, n);
    this.discrete = action.type === 'discrete';
    this.net = new Mlp([obsSize, ...cfg.hidden, size + 1], 'tanh');
    this.net.init(rng, 0.01);
    this.logStd = new Float32Array(this.discrete ? 0 : size).fill(LOG_STD_INIT);
    this.adam = new Adam(this.net.params, cfg.lr);
    this.adamStd = new Adam(this.logStd, cfg.lr);
    const actDims = this.discrete ? 0 : size;
    this.obs = new Float32Array(n * obsSize);
    this.actD = new Int32Array(this.discrete ? n : 0);
    this.actC = new Float32Array(n * actDims);
    this.logp = new Float32Array(n); this.val = new Float32Array(n); this.rew = new Float32Array(n);
    this.ends = new Uint8Array(n); this.boot = new Float32Array(n);
    this.adv = new Float32Array(n); this.ret = new Float32Array(n);
    this.order = Int32Array.from({ length: n }, (_, i) => i);
    this.outD = new Int32Array(cfg.nEnvs);
    this.outC = new Float32Array(cfg.nEnvs * actDims);
    this.det = new Float32Array(actDims);
    this.rowLogp = new Float32Array(size);
    this.env0 = new Float32Array(size);
    this.mb = {
      obs: new Float32Array(B * obsSize), actD: new Int32Array(B), actC: new Float32Array(B * actDims),
      logp: new Float32Array(B), adv: new Float32Array(B), ret: new Float32Array(B), dOut: new Float32Array(B * (size + 1)),
    };
    this.dLogStd = new Float32Array(actDims);
  }

  /** rolloutLen steps recorded. */
  get full(): boolean { return this.t >= this.cfg.rolloutLen; }

  /**
   * Forward all envs (obs = nEnvs x obsSize) and sample actions into the rollout at the current step.
   * Returns a reused buffer: Int32Array (discrete) or Float32Array nEnvs x size clipped to [-1, 1] (continuous).
   */
  actBatch(obs: Float32Array): Int32Array | Float32Array {
    const { nEnvs } = this.cfg, size = this.size, stride = size + 1, row0 = this.t * nEnvs, lp = this.rowLogp;
    const out = this.net.forward(obs, nEnvs);
    this.obs.set(obs.subarray(0, nEnvs * this.obsSize), row0 * this.obsSize);
    for (let e = 0; e < nEnvs; e++) {
      const i = row0 + e, o = e * stride;
      this.val[i] = out[o + size]!;
      if (this.discrete) {
        logSoftmaxRow(out, e, size, stride, lp);
        const u = this.rng.next();
        let a = 0, cum = Math.exp(lp[0]!);
        while (a < size - 1 && u >= cum) cum += Math.exp(lp[++a]!);
        this.actD[i] = a; this.outD[e] = a; this.logp[i] = lp[a]!;
        if (e === 0) for (let k = 0; k < size; k++) this.env0[k] = Math.exp(lp[k]!);
      } else {
        for (let d = 0; d < size; d++) {
          const raw = out[o + d]! + Math.exp(this.logStd[d]!) * this.rng.gaussian();
          this.actC[i * size + d] = raw; this.outC[e * size + d] = clamp(raw, -1, 1);
          if (e === 0) this.env0[d] = out[o + d]!;
        }
        this.logp[i] = gaussianLogp(out, o, this.logStd, this.actC, i * size, size);
      }
    }
    return this.discrete ? this.outD : this.outC;
  }

  /** Value estimate of a single observation. */
  value(obs: Float32Array): number { return this.net.forward(obs, 1)[this.size]!; }

  /** Record the outcome of the actions returned by the last actBatch. */
  record(rewards: Float32Array, ends: Uint8Array, boot: Float32Array): void {
    const { nEnvs } = this.cfg, row0 = this.t * nEnvs;
    this.rew.set(rewards.subarray(0, nEnvs), row0); this.ends.set(ends.subarray(0, nEnvs), row0); this.boot.set(boot.subarray(0, nEnvs), row0);
    this.t++;
  }

  /** GAE, then epochs x minibatches; clears the rollout. Returns the mean losses of the final epoch. */
  update(lastValues: Float32Array): { policyLoss: number; valueLoss: number; entropy: number } {
    const c = this.cfg, size = this.size, n = this.t * c.nEnvs, m = this.mb, order = this.order, nObs = this.obsSize;
    computeGae(this.t, c.nEnvs, this.rew, this.val, this.ends, this.boot, lastValues, c.gamma, c.lambda, this.adv, this.ret);
    let pl = 0, vl = 0, ent = 0, batches = 0;
    for (let epoch = 0; epoch < c.epochs; epoch++) {
      for (let i = n - 1; i > 0; i--) { const j = this.rng.int(i + 1), tmp = order[i]!; order[i] = order[j]!; order[j] = tmp; }
      pl = vl = ent = batches = 0;
      for (let start = 0; start < n; start += c.minibatchSize) {
        const B = Math.min(c.minibatchSize, n - start);
        let mean = 0;
        for (let b = 0; b < B; b++) {
          const r = order[start + b]!;
          m.obs.set(this.obs.subarray(r * nObs, r * nObs + nObs), b * nObs);
          if (this.discrete) m.actD[b] = this.actD[r]!;
          else m.actC.set(this.actC.subarray(r * size, r * size + size), b * size);
          m.logp[b] = this.logp[r]!; m.ret[b] = this.ret[r]!; m.adv[b] = this.adv[r]!;
          mean += this.adv[r]!;
        }
        mean /= B;
        let ss = 0;
        for (let b = 0; b < B; b++) { const d = m.adv[b]! - mean; ss += d * d; }
        const k = 1 / (Math.sqrt(ss / B) + 1e-8);
        for (let b = 0; b < B; b++) m.adv[b] = (m.adv[b]! - mean) * k;
        const out = this.net.forward(m.obs, B);
        const l: PpoLossOut = this.discrete
          ? ppoDiscrete(out, m.actD, m.logp, m.adv, m.ret, size, B, c, m.dOut)
          : ppoGaussian(out, this.logStd, m.actC, m.logp, m.adv, m.ret, size, B, c, m.dOut, this.dLogStd);
        this.net.zeroGrad();
        this.net.backward(m.dOut, B);
        clipGradNorm(this.net.grads, c.maxGradNorm);
        this.adam.step(this.net.grads);
        if (!this.discrete) {
          this.adamStd.step(this.dLogStd);
          for (let d = 0; d < size; d++) this.logStd[d] = clamp(this.logStd[d]!, LOG_STD_MIN, LOG_STD_MAX);
        }
        pl += l.policyLoss; vl += l.valueLoss; ent += l.entropy; batches++;
      }
    }
    this.t = 0;
    return { policyLoss: pl / batches, valueLoss: vl / batches, entropy: ent / batches };
  }

  /** Argmax of the logits, or the clipped means (a reused buffer); for replays. */
  deterministic(obs: Float32Array): number | Float32Array {
    const out = this.net.forward(obs, 1);
    if (!this.discrete) { for (let d = 0; d < this.size; d++) this.det[d] = clamp(out[d]!, -1, 1); return this.det; }
    let best = 0;
    for (let a = 1; a < this.size; a++) if (out[a]! > out[best]!) best = a;
    return best;
  }

  /** Of env 0 from the last actBatch: action probabilities (discrete) or means (continuous). */
  probsOrMeans(): Float32Array { return this.env0; }
}
