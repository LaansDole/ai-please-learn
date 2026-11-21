export interface Track {
  n: number;                 // 160 samples
  cx: Float32Array; cy: Float32Array;       // centreline
  tx: Float32Array; ty: Float32Array;       // unit tangents (direction of travel)
  lx: Float32Array; ly: Float32Array;       // left wall = centre + normal * HALF_WIDTH
  rx: Float32Array; ry: Float32Array;       // right wall
  halfWidth: number;         // 34
  gateEvery: number;         // 4 -> 40 checkpoints
}

const SAMPLES = 160, HALF_WIDTH = 34, DENSE = 2000, BACK = 8, AHEAD = 24;
/**
 * Spec section 10.4, with three points moved so every corner has a radius above 45 px: the spec's (650,330) (700,430) (540,450)
 * gave a 17 px hairpin at the bottom right; they are now (700,330) (670,415) (550,450).
 */
export const CONTROL_POINTS: [number, number][] = [
  [120, 250], [160, 110], [300, 70], [430, 130], [540, 70], [680, 100], [720, 230],
  [700, 330], [670, 415], [550, 450], [420, 370], [280, 440], [150, 400],
];

/** Uniform Catmull-Rom through the closed control polygon, resampled to `samples` points at equal arc length. */
export function catmullRomClosed(points: [number, number][], samples: number): { x: Float32Array; y: Float32Array } {
  const m = points.length, dx = new Float64Array(DENSE + 1), dy = new Float64Array(DENSE + 1), len = new Float64Array(DENSE + 1);
  for (let i = 0; i <= DENSE; i++) {
    const u = (i / DENSE) * m, seg = Math.floor(u) % m, t = u - Math.floor(u), t2 = t * t, t3 = t2 * t;
    const p0 = points[(seg + m - 1) % m]!, p1 = points[seg]!, p2 = points[(seg + 1) % m]!, p3 = points[(seg + 2) % m]!;
    for (const [k, out] of [[0, dx], [1, dy]] as const) {
      out[i] = 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
    }
    if (i > 0) len[i] = len[i - 1]! + Math.hypot(dx[i]! - dx[i - 1]!, dy[i]! - dy[i - 1]!);
  }
  const x = new Float32Array(samples), y = new Float32Array(samples), total = len[DENSE]!;
  for (let s = 0, j = 0; s < samples; s++) {
    const target = (s / samples) * total;
    while (len[j + 1]! < target) j++;
    const f = (target - len[j]!) / Math.max(len[j + 1]! - len[j]!, 1e-12);
    x[s] = dx[j]! + (dx[j + 1]! - dx[j]!) * f; y[s] = dy[j]! + (dy[j + 1]! - dy[j]!) * f;
  }
  return { x, y };
}

function build(): Track {
  const n = SAMPLES, { x: cx, y: cy } = catmullRomClosed(CONTROL_POINTS, n);
  const t: Track = {
    n, cx, cy, halfWidth: HALF_WIDTH, gateEvery: 4,
    tx: new Float32Array(n), ty: new Float32Array(n), lx: new Float32Array(n), ly: new Float32Array(n), rx: new Float32Array(n), ry: new Float32Array(n),
  };
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    const ddx = cx[b]! - cx[a]!, ddy = cy[b]! - cy[a]!, l = Math.hypot(ddx, ddy);
    const tx = ddx / l, ty = ddy / l;
    t.tx[i] = tx; t.ty[i] = ty;
    t.lx[i] = cx[i]! - ty * HALF_WIDTH; t.ly[i] = cy[i]! + tx * HALF_WIDTH;
    t.rx[i] = cx[i]! + ty * HALF_WIDTH; t.ry[i] = cy[i]! - tx * HALF_WIDTH;
  }
  return t;
}

/** Module-level and shared by all car instances. */
export const TRACK: Track = build();

/** Index of the closest centreline sample among hint-8 .. hint+24 (wrapping). */
export function nearestSample(t: Track, x: number, y: number, hint: number): number {
  let best = hint, bestD = Infinity;
  for (let k = -BACK; k <= AHEAD; k++) {
    const i = ((hint + k) % t.n + t.n) % t.n, d = (t.cx[i]! - x) ** 2 + (t.cy[i]! - y) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function distToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
  const u = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / l2)) : 0;
  return Math.hypot(x - ax - u * ex, y - ay - u * ey);
}

/** Distance to the centreline around `sample`: the segments sample-1..sample and sample..sample+1. */
export function distToCentre(t: Track, x: number, y: number, sample: number): number {
  const a = (sample + t.n - 1) % t.n, b = (sample + 1) % t.n;
  return Math.min(
    distToSegment(x, y, t.cx[a]!, t.cy[a]!, t.cx[sample]!, t.cy[sample]!),
    distToSegment(x, y, t.cx[sample]!, t.cy[sample]!, t.cx[b]!, t.cy[b]!));
}

/** Distance along the ray to the nearest wall segment among hint-8 .. hint+24 on both walls, else maxDist. */
export function castRay(t: Track, ox: number, oy: number, angle: number, hint: number, maxDist: number): number {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = maxDist;
  for (let w = 0; w < 2; w++) {
    const wx = w === 0 ? t.lx : t.rx, wy = w === 0 ? t.ly : t.ry;
    for (let k = -BACK; k < AHEAD; k++) {
      const i = ((hint + k) % t.n + t.n) % t.n, j = (i + 1) % t.n;
      const ax = wx[i]!, ay = wy[i]!, ex = wx[j]! - ax, ey = wy[j]! - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) <= 1e-9) continue;
      // ray o + s*d (s >= 0), segment a + u*e (0 <= u <= 1)
      const s = ((ax - ox) * ey - (ay - oy) * ex) / den, u = ((ax - ox) * dy - (ay - oy) * dx) / den;
      if (s >= 0 && u >= 0 && u <= 1 && s < best) best = s;
    }
  }
  return best;
}
