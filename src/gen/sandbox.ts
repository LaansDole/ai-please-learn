import type { GeneratedSdk } from './sdk';

export const LOCKED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'WebTransport'];
// 'eval' cannot be shadowed (illegal parameter name in strict code); the static scan covers it.
export const SHADOWED = [...LOCKED, 'self', 'globalThis', 'postMessage', 'setTimeout', 'setInterval', 'Date', 'performance', 'navigator', 'location', 'close', 'Function'];

/** Layer 2 of spec section 12.5: replaces network and storage globals of a worker with throwing stubs. Does not depend on any CSP header. */
export function lockdown(scope: Record<string, unknown>): void {
  for (const name of LOCKED) {
    const stub = function () { throw new Error(`EvoLab sandbox: ${name} is not available`); };
    try { Object.defineProperty(scope, name, { value: stub, writable: false, configurable: false }); }
    catch { try { scope[name] = stub; } catch { /* non-configurable on this platform: the scan and shadowing still apply */ } }
  }
}

/** Layer 3: evaluates the module with every ambient capability shadowed by an undefined parameter. Throws on syntax errors. */
export function compileGenerated(source: string): (sdk: GeneratedSdk) => unknown {
  const body = `"use strict";\n${source}\n;return typeof createEnv === "function" ? createEnv : undefined;`;
  const factory = new Function(...SHADOWED, body) as (...args: undefined[]) => unknown;
  const createEnv = factory(...SHADOWED.map(() => undefined));
  if (typeof createEnv !== 'function') throw new Error('createEnv is not defined as a function');
  return createEnv as (sdk: GeneratedSdk) => unknown;
}
