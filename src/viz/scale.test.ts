import { describe, expect, it } from 'vitest';
import { decimate, ema, niceTicks, sampleEvenly, stackShares } from './scale';

describe('chart scales', () => {
  it('picks nice ticks covering the range', () => {
    expect(niceTicks(0, 97)).toEqual([0, 20, 40, 60, 80, 100]);
    const t = niceTicks(-3, 3);
    expect(t).toContain(0);
    expect(t[0]).toBeLessThanOrEqual(-3); expect(t.at(-1)).toBeGreaterThanOrEqual(3);
    const gaps = t.slice(1).map((v, i) => v - t[i]!);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!);
    expect(niceTicks(5, 5).length).toBeGreaterThanOrEqual(2);
  });
  it('decimates by min/max buckets and keeps the extremes', () => {
    const xs = Array.from({ length: 10000 }, (_, i) => i), ys = xs.map((i) => Math.sin(i / 50) * (i === 4321 ? 9 : 1) - (i === 7777 ? 9 : 0));
    const d = decimate(xs, ys, 500);
    expect(d.xs.length).toBe(d.ys.length); expect(d.xs.length).toBeLessThanOrEqual(1000);
    expect(d.xs[0]).toBe(0); expect(d.xs.at(-1)).toBe(9999);
    expect(Math.max(...d.ys)).toBe(Math.max(...ys)); expect(Math.min(...d.ys)).toBe(Math.min(...ys));
    expect(decimate([1, 2], [3, 4], 500)).toEqual({ xs: [1, 2], ys: [3, 4] });
  });
  it('stacks species shares in order of first appearance', () => {
    expect(stackShares([{ species: [{ id: 1, size: 30 }, { id: 2, size: 10 }] }, { species: [{ id: 2, size: 20 }, { id: 3, size: 20 }] }]))
      .toEqual({ ids: [1, 2, 3], rows: [[0.75, 1, 1], [0, 0.5, 1]] });
  });
  it('samples long series evenly and keeps both ends', () => {
    const xs = Array.from({ length: 1001 }, (_, i) => i);
    expect(sampleEvenly(xs, 5)).toEqual([0, 250, 500, 750, 1000]);
    expect(sampleEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });
  it('smooths with an exponential moving average', () => {
    expect(ema([0, 10, 10], 0.5)).toEqual([0, 5, 7.5]);
  });
});
