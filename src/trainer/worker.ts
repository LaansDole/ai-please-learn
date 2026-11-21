import { createHost } from './host';
import type { FromWorker, ToWorker } from './protocol';

const scope = self as unknown as {
  postMessage(m: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};
const channel = new MessageChannel();
const immediate: (() => void)[] = [];
channel.port1.onmessage = () => { immediate.shift()?.(); };
const host = createHost(
  (m, transfer) => scope.postMessage(m, transfer ?? []),
  { now: () => performance.now(), defer: (fn, ms) => { if (ms <= 0) { immediate.push(fn); channel.port2.postMessage(0); } else setTimeout(fn, ms); } },
);
scope.onmessage = (e) => { void host(e.data); };
