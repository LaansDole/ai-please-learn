import type { ValidationReport } from './validator';

export interface WorkerLike {
  postMessage(m: unknown): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

/** A fresh instance of the trainer worker, used once as a validate instance. Needs no server: the worker script is a static asset. */
export function spawnValidateWorker(): WorkerLike {
  return new Worker(new URL('../trainer/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

/** Runs the validator inside a worker with a watchdog (spec section 12.5 layer 5). Never rejects; always terminates the worker. */
export function validateInWorker(spawn: () => WorkerLike, source: string, meta: unknown, timeoutMs = 5000): Promise<ValidationReport> {
  return new Promise((resolve) => {
    const worker = spawn();
    let settled = false;
    const finish = (report: ValidationReport) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(report);
    };
    const failed = (error: string) => finish({ ok: false, errors: [error], warnings: [] });
    const timer = setTimeout(() => failed(`validation timed out after ${timeoutMs / 1000} s (possible infinite loop)`), timeoutMs);
    worker.onmessage = (e) => {
      const m = e.data as { t?: string; report?: ValidationReport; message?: string };
      if (m.t === 'validated' && m.report) finish(m.report);
      else if (m.t === 'error') failed(m.message ?? 'validation failed');
    };
    worker.onerror = (e) => failed((e as { message?: string } | null)?.message || 'the validation worker failed to start');
    worker.postMessage({ t: 'validate', source, meta });
  });
}
