import { describe, expect, it } from 'vitest';
import { checkConformance } from '../env/conformance';
import { defaultReward, fitness, signedWeights } from '../env/reward';
import { validateDefinition } from '../env/registry';
import type { Env } from '../env/types';
import { pong } from './pong';

const play = (policy: (obs: Float32Array) => number, seed: number): Env => {
  const env = pong.create(); env.reset(seed);
  for (let i = 0; i < pong.meta.maxSteps && !env.done; i++) env.step(policy(env.observe()));
  return env;
};
const tracker = (o: Float32Array) => (o[1]! < o[4]! - 0.05 ? 0 : o[1]! > o[4]! + 0.05 ? 2 : 1);   // follow ball y

describe('pong', () => {
  it('is valid and conformant', () => {
    expect(validateDefinition(pong)).toEqual([]);
    const r = checkConformance(pong, { steps: 6000 });
    expect(r.errors).toEqual([]);
    expect(r.termsChanged[2]).toBe(true);                       // random play concedes
  });
  it('a ball tracker returns balls and outscores a frozen paddle', () => {
    const s = signedWeights(pong, defaultReward(pong));
    let trackFit = 0, stillFit = 0, hits = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const a = play(tracker, seed), b = play(() => 1, seed);
      trackFit += fitness(a.terms, s); stillFit += fitness(b.terms, s); hits += a.terms[0]!;
    }
    expect(hits).toBeGreaterThan(20); expect(trackFit).toBeGreaterThan(stillFit + 20);
  });
  it('a frozen paddle loses 5-0 and the episode ends', () => {
    const env = play(() => 1, 3);
    expect(env.done).toBe(true); expect(env.terms[2]).toBe(5);
  });
  it('the scripted opponent is beatable: tracker scores at least one point in 5 episodes', () => {
    let scored = 0;
    for (let seed = 1; seed <= 5; seed++) scored += play(tracker, seed).terms[1]!;
    expect(scored).toBeGreaterThanOrEqual(1);
  });
});
