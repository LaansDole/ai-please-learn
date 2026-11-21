import { describe, expect, it } from 'vitest';
import { checkConformance } from '../../env/conformance';
import { validateDefinition } from '../../env/registry';
import { car } from './car';

const drive = (policy: (o: Float32Array) => [number, number], seed: number, max = 3000) => {
  const env = car.create(); env.reset(seed); const a = new Float32Array(2); let n = 0;
  while (!env.done && n < max) { const [s, t] = policy(env.observe()); a[0] = s; a[1] = t; env.step(a); n++; }
  return { env, n };
};
// steer away from the nearer side; slow down when the road ahead is short. rays are in [-1, 1], larger = farther
const centering = (o: Float32Array): [number, number] => {
  const left = o[0]! + o[1]! + o[2]!, right = o[4]! + o[5]! + o[6]!;
  return [Math.max(-1, Math.min(1, (right - left) * 1.5)), o[3]! < -0.4 ? (o[7]! > 0.4 ? -1 : 0.2) : 0.8];
};

describe('car', () => {
  it('is valid and conformant', () => {
    expect(validateDefinition(car)).toEqual([]);
    expect(checkConformance(car).errors).toEqual([]);
  });
  it('a ray-centering driver completes a lap from every start', () => {
    for (let seed = 0; seed < 8; seed++) expect(drive(centering, seed).env.terms[1]).toBeGreaterThanOrEqual(1);
  });
  it('full throttle with no steering crashes; doing nothing stalls after 240 steps', () => {
    const crash = drive(() => [0, 1], 0);
    expect(crash.env.done).toBe(true); expect(crash.env.terms[2]).toBe(1);
    const idle = drive(() => [0, 0], 0);
    expect(idle.n).toBe(240); expect(idle.env.terms[3]).toBe(1);
  });
  it('driving backwards earns no checkpoints', () => {
    expect(drive(() => [0, -1], 0, 200).env.terms[0]).toBe(0);
  });
  it('non-finite actions count as 0 and never corrupt the state', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const { env, n } = drive(() => [bad, bad], 0);
      expect(n, String(bad)).toBe(240);                          // same as doing nothing: stalls
      expect(env.observe().every(Number.isFinite)).toBe(true);
    }
  });
});
