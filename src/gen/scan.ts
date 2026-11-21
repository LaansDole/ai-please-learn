export const FORBIDDEN = ['import', 'require', 'export', 'eval', 'Function', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'importScripts', 'setTimeout', 'setInterval', 'postMessage', 'self', 'globalThis', 'window', 'document', 'navigator', 'localStorage',
  'indexedDB', 'caches', 'Worker', 'Date', 'performance', 'constructor', '__proto__', 'prototype'];

/** Replaces comments and '...' / "..." string contents with spaces. Backticks are left in place (and rejected by scanSource). */
export function stripCommentsAndStrings(src: string): string {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i]!, d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; out += ' '; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i++; out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Layer 1 of spec section 12.5. One error per distinct hit; empty when the source may be compiled. */
export function scanSource(src: string): string[] {
  const errors: string[] = [];
  if (src.length > 40000) errors.push(`source is too long (${src.length} > 40000 characters)`);
  const code = stripCommentsAndStrings(src);
  if (code.includes('`')) errors.push('template literals (backticks) are not allowed; use string concatenation');
  if (/\bMath\s*\.\s*random\b/.test(code)) errors.push('Math.random is not allowed; use sdk.rng(seed)');
  for (const name of FORBIDDEN) {
    const re = new RegExp(`(^|[^A-Za-z0-9_$])${name.replace(/[$_]/g, '\\$&')}(?![A-Za-z0-9_$])`);
    if (re.test(code)) errors.push(`"${name}" is not available in EvoLab environments; remove it`);
  }
  return errors;
}
