import './ui/tokens.css';
import './ui/app.css';
import { registerBuiltins } from './envs/index';
import { conceptPage } from './ui/pages/concept';
import { createPage } from './ui/pages/create';
import { galleryPage } from './ui/pages/gallery';
import { settingsPage } from './ui/pages/settings';
import { startRouter } from './ui/router';

registerBuiltins();
startRouter(document.getElementById('app')!, { gallery: galleryPage, concept: conceptPage, settings: settingsPage, create: createPage });
