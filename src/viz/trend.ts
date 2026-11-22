/** How one iteration's champion did: a new record, better than the mean of the 10 before it, or no gain. */
export type Mark = 'rec' | 'imp' | 'flat';
export interface Trend { record: number; recordAt: number; marks: Mark[] }

const LOOKBACK = 10, STALLED_AFTER = 30;

/**
 * The record over `bests[start..]` (index of the iteration that set it; -1 and NaN when empty) and a mark for each of
 * the last `window` iterations. `start` is where a reward change rescaled fitness: the record starts over there.
 */
export function trend(bests: readonly number[], window = 60, start = 0): Trend {
  const n = bests.length, tail = Math.max(start, n - window), marks: Mark[] = [];
  let record = NaN, recordAt = -1;
  for (let i = start; i < n; i++) {
    const v = bests[i]!, isRecord = recordAt < 0 || v > record;
    if (isRecord) { record = v; recordAt = i; }
    if (i < tail) continue;
    let sum = 0;
    const from = Math.max(start, i - LOOKBACK);
    for (let k = from; k < i; k++) sum += bests[k]!;
    marks.push(isRecord ? 'rec' : v > sum / (i - from) ? 'imp' : 'flat');
  }
  return { record, recordAt, marks };
}

/** One line answering "is it learning?" after `n` iterations. `unit`: generation, update or round. */
export function verdict(t: Trend, n: number, unit: string): { state: 'idle' | 'rec' | 'learning' | 'stalled'; text: string } {
  if (n === 0 || t.recordAt < 0) return { state: 'idle', text: 'Not started' };
  const ago = n - 1 - t.recordAt, units = `${ago} ${unit}${ago === 1 ? '' : 's'}`;
  if (ago === 0) return { state: 'rec', text: `New record this ${unit}` };
  return ago < STALLED_AFTER ? { state: 'learning', text: `Still learning - record set ${units} ago` }
    : { state: 'stalled', text: `Stalled - no new record for ${units}` };
}
