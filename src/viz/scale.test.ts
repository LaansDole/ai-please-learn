import { describe, expect, it } from 'vitest';
import { assignColours, decimate, ema, niceTicks, OTHER, runningBest, sampleEvenly, speciesBands, tickLabel } from './scale';

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
    expect(speciesBands([{ species: [{ id: 1, size: 30 }, { id: 2, size: 10 }] }, { species: [{ id: 2, size: 20 }, { id: 3, size: 20 }] }]))
      .toEqual({ ids: [1, 2, 3], rows: [[0.75, 1, 1], [0, 0.5, 1]], pooled: 0 });
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

describe('tickLabel', () => {
  it('fits the 40 px axis gutter: no padding zeros on small values', () => {
    expect(tickLabel(0.005)).toBe('0.005');           // was "0.00500", clipped at the left edge of the loss chart
    expect(tickLabel(0.5)).toBe('0.5');
    expect(tickLabel(0.0125)).toBe('0.0125');
    expect(tickLabel(-7.25)).toBe('-7.25');
  });
  it('keeps integers and large values short', () => {
    expect(tickLabel(0)).toBe('0');
    expect(tickLabel(40)).toBe('40');
    expect(tickLabel(123.4)).toBe('123');
    expect(tickLabel(25000)).toBe('25k');
  });
  it('F1/F2: huge, flat and near-flat ranges give a few finite ticks instead of throwing or freezing', () => {
    for (const [min, max] of [[1e16, 1e16], [1e22, 1e22], [1e16, 1e16 + 2], [-1e308, 1e308], [1e300, 1.0000001e300], [-5e20, -5e20], [NaN, 1], [0, Infinity]] as const) {
      const t = niceTicks(min, max);
      expect(t.length, `${min}..${max}`).toBeGreaterThanOrEqual(2);
      expect(t.length, `${min}..${max}`).toBeLessThanOrEqual(50);
      if (Number.isFinite(min) && Number.isFinite(max)) expect(t.every(Number.isFinite), `${min}..${max}`).toBe(true);
    }
    expect(niceTicks(1e-9, 2e-9).length).toBeGreaterThan(2);      // a genuinely small range keeps its resolution
  });
});

describe('running best', () => {
  it('never goes down, skips gaps and starts over where told', () => {
    expect(runningBest([1, 3, 2, null, 5, 4])).toEqual([1, 3, 3, 3, 5, 5]);
    expect(runningBest([null, 2, 1])).toEqual([null, 2, 2]);
    expect(runningBest([5, 9, 1, 2], (i) => i === 2)).toEqual([5, 9, 1, 2]);     // a reward change rescales fitness
  });
});

describe('species bands', () => {
  const gen = (...sizes: number[]) => ({ species: sizes.flatMap((size, i) => (size > 0 ? [{ id: i + 1, size }] : [])) });
  it('keeps the big species in order of first appearance and pools the small ones into "other" on top', () => {
    const b = speciesBands([gen(60, 30, 4, 3, 3), gen(50, 40, 5, 5, 0)], { minShare: 0.1 });
    expect(b.ids).toEqual([1, 2, OTHER]);
    expect(b.rows[0]!.map((v) => +v.toFixed(4))).toEqual([0.6, 0.9, 1]);
    expect(b.rows[1]!.map((v) => +v.toFixed(4))).toEqual([0.5, 0.9, 1]);
    expect(b.pooled).toBe(2);                        // species 3 and 4 are alive in the last generation
  });
  it('has no "other" band when nothing is pooled, and caps the number of bands', () => {
    expect(speciesBands([gen(50, 50)]).ids).toEqual([1, 2]);
    const many = speciesBands([gen(...new Array<number>(20).fill(5))], { minShare: 0.01, maxBands: 7 });
    expect(many.ids).toHaveLength(8);
    expect(many.pooled).toBe(13);
  });
  it('smooths long runs without leaving gaps: every column still fills 0..1', () => {
    const history = Array.from({ length: 60 }, (_, g) => (g % 2 ? gen(90, 10) : gen(10, 90)));
    const b = speciesBands(history);
    for (const row of b.rows) {
      expect(row.at(-1)).toBe(1);
      for (let k = 1; k < row.length; k++) expect(row[k]!).toBeGreaterThanOrEqual(row[k - 1]!);
    }
    const mid = b.rows[30]![0]!;                     // raw flips between 0.9 and 0.1
    expect(mid).toBeGreaterThan(0.3); expect(mid).toBeLessThan(0.7);
  });
  it('gives a species one colour for good, and never shares it with a species shown beside it', () => {
    const slots = new Map<number, number>();
    assignColours([1, 8, OTHER], slots, 7);          // 1 and 8 both want slot 1
    expect(slots.get(1)).toBe(1); expect(slots.get(8)).not.toBe(1);
    const eight = slots.get(8);
    assignColours([8, 15, OTHER], slots, 7);
    expect(slots.get(8)).toBe(eight); expect(slots.get(15)).not.toBe(eight);
    expect(slots.has(OTHER)).toBe(false);
  });
});
