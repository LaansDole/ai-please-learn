/** Evenly spaced ticks with a step from {1, 2, 5} x 10^k, covering [min, max]. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!(max > min)) max = min + 1;
  const raw = (max - min) / target, mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  const out: number[] = [];
  // Integer multiples of the step, so ticks do not accumulate floating-point drift.
  for (let i = Math.floor(min / step + 1e-9); i <= Math.ceil(max / step - 1e-9); i++) out.push(Number((i * step).toFixed(digits)));
  return out;
}

/** Min/max bucketing: at most about 2 * maxPoints points, endpoints kept, extremes kept. Non-finite y values are never picked. */
export function decimate(xs: number[], ys: number[], maxPoints: number): { xs: number[]; ys: number[] } {
  const n = xs.length;
  if (n <= maxPoints) return { xs, ys };
  const keep = new Set<number>([0, n - 1]), buckets = maxPoints - 1;
  for (let b = 0; b < buckets; b++) {
    const a = Math.floor((b * n) / buckets), end = Math.floor(((b + 1) * n) / buckets);
    let lo = -1, hi = -1;
    for (let i = a; i < end; i++) {
      if (!Number.isFinite(ys[i])) continue;
      if (lo < 0 || ys[i]! < ys[lo]!) lo = i;
      if (hi < 0 || ys[i]! > ys[hi]!) hi = i;
    }
    if (lo >= 0) { keep.add(lo); keep.add(hi); }
  }
  const idx = [...keep].sort((a, b) => a - b);
  return { xs: idx.map((i) => xs[i]!), ys: idx.map((i) => ys[i]!) };
}

/** rows[g][k]: cumulative upper bound in [0, 1] of species ids[k]'s population share at generation g. Ids in order of first appearance. */
export function stackShares(history: readonly { species: { id: number; size: number }[] }[]): { ids: number[]; rows: number[][] } {
  const ids: number[] = [], index = new Map<number, number>();
  for (const g of history) for (const s of g.species) if (!index.has(s.id)) { index.set(s.id, ids.length); ids.push(s.id); }
  const rows = history.map((g) => {
    const sizes = new Array<number>(ids.length).fill(0);
    let total = 0;
    for (const s of g.species) { sizes[index.get(s.id)!]! += s.size; total += s.size; }
    let acc = 0;
    return sizes.map((s) => (acc += total > 0 ? s / total : 0));
  });
  return { ids, rows };
}

/** At most `max` (>= 2) items at evenly spaced indices; the first and the last are always kept. */
export function sampleEvenly<T>(xs: readonly T[], max: number): readonly T[] {
  const n = xs.length;
  if (n <= max) return xs;
  return Array.from({ length: max }, (_, i) => xs[Math.round((i * (n - 1)) / (max - 1))]!);
}

export function ema(values: number[], alpha: number): number[] {
  let prev = values[0] ?? 0;
  return values.map((v, i) => (prev = i === 0 ? v : alpha * v + (1 - alpha) * prev));
}
