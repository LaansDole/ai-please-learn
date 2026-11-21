import { describe, expect, it } from 'vitest';
import { clamp, lerp, vec } from './math';

describe('math', () => {
  it('clamp, lerp and vec helpers', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(vec.len([3, 4])).toBe(5);
    const r = vec.rot([1, 0], Math.PI / 2);
    expect(r[0]).toBeCloseTo(0, 9); expect(r[1]).toBeCloseTo(1, 9);
    expect(vec.norm([0, 0])).toEqual([0, 0]);
  });
});
