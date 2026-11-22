import { describe, expect, it } from 'vitest';
import { rlVerdict, trend, verdict } from './trend';

describe('trend', () => {
  it('finds the record and marks the tail', () => {
    const t = trend([1, 5, 3, 4, 9, 2], 4);
    expect(t.record).toBe(9); expect(t.recordAt).toBe(4);
    // 3 < mean(1,5); 4 > mean(1,5,3); 9 is a record; 2 < mean
    expect(t.marks).toEqual(['flat', 'imp', 'rec', 'flat']);
  });
  it('counts the first iteration as a record and an equal score as no record', () => {
    expect(trend([7, 7]).marks).toEqual(['rec', 'flat']);
    expect(trend([7, 7]).recordAt).toBe(0);
  });
  it('restarts the record at `start` (a reward change rescales fitness)', () => {
    const t = trend([100, 100, 2, 3], 60, 2);
    expect(t.record).toBe(3); expect(t.recordAt).toBe(3); expect(t.marks).toEqual(['rec', 'rec']);
  });
  it('is empty before the first iteration', () => {
    expect(trend([])).toEqual({ record: NaN, recordAt: -1, marks: [] });
  });
});

describe('verdict', () => {
  const at = (n: number, recordAt: number) => verdict({ record: 1, recordAt, marks: [] }, n, 'generation');
  it('words each state without a semicolon', () => {
    expect(at(0, -1)).toEqual({ state: 'idle', text: 'Not started' });
    expect(at(5, 4)).toEqual({ state: 'rec', text: 'New record this generation' });
    expect(at(358, 351)).toEqual({ state: 'learning', text: 'Still learning - record set 6 generations ago' });
    expect(at(10, 8).text).toBe('Still learning - record set 1 generation ago');
    expect(at(200, 99)).toEqual({ state: 'stalled', text: 'Stalled - no new record for 100 generations' });
  });
});

describe('iterations without a score (a PPO update in which no episode ended)', () => {
  it('are skipped: no record, no mark, not in the lookback mean', () => {
    expect(trend([NaN, 1, 2])).toEqual({ record: 2, recordAt: 2, marks: ['none', 'rec', 'rec'] });
    expect(trend([4, NaN, 3]).marks).toEqual(['rec', 'none', 'flat']);          // 3 < mean(4), the NaN is not a 0
    expect(trend([-9, NaN, -5]).marks).toEqual(['rec', 'none', 'rec']);
    expect(trend([NaN, NaN])).toEqual({ record: NaN, recordAt: -1, marks: ['none', 'none'] });
  });
});

describe('rlVerdict', () => {
  // Seeded noise within +-5 of a level.
  const noisy = (level: (i: number) => number, n: number) => { let s = 1; return Array.from({ length: n }, (_, i) => level(i) + (((s = (s * 48271) % 2147483647) % 1001) / 100 - 5)); };
  it('says learning while the smoothed return rises, however noisy single rounds are', () => {
    const v = rlVerdict(noisy((i) => i * 0.3, 120), 'round');
    expect(v.state).toBe('learning'); expect(v.text).toMatch(/^Still learning - average up \S+ over the last 30 rounds$/);
  });
  it('says stalled once the smoothed return is flat or falling', () => {
    expect(rlVerdict(noisy((i) => Math.min(i, 40) * 0.3, 160), 'round')).toEqual({ state: 'stalled', text: 'Stalled - average has not risen over the last 30 rounds' });
    expect(rlVerdict(noisy((i) => -i * 0.3, 120), 'update').state).toBe('stalled');
  });
  it('is idle before the first round and patient while there is too little to compare', () => {
    expect(rlVerdict([], 'round')).toEqual({ state: 'idle', text: 'Not started' });
    expect(rlVerdict([NaN, NaN], 'update')).toEqual({ state: 'learning', text: 'Still learning - no episode has finished yet' });
    expect(rlVerdict([1, 0, 2], 'round')).toEqual({ state: 'learning', text: 'Still learning - too early to tell' });
  });
  it('starts over at a reward change and skips updates without an episode', () => {
    const rising = noisy((i) => i * 0.6, 120);
    expect(rlVerdict([...noisy(() => 500, 50), ...rising], 'round', 50).state).toBe('learning');
    expect(rlVerdict(rising.flatMap((v) => [v, NaN]), 'update').state).toBe('learning');
  });
});
