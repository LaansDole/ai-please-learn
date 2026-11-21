import { clamp } from '../../core/math';
import type { Env, EnvDefinition, HumanInput, RenderView } from '../../env/types';
import { JOINTS, LIMITS, WALKER, createWalkerSim, initRapier, mapFromLimits, mapToLimits, type WalkerSim } from './model';

const DT = WALKER.dt, CLOCK_PERIOD = 0.8, OBS_BOUND = 5;
const DISTANCE = 0, UPRIGHT = 1, ENERGY = 2, FALL = 3;
const TORSO = '#4de1c1', LEFT = '#7aa2ff', RIGHT = '#c792ea', HEAD_R = 0.1, HEAD_UP = 0.37;
/** [joint index, key that drives it to +1, key that drives it to -1]; ankles hold 0. */
const HUMAN_KEYS: [number, string, string][] = [[0, 'KeyQ', 'KeyA'], [1, 'KeyW', 'KeyS'], [3, 'KeyE', 'KeyD'], [4, 'KeyR', 'KeyF']];

function create(): Env {
  let sim: WalkerSim | null = null, t = 0, x0 = 0, done = false;
  const terms = new Float32Array(4), obs = new Float32Array(21), targets = new Float32Array(6), human = new Float32Array(6);

  return {
    // The seed is unused: every episode starts from the same deterministic world.
    reset(_seed) {
      sim?.free(); sim = createWalkerSim();
      targets.fill(0); t = 0; x0 = sim.torso().x; done = false; terms.fill(0);
    },
    step(action) {
      if (done || !sim) return;
      const a = action as Float32Array;
      let effort = 0;
      for (let j = 0; j < 6; j++) {
        const v = clamp(a[j]!, -1, 1), [lo, hi] = LIMITS[j]!;
        targets[j]! += WALKER.smoothing * (mapToLimits(v, lo, hi) - targets[j]!);
        effort += v * v;
      }
      sim.step(targets); t++;
      const torso = sim.torso(), pitch = Math.abs(torso.pitch);
      terms[DISTANCE] = torso.x - x0;
      if (pitch < 0.35 && torso.y > 0.9) terms[UPRIGHT]! += DT;
      terms[ENERGY]! += (effort / 6) * DT;
      if (torso.y < 0.7 || pitch > 1.0) { terms[FALL] = 1; done = true; }
    },
    observe() {
      if (!sim) return obs;
      const s = sim.torso(), phase = (2 * Math.PI * t * DT) / CLOCK_PERIOD;
      obs[0] = s.y - 1.2; obs[1] = s.pitch; obs[2] = s.vx / 3; obs[3] = s.vy / 3; obs[4] = s.pitchRate / 5;
      for (let j = 0; j < 6; j++) { obs[5 + j] = mapFromLimits(sim.jointAngle(j), LIMITS[j]![0], LIMITS[j]![1]); obs[11 + j] = sim.jointVel(j) / 10; }
      obs[17] = sim.footY(0) < 0.05 ? 1 : 0; obs[18] = sim.footY(1) < 0.05 ? 1 : 0;
      obs[19] = Math.sin(phase); obs[20] = Math.cos(phase);
      for (let i = 0; i < obs.length; i++) obs[i] = clamp(obs[i]!, -OBS_BOUND, OBS_BOUND);
      return obs;
    },
    get done() { return done; },
    terms,
    render(view: RenderView) {
      if (view.kind !== '3d' || !sim) return;
      for (const b of sim.bodies) view.scene.body(b.id, b.shape, b.size, b.pos(), b.quat(), b.id === 'torso' ? TORSO : b.id.endsWith('L') ? LEFT : RIGHT);
      // A head (drawn only, no physics) makes the box and capsules read as a figure.
      const torso = sim.bodies[0]!, [x, y, z] = torso.pos(), pitch = sim.torso().pitch;
      view.scene.body('head', 'sphere', [HEAD_R, 0, 0], [x - Math.sin(pitch) * HEAD_UP, y + Math.cos(pitch) * HEAD_UP, z], torso.quat(), TORSO);
    },
    humanAct(input: HumanInput) {
      human.fill(0);
      for (const [j, plus, minus] of HUMAN_KEYS) human[j] = (input.held.has(plus) ? 1 : 0) - (input.held.has(minus) ? 1 : 0);
      return human;
    },
    dispose() { sim?.free(); sim = null; },
  };
}

export const walker: EnvDefinition = {
  meta: {
    id: 'walker', name: 'Walker 3D', tagline: 'A two-legged stick figure learns to walk without falling over.',
    description: 'A biped with hips, knees and ankles gets no instructions, only its own joint angles, balance and a metronome. It sets a target angle for each joint and is rewarded for every metre its torso travels while staying upright.',
    dims: '3d', fps: 60, maxSteps: 900, learners: ['neat', 'ppo'], ghosts: true,
  },
  observation: {
    labels: [
      'torso height', 'torso pitch', 'torso vx', 'torso vy', 'torso pitch rate',
      ...JOINTS, ...JOINTS.map((j) => `${j} vel`),
      'foot L contact', 'foot R contact', 'clock sin', 'clock cos',
    ],
  },
  action: { type: 'continuous', labels: [...JOINTS] },
  rewardTerms: [
    { key: 'distance', kind: 'reward', description: 'Metres the torso moved forward (backward counts against)', defaultWeight: 10 },
    { key: 'upright', kind: 'reward', description: 'Seconds spent upright and at standing height', defaultWeight: 0.5 },
    { key: 'energy', kind: 'penalty', description: 'Seconds weighted by how hard the joints are driven', defaultWeight: 0.1 },
    { key: 'fall', kind: 'penalty', description: 'Falling over', defaultWeight: 5 },
  ],
  presets: [
    { name: 'default', description: 'Walk forward, stay upright, do not fall.', weights: { distance: 10, upright: 0.5, energy: 0.1, fall: 5 } },
    { name: 'aggressive', description: 'Sprinter: distance is everything, falls are cheap.', weights: { distance: 20, upright: 0.1, energy: 0, fall: 2 } },
    { name: 'survivalist', description: 'Stand tall: staying up matters far more than moving.', weights: { distance: 2, upright: 2, energy: 0.2, fall: 20 } },
  ],
  human: {
    hint: 'Deliberately awkward, like QWOP: Q/A swing the left hip, W/S the left knee, E/D the right hip, R/F the right knee. Hold keys to drive a joint.',
    keys: [
      { code: 'KeyQ', label: 'hip L forward' }, { code: 'KeyA', label: 'hip L back' }, { code: 'KeyW', label: 'knee L straight' }, { code: 'KeyS', label: 'knee L bend' },
      { code: 'KeyE', label: 'hip R forward' }, { code: 'KeyD', label: 'hip R back' }, { code: 'KeyR', label: 'knee R straight' }, { code: 'KeyF', label: 'knee R bend' },
    ],
  },
  train: { neat: { populationSize: 60 }, ppo: { nEnvs: 8, rolloutLen: 256 } },
  prepare: initRapier,
  create,
};
