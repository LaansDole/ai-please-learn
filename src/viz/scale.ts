/** Evenly spaced ticks with a step from {1, 2, 5} x 10^k, covering [min, max]. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  // A span below the values' own precision cannot be ticked (the step would vanish next to them): widen it relative to the magnitude.
  const floor = Math.max(Math.abs(min), Math.abs(max)) * 1e-6;
  if (!(max - min > floor)) max = min + Math.max(1, floor);
  const raw = (max - min) / target, mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const first = Math.floor(min / step + 1e-9), last = Math.ceil(max / step - 1e-9);
  // Non-finite input or a span that overflows: no nice step exists, the two ends are the ticks.
  if (!(step > 0) || !Number.isFinite(step) || !(last - first <= 10 * target)) return [min, max];
  const digits = Math.min(20, Math.max(0, -Math.floor(Math.log10(step))));
  const out: number[] = [];
  // Integer multiples of the step, so ticks do not accumulate floating-point drift.
  for (let i = first; i <= last; i++) out.push(Number((i * step).toFixed(digits)));
  return out;
}

/** Axis and tooltip number: three significant digits without padding zeros ("0.005", not "0.00500", which overflows the axis gutter). */
export function tickLabel(v: number): string {
  const a = Math.abs(v);
  return a >= 10000 ? `${(v / 1000).toFixed(0)}k` : a >= 100 || Number.isInteger(v) ? v.toFixed(0) : String(Number(v.toPrecision(3)));
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

/** The band of pooled small species; never a real species id. */
export const OTHER = -1;

/**
 * What the species chart draws. NEAT makes and loses species every few generations, and one band per species is unreadable:
 * every generation draws its own `top` largest species (ties go to the older one) and pools the rest into one `OTHER` band
 * on top, so that band is never more than what the largest leave over. Bands are stacked in order of first appearance,
 * oldest at the bottom. Shares are averaged over neighbouring generations on long runs, so a band changes shape with the
 * trend and not with every reshuffle; the window shrinks towards both ends, so the first and last columns are exact.
 * rows[g][k] is the cumulative upper bound in [0, 1] of band ids[k] at generation g (a species outside that generation's
 * largest has no height there); the last band ends at 1.
 * `pooled` counts the species alive in the last generation that are inside `OTHER`.
 */
export function speciesBands(
  history: readonly { species: { id: number; size: number }[] }[], { top = 6 } = {},
): { ids: number[]; rows: number[][]; pooled: number } {
  const all: number[] = [], index = new Map<number, number>(), n = history.length;
  for (const g of history) for (const s of g.species) if (!index.has(s.id)) { index.set(s.id, all.length); all.push(s.id); }
  const raw = history.map((g) => {
    const shares = new Array<number>(all.length).fill(0), total = g.species.reduce((sum, s) => sum + s.size, 0);
    if (total > 0) for (const s of g.species) shares[index.get(s.id)!]! += s.size / total;
    return shares;
  });
  // Centred moving average; the same window for every species, so a column still sums to 1.
  const radius = Math.min(4, Math.floor(n / 12));
  const smooth = raw.map((own, g) => {
    const r = Math.min(radius, g, n - 1 - g);
    return r === 0 ? own : all.map((_, k) => { let sum = 0; for (let i = g - r; i <= g + r; i++) sum += raw[i]![k]!; return sum / (2 * r + 1); });
  });
  let other = false;
  const largest = smooth.map((row) => {
    const alive = row.flatMap((share, k) => (share > 0 ? [k] : []));
    other ||= alive.length > top;
    return { pooled: Math.max(0, alive.length - top), set: new Set(alive.sort((a, b) => row[b]! - row[a]! || all[a]! - all[b]!).slice(0, top)) };
  });
  const kept = all.flatMap((_, k) => (largest.some((l) => l.set.has(k)) ? [k] : []));
  const rows = smooth.map((row, g) => {
    let acc = 0, last = -1;
    const out = kept.map((k, j) => { if (largest[g]!.set.has(k)) { acc += row[k]!; last = j; } return acc; });
    // Where nothing is pooled the largest species fill the column: close it at exactly 1, rounding aside, so the grey
    // band has no height there.
    if (largest[g]!.pooled === 0 && last >= 0) out.fill(1, last);
    if (other) out.push(1);
    return out;
  });
  return { ids: [...kept.map((k) => all[k]!), ...(other ? [OTHER] : [])], rows, pooled: largest.at(-1)?.pooled ?? 0 };
}

/** Standings order: largest first, ties to the older species (ids count up), as `speciesBands` picks a generation's largest. */
export function rankSpecies<T extends { id: number; size: number }>(species: readonly T[]): T[] {
  return [...species].sort((a, b) => b.size - a.size || a.id - b.id);
}

/**
 * Palette slots for the bands in `ids`. A species keeps the slot it was first given (`slots` outlives the call), and a new
 * one takes a slot that no band drawn in the same generation uses.
 */
export function assignColours(ids: readonly number[], rows: readonly number[][], slots: Map<number, number>, palette: number): void {
  const drawn = (row: number[], k: number) => row[k]! > (k === 0 ? 0 : row[k - 1]!);
  ids.forEach((id, k) => {
    if (id === OTHER || slots.has(id)) return;
    const used = new Set<number>();
    for (const row of rows) if (drawn(row, k)) ids.forEach((o, j) => { if (slots.has(o) && drawn(row, j)) used.add(slots.get(o)!); });
    // ponytail: with every slot taken by a species it has met over its life, it shares its own id's slot; the id on the band tells them apart.
    let s = id % palette;
    for (let i = 0; i < palette && used.has(s); i++) s = (s + 1) % palette;
    slots.set(id, s);
  });
}

/**
 * The highest value so far at each index: the line that answers "is it improving?". `restart(i)` begins a new record at i.
 * null and non-finite values are gaps: they neither set nor freeze the record.
 */
export function runningBest(values: readonly (number | null)[], restart?: (i: number) => boolean): (number | null)[] {
  let best: number | null = null;
  return values.map((v, i) => {
    if (restart?.(i)) best = null;
    if (v !== null && Number.isFinite(v) && (best === null || v > best)) best = v;
    return best;
  });
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
