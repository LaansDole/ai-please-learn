import { listEnvs } from '../../env/registry';
import { h } from '../dom';
import type { PageFn } from '../router';
import { drawThumbnail } from '../thumbnail';

export const galleryPage: PageFn = (root) => {
  const defs = listEnvs().filter((d) => !d.meta.hidden);
  const cards = defs.map((def) => {
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
  root.append(h('div', { class: 'page', testid: 'gallery' },
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, 'EvoLab'),
      h('span', { class: 'topbar-note' }, 'Watch neural networks learn to play, one generation at a time.'),
      h('a', { class: 'btn', href: '#/settings', testid: 'nav-settings' }, 'Settings')),
    h('main', { class: 'gallery' },
      h('h1', null, 'Concepts'),
      cards.length ? h('div', { class: 'card-grid' }, ...cards) : h('p', { class: 'empty' }, 'No concepts yet'))));
};
