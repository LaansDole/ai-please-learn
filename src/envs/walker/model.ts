import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { RevoluteImpulseJoint, RigidBody } from '@dimforge/rapier3d-compat';
import { clamp } from '../../core/math';

export const JOINTS = ['hip L', 'knee L', 'ankle L', 'hip R', 'knee R', 'ankle R'] as const;
/** Per joint, radians (spec section 10.6). 0 = straight leg. */
export const LIMITS: [number, number][] = [[-0.8, 1.1], [-1.9, 0], [-0.6, 0.6], [-0.8, 1.1], [-1.9, 0], [-0.6, 0.6]];
/**
 * Tuning knobs, kept in one place. Motors are force-based (N m per rad), so 400 could not hold ~45 kg upright: raised to 800
 * with damping = 1.4 * sqrt(stiffness). solverIterations 8 (Rapier default 4) keeps the six-joint chain stiff enough to stand.
 * maxTorque (N m) caps every motor: unlimited motors let evolution find a pogo gait that jumped 0.9 m high instead of walking.
 */
export const WALKER = { stiffness: 800, damping: 40, smoothing: 0.35, dt: 1 / 60, solverIterations: 8, maxTorque: 150 };

type Rapier = typeof RAPIER_NS;
let R: Rapier | null = null;
/** Dynamic import keeps Rapier (and its inlined WASM) out of every bundle that does not run the walker. Idempotent. */
export async function initRapier(): Promise<void> {
  if (R) return;
  const mod = (await import('@dimforge/rapier3d-compat')).default;
  await mod.init();
  R = mod;
}

export function mapToLimits(a: number, lo: number, hi: number): number { return a >= 0 ? a * hi : -a * lo; }
/** Inverse of mapToLimits, clamped to [-1, 1]. A side with a zero limit (knee hi) maps to 0. */
export function mapFromLimits(angle: number, lo: number, hi: number): number {
  const d = angle >= 0 ? hi : -lo;
  return d === 0 ? 0 : clamp(angle / d, -1, 1);
}

export interface WalkerBody { id: string; shape: 'box' | 'capsule'; size: [number, number, number]; pos(): [number, number, number]; quat(): [number, number, number, number] }
export interface WalkerSim {
  step(targets: Float32Array): void;          // 6 joint target angles (radians); one physics step
  torso(): { x: number; y: number; vx: number; vy: number; pitch: number; pitchRate: number };
  jointAngle(i: number): number;              // child z-rotation minus parent z-rotation
  jointVel(i: number): number;
  footY(side: 0 | 1): number;
  bodies: WalkerBody[];                       // torso, thigh L, shin L, foot L, thigh R, shin R, foot R (fixed order)
  free(): void;
}

const GROUND = (0x0001 << 16) | 0x0002, PART = (0x0002 << 16) | 0x0001;     // membership << 16 | filter: parts touch only the ground

/** Requires initRapier() to have resolved. Bodies and joints are created in a fixed order (determinism). */
export function createWalkerSim(): WalkerSim {
  if (!R) throw new Error('initRapier() must resolve before createWalkerSim()');
  const RAPIER = R;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = WALKER.dt; world.numSolverIterations = WALKER.solverIterations;
  world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 5).setTranslation(0, -0.5, 0).setFriction(1).setCollisionGroups(GROUND));
  const bodies: WalkerBody[] = [];
  // Planar (spec A17). Rapier 0.21 explodes when both bodies of a revolute joint have locked axes, so only the torso is locked;
  // the legs are held in its plane by the Z-axis joints and their small solver drift is projected out after every step.
  const part = (id: string, shape: 'box' | 'capsule', size: [number, number, number], x: number, y: number, z: number): RigidBody => {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z);
    if (id === 'torso') bodyDesc.enabledTranslations(true, true, false).enabledRotations(false, false, true);
    const body = world.createRigidBody(bodyDesc);
    const desc = shape === 'box' ? RAPIER.ColliderDesc.cuboid(size[0], size[1], size[2]) : RAPIER.ColliderDesc.capsule(size[1], size[0]);
    world.createCollider(desc.setDensity(1000).setFriction(1).setCollisionGroups(PART), body);
    bodies.push({
      id, shape, size,
      pos: () => { const t = body.translation(); return [t.x, t.y, t.z]; },
      quat: () => { const q = body.rotation(); return [q.x, q.y, q.z, q.w]; },
    });
    return body;
  };

  const torso = part('torso', 'box', [0.1, 0.25, 0.12], 0, 1.2, 0);
  const axis = { x: 0, y: 0, z: 1 };
  const legParts: { body: RigidBody; z: number }[] = [];
  const joints: { joint: RevoluteImpulseJoint; parent: RigidBody; child: RigidBody }[] = [];
  const feet: RigidBody[] = [];
  for (const [side, z] of [['L', 0.09], ['R', -0.09]] as const) {
    const thigh = part(`thigh ${side}`, 'capsule', [0.05, 0.17, 0], 0, 0.73, z);
    const shin = part(`shin ${side}`, 'capsule', [0.045, 0.17, 0], 0, 0.29, z);
    const foot = part(`foot ${side}`, 'box', [0.11, 0.035, 0.06], 0.04, 0.035, z);
    feet.push(foot); legParts.push({ body: thigh, z }, { body: shin, z }, { body: foot, z });
    const rev = (parent: RigidBody, child: RigidBody, pa: [number, number, number], pb: [number, number, number]) => {
      const joint = world.createImpulseJoint(RAPIER.JointData.revolute({ x: pa[0], y: pa[1], z: pa[2] }, { x: pb[0], y: pb[1], z: pb[2] }, axis), parent, child, true) as RevoluteImpulseJoint;
      const [lo, hi] = LIMITS[joints.length]!;
      joint.setLimits(lo, hi); joint.configureMotorModel(RAPIER.MotorModel.ForceBased); joint.setMotorMaxForce(WALKER.maxTorque);
      joints.push({ joint, parent, child });
    };
    rev(torso, thigh, [0, -0.25, z], [0, 0.22, 0]);      // hip at world y 0.95
    rev(thigh, shin, [0, -0.22, 0], [0, 0.22, 0]);       // knee at 0.51
    rev(shin, foot, [0, -0.22, 0], [-0.04, 0.035, 0]);   // ankle at 0.07
  }

  /** Rotation of a planar body about z. */
  const angle = (b: RigidBody) => { const q = b.rotation(); return 2 * Math.atan2(q.z, q.w); };
  const wrap = (a: number) => (a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a);

  return {
    bodies,
    step(targets) {
      for (let j = 0; j < 6; j++) joints[j]!.joint.configureMotorPosition(targets[j]!, WALKER.stiffness, WALKER.damping);
      world.step();
      for (const { body, z } of legParts) {
        const t = body.translation(), q = body.rotation(), n = Math.hypot(q.z, q.w), v = body.linvel(), w = body.angvel();
        body.setTranslation({ x: t.x, y: t.y, z }, false); body.setRotation({ x: 0, y: 0, z: q.z / n, w: q.w / n }, false);
        body.setLinvel({ x: v.x, y: v.y, z: 0 }, false); body.setAngvel({ x: 0, y: 0, z: w.z }, false);
      }
    },
    torso() {
      const t = torso.translation(), v = torso.linvel();
      return { x: t.x, y: t.y, vx: v.x, vy: v.y, pitch: wrap(angle(torso)), pitchRate: torso.angvel().z };
    },
    jointAngle: (i) => wrap(angle(joints[i]!.child) - angle(joints[i]!.parent)),
    jointVel: (i) => joints[i]!.child.angvel().z - joints[i]!.parent.angvel().z,
    footY: (side) => feet[side]!.translation().y,
    free() { world.free(); },
  };
}
