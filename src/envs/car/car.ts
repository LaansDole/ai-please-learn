import { clamp, finiteOr0 } from '../../core/math';
import type { Env, EnvDefinition, HumanInput, RenderView } from '../../env/types';
import { TRACK, castRay, distToCentre, nearestSample } from './track';

const DT = 1 / 60, CAR_R = 9, MAX_SPEED = 260, RAY_MAX = 300, STALL_STEPS = 240, GATES = TRACK.n / TRACK.gateEvery;
/**
 * Tyre grip: lateral acceleration (turn rate * speed) is capped at 220 px/s^2, so above ~80 px/s the car turns wider the faster
 * it goes (radius 100 px at 150 px/s, 307 px flat out). Without it the whole track could be driven at full throttle and a random
 * generation-1 network that merely steered away from walls already scored ~90% of the best possible; now corners need braking.
 */
const GRIP = 220;
const RAY_ANGLES = [-90, -50, -25, 0, 25, 50, 90].map((deg) => (deg * Math.PI) / 180);
const CHECKPOINT = 0, LAP = 1, CRASH = 2, STALL = 3, SPEED = 4, WOBBLE = 5;
const BG = '#f9faf5', FG = '#16241d', DIM = '#dde2d6', ACCENT = '#1d4a3b', WARN = '#a65a3a';

// Static geometry, built once. The surface is one polygon: the left wall forwards, then the right wall backwards (a ring).
const LEFT: number[] = [], RIGHT: number[] = [], SURFACE: number[] = [];
for (let i = 0; i < TRACK.n; i++) { LEFT.push(TRACK.lx[i]!, TRACK.ly[i]!); RIGHT.push(TRACK.rx[i]!, TRACK.ry[i]!); }
SURFACE.push(...LEFT, LEFT[0]!, LEFT[1]!, RIGHT[0]!, RIGHT[1]!);
for (let i = TRACK.n - 1; i >= 0; i--) SURFACE.push(TRACK.rx[i]!, TRACK.ry[i]!);

function create(): Env {
  let x = 0, y = 0, heading = 0, speed = 0, sample = 0, start = 0, travelled = 0, progress = 0, sinceCheckpoint = 0, done = false;
  const terms = new Float32Array(6), obs = new Float32Array(8), human = new Float32Array(2);

  return {
    reset(seed) {
      start = sample = (seed % 8) * 20;
      x = TRACK.cx[sample]!; y = TRACK.cy[sample]!; heading = Math.atan2(TRACK.ty[sample]!, TRACK.tx[sample]!);
      speed = 0; travelled = 0; progress = 0; sinceCheckpoint = 0; done = false; terms.fill(0);
    },
    step(action) {
      if (done) return;
      const a = action as Float32Array, steer = clamp(finiteOr0(a[0]!), -1, 1), throttle = clamp(finiteOr0(a[1]!), -1, 1);
      speed = clamp((speed + throttle * 300 * DT) * (1 - 0.6 * DT), -60, MAX_SPEED);
      heading += steer * DT * Math.min(2.8 * clamp(Math.abs(speed) / 80, 0, 1), GRIP / Math.max(Math.abs(speed), 1)) * Math.sign(speed);
      x += Math.cos(heading) * speed * DT; y += Math.sin(heading) * speed * DT;
      const s = nearestSample(TRACK, x, y, sample);
      let adv = (s - sample + TRACK.n) % TRACK.n;
      if (adv > TRACK.n / 2) adv -= TRACK.n;                  // signed advance
      sample = s; travelled += adv;
      if (travelled > progress) {                             // only new ground counts, so reversing over a gate earns nothing
        const before = Math.floor(progress / TRACK.gateEvery), after = Math.floor(travelled / TRACK.gateEvery);
        if (after > before) {
          terms[CHECKPOINT]! += after - before; sinceCheckpoint = 0;
          if (Math.floor(after / GATES) > Math.floor(before / GATES)) terms[LAP]!++;
        }
        progress = travelled;
      }
      terms[SPEED]! += (Math.max(0, speed) / MAX_SPEED) * DT; terms[WOBBLE]! += Math.abs(steer) * DT;
      if (distToCentre(TRACK, x, y, sample) > TRACK.halfWidth - CAR_R) { terms[CRASH]!++; done = true; }
      else if (++sinceCheckpoint >= STALL_STEPS) { terms[STALL]!++; done = true; }
    },
    observe() {
      for (let i = 0; i < 7; i++) obs[i] = castRay(TRACK, x, y, heading + RAY_ANGLES[i]!, sample, RAY_MAX) / (RAY_MAX / 2) - 1;
      obs[7] = speed / MAX_SPEED;
      return obs;
    },
    get done() { return done; },
    terms,
    render(view: RenderView) {
      if (view.kind !== '2d') return;
      const d = view.draw;
      if (!view.ghost) {
        d.clear(BG);
        d.poly(SURFACE, DIM, true); d.poly(LEFT, FG, false); d.poly(RIGHT, FG, false);
        const nextGate = (Math.floor(progress / TRACK.gateEvery) + 1) % GATES, startGate = start / TRACK.gateEvery;
        for (let g = 0; g < GATES; g++) {
          const i = ((startGate + g) % GATES) * TRACK.gateEvery, next = g === nextGate;
          d.line(TRACK.lx[i]!, TRACK.ly[i]!, TRACK.rx[i]!, TRACK.ry[i]!, next ? ACCENT : BG, next ? 3 : 1);
        }
        // Sensor rays, cast again here: a human player never calls observe(), so a cache would be stale.
        for (const off of RAY_ANGLES) {
          const ang = heading + off, dist = castRay(TRACK, x, y, ang, sample, RAY_MAX);
          d.line(x, y, x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, ACCENT, 1);
        }
      }
      const c = Math.cos(heading), s = Math.sin(heading);
      d.poly([x + c * 14, y + s * 14, x - c * 9 - s * 8, y - s * 9 + c * 8, x - c * 9 + s * 8, y - s * 9 - c * 8], view.ghost ? ACCENT : WARN, true);
    },
    humanAct(input: HumanInput) {
      const k = input.held;
      human[0] = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
      human[1] = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
      return human;
    },
  };
}

export const car: EnvDefinition = {
  meta: {
    id: 'car', name: 'Car racing', tagline: 'Drive laps of a winding track using seven distance sensors.',
    description: 'A car sees the track only through seven distance sensors and its own speed. Its tyres have limited grip, so it must learn to brake for corners as well as steer to pass checkpoints and finish laps without touching the walls.',
    dims: '2d', fps: 60, maxSteps: 3000, learners: ['neat', 'ppo'], ghosts: true,
  },
  observation: { labels: ['ray -90', 'ray -50', 'ray -25', 'ray 0', 'ray +25', 'ray +50', 'ray +90', 'speed'] },
  action: { type: 'continuous', labels: ['steer', 'throttle'] },
  rewardTerms: [
    { key: 'checkpoint', kind: 'reward', description: 'Checkpoints passed (40 per lap)', defaultWeight: 1 },
    { key: 'lap', kind: 'reward', description: 'Laps completed', defaultWeight: 20 },
    { key: 'crash', kind: 'penalty', description: 'Hitting a wall', defaultWeight: 5 },
    { key: 'stall', kind: 'penalty', description: 'Four seconds without a new checkpoint', defaultWeight: 2 },
    { key: 'speed', kind: 'reward', description: 'Seconds weighted by speed (1 = top speed)', defaultWeight: 0.1 },
    { key: 'wobble', kind: 'penalty', description: 'Seconds weighted by how hard it steers', defaultWeight: 0.05 },
  ],
  presets: [
    { name: 'default', description: 'Make progress around the track and do not crash.', weights: { checkpoint: 1, lap: 20, crash: 5, stall: 2, speed: 0.1, wobble: 0.05 } },
    { name: 'aggressive', description: 'Fast laps. Crashes are cheap.', weights: { checkpoint: 1, lap: 30, crash: 2, stall: 5, speed: 0.5, wobble: 0 } },
    { name: 'survivalist', description: 'Never touch a wall. Speed is irrelevant.', weights: { checkpoint: 1, lap: 10, crash: 20, stall: 1, speed: 0, wobble: 0.1 } },
  ],
  human: {
    hint: 'Left and right arrows steer, up accelerates, down brakes and reverses.',
    keys: [{ code: 'ArrowLeft', label: 'steer left' }, { code: 'ArrowRight', label: 'steer right' }, { code: 'ArrowUp', label: 'throttle' }, { code: 'ArrowDown', label: 'brake / reverse' }],
  },
  train: { neat: { populationSize: 100 } },
  create,
};
