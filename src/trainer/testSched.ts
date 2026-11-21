import type { Scheduler } from './runner';

/** Test helper. Virtual clock: every now() call costs `cost` ms; defer() queues; drain() runs queued callbacks. */
export function fakeSched(cost = 0.01) {
  let t = 0; const q: { fn: () => void; at: number }[] = [];
  const sched: Scheduler = { now: () => (t += cost), defer: (fn, ms) => q.push({ fn, at: t + ms }) };
  return { sched, drain(n: number) { for (let i = 0; i < n && q.length; i++) { const j = q.shift()!; if (j.at > t) t = j.at; j.fn(); } }, time: () => t };
}
