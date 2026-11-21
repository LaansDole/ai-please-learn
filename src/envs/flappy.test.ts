import { describe, expect, it } from 'vitest';
import { checkConformance } from '../env/conformance';
import { validateDefinition } from '../env/registry';
import { flappy } from './flappy';

describe('flappy', () => {
  it('is valid and conformant', () => {
    expect(validateDefinition(flappy)).toEqual([]);
    expect(checkConformance(flappy).errors).toEqual([]);
  });
  it('gliding crashes into the floor within a second and counts the crash', () => {
    const env = flappy.create(); env.reset(1); let n = 0;
    while (!env.done) { env.step(0); n++; }
    expect(n).toBeLessThan(60); expect(env.terms[2]).toBe(1); expect(env.terms[0]).toBe(0);
  });
  it('a gap-seeking policy passes at least 10 pipes on every seed', () => {
    const env = flappy.create();
    for (let seed = 1; seed <= 5; seed++) {
      env.reset(seed);
      for (let i = 0; i < 6000 && !env.done; i++) { const o = env.observe(); env.step(o[3]! < -0.08 && o[1]! > -0.2 ? 1 : 0); }
      expect(env.terms[0]).toBeGreaterThanOrEqual(10);
    }
  });
  it('flap term counts flaps; alive accumulates seconds', () => {
    const env = flappy.create(); env.reset(1);
    env.step(1); env.step(0); env.step(1);
    expect(env.terms[3]).toBe(2); expect(env.terms[1]).toBeCloseTo(3 / 60, 5);
  });
});
