import { describe, expect, it } from 'vitest';
import { nextScale } from './barChart';

describe('outputs bar scale', () => {
  it('F3: follows the largest finite value, decays back after a spike and ignores non-finite values', () => {
    let s = nextScale(1, Float32Array.from([0.2, -50]));
    expect(s).toBe(50);
    for (let i = 0; i < 2000; i++) s = nextScale(s, Float32Array.from([0.2, -0.5]));
    expect(s).toBe(1);
    expect(nextScale(1, Float32Array.from([Infinity, NaN, 3]))).toBe(3);
  });
});
