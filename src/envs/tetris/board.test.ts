import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import { PIECES, bag, emptyBoard, features, holes, place, placements } from './board';

const idx = (n: string) => PIECES.findIndex((p) => p.name === n);
const fill = (b: ReturnType<typeof emptyBoard>, cells: [number, number][]) => {
  for (const [c, r] of cells) { b.rows[r]! |= 1 << c; b.heights[c] = Math.max(b.heights[c]!, 20 - r); }
};

describe('tetris board', () => {
  it('enumerates the right number of placements on an empty board', () => {
    const b = emptyBoard();
    expect(placements(b, idx('O')).length).toBe(9);
    expect(placements(b, idx('I')).length).toBe(17);
    expect(placements(b, idx('T')).length).toBe(34);
    expect(placements(b, idx('S')).length).toBe(17);
  });
  it('hard-drops onto the stack and clears full lines', () => {
    const b = emptyBoard(), out = emptyBoard();
    fill(b, Array.from({ length: 9 }, (_, c) => [c, 19] as [number, number]));           // bottom row full except column 9
    const vertical = placements(b, idx('I')).find((p) => PIECES[idx('I')]!.rotations[p.rot]!.width === 1 && p.x === 9)!;
    expect(place(b, idx('I'), vertical, out)).toBe(1);
    expect(Array.from(out.heights)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 3]);
    expect(out.rows[19]).toBe(1 << 9);
    expect(b.rows[19]).toBe(0b0111111111);                                               // input untouched
  });
  it('computes features on a hand-built board', () => {
    const b = emptyBoard();
    fill(b, [[0, 19], [0, 18], [0, 17], [1, 19], [2, 17], [3, 19]]);                     // column 2 has a block at height 3 with 2 holes under it
    expect(holes(b)).toBe(2);
    const f = new Float32Array(6); features(b, 2, f);
    expect(f[0]).toBeCloseTo(0.5);                                                       // 2 lines / 4
    expect(f[1]).toBeCloseTo((3 + 1 + 3 + 1) / 200);
    expect(f[2]).toBeCloseTo(2 / 40);
    expect(f[3]).toBeCloseTo((2 + 2 + 2 + 1) / 60);                                      // |3-1| + |1-3| + |3-1| + |1-0| + zeros
    expect(f[4]).toBeCloseTo(3 / 20);
    expect(f[5]).toBeCloseTo(2 / 40);                                                    // column 1 is a well of depth 2 between heights 3 and 3
  });
  it('a full board offers no placements', () => {
    const b = emptyBoard();
    for (let r = 1; r < 20; r++) fill(b, [[0, r], [2, r], [4, r], [6, r], [8, r]]);
    fill(b, [[0, 0], [2, 0], [4, 0], [6, 0], [8, 0]]);
    expect(placements(b, idx('O')).length).toBe(0);
  });
  it('bag is a permutation of the seven pieces', () => {
    expect([...bag(new Rng(4))].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(bag(new Rng(4))).toEqual(bag(new Rng(4)));
  });
});
