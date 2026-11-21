import { beforeAll, describe, expect, it } from 'vitest';
import { checkConformance } from '../../env/conformance';
import { validateDefinition } from '../../env/registry';
import { walker } from './walker';

beforeAll(() => walker.prepare!());

describe('walker env', () => {
  it('is valid and conformant (3D render produces 7 bodies)', () => {
    expect(validateDefinition(walker)).toEqual([]);
    expect(walker.observation.labels.length).toBe(21);
    expect(checkConformance(walker, { steps: 1500 }).errors).toEqual([]);
  });
  it('standing still earns upright reward and no distance; random flailing falls', () => {
    const env = walker.create(); env.reset(1); const a = new Float32Array(6);
    for (let i = 0; i < 120 && !env.done; i++) env.step(a);
    expect(env.terms[1]).toBeGreaterThan(1.0); expect(Math.abs(env.terms[0]!)).toBeLessThan(0.3);
    env.reset(2); let n = 0;
    while (!env.done && n < 900) { for (let j = 0; j < 6; j++) a[j] = Math.sin(n * (j + 1) * 0.7); env.step(a); n++; }
    expect(env.done).toBe(true); expect(env.terms[3]).toBe(1); expect(env.terms[2]).toBeGreaterThan(0);
    env.dispose!();
  });
  it('reset rebuilds an identical world', () => {
    const env = walker.create(); const a = Float32Array.from([0.5, -0.5, 0, -0.5, -0.2, 0]);
    const run = () => { env.reset(9); for (let i = 0; i < 100; i++) env.step(a); return Array.from(env.observe()); };
    expect(run()).toEqual(run());
    env.dispose!();
  });
});
