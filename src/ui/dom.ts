import { formatRoute } from './router';

const HOME = formatRoute({ page: 'gallery' });

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

/** Top-bar link to the source repository; opens in a new tab. */
function repoLink(): HTMLAnchorElement {
  const a = h('a', {
    class: 'repo-link', href: 'https://github.com/LaansDole/ai-please-learn', target: '_blank', rel: 'noopener noreferrer',
    'aria-label': 'EvoLab on GitHub', testid: 'nav-repo',
  });
  a.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg><span>GitHub</span>';
  return a;
}

/** The tabs that end every top bar; the page that is open carries `aria-current`. */
export function topNav(active?: 'gallery' | 'create' | 'math' | 'settings'): HTMLElement {
  const tab = (id: string, href: string, label: string) =>
    h('a', { class: id === 'gallery' && 'nav-home', href, testid: `nav-${id}`, 'aria-current': active === id && 'page' }, label);
  return h('nav', { class: 'topnav', 'aria-label': 'Main' },
    tab('gallery', HOME, 'Gallery'), tab('create', formatRoute({ page: 'create' }), 'Create'),
    // The recorded demo is a static page beside the app (`RESERVED_IDS` has "demo"): the router leaves this link to the browser,
    // and that page carries the same bar with Demo marked as open.
    tab('demo', `${HOME}demo/`, 'Demo'), tab('math', formatRoute({ page: 'math' }), 'Math'),
    tab('settings', formatRoute({ page: 'settings' }), 'Settings'), repoLink());
}

/** A whole page that says something is missing and links home. */
export function notFound(root: HTMLElement, title: string, text: string): void {
  root.append(h('div', { class: 'page', testid: 'not-found' },
    h('header', { class: 'topbar' }, h('a', { class: 'brand', href: HOME }, 'EvoLab'), topNav()),
    h('main', { class: 'gallery' },
      h('div', { class: 'empty-state' },
        h('h1', null, title),
        h('p', null, text),
        h('p', null, h('a', { class: 'btn btn-primary', href: HOME }, 'Back to the gallery'))))));
}

/** Any address that is no page of the app. An unknown generated concept (`gen-*`) has its own wording in the concept page. */
export function pageNotFound(root: HTMLElement): void {
  notFound(root, 'Page not found', 'The address may be mistyped, or the page has moved.');
}

/** Compact number for readouts: 1 decimal below 100, none above, "4.1k" above 1000. */
export function fmt(v: number): string {
  const a = Math.abs(v);
  if (!Number.isFinite(v)) return '-';
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return a >= 100 ? v.toFixed(0) : v.toFixed(a >= 10 || Number.isInteger(v) ? 1 : 2);
}
