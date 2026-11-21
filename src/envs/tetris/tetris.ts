import { Rng } from '../../core/rng';
import type { Env, EnvDefinition, HumanInput, RenderView } from '../../env/types';
import { COLS, PIECES, ROWS, bag, emptyBoard, features, holes, place, placements, type Placement } from './board';

const CELL = 25, X0 = (800 - COLS * CELL) / 2, START_X = 3;
const LINES = 0, TETRIS = 1, PIECE = 2, HOLES = 3, TOPOUT = 4;
const BG = '#0d121b', FG = '#d7e0ee', DIM = '#2a3446', ACCENT = '#4de1c1', WARN = '#ffc857', WELL = '#111825';

function create(): Env {
  let board = emptyBoard(), scratch = emptyBoard();
  let rng = new Rng(0), queue: number[] = [], current = 0, done = false;
  let cands: Placement[] = [], view: Float32Array[] = [];
  let lastPlaced: [number, number][] = [];                    // board cells of the newest piece, while it is still intact
  const pool: Float32Array[] = [];                            // candidate feature vectors, reused across steps
  const cursor = { rot: 0, x: START_X, used: false };
  const terms = new Float32Array(5), obs = new Float32Array(6);

  function nextPiece(): void {
    if (queue.length < 2) queue.push(...bag(rng));
    current = queue.shift()!;
    cands = placements(board, current);
    while (pool.length < cands.length) pool.push(new Float32Array(6));
    view = pool.slice(0, cands.length);
    cands.forEach((p, i) => features(scratch, place(board, current, p, scratch), view[i]!));
    cursor.rot = 0; cursor.x = START_X; cursor.used = false;
  }
  /** The candidate under the human cursor: same rotation, nearest legal column. -1 if that rotation does not fit anywhere. */
  function cursorCandidate(): number {
    let best = -1;
    cands.forEach((p, i) => { if (p.rot === cursor.rot && (best < 0 || Math.abs(p.x - cursor.x) < Math.abs(cands[best]!.x - cursor.x))) best = i; });
    return best;
  }

  return {
    reset(seed) {
      rng = new Rng(seed);
      board = emptyBoard(); queue = []; done = false; terms.fill(0); lastPlaced = [];
      nextPiece();
    },
    step(action) {
      if (done) return;
      const p = cands[action as number]!, holesBefore = holes(board);
      const lines = place(board, current, p, scratch);
      [board, scratch] = [scratch, board];
      terms[LINES]! += lines; terms[PIECE]!++;
      if (lines === 4) terms[TETRIS]!++;
      terms[HOLES]! += Math.max(0, holes(board) - holesBefore);
      lastPlaced = lines === 0 ? PIECES[current]!.rotations[p.rot]!.cells.map(([dx, dy]) => [p.x + dx, p.y + dy]) : [];
      nextPiece();
      if (cands.length === 0) { terms[TOPOUT]!++; done = true; }
    },
    observe() { features(board, 0, obs); return obs; },
    candidates() { return view; },
    get done() { return done; },
    terms,
    render(v: RenderView) {
      if (v.kind !== '2d' || v.ghost) return;
      const d = v.draw;
      d.clear(BG);
      d.rect(X0 - 2, 0, COLS * CELL + 4, ROWS * CELL, DIM); d.rect(X0, 0, COLS * CELL, ROWS * CELL, WELL);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (board.rows[r]! & (1 << c)) d.rect(X0 + c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2, DIM);
      }
      for (const [c, r] of lastPlaced) d.rect(X0 + c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2, ACCENT);
      const preview = (piece: number, label: string, y: number) => {
        d.text(label, X0 + COLS * CELL + 40, y, FG, 14);
        for (const [dx, dy] of PIECES[piece]!.rotations[0]!.cells) d.rect(X0 + COLS * CELL + 40 + dx * 18, y + 12 + dy * 18, 16, 16, label === 'now' ? WARN : DIM);
      };
      if (!done) preview(current, 'now', 40);
      if (queue.length) preview(queue[0]!, 'next', 130);
      d.text(`lines ${terms[LINES]}`, 60, 52, FG, 20);
      const at = cursor.used && !done ? cursorCandidate() : -1;
      if (at >= 0) {
        const p = cands[at]!;
        for (const [dx, dy] of PIECES[current]!.rotations[p.rot]!.cells) {
          const x = X0 + (p.x + dx) * CELL + 1, y = (p.y + dy) * CELL + 1, s = CELL - 2;
          d.poly([x, y, x + s, y, x + s, y + s, x, y + s], WARN, false);
        }
      }
    },
    humanAct(input: HumanInput) {
      if (done) return null;
      const k = input.pressed, rots = PIECES[current]!.rotations;
      if (k.has('ArrowUp')) { cursor.rot = (cursor.rot + 1) % rots.length; cursor.used = true; }
      const move = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
      if (move !== 0) cursor.used = true;
      cursor.x = Math.min(Math.max(cursor.x + move, 0), COLS - rots[cursor.rot]!.width);
      if (!k.has('Space')) return null;
      const i = cursorCandidate();
      return i >= 0 ? i : 0;                                  // that rotation no longer fits: drop the first legal placement
    },
  };
}

export const tetris: EnvDefinition = {
  meta: {
    id: 'tetris', name: 'Tetris', tagline: 'Judge every possible landing spot and pick the best.',
    description: 'The agent does not press keys. For each piece it scores every place the piece could land (each rotation in each column) from six features of the resulting board, and the highest score is played. It learns what a good board looks like.',
    dims: '2d', fps: 4, maxSteps: 500, learners: ['neat'], ghosts: false,
  },
  observation: { labels: ['lines cleared', 'aggregate height', 'holes', 'bumpiness', 'max height', 'wells'] },
  action: { type: 'candidates', scoreLabel: 'placement score' },
  rewardTerms: [
    { key: 'lines', kind: 'reward', description: 'Lines cleared', defaultWeight: 10 },
    { key: 'tetris', kind: 'reward', description: 'Four lines cleared at once', defaultWeight: 20 },
    { key: 'piece', kind: 'reward', description: 'Pieces placed', defaultWeight: 0.1 },
    { key: 'holes', kind: 'penalty', description: 'Holes created (empty cells buried under a block)', defaultWeight: 0.05 },
    { key: 'topout', kind: 'penalty', description: 'The stack reaching the top', defaultWeight: 20 },
  ],
  presets: [
    { name: 'default', description: 'Clear lines, keep the stack clean, do not top out.', weights: { lines: 10, tetris: 20, piece: 0.1, holes: 0.05, topout: 20 } },
    { name: 'aggressive', description: 'Go for four-line clears.', weights: { lines: 10, tetris: 60, piece: 0, holes: 0, topout: 10 } },
    { name: 'survivalist', description: 'Stay alive: every piece placed counts, topping out is very costly.', weights: { lines: 2, tetris: 0, piece: 1, holes: 0.5, topout: 50 } },
  ],
  human: {
    hint: 'Left and right arrows move the placement cursor, up rotates, Space drops the piece there.',
    keys: [{ code: 'ArrowLeft', label: 'move left' }, { code: 'ArrowRight', label: 'move right' }, { code: 'ArrowUp', label: 'rotate' }, { code: 'Space', label: 'drop' }],
  },
  train: { neat: { populationSize: 80 } },
  create,
};
