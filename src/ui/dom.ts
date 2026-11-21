type Child = Node | string | null | undefined | false;

/** props: `class`, `dataset` object, `on<Event>` handlers, `testid` (= data-testid); anything else is set as an attribute (null/false skip it). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, unknown> | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'testid') el.dataset.testid = String(v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Compact number for readouts: 1 decimal below 100, none above, "4.1k" above 1000. */
export function fmt(v: number): string {
  const a = Math.abs(v);
  if (!Number.isFinite(v)) return '-';
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return a >= 100 ? v.toFixed(0) : v.toFixed(a >= 10 || Number.isInteger(v) ? 1 : 2);
}
