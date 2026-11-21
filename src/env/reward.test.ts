import { describe, expect, it } from 'vitest';
import { reach1d } from '../envs/reach1d';
import { applyPreset, defaultReward, fitness, signedWeights, validateReward } from './reward';

describe('reward engine', () => {
  it('signs weights by kind and sums weight * term', () => {
    const cfg = defaultReward(reach1d);
    expect(cfg).toEqual({ version: 1, envId: 'reach1d', preset: 'default', weights: { closeness: 10, arrived: 5, effort: 0.5 } });
    const s = signedWeights(reach1d, cfg);
    expect(Array.from(s)).toEqual([10, 5, -0.5]);
    expect(fitness(new Float32Array([0.5, 0.2, 1]), s)).toBeCloseTo(5 + 1 - 0.5, 6);
  });
  it('missing keys fall back to defaults; presets apply', () => {
    const s = signedWeights(reach1d, { version: 1, envId: 'reach1d', preset: null, weights: { arrived: 2 } });
    expect(Array.from(s)).toEqual([10, 2, -0.5]);
    expect(applyPreset(reach1d, 'aggressive').weights).toEqual({ closeness: 5, arrived: 15, effort: 0 });
    expect(() => applyPreset(reach1d, 'nope')).toThrow();
  });
  it('validateReward rejects bad input with one error per problem', () => {
    const bad = validateReward(reach1d, { version: 1, envId: 'pong', preset: null, weights: { closeness: -1, typo: 3, arrived: 'x' } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBe(4);            // envId, negative, unknown key, non-number
    expect(validateReward(reach1d, null).ok).toBe(false);
    expect(validateReward(reach1d, { version: 1, envId: 'reach1d', preset: null, weights: { effort: 2 } }).ok).toBe(true);
  });
});
