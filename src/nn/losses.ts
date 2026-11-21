import type { FloatArray } from './mlp';

// Every dOut is fully overwritten; all results are means over the batch.

export function huberTd(q: FloatArray, actions: Int32Array, targets: FloatArray, nActions: number, batch: number, dOut: FloatArray): number {
  dOut.fill(0); let loss = 0;
  for (let b = 0; b < batch; b++) {
    const i = b * nActions + actions[b]!, e = q[i]! - targets[b]!, ae = Math.abs(e);
    loss += ae <= 1 ? 0.5 * e * e : ae - 0.5;
    dOut[i] = (ae <= 1 ? e : Math.sign(e)) / batch;
  }
  return loss / batch;
}

export interface PpoCoef { clipEps: number; valueCoef: number; entropyCoef: number }
export interface PpoLossOut { loss: number; policyLoss: number; valueLoss: number; entropy: number }

/** Log-probabilities of one row of logits. */
export function logSoftmaxRow(out: FloatArray, row: number, nA: number, stride: number, dst: FloatArray): void {
  const o = row * stride;
  let max = -Infinity;
  for (let k = 0; k < nA; k++) if (out[o + k]! > max) max = out[o + k]!;
  let sum = 0;
  for (let k = 0; k < nA; k++) sum += Math.exp(out[o + k]! - max);
  const lse = max + Math.log(sum);
  for (let k = 0; k < nA; k++) dst[k] = out[o + k]! - lse;
}

const HALF_LOG_2PI = 0.9189385332046727;
/** exp of a log-ratio clamped to +/-20, so a policy that moved far from the rollout's cannot overflow the surrogate to Infinity. */
const ratioOf = (logRatio: number) => Math.exp(Math.min(20, Math.max(-20, logRatio)));

export function gaussianLogp(mean: FloatArray, meanOff: number, logStd: FloatArray, action: FloatArray, actOff: number, nD: number): number {
  let lp = 0;
  for (let d = 0; d < nD; d++) {
    const z = (action[actOff + d]! - mean[meanOff + d]!) / Math.exp(logStd[d]!);
    lp += -0.5 * z * z - logStd[d]! - HALF_LOG_2PI;
  }
  return lp;
}

/** out rows: [logits(nA), value] */
export function ppoDiscrete(
  out: FloatArray, actions: Int32Array, oldLogp: FloatArray, adv: FloatArray, ret: FloatArray,
  nA: number, batch: number, c: PpoCoef, dOut: FloatArray,
): PpoLossOut {
  const stride = nA + 1; let pl = 0, vl = 0, ent = 0;
  const logp = new Float64Array(nA);
  for (let b = 0; b < batch; b++) {
    const o = b * stride;
    logSoftmaxRow(out, b, nA, stride, logp);
    let H = 0; for (let k = 0; k < nA; k++) H -= Math.exp(logp[k]!) * logp[k]!;
    const a = actions[b]!, ratio = ratioOf(logp[a]! - oldLogp[b]!), A = adv[b]!;
    const s1 = ratio * A, s2 = Math.min(Math.max(ratio, 1 - c.clipEps), 1 + c.clipEps) * A;
    pl -= Math.min(s1, s2);
    const dLogpA = s1 <= s2 ? -A * ratio : 0;                        // d(policy loss)/d(logp of the taken action)
    for (let k = 0; k < nA; k++) {
      const p = Math.exp(logp[k]!);
      const dPolicy = dLogpA * ((k === a ? 1 : 0) - p);
      const dEntropyTerm = c.entropyCoef * p * (logp[k]! + H);       // d(-entropyCoef * H)/d(logit k)
      dOut[o + k] = (dPolicy + dEntropyTerm) / batch;
    }
    const dv = out[o + nA]! - ret[b]!;
    vl += dv * dv; dOut[o + nA] = (c.valueCoef * 2 * dv) / batch; ent += H;
  }
  pl /= batch; vl /= batch; ent /= batch;
  return { loss: pl + c.valueCoef * vl - c.entropyCoef * ent, policyLoss: pl, valueLoss: vl, entropy: ent };
}

/** out rows: [means(nD), value]; actions are the raw (unclipped) samples, batch x nD */
export function ppoGaussian(
  out: FloatArray, logStd: FloatArray, actions: FloatArray, oldLogp: FloatArray, adv: FloatArray, ret: FloatArray,
  nD: number, batch: number, c: PpoCoef, dOut: FloatArray, dLogStd: FloatArray,
): PpoLossOut {
  const stride = nD + 1; let pl = 0, vl = 0;
  dLogStd.fill(0);
  let H = 0; for (let d = 0; d < nD; d++) H += logStd[d]! + HALF_LOG_2PI + 0.5;      // state-independent entropy
  for (let b = 0; b < batch; b++) {
    const o = b * stride;
    const lp = gaussianLogp(out, o, logStd, actions, b * nD, nD);
    const ratio = ratioOf(lp - oldLogp[b]!), A = adv[b]!;
    const s1 = ratio * A, s2 = Math.min(Math.max(ratio, 1 - c.clipEps), 1 + c.clipEps) * A;
    pl -= Math.min(s1, s2);
    const dLogp = s1 <= s2 ? -A * ratio : 0;
    for (let d = 0; d < nD; d++) {
      const sd = Math.exp(logStd[d]!), z = (actions[b * nD + d]! - out[o + d]!) / sd;
      dOut[o + d] = (dLogp * z) / sd / batch;                        // dlogp/dmean = z / sd
      dLogStd[d]! += (dLogp * (z * z - 1)) / batch;                  // dlogp/dlogStd = z^2 - 1
    }
    const dv = out[o + nD]! - ret[b]!;
    vl += dv * dv; dOut[o + nD] = (c.valueCoef * 2 * dv) / batch;
  }
  for (let d = 0; d < nD; d++) dLogStd[d]! -= c.entropyCoef;         // d(-entropyCoef * H)/dlogStd = -entropyCoef
  pl /= batch; vl /= batch;
  return { loss: pl + c.valueCoef * vl - c.entropyCoef * H, policyLoss: pl, valueLoss: vl, entropy: H };
}
