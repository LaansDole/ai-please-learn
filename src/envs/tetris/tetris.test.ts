import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import { checkConformance } from '../../env/conformance';
import { validateDefinition } from '../../env/registry';
import { tetris } from './tetris';

// classic hand-tuned linear evaluator, rescaled to our feature scaling: lines, aggregate height, holes, bumpiness
const W = [0.76 * 4, -0.51 * 200, -0.36 * 40, -0.18 * 60, 0, 0];
const linear = (cands: Float32Array[]) => {
  let best = 0, bs = -Infinity;
  cands.forEach((f, i) => { let s = 0; for (let k = 0; k < 6; k++) s += W[k]! * f[k]!; if (s > bs) { bs = s; best = i; } });
  return best;
};

describe('tetris', () => {
  it('is valid and conformant', () => {
    expect(validateDefinition(tetris)).toEqual([]);
    expect(checkConformance(tetris).errors).toEqual([]);
  });
  it('random placement tops out quickly', () => {
    const env = tetris.create(); const rng = new Rng(1); env.reset(1); let n = 0;
    while (!env.done) { env.step(rng.int(env.candidates!().length)); n++; }
    expect(n).toBeLessThan(120); expect(env.terms[4]).toBe(1);
  });
  it('the linear evaluator survives 500 pieces and clears at least 150 lines', () => {
    const env = tetris.create(); env.reset(2); let n = 0;
    while (!env.done && n < 500) { env.step(linear(env.candidates!())); n++; }
    expect(n).toBe(500); expect(env.terms[0]).toBeGreaterThanOrEqual(150); expect(env.terms[2]).toBe(500);
  });
  it('human cursor: arrows move, Space drops the matching candidate', () => {
    const env = tetris.create(); env.reset(3);
    const inp = (k: string[]) => ({ held: new Set(k), pressed: new Set(k) });
    const n = env.candidates!().length;
    expect(env.humanAct!(inp(['ArrowRight']))).toBeNull();
    expect(env.humanAct!(inp(['ArrowUp']))).toBeNull();
    const a = env.humanAct!(inp(['Space']));
    expect(typeof a === 'number' && a >= 0 && a < n).toBe(true);
    expect(env.humanAct!({ held: new Set(), pressed: new Set() })).toBeNull();
  });
});
