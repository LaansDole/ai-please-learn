/**
 * The inclusive byte span a single-range HTTP `Range` header asks of a file of `size` bytes. null: no usable header, send the
 * whole file (200). 'unsatisfiable': answer 416 with `content-range: bytes * /size`.
 */
export function byteRange(header: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) {                                         // "bytes=-N": the last N bytes
    const n = Number(m[2]);
    return n > 0 && size > 0 ? { start: Math.max(0, size - n), end: size - 1 } : 'unsatisfiable';
  }
  const start = Number(m[1]), end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (m[2] && Number(m[2]) < start) return null;       // a backwards range is not a range: the header is ignored
  return start >= size ? 'unsatisfiable' : { start, end };
}
