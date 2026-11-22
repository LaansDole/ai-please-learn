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
 * only species that reach `minShare` of the population are kept (the `maxBands` largest of them, in order of first
 * appearance, oldest at the bottom), and everything else is pooled into one `OTHER` band on top. Shares are averaged over
 * neighbouring generations on long runs, so a band changes shape with the trend and not with every reshuffle.
 * rows[g][k] is the cumulative upper bound in [0, 1] of band ids[k] at generation g; the last band always ends at 1.
 * `pooled` counts the species alive in the last generation that are inside `OTHER`.
 */
export function speciesBands(
  history: readonly { species: { id: number; size: number }[] }[], { minShare = 0.06, maxBands = 7 } = {},
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
  const smooth = radius === 0 ? raw : raw.map((_, g) => {
    const a = Math.max(0, g - radius), b = Math.min(n - 1, g + radius);
    return all.map((_, k) => { let sum = 0; for (let i = a; i <= b; i++) sum += raw[i]![k]!; return sum / (b - a + 1); });
  });
  const peak = all.map((_, k) => smooth.reduce((m, row) => Math.max(m, row[k]!), 0));
  const area = all.map((_, k) => smooth.reduce((sum, row) => sum + row[k]!, 0));
  const kept = all.map((_, k) => k).filter((k) => peak[k]! >= minShare).sort((a, b) => area[b]! - area[a]!).slice(0, maxBands).sort((a, b) => a - b);
  const other = kept.length < all.length;
  const rows = smooth.map((row) => {
    let acc = 0;
    const out = kept.map((k) => (acc += row[k]!));
    if (other) out.push(1); else if (out.length) out[out.length - 1] = 1;
    return out;
  });
  const shown = new Set(kept.map((k) => all[k]!));
  return { ids: [...kept.map((k) => all[k]!), ...(other ? [OTHER] : [])], rows, pooled: history.at(-1)?.species.filter((s) => s.size > 0 && !shown.has(s.id)).length ?? 0 };
}

/**
 * Palette slots for the bands in `ids`. A species keeps the slot it was first given (`slots` outlives the call), and a new
 * one takes a slot that no band beside it uses. At most `palette` real ids at a time.
 */
export function assignColours(ids: readonly number[], slots: Map<number, number>, palette: number): void {
  const used = new Set(ids.flatMap((id) => (slots.has(id) ? [slots.get(id)!] : [])));
  for (const id of ids) {
    if (id === OTHER || slots.has(id) || used.size >= palette) continue;
    let s = id % palette;
    while (used.has(s)) s = (s + 1) % palette;
    slots.set(id, s); used.add(s);
  }
}

/** The highest value so far at each index: the line that answers "is it improving?". `restart(i)` begins a new record at i. */
export function runningBest(values: readonly (number | null)[], restart?: (i: number) => boolean): (number | null)[] {
  let best: number | null = null;
  return values.map((v, i) => {
    if (restart?.(i)) best = null;
    if (v !== null && (best === null || v > best)) best = v;
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
