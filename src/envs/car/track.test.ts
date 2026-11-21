import { describe, expect, it } from 'vitest';
import { TRACK, castRay, distToCentre, nearestSample } from './track';

describe('track', () => {
  const t = TRACK;
  it('is a closed, evenly sampled loop with room for the car', () => {
    expect(t.n).toBe(160);
    const seg = Array.from({ length: t.n }, (_, i) => Math.hypot(t.cx[(i + 1) % t.n]! - t.cx[i]!, t.cy[(i + 1) % t.n]! - t.cy[i]!));
    expect(Math.max(...seg) / Math.min(...seg)).toBeLessThan(1.6);
    for (let i = 0; i < t.n; i++) { expect(t.cx[i]).toBeGreaterThan(40); expect(t.cx[i]).toBeLessThan(760); expect(t.cy[i]).toBeGreaterThan(40); expect(t.cy[i]).toBeLessThan(460); }
  });
  it('does not overlap itself: far-apart samples are more than two half-widths apart', () => {
    for (let i = 0; i < t.n; i++) for (let j = i + 1; j < t.n; j++) {
      const gap = Math.min(j - i, t.n - (j - i));
      if (gap > 14) expect(Math.hypot(t.cx[i]! - t.cx[j]!, t.cy[i]! - t.cy[j]!)).toBeGreaterThan(2 * t.halfWidth + 6);
    }
  });
  it('corners are drivable: radius of curvature is at least 45 px everywhere', () => {
    for (let i = 0; i < t.n; i++) {
      const j = (i + 1) % t.n;
      const dTheta = Math.abs(Math.atan2(t.tx[i]! * t.ty[j]! - t.ty[i]! * t.tx[j]!, t.tx[i]! * t.tx[j]! + t.ty[i]! * t.ty[j]!));
      const ds = Math.hypot(t.cx[j]! - t.cx[i]!, t.cy[j]! - t.cy[i]!);
      expect(ds / Math.max(dTheta, 1e-6)).toBeGreaterThan(45);
    }
  });
  it('nearestSample, distToCentre and castRay agree with the geometry', () => {
    for (const i of [0, 37, 80, 121]) {
      expect(nearestSample(t, t.cx[i]!, t.cy[i]!, i)).toBe(i);
      expect(distToCentre(t, t.cx[i]!, t.cy[i]!, i)).toBeLessThan(0.5);
      const heading = Math.atan2(t.ty[i]!, t.tx[i]!);
      expect(castRay(t, t.cx[i]!, t.cy[i]!, heading + Math.PI / 2, i, 300)).toBeGreaterThan(t.halfWidth - 4);
      expect(castRay(t, t.cx[i]!, t.cy[i]!, heading + Math.PI / 2, i, 300)).toBeLessThan(t.halfWidth + 8);
      expect(castRay(t, t.cx[i]!, t.cy[i]!, heading, i, 300)).toBeGreaterThan(t.halfWidth);
    }
  });
});
