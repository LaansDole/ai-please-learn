import { RESERVED_IDS } from '../env/registry';

export type Step = 1 | 2 | 3 | 4;
export type Route = { page: 'gallery' } | { page: 'concept'; envId: string; step: Step } | { page: 'settings' } | { page: 'create' } | { page: 'notfound' };
/** Returns an unmount function. A concept page may attach `onStep` to it: step-only changes then call it instead of remounting. */
export type PageFn = (root: HTMLElement, route: Route) => (() => void) | void;
type Unmount = (() => void) & { onStep?(step: Step): void };

/** Where the app is hosted, with a trailing slash: "/" in dev, "/ai-please-learn/" on GitHub Pages. */
const BASE = import.meta.env.BASE_URL;

/** `pathname` is a full URL path. Concepts sit at the top level, so `RESERVED_IDS` can never be concept ids. */
export function parseRoute(pathname: string, base = BASE): Route {
  if (`${pathname}/` === base) return { page: 'gallery' };
  if (!pathname.startsWith(base)) return { page: 'notfound' };
  const parts = pathname.slice(base.length).split('/').filter(Boolean), [id, step] = parts;
  if (!id || ((id === 'index.html' || id === 'index') && parts.length === 1)) return { page: 'gallery' };
  if ((id === 'settings' || id === 'create') && parts.length === 1) return { page: id };
  if (parts.length <= 2 && /^[a-z][a-z0-9-]*$/.test(id) && !RESERVED_IDS.has(id)) {
    const n = Number(step ?? 1);
    return { page: 'concept', envId: id, step: n === 2 || n === 3 || n === 4 ? n : 1 };
  }
  return { page: 'notfound' };
}

/** The URL path of a route; `notfound` has none of its own and formats as the gallery. */
export function formatRoute(r: Route, base = BASE): string {
  return r.page === 'concept' ? `${base}${r.envId}/${r.step}` : r.page === 'settings' || r.page === 'create' ? `${base}${r.page}` : base;
}

/** Links shared before the History API router: "#/c/pong/3", "#/settings", "#/". Returns the clean path, or null for any other hash. */
export function legacyHashPath(hash: string, base = BASE): string | null {
  return hash.startsWith('#/') ? base + hash.slice(2).replace(/^c\//, '') : null;
}

const saveScroll = () => history.replaceState({ ...(history.state as object | null), scrollY: window.scrollY }, '');

/** In-app navigation that adds a history entry. The entry left behind remembers its scroll position for back/forward. */
export function navigate(path: string): void {
  if (path !== location.pathname) {
    saveScroll();
    history.pushState(null, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function startRouter(root: HTMLElement, pages: Record<Route['page'], PageFn>): void {
  let current: Route | null = null, unmount: Unmount | void, raf = 0, saving = 0;
  history.scrollRestoration = 'manual';                // the page is rebuilt on every route: render() restores the position itself
  const render = (e?: Event) => {
    const legacy = legacyHashPath(location.hash);
    if (legacy !== null) history.replaceState(null, '', legacy);
    const next = parseRoute(location.pathname);
    // The page that is already open stays as it is: a click on its own tab or a hash-only change must not wipe a form or orphan a run.
    if (current && current.page === next.page && formatRoute(current) === formatRoute(next)) return;
    if (current?.page === 'concept' && next.page === 'concept' && current.envId === next.envId && unmount?.onStep) {
      current = next; unmount.onStep(next.step); return;
    }
    unmount?.();
    root.replaceChildren();
    current = next;
    unmount = pages[next.page](root, next);
    // Back and forward (a real popstate) return to where the reader was; a link opens its page at the top.
    // Cards and concept pages can arrive after this frame (IndexedDB): until the page is tall enough the position clamps,
    // so it is set again each frame, for at most 600 ms.
    const y = e?.isTrusted ? (history.state as { scrollY?: number } | null)?.scrollY ?? 0 : 0, t0 = performance.now();
    cancelAnimationFrame(raf);
    const restore = () => {
      window.scrollTo(0, y);
      raf = window.scrollY < y - 1 && performance.now() - t0 < 600 ? requestAnimationFrame(restore) : 0;
    };
    restore();
  };
  window.addEventListener('popstate', render);       // back/forward, navigate(), and a hash typed into the address bar
  // navigate() saves the position of the page it leaves; Back leaves a page without it, so Forward needs it saved while scrolling.
  // Not while a restore is pending: the position is still clamped then, and saving it would overwrite the one being restored.
  window.addEventListener('scroll', () => { clearTimeout(saving); saving = window.setTimeout(() => { if (!raf) saveScroll(); }, 150); }, { passive: true });
  // Plain left-clicks on links to a page of the app navigate without a page load. New tabs, downloads, other sites, in-page
  // anchors and files that sit next to the app (assets, the demo) stay with the browser.
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a') : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target || a.hasAttribute('download') || a.origin !== location.origin || a.hash || parseRoute(a.pathname).page === 'notfound') return;
    e.preventDefault();
    navigate(a.pathname);
  });
  render();
}
