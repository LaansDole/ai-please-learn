import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { gradCheck } from './gradcheck';
import { huberTd, ppoDiscrete, ppoGaussian } from './losses';
import { Mlp } from './mlp';

const C = { clipEps: 0.2, valueCoef: 0.5, entropyCoef: 0.01 };
const B = 8;

describe('losses: analytic gradients match finite differences through the network', () => {
  it('huberTd (both the quadratic and the linear region)', () => {
    const rng = new Rng(1); const net = new Mlp([3, 6, 4], 'tanh', Float64Array); net.init(rng);
    const x = new Float64Array(B * 3).map(() => rng.range(-1, 1));
    const actions = Int32Array.from({ length: B }, () => rng.int(4));
    const targets = new Float64Array(B).map((_, i) => (i % 2 ? rng.range(-0.3, 0.3) : rng.range(3, 6)));
    const dOut = new Float64Array(B * 4);
    const loss = () => huberTd(net.forward(x, B), actions, targets, 4, B, dOut);
    loss(); net.zeroGrad(); net.backward(dOut, B);
    expect(gradCheck(loss, net.params as Float64Array, net.grads as Float64Array, rng)).toBeLessThan(1e-5);
  });
  it('ppoDiscrete: clipped surrogate + value + entropy', () => {
    const rng = new Rng(2); const nA = 3; const net = new Mlp([4, 6, nA + 1], 'tanh', Float64Array); net.init(rng);
    const x = new Float64Array(B * 4).map(() => rng.range(-1, 1));
    const actions = Int32Array.from({ length: B }, () => rng.int(nA));
    const oldLogp = new Float64Array(B).map(() => Math.log(1 / nA) + rng.range(-0.5, 0.5));   // forces some clipped samples
    const adv = new Float64Array(B).map(() => rng.gaussian()), ret = new Float64Array(B).map(() => rng.range(-1, 1));
    const dOut = new Float64Array(B * (nA + 1));
    const loss = () => ppoDiscrete(net.forward(x, B), actions, oldLogp, adv, ret, nA, B, C, dOut).loss;
    loss(); net.zeroGrad(); net.backward(dOut, B);
    expect(gradCheck(loss, net.params as Float64Array, net.grads as Float64Array, rng)).toBeLessThan(1e-5);
    const r = ppoDiscrete(net.forward(x, B), actions, oldLogp, adv, ret, nA, B, C, dOut);
    expect(r.entropy).toBeGreaterThan(0); expect(r.entropy).toBeLessThanOrEqual(Math.log(nA) + 1e-9);
    expect(r.loss).toBeCloseTo(r.policyLoss + C.valueCoef * r.valueLoss - C.entropyCoef * r.entropy, 10);
  });
  it('ppoGaussian: gradients for the network and for logStd', () => {
    const rng = new Rng(3); const nD = 2; const net = new Mlp([4, 6, nD + 1], 'tanh', Float64Array); net.init(rng);
    const logStd = Float64Array.from([-0.5, -0.2]);
    const x = new Float64Array(B * 4).map(() => rng.range(-1, 1));
    const actions = new Float64Array(B * nD).map(() => rng.range(-1.5, 1.5));
    const oldLogp = new Float64Array(B).map(() => rng.range(-3, -1));
    const adv = new Float64Array(B).map(() => rng.gaussian()), ret = new Float64Array(B).map(() => rng.range(-1, 1));
    const dOut = new Float64Array(B * (nD + 1)), dLogStd = new Float64Array(nD);
    const loss = () => ppoGaussian(net.forward(x, B), logStd, actions, oldLogp, adv, ret, nD, B, C, dOut, dLogStd).loss;
    loss(); net.zeroGrad(); net.backward(dOut, B);
    expect(gradCheck(loss, net.params as Float64Array, net.grads as Float64Array, rng)).toBeLessThan(1e-5);
    loss();
    expect(gradCheck(loss, logStd, Float64Array.from(dLogStd), rng)).toBeLessThan(1e-5);
  });
});
