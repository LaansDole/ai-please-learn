import { beforeAll, describe, expect, it } from 'vitest';
import { LIMITS, createWalkerSim, initRapier, mapFromLimits, mapToLimits } from './model';

beforeAll(() => initRapier());
const zeros = new Float32Array(6);

describe('walker model', () => {
  it('maps actions to joint limits with 0 = straight', () => {
    expect(mapToLimits(0, -1.9, 0)).toBe(0); expect(mapToLimits(-1, -1.9, 0)).toBeCloseTo(-1.9); expect(mapToLimits(1, -0.8, 1.1)).toBeCloseTo(1.1);
    expect(mapFromLimits(mapToLimits(-0.4, -0.8, 1.1), -0.8, 1.1)).toBeCloseTo(-0.4);
  });
  it('spawns standing and keeps standing for a second with straight-leg targets', () => {
    const sim = createWalkerSim();
    expect(sim.torso().y).toBeCloseTo(1.2, 1);
    for (let i = 0; i < 60; i++) sim.step(zeros);
    expect(sim.torso().y).toBeGreaterThan(0.9); expect(Math.abs(sim.torso().pitch)).toBeLessThan(0.5);
    expect(sim.footY(0)).toBeLessThan(0.06);
    sim.free();
  });
  it('is planar: z and out-of-plane rotation stay zero', () => {
    const sim = createWalkerSim(); const t = Float32Array.from([1.0, -1.5, 0.3, -0.6, 0, -0.3]);
    for (let i = 0; i < 120; i++) sim.step(t);
    for (const b of sim.bodies) { expect(Math.abs(b.pos()[2] - (b.id.endsWith('L') ? 0.09 : b.id.endsWith('R') ? -0.09 : 0))).toBeLessThan(1e-4); expect(Math.abs(b.quat()[0])).toBeLessThan(1e-4); expect(Math.abs(b.quat()[1])).toBeLessThan(1e-4); }
    sim.free();
  });
  it('motors move joints toward their targets and respect limits', () => {
    const sim = createWalkerSim(); const t = Float32Array.from([0.8, -1.2, 0, 0, 0, 0]);
    for (let i = 0; i < 40; i++) sim.step(t);
    expect(sim.jointAngle(0)).toBeGreaterThan(0.3); expect(sim.jointAngle(1)).toBeLessThan(-0.4);
    for (let j = 0; j < 6; j++) { expect(sim.jointAngle(j)).toBeGreaterThan(LIMITS[j]![0] - 0.15); expect(sim.jointAngle(j)).toBeLessThan(LIMITS[j]![1] + 0.15); }
    sim.free();
  });
  it('is deterministic: two sims with the same targets are bit-identical', () => {
    const run = () => { const sim = createWalkerSim(); const out: number[] = [];
      for (let i = 0; i < 200; i++) { sim.step(Float32Array.from([Math.sin(i / 9), -0.5, 0.1, -Math.sin(i / 9), -0.8, 0])); }
      for (const b of sim.bodies) out.push(...b.pos(), ...b.quat()); sim.free(); return out; };
    expect(run()).toEqual(run());
  });
});
