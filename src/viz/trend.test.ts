import { describe, expect, it } from 'vitest';
import { trend, verdict } from './trend';

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
