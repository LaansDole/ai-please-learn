import { listEnvs } from '../../env/registry';
import { library, toConceptFile, type StoredConcept } from '../../gen/library';
import { h, topNav } from '../dom';
import { showSource } from '../panels/sourceModal';
import { formatRoute, type PageFn } from '../router';
import { drawInitials, drawThumbnail } from '../thumbnail';

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** The last line of a plate's caption: the methods it can learn with, then its tags. */
function cardMeta(dims: string, learners: readonly string[], generated = false): HTMLElement {
  return h('div', { class: 'card-meta' },
    h('span', { class: 'muted' }, learners.join(', ')),
    h('span', null,
      generated && h('span', { class: 'badge badge-gen', testid: 'badge-generated' }, 'generated'), generated && ' ',
      h('span', { class: 'badge badge-dim' }, dims)));
}

/** Buttons sit outside the link so they can be reached and pressed on their own. */
function generatedCard(c: StoredConcept, onDeleted: () => void): HTMLElement {
  const canvas = h('canvas', { width: 640, height: 400, class: 'card-thumb', 'aria-hidden': 'true' });
  drawInitials(canvas, c.name);
  return h('div', { class: 'card', testid: `card-${c.id}` },
    h('a', { class: 'card-link', href: formatRoute({ page: 'gallery' }) + c.id },
      canvas,
      h('div', { class: 'card-body' },
        h('h2', null, c.name),
        h('p', null, c.meta.tagline),
        cardMeta('2D', c.meta.action.type === 'continuous' ? ['NEAT', 'PPO'] : ['NEAT', 'DQN', 'PPO'], true))),
    h('div', { class: 'card-actions' },
      h('button', { type: 'button', testid: `card-source-${c.id}`, onclick: () => showSource(c) }, 'View source'),
      h('button', { type: 'button', testid: `card-export-${c.id}`, onclick: () => download(`${c.id}.evolab-concept.json`, toConceptFile(c)) }, 'Export'),
      h('button', { type: 'button', class: 'btn-danger', testid: `card-delete-${c.id}`, onclick: () => {
        if (confirm(`Delete "${c.name}"?`)) void library.remove(c.id).then(onDeleted);
      } }, 'Delete')));
}

/** The way to the Create page, shaped like the concepts it sits beside. */
function createCard(): HTMLElement {
  const thumb = h('div', { class: 'card-thumb card-create-thumb', 'aria-hidden': 'true' });
  thumb.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  return h('a', { class: 'card card-create', href: formatRoute({ page: 'create' }), testid: 'card-create' },
    thumb,
    h('div', { class: 'card-body' },
      h('h2', null, 'Make your own'),
      h('p', null, 'Describe a game in a sentence and a language model writes it, or import a concept file.')));
}

/** The recorded demo is a static file beside the app (`RESERVED_IDS` has "demo"), so the router leaves this link to the browser. */
function demoLink(): HTMLElement {
  const a = h('a', { class: 'demo-link', href: `${import.meta.env.BASE_URL}demo/`, testid: 'gallery-demo' });
  a.innerHTML = '<svg viewBox="5 4 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  a.append('Watch the 5-minute demo');
  return a;
}

const STEPS: [string, string][] = [
  ['Play', 'Take the controls yourself and see what the game asks for.'],
  ['Rewards', 'Decide what counts as good, and how much.'],
  ['Network', 'See what it senses and choose how it learns.'],
  ['Learn', 'Watch generations improve, live.'],
];

export const galleryPage: PageFn = (root) => {
  let gone = false;
  const cards = listEnvs().filter((d) => !d.meta.hidden).map((def) => {
    const canvas = h('canvas', { width: 640, height: 400, class: 'card-thumb', 'aria-hidden': 'true' });
    drawThumbnail(canvas, def);
    return h('a', { class: 'card', href: formatRoute({ page: 'gallery' }) + def.meta.id, testid: `card-${def.meta.id}` },
      canvas,
      h('div', { class: 'card-body' },
        h('h2', null, def.meta.name),
        h('p', null, def.meta.tagline),
        cardMeta(def.meta.dims.toUpperCase(), def.meta.learners.map((l) => l.toUpperCase()))));
  });
  const libraryError = h('p', { class: 'errors-line', role: 'alert' });
  const ownGrid = h('div', { class: 'card-grid' }, createCard());
  let generated: HTMLElement[] = [];
  const refresh = () => library.list().then((list) => {
    if (gone) return;
    for (const el of generated) el.remove();
    generated = list.map((c) => generatedCard(c, refresh));
    ownGrid.append(...generated);
  }, () => { libraryError.textContent = 'Generated concepts are unavailable. This browser blocks IndexedDB.'; });
  void refresh();

  root.append(h('div', { class: 'page', testid: 'gallery' },
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: formatRoute({ page: 'gallery' }) }, 'EvoLab'),
      h('span', { class: 'brand-tag' }, 'ai, please learn'),
      topNav('gallery')),
    h('main', { class: 'gallery' },
      h('div', { class: 'gal' },
        h('section', { class: 'intro' },
          h('h1', null, 'Watch a neural network learn to play.'),
          h('p', { class: 'lede' }, 'EvoLab trains small neural networks live in your browser. Pick a game and see them go from flailing to competent, one generation at a time.'),
          h('h2', null, 'How a session goes'),
          h('ol', { class: 'hero-steps' }, ...STEPS.map(([name, what]) => h('li', null, h('b', null, name), h('span', null, what)))),
          h('div', { class: 'cta' },
            h('a', { class: 'btn btn-primary', href: formatRoute({ page: 'concept', envId: 'snake', step: 1 }), testid: 'gallery-start' }, 'Start with Snake'),
            demoLink())),
        h('section', { class: 'card-grid', 'aria-label': 'Concepts' }, ...cards)),
      h('section', { class: 'own' },
        h('div', { class: 'own-head' },
          h('h2', null, 'Your concepts'),
          h('p', null, 'Concepts you create or import appear here. They are stored in this browser only.')),
        libraryError, ownGrid))));
  return () => { gone = true; };
};
