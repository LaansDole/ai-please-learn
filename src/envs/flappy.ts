import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { Env, EnvDefinition, HumanInput, RenderView } from '../env/types';

const W = 800, H = 500, BX = 200, R = 12, G = 1400, FLAP = -380, PIPE_W = 60, SPACING = 260, GAP = 150, SPEED = 170, DT = 1 / 60;
const PIPE = 0, ALIVE = 1, CRASH = 2, FLAPS = 3;
const BG = '#0d121b', FG = '#d7e0ee', DIM = '#2a3446', ACCENT = '#4de1c1', WARN = '#ffc857';

interface Pipe { x: number; gapY: number; passed: boolean }

// Parallax backdrop: fixed positions shared by every instance.
const STARS: number[] = [];
{ const r = new Rng(7); for (let i = 0; i < 40; i++) STARS.push(r.range(0, W), r.range(0, H)); }

function create(): Env {
  let y = 250, vy = 0, travelled = 0, done = false;
  let rng = new Rng(0);
  let pipes: Pipe[] = [];
  const terms = new Float32Array(4), obs = new Float32Array(5);

  /** Keeps at least three pipes ahead of the bird. */
  function refill(): void {
    while (pipes.length === 0 || pipes.filter((p) => p.x > BX).length < 3) {
      pipes.push({ x: pipes.length ? pipes[pipes.length - 1]!.x + SPACING : 500, gapY: rng.range(110, 390), passed: false });
    }
  }

  return {
    reset(seed) {
      rng = new Rng(seed);
      y = 250; vy = 0; travelled = 0; done = false; terms.fill(0);
      pipes = []; refill();
    },
    step(action) {
      if (done) return;
      if (action === 1) { vy = FLAP; terms[FLAPS]!++; }
      vy += G * DT; y += vy * DT;
      travelled += SPEED * DT;
      for (const p of pipes) p.x -= SPEED * DT;
      terms[ALIVE]! += DT;
      let hit = y - R < 0 || y + R > H;
      for (const p of pipes) {
        if (!p.passed && p.x + PIPE_W < BX - R) { p.passed = true; terms[PIPE]!++; }
        if (p.x < BX + R && p.x + PIPE_W > BX - R && (y - R < p.gapY - GAP / 2 || y + R > p.gapY + GAP / 2)) hit = true;
      }
      if (pipes[0]!.x + PIPE_W < -20) pipes.shift();
      refill();
      if (hit) { terms[CRASH]!++; done = true; }
    },
    observe() {
      // "Next" is the first pipe the bird has not cleared yet.
      const i = pipes.findIndex((p) => p.x + PIPE_W >= BX - R), next = pipes[i]!, following = pipes[i + 1]!;
      obs[0] = y / 250 - 1; obs[1] = vy / 600; obs[2] = clamp((next.x - BX) / 300, -1, 1);
      obs[3] = (next.gapY - y) / 250; obs[4] = (following.gapY - y) / 250;
      return obs;
    },
    get done() { return done; },
    terms,
    render(view: RenderView) {
      if (view.kind !== '2d') return;
      const d = view.draw;
      if (!view.ghost) {
        d.clear(BG);
        for (let i = 0; i < STARS.length; i += 2) d.circle(((STARS[i]! - travelled * 0.3) % W + W) % W, STARS[i + 1]!, 1.5, DIM);
        for (const p of pipes) {
          const top = p.gapY - GAP / 2, bottom = p.gapY + GAP / 2;
          d.rect(p.x, 0, PIPE_W, top, DIM); d.rect(p.x, bottom, PIPE_W, H - bottom, DIM);
          d.rect(p.x - 4, top - 10, PIPE_W + 8, 10, ACCENT); d.rect(p.x - 4, bottom, PIPE_W + 8, 10, ACCENT);
        }
        d.text(String(terms[PIPE]), W / 2 - 14, 64, FG, 48);
      }
      d.circle(BX, y, R, view.ghost ? ACCENT : WARN);
      if (!view.ghost) {
        const tilt = clamp(vy / 600, -1, 1);
        d.line(BX, y, BX + Math.cos(tilt) * (R + 8), y + Math.sin(tilt) * (R + 8), FG, 3);
      }
    },
    humanAct(input: HumanInput) { return input.pressed.has('Space') ? 1 : 0; },
  };
}

export const flappy: EnvDefinition = {
  meta: {
    id: 'flappy', name: 'Flappy', tagline: 'Flap through the gaps in an endless row of pipes.',
    description: 'A bird falls under gravity and can only flap upward. It learns when to flap so it threads the gap in each pipe; touching a pipe, the floor or the ceiling ends the run.',
    dims: '2d', fps: 60, maxSteps: 6000, learners: ['neat', 'dqn', 'ppo'], ghosts: true,
  },
  observation: { labels: ['bird y', 'bird vy', 'next pipe distance', 'next gap offset', 'following gap offset'] },
  action: { type: 'discrete', labels: ['glide', 'flap'] },
  rewardTerms: [
    { key: 'pipe', kind: 'reward', description: 'Pipes passed', defaultWeight: 5 },
    { key: 'alive', kind: 'reward', description: 'Seconds survived', defaultWeight: 0.6 },
    { key: 'crash', kind: 'penalty', description: 'Hitting a pipe, the floor or the ceiling', defaultWeight: 1 },
    { key: 'flap', kind: 'penalty', description: 'Flaps', defaultWeight: 0.005 },
  ],
  presets: [
    { name: 'default', description: 'Pass pipes, stay alive, do not flap needlessly.', weights: { pipe: 5, alive: 0.6, crash: 1, flap: 0.005 } },
    { name: 'aggressive', description: 'Only pipes count.', weights: { pipe: 10, alive: 0, crash: 0, flap: 0 } },
    { name: 'survivalist', description: 'Staying in the air matters most; crashing is costly.', weights: { pipe: 1, alive: 2, crash: 10, flap: 0.02 } },
  ],
  human: { hint: 'Press Space to flap. Fly through the gaps.', keys: [{ code: 'Space', label: 'flap' }] },
  create,
};
