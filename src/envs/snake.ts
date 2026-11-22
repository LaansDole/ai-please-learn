import { Rng } from '../core/rng';
import type { Env, EnvDefinition, HumanInput, RenderView } from '../env/types';

const N = 12, CELLS = N * N, CELL = 40, OFF_X = 160, OFF_Y = 10;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];   // 0 right, 1 down, 2 left, 3 up (screen y grows downward, so +1 is a right turn)
const FOOD = 0, APPROACH = 1, RETREAT = 2, DEATH = 3, STARVE = 4, SURVIVE = 5;
const ARROWS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];   // indexed by direction
const BG = '#f9faf5', DIM = '#c2cabb', MUTED = '#4b5a51', ACCENT = '#1d4a3b', WARN = '#a65a3a', HEAD = '#16241d';

function create(): Env {
  let body: number[] = [];                    // cell indices, head first
  const occ = new Uint8Array(CELLS);
  let dir = 0, food = 0, hunger = 0, done = false;
  let rng = new Rng(0);
  const terms = new Float32Array(6), obs = new Float32Array(9);

  function placeFood(): void {
    let k = rng.int(CELLS - body.length);
    for (let c = 0; c < CELLS; c++) if (!occ[c] && k-- === 0) { food = c; return; }
  }
  /** Would moving the head one cell in direction d kill the snake? The tail cell is vacated by the move. */
  function dangerAt(d: number): number {
    const x = body[0]! % N + DX[d]!, y = Math.floor(body[0]! / N) + DY[d]!;
    if (x < 0 || x >= N || y < 0 || y >= N) return 1;
    const c = y * N + x;
    return occ[c] && c !== body[body.length - 1] ? 1 : 0;
  }
  /** Free cells in direction d before a wall or the body. */
  function freeIn(d: number): number {
    let x = body[0]! % N + DX[d]!, y = Math.floor(body[0]! / N) + DY[d]!, n = 0;
    while (x >= 0 && x < N && y >= 0 && y < N && !occ[y * N + x]) { n++; x += DX[d]!; y += DY[d]!; }
    return n;
  }
  const foodDist = (c: number) => Math.abs(c % N - food % N) + Math.abs(Math.floor(c / N) - Math.floor(food / N));

  return {
    reset(seed) {
      rng = new Rng(seed);
      occ.fill(0); body = [6 * N + 6, 6 * N + 5, 6 * N + 4];
      for (const c of body) occ[c] = 1;
      dir = 0; hunger = 0; done = false; terms.fill(0);
      placeFood();
    },
    step(action) {
      if (done) return;
      dir = (dir + (action as number) - 1 + 4) % 4;
      const head = body[0]!;
      if (dangerAt(dir)) { terms[DEATH]!++; done = true; return; }
      const next = head + DX[dir]! + DY[dir]! * N;
      terms[SURVIVE]!++;
      if (next === food) {
        body.unshift(next); occ[next] = 1;
        terms[FOOD]!++; hunger = 0;
        if (body.length === CELLS) { done = true; return; }
        placeFood();
        return;
      }
      occ[body.pop()!] = 0;
      body.unshift(next); occ[next] = 1;
      const before = foodDist(head), after = foodDist(next);
      if (after < before) terms[APPROACH]!++; else if (after > before) terms[RETREAT]!++;
      if (++hunger > 100 + 4 * body.length) { terms[STARVE]!++; done = true; }
    },
    observe() {
      const left = (dir + 3) % 4, right = (dir + 1) % 4, hx = DX[dir]!, hy = DY[dir]!;
      const dx = food % N - body[0]! % N, dy = Math.floor(food / N) - Math.floor(body[0]! / N);
      obs[0] = dangerAt(dir); obs[1] = dangerAt(left); obs[2] = dangerAt(right);
      obs[3] = freeIn(dir) / 11; obs[4] = freeIn(left) / 11; obs[5] = freeIn(right) / 11;
      obs[6] = (dx * hx + dy * hy) / 11; obs[7] = (dx * -hy + dy * hx) / 11;
      obs[8] = body.length / CELLS;
      return obs;
    },
    get done() { return done; },
    terms,
    render(view: RenderView) {
      if (view.kind !== '2d') return;
      const d = view.draw;
      const px = (c: number) => OFF_X + (c % N) * CELL, py = (c: number) => OFF_Y + Math.floor(c / N) * CELL;
      if (!view.ghost) {
        d.clear(BG);
        for (let i = 0; i <= N; i++) {
          d.line(OFF_X + i * CELL, OFF_Y, OFF_X + i * CELL, OFF_Y + N * CELL, DIM, 1);
          d.line(OFF_X, OFF_Y + i * CELL, OFF_X + N * CELL, OFF_Y + i * CELL, DIM, 1);
        }
        d.circle(px(food) + CELL / 2, py(food) + CELL / 2, 12, WARN);
        // Score in the left gutter, like Flappy's pipe count: the board fills the full height, so nothing fits above it.
        d.text(String(terms[FOOD]), 40, 64, HEAD, 48); d.text('food eaten', 40, 88, MUTED, 14);
      }
      for (let i = body.length - 1; i >= (view.ghost ? 0 : 1); i--) d.rect(px(body[i]!) + 3, py(body[i]!) + 3, CELL - 6, CELL - 6, ACCENT);
      if (view.ghost) return;
      const cx = px(body[0]!) + CELL / 2, cy = py(body[0]!) + CELL / 2, hx = DX[dir]!, hy = DY[dir]!;
      d.rect(cx - 17, cy - 17, 34, 34, HEAD);
      d.circle(cx + hx * 8 - hy * 8, cy + hy * 8 + hx * 8, 3, BG); d.circle(cx + hx * 8 + hy * 8, cy + hy * 8 - hx * 8, 3, BG);
    },
    /** Absolute arrows become relative turns; a reversal is ignored. A tap between ticks (pressed) wins over a held key. */
    humanAct(input: HumanInput) {
      let want = ARROWS.findIndex((k) => input.pressed.has(k));
      if (want < 0) want = ARROWS.findIndex((k) => input.held.has(k));
      if (want < 0) return 1;
      const turn = (want - dir + 4) % 4;
      return turn === 1 ? 2 : turn === 3 ? 0 : 1;
    },
  };
}

export const snake: EnvDefinition = {
  meta: {
    id: 'snake', name: 'Snake', tagline: 'Find food without hitting walls or yourself.',
    description: 'A snake on a 12 x 12 grid senses danger and the direction of food relative to its own heading, and learns to grow without trapping itself.',
    dims: '2d', fps: 10, maxSteps: 2000, learners: ['neat', 'dqn', 'ppo'], ghosts: true,
  },
  observation: { labels: ['danger ahead', 'danger left', 'danger right', 'free ahead', 'free left', 'free right', 'food ahead', 'food side', 'length'] },
  action: { type: 'discrete', labels: ['turn left', 'straight', 'turn right'] },
  rewardTerms: [
    { key: 'food', kind: 'reward', description: 'Food eaten', defaultWeight: 10 },
    { key: 'approach', kind: 'reward', description: 'Steps that moved closer to the food', defaultWeight: 0.1 },
    { key: 'retreat', kind: 'penalty', description: 'Steps that moved away from the food', defaultWeight: 0.1 },
    { key: 'death', kind: 'penalty', description: 'Hit a wall or itself', defaultWeight: 5 },
    { key: 'starve', kind: 'penalty', description: 'Went too long without eating', defaultWeight: 5 },
    { key: 'survive', kind: 'reward', description: 'Steps alive', defaultWeight: 0, max: 1 },
  ],
  presets: [
    { name: 'default', description: 'Eat, and head toward the food.', weights: { food: 10, approach: 0.1, retreat: 0.1, death: 5, starve: 5, survive: 0 } },
    { name: 'aggressive', description: 'Food above all. Dying is cheap.', weights: { food: 20, approach: 0.2, retreat: 0, death: 1, starve: 10, survive: 0 } },
    { name: 'survivalist', description: 'Stay alive. Food is a bonus.', weights: { food: 5, approach: 0, retreat: 0, death: 20, starve: 2, survive: 0.05 } },
  ],
  human: {
    hint: 'Arrow keys steer the snake. It cannot reverse.',
    keys: [{ code: 'ArrowUp', label: 'up' }, { code: 'ArrowDown', label: 'down' }, { code: 'ArrowLeft', label: 'left' }, { code: 'ArrowRight', label: 'right' }],
  },
  train: { neat: { episodesPerGenome: 2 } },
  create,
};
