import { h, topNav } from '../dom';
import { createNewConceptPanel } from '../panels/newConcept';
import { formatRoute, navigate, type PageFn } from '../router';

export const createPage: PageFn = (root) => {
  const leaving = new AbortController();
  root.append(h('div', { class: 'page', testid: 'create' },
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: formatRoute({ page: 'gallery' }) }, 'EvoLab'),
      topNav('create')),
    h('main', { class: 'settings' },
      h('h1', null, 'Make your own'),
      h('p', { class: 'page-note' }, 'Describe a game in a sentence and a language model writes it. A generated concept is checked in a sandbox, then trains exactly like a built-in.'),
      createNewConceptPanel((id) => navigate(formatRoute({ page: 'concept', envId: id, step: 1 })), leaving.signal),
      h('p', { class: 'page-note' }, 'Concepts you create or import appear in the ', h('a', { href: formatRoute({ page: 'gallery' }) }, 'gallery'), ', next to the built-in ones. They are stored in this browser only.'))));
  return () => leaving.abort();                    // a generation still waiting for the model stops with the page
};
