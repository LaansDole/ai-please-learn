import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { gradCheck } from './gradcheck';
import { Mlp, paramCount } from './mlp';

function mseSetup(hidden: 'tanh' | 'relu') {
  const rng = new Rng(3); const net = new Mlp([4, 7, 5, 3], hidden, Float64Array); net.init(rng);
  const B = 6, x = new Float64Array(B * 4).map(() => rng.range(-1, 1)), y = new Float64Array(B * 3).map(() => rng.range(-1, 1));
  const dOut = new Float64Array(B * 3);
  const loss = () => { const o = net.forward(x, B); let l = 0; for (let i = 0; i < o.length; i++) { const d = o[i]! - y[i]!; l += d * d; dOut[i] = (2 * d) / B; } return l / B; };
  return { net, rng, loss, dOut, B };
}

describe('Mlp', () => {
  it('counts parameters and computes a known forward pass', () => {
    expect(paramCount([2, 4, 3])).toBe(27);
    const net = new Mlp([2, 2, 1], 'tanh', Float64Array);
    net.params.set([1, 0, 0, 1, 0.5, -0.5, 2, -1, 0.1]);             // W1 = I, b1 = [0.5, -0.5], W2 = [2, -1], b2 = 0.1
    const out = net.forward1(Float64Array.from([0.3, 0.2]));
    expect(out[0]).toBeCloseTo(2 * Math.tanh(0.8) - Math.tanh(-0.3) + 0.1, 12);
    expect(net.lastActivations.map((a) => a.length)).toEqual([2, 2, 1]);
  });
  for (const hidden of ['tanh', 'relu'] as const) {
    it(`backprop matches finite differences (${hidden}, MSE)`, () => {
      const { net, rng, loss, dOut, B } = mseSetup(hidden);
      loss(); net.zeroGrad(); net.backward(dOut, B);
      expect(gradCheck(loss, net.params as Float64Array, net.grads as Float64Array, rng)).toBeLessThan(1e-5);
    });
  }
  it('gradients accumulate until zeroGrad; float32 nets agree with float64 to 1e-5', () => {
    const { net, loss, dOut, B } = mseSetup('tanh');
    loss(); net.zeroGrad(); net.backward(dOut, B); const g1 = Array.from(net.grads);
    loss(); net.backward(dOut, B);
    expect(net.grads[0]).toBeCloseTo(2 * g1[0]!, 10);
    const f32 = new Mlp([4, 7, 5, 3], 'tanh'); f32.params.set(net.params);
    const x = [0.1, -0.2, 0.3, 0.4];
    expect(f32.forward1(Float32Array.from(x))[0]).toBeCloseTo(net.forward1(Float64Array.from(x))[0]!, 5);
  });
});
