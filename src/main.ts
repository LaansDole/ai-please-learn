import './ui/tokens.css';
import './ui/app.css';
import { registerBuiltins } from './envs/index';
import { h } from './ui/dom';
import { galleryPage } from './ui/pages/gallery';
import { startRouter, type PageFn } from './ui/router';

const placeholder = (title: string): PageFn => (root) => { root.append(h('main', { class: 'page' }, h('h1', null, title), h('a', { href: '#/' }, 'Back to the gallery'))); };

registerBuiltins();
startRouter(document.getElementById('app')!, { gallery: galleryPage, concept: placeholder('Concept'), settings: placeholder('Settings') });
