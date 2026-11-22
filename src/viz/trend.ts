/**
 * How one iteration's champion did: a new record, better than the mean of the 10 before it, or no gain. `none`: the
 * iteration has no score (a PPO update in which no episode ended) or lies before the reward change the record starts at.
 */
export type Mark = 'rec' | 'imp' | 'flat' | 'none';
export interface Trend { record: number; recordAt: number; marks: Mark[] }
export interface Verdict { state: 'idle' | 'rec' | 'learning' | 'stalled'; text: string }

const LOOKBACK = 10, STALLED_AFTER = 30;

/**
 * The record over `bests[start..]` (index of the iteration that set it; -1 and NaN when empty) and a mark for each of
 * the last `window` iterations. `start` is where a reward change rescaled fitness: the record starts over there.
 * Non-finite values are iterations without a score: they set no record and stay out of the lookback mean.
 */
export function trend(bests: readonly number[], window = 60, start = 0): Trend {
  const n = bests.length, tail = Math.max(start, n - window), marks: Mark[] = [];
  let record = NaN, recordAt = -1;
  for (let i = start; i < n; i++) {
    const v = bests[i]!, scored = Number.isFinite(v), isRecord = scored && (recordAt < 0 || v > record);
    if (isRecord) { record = v; recordAt = i; }
    if (i < tail) continue;
    let sum = 0, count = 0;
    for (let k = Math.max(start, i - LOOKBACK); k < i; k++) if (Number.isFinite(bests[k])) { sum += bests[k]!; count++; }
    marks.push(!scored ? 'none' : isRecord ? 'rec' : v > sum / count ? 'imp' : 'flat');
  }
  return { record, recordAt, marks };
}

/** One line answering "is it learning?" after `n` iterations. `unit`: generation, update or round. */
export function verdict(t: Trend, n: number, unit: string): Verdict {
  if (n === 0 || t.recordAt < 0) return { state: 'idle', text: 'Not started' };
  const ago = n - 1 - t.recordAt, units = `${ago} ${unit}${ago === 1 ? '' : 's'}`;
  if (ago === 0) return { state: 'rec', text: `New record this ${unit}` };
  return ago < STALLED_AFTER ? { state: 'learning', text: `Still learning - record set ${units} ago` }
    : { state: 'stalled', text: `Stalled - no new record for ${units}` };
}

const RL_ALPHA = 0.1, RL_LOOK = 30, RL_MIN = 10;

/**
 * The same question for DQN and PPO, where one lucky episode sets a record that a steadily improving agent then takes long
 * to beat: the verdict reads the smoothed mean return instead. Learning while that average stands above where it was
 * `RL_LOOK` iterations ago by more than its own noise. `means[start..]` as in `trend`; non-finite entries are skipped.
 */
export function rlVerdict(means: readonly number[], unit: string, start = 0): Verdict {
  if (means.length <= start) return { state: 'idle', text: 'Not started' };
  const avg: number[] = [], dev: number[] = [];
  let e = NaN, scored = 0;
  for (let i = start; i < means.length; i++) {
    const v = means[i]!;
    if (Number.isFinite(v)) { if (scored) dev[i - start] = v - e; e = scored ? e + RL_ALPHA * (v - e) : v; scored++; }
    avg.push(e);
  }
  if (scored === 0) return { state: 'learning', text: 'Still learning - no episode has finished yet' };
  const look = Math.min(RL_LOOK, avg.length - 1), then = avg[avg.length - 1 - look]!;
  if (scored < RL_MIN || !Number.isFinite(then)) return { state: 'learning', text: 'Still learning - too early to tell' };
  // Two standard deviations of the difference between two readings of the average, from how far single iterations fall from it.
  let sq = 0, count = 0;
  for (let i = avg.length - look; i < avg.length; i++) if (dev[i] !== undefined) { sq += dev[i]! ** 2; count++; }
  const noise = 2 * Math.sqrt((sq / Math.max(1, count)) * ((2 * RL_ALPHA) / (2 - RL_ALPHA)));
  const delta = e - then, units = `the last ${look} ${unit}s`;
  return delta > noise ? { state: 'learning', text: `Still learning - average up ${Number(delta.toPrecision(2))} over ${units}` }
    : { state: 'stalled', text: `Stalled - average has not risen over ${units}` };
}
