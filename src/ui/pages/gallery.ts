import { listEnvs } from '../../env/registry';
import { library, toConceptFile, type StoredConcept } from '../../gen/library';
import { h } from '../dom';
import { createNewConceptPanel } from '../panels/newConcept';
import { showSource } from '../panels/sourceModal';
import { formatRoute, type PageFn } from '../router';
import { drawInitials, drawThumbnail } from '../thumbnail';

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** Buttons sit outside the link so they can be reached and pressed on their own. */
function generatedCard(c: StoredConcept, onDeleted: () => void): HTMLElement {
  const canvas = h('canvas', { width: 640, height: 400, class: 'card-thumb', 'aria-hidden': 'true' });
  drawInitials(canvas, c.name);
  const learners = c.meta.action.type === 'continuous' ? ['NEAT', 'PPO'] : ['NEAT', 'DQN', 'PPO'];
  return h('div', { class: 'card', testid: `card-${c.id}` },
    h('a', { class: 'card-link', href: `#/c/${c.id}` },
      canvas,
      h('div', { class: 'card-body' },
        h('h2', null, c.name),
        h('p', null, c.meta.tagline),
        h('div', { class: 'badges' },
          h('span', { class: 'badge badge-gen', testid: 'badge-generated' }, 'generated'),
          h('span', { class: 'badge badge-dim' }, '2D'),
          ...learners.map((l) => h('span', { class: 'badge' }, l))))),
    h('div', { class: 'card-actions' },
      h('button', { type: 'button', testid: `card-source-${c.id}`, onclick: () => showSource(c) }, 'View source'),
      h('button', { type: 'button', testid: `card-export-${c.id}`, onclick: () => download(`${c.id}.evolab-concept.json`, toConceptFile(c)) }, 'Export'),
      h('button', { type: 'button', class: 'btn-danger', testid: `card-delete-${c.id}`, onclick: () => {
        if (confirm(`Delete "${c.name}"?`)) void library.remove(c.id).then(onDeleted);
      } }, 'Delete')));
}

export const galleryPage: PageFn = (root) => {
  let gone = false;
  const cards = listEnvs().filter((d) => !d.meta.hidden).map((def) => {
    const canvas = h('canvas', { width: 640, height: 400, class: 'card-thumb', 'aria-hidden': 'true' });
    drawThumbnail(canvas, def);
    return h('a', { class: 'card', href: `#/c/${def.meta.id}`, testid: `card-${def.meta.id}` },
      canvas,
      h('div', { class: 'card-body' },
        h('h2', null, def.meta.name),
        h('p', null, def.meta.tagline),
        h('div', { class: 'badges' },
          h('span', { class: 'badge badge-dim' }, def.meta.dims.toUpperCase()),
          ...def.meta.learners.map((l) => h('span', { class: 'badge' }, l.toUpperCase())))));
  });
  const grid = h('div', { class: 'card-grid' }, ...cards);
  const libraryError = h('p', { class: 'errors-line', role: 'alert' });
  const ownEmpty = h('p', { class: 'own-empty' }, 'Concepts you create or import appear here, next to the built-in ones. They are stored in this browser only.');
  const ownGrid = h('div', { class: 'card-grid own-grid' },
    createNewConceptPanel((id) => { location.hash = formatRoute({ page: 'concept', envId: id, step: 1 }); }), ownEmpty);
  let generated: HTMLElement[] = [];
  const refresh = () => library.list().then((list) => {
    if (gone) return;
    for (const el of generated) el.remove();
    generated = list.map((c) => generatedCard(c, refresh));
    ownEmpty.hidden = generated.length > 0;
    ownGrid.append(...generated);
  }, () => { ownEmpty.hidden = true; libraryError.textContent = 'Generated concepts are unavailable: this browser blocks IndexedDB.'; });
  void refresh();

  const steps: [string, string][] = [['Play', 'Try the game yourself.'], ['Rewards', 'Decide what counts as good.'], ['Network', 'Choose how it learns.'], ['Learn', 'Watch it get there.']];
  root.append(h('div', { class: 'page', testid: 'gallery' },
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, 'EvoLab'),
      h('a', { class: 'btn topbar-end', href: '#/settings', testid: 'nav-settings' }, 'Settings')),
    h('main', { class: 'gallery' },
      h('section', { class: 'hero' },
        h('div', { class: 'hero-text' },
          h('h1', null, 'Watch a neural network learn to play.'),
          h('p', { class: 'lede' }, 'EvoLab trains small neural networks live in your browser. Pick a game below and see them go from flailing to competent, one generation at a time.')),
        h('ol', { class: 'hero-steps', 'aria-label': 'Every concept has four steps' },
          ...steps.map(([name, what]) => h('li', null, h('b', null, name), h('span', null, what))))),
      h('section', { class: 'gallery-section' },
        h('h2', { class: 'section-title' }, 'Pick a concept'),
        grid),
      h('section', { class: 'gallery-section' },
        h('h2', { class: 'section-title' }, 'Make your own'),
        h('p', { class: 'section-note' }, 'Describe a game in a sentence and a language model writes it. A generated concept is checked in a sandbox, then trains exactly like a built-in.'),
        libraryError, ownGrid))));
  return () => { gone = true; };
};
