import { h, topNav } from '../dom';
import { createNewConceptPanel } from '../panels/newConcept';
import { formatRoute, type PageFn } from '../router';

export const createPage: PageFn = (root) => {
  root.append(h('div', { class: 'page', testid: 'create' },
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, 'EvoLab'),
      topNav('create')),
    h('main', { class: 'settings' },
      h('h1', null, 'Make your own'),
      h('p', { class: 'page-note' }, 'Describe a game in a sentence and a language model writes it. A generated concept is checked in a sandbox, then trains exactly like a built-in.'),
      createNewConceptPanel((id) => { location.hash = formatRoute({ page: 'concept', envId: id, step: 1 }); }),
      h('p', { class: 'page-note' }, 'Concepts you create or import appear in the ', h('a', { href: '#/' }, 'gallery'), ', next to the built-in ones. They are stored in this browser only.'))));
};
