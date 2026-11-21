import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DEFAULT_DQN } from '../learner/config';
import { DqnAgent, ddqnTarget } from './dqn';

const O = new Float32Array(1), N = new Float32Array(1);

describe('DqnAgent', () => {
  it('epsilon decays linearly from epsilonStart to epsilonEnd', () => {
    const agent = new DqnAgent(1, 2, { ...DEFAULT_DQN, epsilonDecaySteps: 200, learnStart: 1e9 }, new Rng(1));
    expect(agent.epsilon).toBe(1);
    for (let i = 0; i < 100; i++) agent.observe(O, 0, 0, N, false);
    expect(agent.epsilon).toBeCloseTo(0.525, 6);
    for (let i = 0; i < 100; i++) agent.observe(O, 0, 0, N, false);
    expect(agent.epsilon).toBeCloseTo(0.05, 6);
    for (let i = 0; i < 50; i++) agent.observe(O, 0, 0, N, false);
    expect(agent.epsilon).toBeCloseTo(0.05, 6);
    expect(agent.steps).toBe(250);
  });
  it('does not update before learnStart, then once every trainEvery steps', () => {
    const agent = new DqnAgent(1, 2, { ...DEFAULT_DQN, learnStart: 100, trainEvery: 4 }, new Rng(1));
    let before = 0, after = 0;
    for (let i = 1; i <= 200; i++) {
      const loss = agent.observe(O, i % 2, 1, N, false);
      if (loss !== null) { expect(Number.isFinite(loss)).toBe(true); if (i < 100) before++; else after++; }
    }
    expect(before).toBe(0); expect(after).toBe(26);                  // steps 100, 104, ..., 200
  });
  it('hard-syncs the target network every targetSyncEvery steps', () => {
    const agent = new DqnAgent(1, 2, { ...DEFAULT_DQN, learnStart: 10, batchSize: 8, targetSyncEvery: 50 }, new Rng(1));
    const same = () => agent.online.params.every((p, i) => p === agent.target.params[i]);
    expect(same()).toBe(true);
    for (let i = 0; i < 50; i++) agent.observe(O, i % 2, 1, N, false);
    expect(same()).toBe(true);
    for (let i = 0; i < 6; i++) agent.observe(O, i % 2, 1, N, false);
    expect(same()).toBe(false);
    for (let i = 0; i < 44; i++) agent.observe(O, i % 2, 1, N, false);
    expect(same()).toBe(true);
  });
  it('learns a two-armed contextual bandit', () => {
    const rng = new Rng(5);
    const agent = new DqnAgent(1, 2, { ...DEFAULT_DQN, learnStart: 100, epsilonDecaySteps: 1500, lr: 1e-3 }, new Rng(2));
    const obs = new Float32Array(1);
    for (let i = 0; i < 3000; i++) {
      obs[0] = rng.next() < 0.5 ? -1 : 1;
      const a = agent.act(obs);
      agent.observe(obs, a, a === (obs[0] > 0 ? 1 : 0) ? 1 : 0, obs, true);
    }
    for (const s of [-1, 1]) {
      obs[0] = s;
      const correct = s > 0 ? 1 : 0;
      expect(agent.act(obs, true)).toBe(correct);
      const q = agent.qValues();
      expect(q[correct]! - q[1 - correct]!).toBeGreaterThan(0.5);
    }
  });
  it('Double-DQN target evaluates the online argmax with the target network', () => {
    const qOnlineNext = Float32Array.from([1, 0]), qTargetNext = Float32Array.from([2, 5]);
    expect(ddqnTarget(0.5, false, 0.9, qOnlineNext, qTargetNext)).toBeCloseTo(0.5 + 0.9 * 2, 6);
    expect(ddqnTarget(0.5, true, 0.9, qOnlineNext, qTargetNext)).toBe(0.5);
  });
});
