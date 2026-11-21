import { describe, expect, it, vi } from 'vitest';
import { validateInWorker, type WorkerLike } from './validateClient';
import type { ValidationReport } from './validator';

const report: ValidationReport = { ok: true, errors: [], warnings: [], stats: { steps: 2000, episodes: 16, ms: 5 } };

function fake(onPost: (w: WorkerLike & { terminated: number; posted: unknown[] }) => void) {
  const w = { posted: [] as unknown[], terminated: 0, onmessage: null, onerror: null,
    postMessage(m: unknown) { this.posted.push(m); onPost(this); }, terminate() { this.terminated++; } } as WorkerLike & { terminated: number; posted: unknown[] };
  return w;
}

describe('validateInWorker', () => {
  it('resolves with the worker report and terminates the worker', async () => {
    const w = fake((self) => { queueMicrotask(() => self.onmessage?.({ data: { t: 'validated', report } })); });
    expect(await validateInWorker(() => w, 'src', { name: 'x' })).toEqual(report);
    expect(w.posted).toEqual([{ t: 'validate', source: 'src', meta: { name: 'x' } }]);
    expect(w.terminated).toBe(1);
  });
  it('times out a silent worker, terminates it once and ignores a late reply', async () => {
    vi.useFakeTimers();
    try {
      const w = fake(() => {});
      const p = validateInWorker(() => w, 'src', {}, 40);
      vi.advanceTimersByTime(40);
      const r = await p;
      expect(r).toEqual({ ok: false, errors: ['validation timed out after 0.04 s (possible infinite loop)'], warnings: [] });
      w.onmessage?.({ data: { t: 'validated', report } });
      expect(w.terminated).toBe(1);
    } finally { vi.useRealTimers(); }
  });
  it('the default budget is 5 s', async () => {
    vi.useFakeTimers();
    try {
      const p = validateInWorker(() => fake(() => {}), 'src', {});
      vi.advanceTimersByTime(5000);
      expect((await p).errors).toEqual(['validation timed out after 5 s (possible infinite loop)']);
    } finally { vi.useRealTimers(); }
  });
  it('reports worker errors', async () => {
    const posted = fake((self) => { queueMicrotask(() => self.onmessage?.({ data: { t: 'error', message: 'x' } })); });
    expect(await validateInWorker(() => posted, 'src', {})).toEqual({ ok: false, errors: ['x'], warnings: [] });
    const crashed = fake((self) => { queueMicrotask(() => self.onerror?.({ message: 'script failed' })); });
    expect(await validateInWorker(() => crashed, 'src', {})).toEqual({ ok: false, errors: ['script failed'], warnings: [] });
    expect(posted.terminated + crashed.terminated).toBe(2);
  });
});
