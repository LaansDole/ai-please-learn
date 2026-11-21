import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from './rng';

describe('Rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Rng(42), b = new Rng(42), c = new Rng(43);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(xs);
  });
  it('next is in [0,1) with mean ~0.5; int and range respect bounds', () => {
    const r = new Rng(1); let sum = 0;
    for (let i = 0; i < 20000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); sum += v; }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
    for (let i = 0; i < 1000; i++) { expect(r.int(7)).toBeLessThan(7); const x = r.range(-2, 3); expect(x >= -2 && x < 3).toBe(true); }
  });
  it('gaussian has mean ~0 and variance ~1', () => {
    const r = new Rng(7); let s = 0, s2 = 0; const n = 40000;
    for (let i = 0; i < n; i++) { const g = r.gaussian(); s += g; s2 += g * g; }
    expect(s / n).toBeCloseTo(0, 1); expect(s2 / n).toBeCloseTo(1, 1);
  });
  it('seed 0 works and hashSeed is stable and order-sensitive', () => {
    expect(new Rng(0).next()).not.toBeNaN();
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3));
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(3, 2, 1));
    expect(Number.isInteger(hashSeed(5, 6)) && hashSeed(5, 6) >= 0).toBe(true);
  });
});
