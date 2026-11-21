export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export type Vec2 = [number, number];

export const vec = {
  add: (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]],
  sub: (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]],
  scale: (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s],
  dot: (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1],
  len: (a: Vec2): number => Math.hypot(a[0], a[1]),
  dist: (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]),
  norm: (a: Vec2): Vec2 => { const l = Math.hypot(a[0], a[1]); return l === 0 ? [0, 0] : [a[0] / l, a[1] / l]; },
  rot: (a: Vec2, r: number): Vec2 => { const c = Math.cos(r), s = Math.sin(r); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; },
};
