import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DEFAULT_PPO } from '../learner/config';
import { PpoAgent } from './ppo';

/** Zero weights and the given output biases, so the outputs ignore the input. */
function setOutputBias(agent: PpoAgent, bias: number[]): void {
  const { net } = agent, L = net.sizes.length - 1;
  net.params.fill(0);
  net.params.set(bias, net.offsets[L - 1]! + net.sizes[L - 1]! * net.sizes[L]!);
}

describe('PpoAgent', () => {
  it('discrete sampling follows the policy; deterministic takes the argmax', () => {
    const agent = new PpoAgent(1, { type: 'discrete', size: 2 }, { ...DEFAULT_PPO, nEnvs: 8, rolloutLen: 500 }, new Rng(1));
    setOutputBias(agent, [0, Math.log(3), 0]);
    const obs = new Float32Array(8), z = new Float32Array(8), ends = new Uint8Array(8);
    let ones = 0;
    for (let t = 0; t < 500; t++) { for (const a of agent.actBatch(obs) as Int32Array) ones += a; agent.record(z, ends, z); }
    expect(ones / 4000).toBeGreaterThan(0.72); expect(ones / 4000).toBeLessThan(0.78);
    expect(agent.probsOrMeans()[1]).toBeCloseTo(0.75, 5);
    expect(agent.full).toBe(true);
    expect(agent.deterministic(obs.subarray(0, 1))).toBe(1);
  });
  it('continuous deterministic action is the clipped mean', () => {
    const agent = new PpoAgent(1, { type: 'continuous', size: 2 }, DEFAULT_PPO, new Rng(1));
    setOutputBias(agent, [3, -0.25, 0]);
    expect(Array.from(agent.deterministic(new Float32Array(1)) as Float32Array)).toEqual([1, -0.25]);
    expect(Array.from(agent.logStd)).toEqual([-0.5, -0.5]);
  });
  it('learns a discrete bandit; update clears the rollout and returns finite losses', () => {
    const cfg = { ...DEFAULT_PPO, nEnvs: 8, rolloutLen: 32, minibatchSize: 64, epochs: 4, lr: 3e-3 };
    const rng = new Rng(9), agent = new PpoAgent(1, { type: 'discrete', size: 2 }, cfg, new Rng(2));
    const obs = new Float32Array(8), rew = new Float32Array(8), ends = new Uint8Array(8).fill(1), zero = new Float32Array(8);
    for (let u = 0; u < 40; u++) {
      while (!agent.full) {
        for (let e = 0; e < 8; e++) obs[e] = rng.next() < 0.5 ? -1 : 1;
        const a = agent.actBatch(obs) as Int32Array;
        for (let e = 0; e < 8; e++) rew[e] = a[e] === (obs[e]! > 0 ? 1 : 0) ? 1 : 0;
        agent.record(rew, ends, zero);
      }
      const l = agent.update(zero);
      expect(agent.full).toBe(false);
      for (const v of [l.policyLoss, l.valueLoss, l.entropy]) expect(Number.isFinite(v)).toBe(true);
    }
    for (const s of [-1, 1]) {
      agent.actBatch(obs.fill(s));
      expect(agent.probsOrMeans()[s > 0 ? 1 : 0]).toBeGreaterThan(0.9);
    }
  });
  it('learns a continuous bandit and narrows its exploration', () => {
    const cfg = { ...DEFAULT_PPO, nEnvs: 8, rolloutLen: 32, minibatchSize: 64, epochs: 4, lr: 3e-3, entropyCoef: 0 };
    const rng = new Rng(9), agent = new PpoAgent(1, { type: 'continuous', size: 1 }, cfg, new Rng(2));
    const obs = new Float32Array(8), rew = new Float32Array(8), ends = new Uint8Array(8).fill(1), zero = new Float32Array(8);
    for (let u = 0; u < 60; u++) {
      while (!agent.full) {
        for (let e = 0; e < 8; e++) obs[e] = rng.next() < 0.5 ? -1 : 1;
        const a = agent.actBatch(obs) as Float32Array;
        for (let e = 0; e < 8; e++) rew[e] = 1 - Math.abs(a[e]! - 0.5 * obs[e]!);
        agent.record(rew, ends, zero);
      }
      agent.update(zero);
    }
    for (const s of [-1, 1]) {
      const mean = (agent.deterministic(Float32Array.of(s)) as Float32Array)[0]!;
      expect(Math.abs(mean - 0.5 * s)).toBeLessThan(0.15);
    }
    expect(agent.logStd[0]).toBeLessThan(-0.5);
  });
});
