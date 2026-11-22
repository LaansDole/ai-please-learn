import { describe, expect, it } from 'vitest';
import { byteRange } from './byteRange';

describe('byteRange', () => {
  it('no header, or one that is not a byte range, is the whole file', () => {
    for (const h of [undefined, '', 'bytes=-', 'items=0-5', 'bytes=0-5,10-15', 'bytes=5-2']) expect(byteRange(h, 100), String(h)).toBeNull();
  });
  it('reads start-end, clamps the end to the file, and an open end runs to the last byte', () => {
    expect(byteRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(byteRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange('bytes=40-', 100)).toEqual({ start: 40, end: 99 });
    expect(byteRange('bytes=99-', 100)).toEqual({ start: 99, end: 99 });
  });
  it('a suffix range is the last N bytes', () => {
    expect(byteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
  });
  it('a start at or past the end, or an empty suffix, cannot be satisfied', () => {
    for (const h of ['bytes=100-', 'bytes=100-200', 'bytes=5000-', 'bytes=-0']) expect(byteRange(h, 100), h).toBe('unsatisfiable');
    expect(byteRange('bytes=0-', 0)).toBe('unsatisfiable');
  });
});
