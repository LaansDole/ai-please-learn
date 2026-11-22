import { listModels } from '../../gen/llm';
import { PRESETS, isLocalUrl, loadSettings, resolveMode, saveSettings, validateSettings, type LlmSettings } from '../../gen/settings';
import { h, repoLink } from '../dom';
import type { PageFn } from '../router';

export const settingsPage: PageFn = (root) => {
  const s = loadSettings();
  let gone = false;
  const baseUrl = h('input', { type: 'url', id: 'set-url', testid: 'settings-base-url', value: s.baseUrl, spellcheck: 'false', autocomplete: 'off' });
  const model = h('input', { type: 'text', id: 'set-model', testid: 'settings-model', value: s.model, spellcheck: 'false', autocomplete: 'off' });
  const apiKey = h('input', { type: 'password', id: 'set-key', testid: 'settings-api-key', value: s.apiKey, autocomplete: 'off' });
  const mode = h('select', { id: 'set-mode', testid: 'settings-mode' },
    h('option', { value: 'auto' }, 'Automatic'), h('option', { value: 'proxy' }, 'Proxy (dev / preview server)'), h('option', { value: 'direct' }, 'Direct (browser calls the endpoint)'));
  mode.value = s.mode;
  const active = h('p', { class: 'field-help', testid: 'settings-mode-active' });
  const origin = location.origin;
  const directHelp = h('div', { class: 'note', testid: 'settings-direct-help', hidden: true },
    h('p', null, 'In direct mode this page calls the endpoint itself, so the local server must allow requests from ', h('code', null, origin), '.'),
    h('ul', null,
      h('li', null, 'Ollama: start it with ', h('code', null, `OLLAMA_ORIGINS=${origin} ollama serve`)),
      h('li', null, 'LM Studio: Developer > Local Server > enable CORS')),
    h('p', null, 'If the call is still blocked, use "Paste a response" in the gallery: copy the prompt into any chat model and paste its answer back.'));
  const proxyNote = h('p', { class: 'field-help', testid: 'settings-direct-csp', hidden: true },
    'This server offers the proxy, and its security policy blocks direct calls from the page. Use Automatic or Proxy here.');
  const warning = h('div', { class: 'note note-warn', testid: 'settings-remote-warning', role: 'status', hidden: true },
    h('span', { class: 'warn-mark', 'aria-hidden': 'true' }, '!'), 'This sends your concept text to a remote server.');
  const error = h('p', { class: 'errors-line', testid: 'settings-error', role: 'alert' });
  const result = h('p', { class: 'field-help', testid: 'settings-test-result', role: 'status' });

  const current = (): LlmSettings | null => validateSettings({ baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value, mode: mode.value });
  const sync = () => {
    warning.hidden = isLocalUrl(baseUrl.value.trim());
    const now = current();
    if (!now) return;
    void Promise.all([resolveMode(now), resolveMode({ ...now, mode: 'auto' })]).then(([m, auto]) => {
      if (gone) return;
      active.textContent = now.mode === 'auto' ? `Active: ${m} (detected: this page ${m === 'proxy' ? 'is served with' : 'has no'} LLM proxy).` : `Active: ${m}.`;
      directHelp.hidden = m !== 'direct';
      proxyNote.hidden = !(m === 'direct' && auto === 'proxy');
    });
  };
  const save = () => {
    const now = current();
    error.textContent = now ? '' : 'Not saved: the base URL must start with http:// or https:// and the model must not be empty.';
    if (now) saveSettings(now);
    sync();
  };
  for (const el of [baseUrl, model, apiKey, mode]) el.addEventListener('change', save);
  baseUrl.addEventListener('input', () => { warning.hidden = isLocalUrl(baseUrl.value.trim()); });
  const preset = (name: keyof typeof PRESETS, label: string) => h('button', { type: 'button', testid: `settings-preset-${name}`, onclick: () => { baseUrl.value = PRESETS[name]; save(); } }, label);
  const field = (label: string, input: HTMLElement, ...extra: (Node | string)[]) =>
    h('div', { class: 'form-field' }, h('label', { for: input.id }, label), input, ...extra);
  const testButton = h('button', { type: 'button', class: 'btn-primary', testid: 'settings-test' }, 'Test connection');
  testButton.addEventListener('click', async () => {
    const now = current();
    if (!now) { save(); return; }
    testButton.disabled = true; result.textContent = 'Connecting...';
    try {
      const models = await listModels(now, fetch, await resolveMode(now));
      result.textContent = `Connected: ${models.length} model${models.length === 1 ? '' : 's'}.`
        + (models.includes(now.model) ? '' : ` Warning: model ${now.model} not found on this server.`);
    } catch (e) { result.textContent = `Failed: ${e instanceof Error ? e.message : String(e)}`; }
    testButton.disabled = false;
  });

  root.append(h('div', { class: 'page', testid: 'settings' },
    h('header', { class: 'topbar' },
      h('div', { class: 'crumb' }, h('a', { class: 'brand', href: '#/' }, 'EvoLab'), h('span', { class: 'sep' }, '/'), h('span', { class: 'here' }, 'Settings')),
      h('a', { class: 'btn topbar-end', href: '#/' }, 'Back to the gallery'),
      repoLink()),
    h('main', { class: 'settings' },
      h('h1', null, 'Settings'),
      h('section', { class: 'panel form' },
        h('h3', null, 'Concept generator (LLM)'),
        h('p', { class: 'muted' }, 'EvoLab turns a sentence into a playable environment by asking an OpenAI-compatible model. ',
          'The concept text is sent only to the endpoint below and nowhere else.'),
        field('Base URL', baseUrl, h('div', { class: 'preset-row' }, h('span', { class: 'muted' }, 'Presets'), preset('ollama', 'Ollama'), preset('lmstudio', 'LM Studio'))),
        warning,
        field('Model', model),
        field('API key', apiKey, h('p', { class: 'field-help' }, "Stored only in this browser's localStorage. Leave empty for local servers.")),
        field('Connection mode', mode, active, proxyNote),
        directHelp,
        error,
        h('div', { class: 'test-row' }, testButton, result)))));
  sync();
  return () => { gone = true; };
};
