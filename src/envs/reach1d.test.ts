import { describe, expect, it } from 'vitest';
import { checkConformance } from '../env/conformance';
import { validateDefinition } from '../env/registry';
import { reach1d } from './reach1d';

describe('reach1d', () => {
  it('is a valid definition and passes conformance', () => {
    expect(validateDefinition(reach1d)).toEqual([]);
    const r = checkConformance(reach1d);
    expect(r.errors).toEqual([]);
    expect(r.termsChanged).toEqual([true, true, true]);
  });
  it('a perfect player scores about 13, an idle one about 4.5 (default weights)', () => {
    const env = reach1d.create(); let perfect = 0, idle = 0;
    for (let seed = 1; seed <= 20; seed++) {
      env.reset(seed);
      while (!env.done) { const [x, t] = env.observe(); env.step(Math.abs(t! - x!) < 0.03 ? 1 : t! > x! ? 2 : 0); }
      perfect += 10 * env.terms[0]! + 5 * env.terms[1]! - 0.5 * env.terms[2]!;
      env.reset(seed); while (!env.done) env.step(1);
      idle += 10 * env.terms[0]!;
    }
    expect(perfect / 20).toBeGreaterThan(12.5); expect(idle / 20).toBeLessThan(6);
  });
  it('humanAct maps arrow keys', () => {
    const env = reach1d.create(); env.reset(1);
    const input = (k: string[]) => ({ held: new Set(k), pressed: new Set<string>() });
    expect(env.humanAct!(input(['ArrowLeft']))).toBe(0);
    expect(env.humanAct!(input([]))).toBe(1);
    expect(env.humanAct!(input(['ArrowRight']))).toBe(2);
  });
});
