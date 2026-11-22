import { h, topNav } from '../dom';
import { formatRoute, type PageFn } from '../router';

/**
 * "How the learners work": docs/math.md, typeset when the app is built. The report and KaTeX's stylesheet load with this
 * page only, so the gallery does not pay for them.
 */
export const mathPage: PageFn = (root) => {
  let gone = false;
  const toc = h('ol'), doc = h('article', { class: 'math-doc', testid: 'math-doc' }, h('p', { class: 'muted' }, 'Loading the report...'));
  root.append(h('div', { class: 'page', testid: 'math' },
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: formatRoute({ page: 'gallery' }) }, 'EvoLab'),
      topNav('math')),
    h('main', { class: 'math' },
      h('nav', { class: 'math-toc', 'aria-label': 'Sections', testid: 'math-toc' }, h('h2', null, 'Contents'), toc),
      doc)));
  void Promise.all([import('../../../docs/math.md?html'), import('katex/dist/katex.min.css')]).then(([{ default: html }]) => {
    if (gone) return;
    doc.innerHTML = html;                                   // built from docs/math.md by tools/mathDoc.ts, which escapes its text
    const links = new Map<string, HTMLAnchorElement>();
    for (const h2 of doc.querySelectorAll('h2')) {
      const a = h('a', { href: `#${h2.id}` }, h2.firstChild!.textContent!.trim());
      links.set(h2.id, a);
      toc.append(h('li', null, a));
    }
    // A deep link to a section: the browser looked for the fragment before the report was there.
    if (location.hash && window.scrollY === 0) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    // The section being read is marked in the contents: the last heading above the upper third of the window.
    const mark = () => {
      let current = '';
      for (const id of links.keys()) if (document.getElementById(id)!.getBoundingClientRect().top < window.innerHeight / 3) current = id;
      for (const [id, a] of links) a.toggleAttribute('aria-current', id === current);
    };
    window.addEventListener('scroll', mark, { passive: true });
    unmark = () => window.removeEventListener('scroll', mark);
    mark();
  }, (e: unknown) => { if (!gone) doc.replaceChildren(h('p', { class: 'errors-line', role: 'alert' }, `The report could not be loaded: ${e instanceof Error ? e.message : String(e)}. Reload the page to try again.`)); });
  let unmark = () => {};
  return () => { gone = true; unmark(); };
};
