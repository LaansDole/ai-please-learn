import { describe, expect, it } from 'vitest';
import { checkConformance } from '../env/conformance';
import { validateDefinition } from '../env/registry';
import { snake } from './snake';

// obs: 0-2 danger ahead/left/right, 3-5 free ahead/left/right, 6 food ahead, 7 food side, 8 length
const greedy = (o: Float32Array): number => {
  const want = Math.abs(o[7]!) > Math.abs(o[6]!) || o[6]! < 0 ? (o[7]! > 0 ? 2 : o[7]! < 0 ? 0 : 1) : 1;
  const danger = [o[1]!, o[0]!, o[2]!];                               // indexed by action: left, straight, right
  if (!danger[want]) return want;
  return [1, 0, 2].find((a) => !danger[a]) ?? 1;
};

describe('snake', () => {
  it('is valid and conformant', () => {
    expect(validateDefinition(snake)).toEqual([]);
    expect(checkConformance(snake).errors).toEqual([]);
  });
  it('a greedy policy eats at least 5 food on average; a straight runner dies at the wall in 6 steps', () => {
    const env = snake.create(); let food = 0;
    for (let seed = 1; seed <= 10; seed++) { env.reset(seed); for (let i = 0; i < 2000 && !env.done; i++) env.step(greedy(env.observe())); food += env.terms[0]!; }
    expect(food / 10).toBeGreaterThanOrEqual(5);
    env.reset(1); let n = 0; while (!env.done) { env.step(1); n++; }
    expect(n).toBe(6); expect(env.terms[3]).toBe(1);                   // head starts at column 6 of 0..11 heading right
  });
  it('starves when circling and reports it', () => {
    const env = snake.create(); env.reset(2); let n = 0;
    while (!env.done && n < 500) { env.step(n % 2 === 0 ? 2 : 1); n++; }   // alternating right turns and straights: never reaches food, ends by starving or hitting itself
    expect(env.done).toBe(true); expect(env.terms[3]! + env.terms[4]!).toBe(1);
  });
  it('humanAct converts absolute arrows to relative turns and ignores reversal', () => {
    const env = snake.create(); env.reset(1);                          // heading right
    const inp = (k: string) => ({ held: new Set([k]), pressed: new Set([k]) });
    expect(env.humanAct!(inp('ArrowUp'))).toBe(0);
    expect(env.humanAct!(inp('ArrowDown'))).toBe(2);
    expect(env.humanAct!(inp('ArrowLeft'))).toBe(1);
    expect(env.humanAct!({ held: new Set(), pressed: new Set() })).toBe(1);
  });
});
