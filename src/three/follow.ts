import type { Body3D, Vec3 } from '../env/types';

/** Centroid of the solid (non-ghost) bodies: what the camera follows. Null when the frame has none. */
export function focusOf(bodies: Body3D[]): Vec3 | null {
  let x = 0, y = 0, z = 0, n = 0;
  for (const b of bodies) { if (b.ghost) continue; x += b.pos[0]; y += b.pos[1]; z += b.pos[2]; n++; }
  return n ? [x / n, y / n, z / n] : null;
}

/** x eases towards the focus; height and distance stay where the camera started. */
export function followCamera(current: Vec3, focus: Vec3, lerp: number): Vec3 {
  return [current[0] + (focus[0] - current[0]) * lerp, current[1], current[2]];
}

/** Whole-metre positions within `focusX +/- span`. */
export function distanceMarkers(focusX: number, span: number): number[] {
  const out: number[] = [];
  for (let m = Math.ceil(focusX - span); m <= Math.floor(focusX + span); m++) out.push(m);
  return out;
}
