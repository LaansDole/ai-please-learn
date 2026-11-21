import type { EnvSpecMsg } from '../env/types';
import type { EnvRef, FromWorker, ToWorker } from './protocol';

const WATCHDOG_MS = 15000, INIT_MS = 10000;

/** Main-thread handle on one worker instance (train, stage or validate). */
export class WorkerClient {
  private worker: Worker | null;
  private listeners = new Map<string, Set<(m: FromWorker) => void>>();
  private state: 'idle' | 'running' | 'paused' = 'idle';
  private lastMessage = 0;
  private watchdog: ReturnType<typeof setInterval>;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      this.lastMessage = performance.now();
      if (e.data.t === 'status') this.state = e.data.state;
      this.dispatch(e.data);
    };
    this.worker.onerror = (e) => this.dispatch({ t: 'error', message: e.message || 'worker failed' });
    // Spec 3.3: a running worker that stays silent for 15 s is stuck (runaway generated code).
    this.watchdog = setInterval(() => {
      if (this.state !== 'running' || performance.now() - this.lastMessage < WATCHDOG_MS) return;
      this.terminate();
      this.dispatch({ t: 'error', message: 'worker stopped responding' });
    }, 1000);
  }

  private dispatch(m: FromWorker): void {
    for (const fn of [...(this.listeners.get(m.t) ?? [])]) fn(m);
  }

  /** False once the worker was terminated (by the watchdog, an init timeout or the owner). */
  get alive(): boolean { return this.worker !== null; }

  send(msg: ToWorker, transfer: Transferable[] = []): void {
    if (this.worker) this.worker.postMessage(msg, transfer);
    else this.dispatch({ t: 'error', message: 'The worker is no longer running. Start again to restart it.' });
  }

  /** Returns the unsubscribe function. */
  on<T extends FromWorker['t']>(t: T, fn: (m: Extract<FromWorker, { t: T }>) => void): () => void {
    const set = this.listeners.get(t) ?? new Set();
    this.listeners.set(t, set);
    const wrapped = fn as (m: FromWorker) => void;
    set.add(wrapped);
    return () => { set.delete(wrapped); };
  }

  init(env: EnvRef): Promise<EnvSpecMsg> {
    return new Promise((resolve, reject) => {
      const offReady = this.on('ready', (m) => { off(); resolve(m.spec); });
      const offError = this.on('error', (m) => { off(); reject(new Error(m.message)); });
      // The watchdog only covers a running trainer; a module that loops while it loads would otherwise hang the page forever.
      const timer = setTimeout(() => { off(); this.terminate(); reject(new Error('The concept did not start within 10 seconds.')); }, INIT_MS);
      const off = () => { clearTimeout(timer); offReady(); offError(); };
      this.send({ t: 'init', env });
    });
  }

  terminate(): void {
    clearInterval(this.watchdog);
    this.worker?.terminate();
    this.worker = null;
    this.state = 'idle';
  }
}
