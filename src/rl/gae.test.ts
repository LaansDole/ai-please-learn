import { describe, expect, it } from 'vitest';
import { computeGae } from './gae';

function run(ends: number[], boot: number[] = [0, 0, 0]) {
  const adv = new Float32Array(3), ret = new Float32Array(3);
  computeGae(3, 1, Float32Array.from([1, 1, 1]), Float32Array.from([0.5, 0.5, 0.5]), Uint8Array.from(ends), Float32Array.from(boot),
    Float32Array.from([0.5]), 0.9, 0.8, adv, ret);
  return { adv, ret };
}

describe('computeGae', () => {
  it('matches the hand computation without episode ends', () => {
    const { adv, ret } = run([0, 0, 0]);
    expect(adv[2]).toBeCloseTo(0.95, 5); expect(adv[1]).toBeCloseTo(1.634, 5); expect(adv[0]).toBeCloseTo(2.12648, 5);
    for (let t = 0; t < 3; t++) expect(ret[t]).toBeCloseTo(adv[t]! + 0.5, 5);
  });
  it('termination: no bootstrap and the recursion restarts', () => {
    const { adv } = run([0, 1, 0]);
    expect(adv[2]).toBeCloseTo(0.95, 5); expect(adv[1]).toBeCloseTo(0.5, 5); expect(adv[0]).toBeCloseTo(0.95 + 0.72 * 0.5, 5);
  });
  it('truncation: bootstraps from boot and the recursion restarts', () => {
    const { adv } = run([0, 2, 0], [0, 2, 0]);
    expect(adv[1]).toBeCloseTo(2.3, 5); expect(adv[0]).toBeCloseTo(0.95 + 0.72 * 2.3, 5);
  });
  it('interleaved envs give the same results as each alone', () => {
    const a = run([0, 0, 0]).adv, b = run([0, 1, 0]).adv;
    const adv = new Float32Array(6), ret = new Float32Array(6);
    computeGae(3, 2, new Float32Array(6).fill(1), new Float32Array(6).fill(0.5), Uint8Array.from([0, 0, 0, 1, 0, 0]), new Float32Array(6),
      Float32Array.from([0.5, 0.5]), 0.9, 0.8, adv, ret);
    for (let t = 0; t < 3; t++) { expect(adv[t * 2]).toBeCloseTo(a[t]!, 6); expect(adv[t * 2 + 1]).toBeCloseTo(b[t]!, 6); }
  });
});
