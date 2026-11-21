import { describe, expect, it } from 'vitest';
import { Adam, clipGradNorm } from './adam';

describe('Adam', () => {
  it('minimises a quadratic', () => {
    const p = new Float64Array(2), g = new Float64Array(2), target = [3, -2];
    const adam = new Adam(p, 0.1);
    for (let s = 0; s < 500; s++) { for (let i = 0; i < 2; i++) g[i] = 2 * (p[i]! - target[i]!); adam.step(g); }
    expect(Math.abs(p[0]! - 3)).toBeLessThan(0.01);
    expect(Math.abs(p[1]! + 2)).toBeLessThan(0.01);
  });
  it('first step moves each parameter by lr in magnitude', () => {
    const p = new Float64Array(2);
    new Adam(p, 0.1).step(Float64Array.from([-6, 4]));
    expect(p[0]).toBeCloseTo(0.1, 6); expect(p[1]).toBeCloseTo(-0.1, 6);
  });
  it('clipGradNorm scales in place and returns the pre-clip norm', () => {
    const g = Float64Array.from([3, 4]);
    expect(clipGradNorm(g, 1)).toBeCloseTo(5, 12);
    expect(g[0]).toBeCloseTo(0.6, 12); expect(g[1]).toBeCloseTo(0.8, 12);
    const h = Float64Array.from([0.3, 0.4]);
    expect(clipGradNorm(h, 1)).toBeCloseTo(0.5, 12);
    expect(Array.from(h)).toEqual([0.3, 0.4]);
  });
});
