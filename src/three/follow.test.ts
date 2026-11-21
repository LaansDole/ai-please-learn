import { describe, expect, it } from 'vitest';
import type { Body3D } from '../env/types';
import { distanceMarkers, focusOf, followCamera } from './follow';

const body = (x: number, y: number, ghost = false): Body3D => ({ id: `b${x}`, shape: 'box', size: [1, 1, 1], pos: [x, y, 0], quat: [0, 0, 0, 1], ghost });

describe('camera follow helpers', () => {
  it('focusOf averages the solid bodies and ignores ghosts', () => {
    expect(focusOf([body(0, 1), body(2, 1), body(50, 0, true)])).toEqual([1, 1, 0]);
    expect(focusOf([body(50, 0, true)])).toBeNull();
    expect(focusOf([])).toBeNull();
  });
  it('followCamera moves x by the lerp and keeps y and z', () => {
    const next = followCamera([0, 1.4, 4.5], [10, 1, 0], 0.08);
    expect(next[0]).toBeCloseTo(0.8); expect(next[1]).toBe(1.4); expect(next[2]).toBe(4.5);
  });
  it('distanceMarkers lists the whole metres within the span', () => {
    expect(distanceMarkers(3.4, 2)).toEqual([2, 3, 4, 5]);
    expect(distanceMarkers(-0.5, 1)).toEqual([-1, 0]);
  });
});
