export type Step = 1 | 2 | 3 | 4;
export type Route = { page: 'gallery' } | { page: 'concept'; envId: string; step: Step } | { page: 'settings' };
/** Returns an unmount function. A concept page may attach `onStep` to it: step-only changes then call it instead of remounting. */
export type PageFn = (root: HTMLElement, route: Route) => (() => void) | void;
type Unmount = (() => void) & { onStep?(step: Step): void };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'settings' && parts.length === 1) return { page: 'settings' };
  if (parts[0] === 'c' && parts[1] && /^[a-z][a-z0-9-]*$/.test(parts[1])) {
    const n = Number(parts[2] ?? 1);
    return { page: 'concept', envId: parts[1], step: n === 2 || n === 3 || n === 4 ? n : 1 };
  }
  return { page: 'gallery' };
}

export function formatRoute(r: Route): string {
  return r.page === 'concept' ? `#/c/${r.envId}/${r.step}` : r.page === 'settings' ? '#/settings' : '#/';
}

export function startRouter(root: HTMLElement, pages: { gallery: PageFn; concept: PageFn; settings: PageFn }): void {
  let current: Route | null = null, unmount: Unmount | void;
  const render = () => {
    const next = parseRoute(location.hash);
    if (current?.page === 'concept' && next.page === 'concept' && current.envId === next.envId && unmount?.onStep) {
      current = next; unmount.onStep(next.step); return;
    }
    unmount?.();
    root.replaceChildren();
    current = next;
    unmount = pages[next.page](root, next);
    window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', render);
  render();
}
