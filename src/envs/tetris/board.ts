import type { Rng } from '../../core/rng';

export const COLS = 10, ROWS = 20;
const FULL = (1 << COLS) - 1;

/** rows[0] = top row; bit c set = cell (c, row) filled. heights[c] = filled height of column c. */
export interface Board { rows: Uint16Array; heights: Int8Array }

export function emptyBoard(): Board { return { rows: new Uint16Array(ROWS), heights: new Int8Array(COLS) }; }
export function copyBoard(src: Board, dst: Board): void { dst.rows.set(src.rows); dst.heights.set(src.heights); }

type PieceName = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
/** `bottom[dx]` = largest dy among the cells in column dx (the cell that lands first). */
export interface Rotation { cells: [number, number][]; width: number; bottom: number[] }

const rotation = (cells: [number, number][]): Rotation => {
  const width = Math.max(...cells.map((c) => c[0])) + 1;
  return { cells, width, bottom: Array.from({ length: width }, (_, dx) => Math.max(...cells.filter((c) => c[0] === dx).map((c) => c[1]))) };
};
/** Unique rotations only; cells are [dx, dy] with dy down, min dx = min dy = 0. */
export const PIECES: { name: PieceName; rotations: Rotation[] }[] = [
  { name: 'I', rotations: [[[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]]] },
  { name: 'O', rotations: [[[0, 0], [1, 0], [0, 1], [1, 1]]] },
  { name: 'T', rotations: [[[0, 0], [1, 0], [2, 0], [1, 1]], [[1, 0], [0, 1], [1, 1], [1, 2]], [[1, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [0, 1], [1, 1], [0, 2]]] },
  { name: 'S', rotations: [[[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]]] },
  { name: 'Z', rotations: [[[0, 0], [1, 0], [1, 1], [2, 1]], [[1, 0], [0, 1], [1, 1], [0, 2]]] },
  { name: 'J', rotations: [[[0, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [1, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0], [2, 1]], [[1, 0], [1, 1], [0, 2], [1, 2]]] },
  { name: 'L', rotations: [[[2, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[0, 0], [1, 0], [2, 0], [0, 1]], [[0, 0], [1, 0], [1, 1], [1, 2]]] },
].map((p) => ({ name: p.name as PieceName, rotations: (p.rotations as [number, number][][]).map(rotation) }));

/** y = row of the piece's top-left box after hard drop. */
export interface Placement { rot: number; x: number; y: number }

/** Every hard drop of the piece, ordered by rot, then x; placements that would leave a cell above row 0 are excluded. */
export function placements(b: Board, piece: number): Placement[] {
  const out: Placement[] = [];
  PIECES[piece]!.rotations.forEach((r, rot) => {
    for (let x = 0; x + r.width <= COLS; x++) {
      let y = ROWS;
      for (let dx = 0; dx < r.width; dx++) y = Math.min(y, ROWS - b.heights[x + dx]! - 1 - r.bottom[dx]!);
      if (y >= 0) out.push({ rot, x, y });
    }
  });
  return out;
}

/** Writes the afterstate into `out` (which must not be `b`) and returns the number of lines cleared (0..4). */
export function place(b: Board, piece: number, p: Placement, out: Board): number {
  const rows = out.rows;
  rows.set(b.rows);
  for (const [dx, dy] of PIECES[piece]!.rotations[p.rot]!.cells) rows[p.y + dy]! |= 1 << (p.x + dx);
  // Compact: non-full rows slide down over the full ones.
  let w = ROWS - 1;
  for (let r = ROWS - 1; r >= 0; r--) if (rows[r] !== FULL) rows[w--] = rows[r]!;
  const lines = w + 1;
  while (w >= 0) rows[w--] = 0;
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS && !(rows[r]! & (1 << c))) r++;
    out.heights[c] = ROWS - r;
  }
  return lines;
}

/** Empty cells with a filled cell somewhere above in the same column. */
export function holes(b: Board): number {
  let n = 0;
  for (let c = 0; c < COLS; c++) for (let r = ROWS - b.heights[c]!; r < ROWS; r++) if (!(b.rows[r]! & (1 << c))) n++;
  return n;
}

/** [lines/4, aggregateHeight/200, holes/40, bumpiness/60, maxHeight/20, wells/40]. A well's depth is how far a column sits below both neighbours (edges count as 20). */
export function features(b: Board, lines: number, out: Float32Array): void {
  const h = b.heights;
  let sum = 0, bump = 0, max = 0, wells = 0;
  for (let c = 0; c < COLS; c++) {
    const v = h[c]!;
    sum += v; if (v > max) max = v;
    if (c > 0) bump += Math.abs(v - h[c - 1]!);
    wells += Math.max(0, Math.min(c > 0 ? h[c - 1]! : ROWS, c < COLS - 1 ? h[c + 1]! : ROWS) - v);
  }
  out[0] = lines / 4; out[1] = sum / 200; out[2] = holes(b) / 40; out[3] = bump / 60; out[4] = max / 20; out[5] = wells / 40;
}

/** A shuffled permutation of 0..6 (Fisher-Yates). */
export function bag(rng: Rng): number[] {
  const a = [0, 1, 2, 3, 4, 5, 6];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(i + 1), t = a[i]!; a[i] = a[j]!; a[j] = t; }
  return a;
}
