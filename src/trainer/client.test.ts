import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient } from './client';

class FakeWorker {
  static last: FakeWorker;
  posted: unknown[] = []; terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null; onerror: unknown = null;
  constructor() { FakeWorker.last = this; }
  postMessage(m: unknown) { this.posted.push(m); }
  terminate() { this.terminated = true; }
}

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('WorkerClient', () => {
  it('A8: init that gets no answer within 10 s terminates the worker and rejects', async () => {
    const c = new WorkerClient();
    const failed = c.init({ kind: 'builtin', id: 'reach1d' }).then(() => 'ready', (e: Error) => e.message);
    vi.advanceTimersByTime(9999);
    expect(FakeWorker.last.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(await failed).toMatch(/did not start/);
    expect(FakeWorker.last.terminated).toBe(true);
    expect(c.alive).toBe(false);
  });
  it('A8: an answered init is not timed out later', async () => {
    const c = new WorkerClient();
    const p = c.init({ kind: 'builtin', id: 'reach1d' });
    FakeWorker.last.onmessage!({ data: { t: 'ready', spec: { ok: 1 } } });
    expect(await p).toEqual({ ok: 1 });
    vi.advanceTimersByTime(20000);
    expect(FakeWorker.last.terminated).toBe(false);
    c.terminate();
  });
  it('D5: send on a dead worker reports an error instead of dropping the message silently', () => {
    const c = new WorkerClient(), errors: string[] = [];
    c.on('error', (m) => errors.push(m.message));
    c.terminate();
    c.send({ t: 'train/stop' });
    expect(errors.length).toBe(1);
  });
});
