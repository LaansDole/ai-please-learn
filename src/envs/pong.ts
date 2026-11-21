import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { Env, EnvDefinition, HumanInput, RenderView } from '../env/types';

const W = 800, H = 500, PW = 12, PH = 80, AX = 30, OX = 770, BR = 7, DT = 1 / 60;
const AGENT_SPEED = 360, OPP_SPEED = 230, OPP_DEAD = 12, SERVE_SPEED = 300, MAX_SPEED = 700, WIN = 5, TRAIL = 6;
const HIT = 0, SCORE = 1, CONCEDE = 2, TRACKING = 3, JITTER = 4;
const BG = '#0d121b', FG = '#d7e0ee', DIM = '#2a3446', ACCENT = '#4de1c1', WARN = '#ffc857';

function create(): Env {
  let py = H / 2, oy = H / 2, bx = W / 2, by = H / 2, bvx = 0, bvy = 0, my = 0, opp = 0, done = false;
  let rng = new Rng(0);
  const terms = new Float32Array(5), obs = new Float32Array(6);
  const trail: number[] = [];                 // x, y pairs, oldest first

  function serve(): void {
    bx = W / 2; by = rng.range(120, H - 120);
    const ang = rng.range(-35, 35) * Math.PI / 180, dir = rng.next() < 0.5 ? -1 : 1;
    bvx = dir * SERVE_SPEED * Math.cos(ang); bvy = SERVE_SPEED * Math.sin(ang);
    trail.length = 0;
  }
  /** Offset from the paddle centre maps to +/-55 degrees; each hit speeds the ball up by 5%. */
  function bounce(paddleY: number, dir: 1 | -1): void {
    const off = clamp((by - paddleY) / (PH / 2 + BR), -1, 1);
    const speed = Math.min(MAX_SPEED, Math.hypot(bvx, bvy) * 1.05), ang = off * (55 * Math.PI / 180);
    bvx = dir * speed * Math.cos(ang); bvy = speed * Math.sin(ang);
  }

  return {
    reset(seed) {
      rng = new Rng(seed);
      py = oy = H / 2; my = opp = 0; done = false; terms.fill(0);
      serve();
    },
    step(action) {
      if (done) return;
      const mv = (action as number) - 1;      // -1 up, 0 stay, +1 down
      py = clamp(py + mv * AGENT_SPEED * DT, PH / 2, H - PH / 2);
      if (mv !== 0) terms[JITTER]! += DT;
      // Opponent: chases the ball only while it approaches, otherwise drifts to the centre.
      const goal = bvx > 0 ? by : H / 2, dy = goal - oy, dead = bvx > 0 ? OPP_DEAD : 0;
      if (Math.abs(dy) > dead) oy = clamp(oy + Math.sign(dy) * Math.min(OPP_SPEED * DT, Math.abs(dy)), PH / 2, H - PH / 2);
      trail.push(bx, by);
      if (trail.length > TRAIL * 2) trail.splice(0, 2);
      bx += bvx * DT; by += bvy * DT;
      if (by < BR) { by = BR; bvy = Math.abs(bvy); } else if (by > H - BR) { by = H - BR; bvy = -Math.abs(bvy); }
      if (bvx < 0 && bx - BR <= AX + PW / 2 && bx >= AX - PW && Math.abs(by - py) <= PH / 2 + BR) { bounce(py, 1); bx = AX + PW / 2 + BR; terms[HIT]!++; }
      else if (bvx > 0 && bx + BR >= OX - PW / 2 && bx <= OX + PW && Math.abs(by - oy) <= PH / 2 + BR) { bounce(oy, -1); bx = OX - PW / 2 - BR; }
      if (bx < -BR) { terms[CONCEDE]!++; opp++; serve(); } else if (bx > W + BR) { terms[SCORE]!++; my++; serve(); }
      terms[TRACKING]! += (1 - Math.abs(by - py) / H) * DT;
      if (my >= WIN || opp >= WIN) done = true;
    },
    observe() {
      obs[0] = bx / 400 - 1; obs[1] = by / 250 - 1; obs[2] = bvx / MAX_SPEED; obs[3] = bvy / MAX_SPEED;
      obs[4] = py / 250 - 1; obs[5] = oy / 250 - 1;
      return obs;
    },
    get done() { return done; },
    terms,
    render(view: RenderView) {
      if (view.kind !== '2d') return;
      const d = view.draw;
      if (!view.ghost) {
        d.clear(BG);
        for (let y = 10; y < H; y += 30) d.line(W / 2, y, W / 2, y + 15, DIM, 2);
        d.text(String(my), W / 2 - 70, 64, DIM, 48); d.text(String(opp), W / 2 + 44, 64, DIM, 48);
        d.rect(OX - PW / 2, oy - PH / 2, PW, PH, FG);
        for (let i = 0; i < trail.length; i += 2) d.circle(trail[i]!, trail[i + 1]!, 2 + i / 4, DIM);
      }
      d.rect(AX - PW / 2, py - PH / 2, PW, PH, ACCENT);
      d.circle(bx, by, BR, view.ghost ? ACCENT : WARN);
    },
    humanAct(input: HumanInput) { return input.held.has('ArrowUp') ? 0 : input.held.has('ArrowDown') ? 2 : 1; },
  };
}

export const pong: EnvDefinition = {
  meta: {
    id: 'pong', name: 'Pong', tagline: 'Return the ball past a scripted opponent.',
    description: 'A paddle on the left learns to meet the ball and angle it past a scripted opponent. First to five points wins the episode.',
    dims: '2d', fps: 60, maxSteps: 3000, learners: ['neat', 'dqn', 'ppo'], ghosts: true,
  },
  observation: { labels: ['ball x', 'ball y', 'ball vx', 'ball vy', 'my paddle y', 'opponent y'] },
  action: { type: 'discrete', labels: ['up', 'stay', 'down'] },
  rewardTerms: [
    { key: 'hit', kind: 'reward', description: 'Balls returned with the paddle', defaultWeight: 1 },
    { key: 'score', kind: 'reward', description: 'Points won', defaultWeight: 5 },
    { key: 'concede', kind: 'penalty', description: 'Points lost', defaultWeight: 3 },
    { key: 'tracking', kind: 'reward', description: 'Seconds weighted by how level the paddle is with the ball', defaultWeight: 0.2 },
    { key: 'jitter', kind: 'penalty', description: 'Seconds spent moving the paddle', defaultWeight: 0.01 },
  ],
  presets: [
    { name: 'default', description: 'Return the ball, win points, stay level with it.', weights: { hit: 1, score: 5, concede: 3, tracking: 0.2, jitter: 0.01 } },
    { name: 'aggressive', description: 'Only winning points matters.', weights: { hit: 0.5, score: 10, concede: 1, tracking: 0, jitter: 0 } },
    { name: 'survivalist', description: 'Never let a ball past; scoring is irrelevant.', weights: { hit: 2, score: 0, concede: 10, tracking: 0.5, jitter: 0.05 } },
  ],
  human: { hint: 'Arrow keys move your paddle (left side). First to five points wins.', keys: [{ code: 'ArrowUp', label: 'up' }, { code: 'ArrowDown', label: 'down' }] },
  train: { neat: { episodesPerGenome: 2 }, dqn: { episodesPerIteration: 1 } },
  create,
};
