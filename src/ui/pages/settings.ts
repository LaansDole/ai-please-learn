import { listModels, pickChatModel } from '../../gen/llm';
import { PROVIDERS, PROVIDER_IDS, isLocalUrl, loadSettings, missingKey, resolveMode, saveSettings, validateSettings, type ConnectionMode, type LlmSettings, type ProviderId } from '../../gen/settings';
import { h, topNav } from '../dom';
import { formatRoute, type PageFn } from '../router';

const KEY_HELP = "Stored only in this browser's localStorage.";

export const settingsPage: PageFn = (root) => {
  const s = loadSettings();
  let gone = false, provider = s.provider;
  const baseUrl = h('input', { type: 'url', id: 'set-url', testid: 'settings-base-url', value: s.baseUrl, spellcheck: 'false', autocomplete: 'off' });
  const modelOptions = h('datalist', { id: 'set-models', testid: 'settings-model-options' });
  const model = h('input', { type: 'text', id: 'set-model', testid: 'settings-model', value: s.model, list: modelOptions.id, spellcheck: 'false', autocomplete: 'off' });
  const apiKey = h('input', { type: 'password', id: 'set-key', testid: 'settings-api-key', value: s.apiKey, autocomplete: 'off' });
  const keyHelp = h('p', { class: 'field-help', testid: 'settings-key-help' });
  const mode = h('select', { id: 'set-mode', testid: 'settings-mode' },
    h('option', { value: 'auto' }, 'Automatic'), h('option', { value: 'proxy' }, 'Proxy (dev / preview server)'), h('option', { value: 'direct' }, 'Direct (browser calls the endpoint)'));
  mode.value = s.mode;
  const active = h('p', { class: 'field-help', testid: 'settings-mode-active' });
  const origin = location.origin;
  const providerHelp = h('p', { class: 'field-help', testid: 'settings-provider-help' });
  const directHelp = h('p', { class: 'field-help', testid: 'settings-direct-help', hidden: true },
    'In direct mode this page calls the endpoint itself. If the call is blocked, use "Paste a response" on the ',
    h('a', { href: formatRoute({ page: 'create' }) }, 'Create'), ' page: copy the prompt into any chat model and paste its answer back.');
  const proxyNote = h('p', { class: 'field-help', testid: 'settings-direct-csp', hidden: true },
    'This server offers the proxy, and its security policy blocks direct calls from the page. Use Automatic or Proxy here.');
  const warning = h('div', { class: 'note note-warn', testid: 'settings-remote-warning', role: 'status', hidden: true },
    h('span', { class: 'warn-mark', 'aria-hidden': 'true' }, '!'), 'This sends your concept text to a remote server.');
  const error = h('p', { class: 'errors-line', testid: 'settings-error', role: 'alert' });
  const result = h('p', { class: 'field-help', testid: 'settings-test-result', role: 'status' });

  /** What the chosen provider needs before a call can work; the CORS step only matters when the page calls it directly. */
  const help = (m: ConnectionMode | null): (Node | string)[] => {
    const direct = m === 'direct';
    if (provider === 'openai') return [
      'OpenAI needs an API key: create one at ',
      h('a', { href: 'https://platform.openai.com/api-keys', target: '_blank', rel: 'noopener noreferrer' }, 'platform.openai.com/api-keys'), ' and paste it below.',
      direct ? ' Calls go straight from this browser to api.openai.com.' : m ? " Calls go through this server's proxy to api.openai.com." : ''];
    if (provider === 'lmstudio') return [
      'In LM Studio open Developer > Local Server and start the server.',
      ...(direct ? [' Turn on "Enable CORS" there so that ', h('code', null, origin), ' may call it.'] : []),
      ' Leave the model empty to use the first one it lists.'];
    return direct
      ? ['Start Ollama so that it accepts this site: ', h('code', null, `OLLAMA_ORIGINS=${origin} ollama serve`)]
      : ['Start Ollama with ', h('code', null, 'ollama serve'), '.'];
  };

  const current = (): LlmSettings | null => validateSettings({ provider, baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value, mode: mode.value });
  const buttons = Object.fromEntries(PROVIDER_IDS.map((id) => [id, h('button', { type: 'button', testid: `settings-provider-${id}`, onclick: () => choose(id) }, PROVIDERS[id].label)])) as Record<ProviderId, HTMLButtonElement>;
  const sync = () => {
    for (const id of PROVIDER_IDS) buttons[id].setAttribute('aria-pressed', String(id === provider));
    warning.hidden = isLocalUrl(baseUrl.value.trim());
    keyHelp.textContent = `${KEY_HELP} ${PROVIDERS[provider].needsKey ? `Required for ${PROVIDERS[provider].label}.` : 'Leave empty for local servers.'}`;
    model.placeholder = PROVIDERS[provider].model ? '' : 'first loaded model';
    const now = current();
    if (!now) { providerHelp.replaceChildren(...help(null)); return; }
    void Promise.all([resolveMode(now), resolveMode({ ...now, mode: 'auto' })]).then(([m, auto]) => {
      if (gone) return;
      active.textContent = now.mode === 'auto' ? `Active: ${m} (detected: this page ${m === 'proxy' ? 'is served with' : 'has no'} LLM proxy).` : `Active: ${m}.`;
      providerHelp.replaceChildren(...help(m));
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
  /** Picking a provider is an explicit reset to its preset; the key is the user's and stays. */
  function choose(id: ProviderId) {
    provider = id;
    baseUrl.value = PROVIDERS[id].baseUrl; model.value = PROVIDERS[id].model;
    modelOptions.replaceChildren(); result.textContent = '';
    save();
  }
  for (const el of [baseUrl, model, apiKey, mode]) el.addEventListener('change', save);
  baseUrl.addEventListener('input', () => { warning.hidden = isLocalUrl(baseUrl.value.trim()); });
  const field = (label: string, input: HTMLElement, ...extra: (Node | string)[]) =>
    h('div', { class: 'form-field' }, h('label', { for: input.id }, label), input, ...extra);
  const testButton = h('button', { type: 'button', class: 'btn-primary', testid: 'settings-test' }, 'Test connection');
  testButton.addEventListener('click', async () => {
    const now = current();
    if (!now) { save(); return; }
    if (missingKey(now)) { result.textContent = `Enter your ${PROVIDERS[now.provider].label} API key first.`; apiKey.focus(); return; }
    testButton.disabled = true; result.textContent = 'Connecting...';
    try {
      const models = await listModels(now, fetch, await resolveMode(now));
      modelOptions.replaceChildren(...models.map((id) => h('option', { value: id })));
      const count = `Connected: ${models.length} model${models.length === 1 ? '' : 's'}.`;
      const first = now.model ? undefined : pickChatModel(models);
      if (first) { model.value = first; save(); result.textContent = `${count} Using ${first}.`; }
      else if (!now.model) result.textContent = `${count} Load a chat model in ${PROVIDERS[now.provider].label} first.`;
      else result.textContent = count + (models.includes(now.model) ? '' : ` Warning: model ${now.model} not found on this server.`);
    } catch (e) { result.textContent = `Failed: ${e instanceof Error ? e.message : String(e)}`; }
    testButton.disabled = false;
  });

  root.append(h('div', { class: 'page', testid: 'settings' },
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: formatRoute({ page: 'gallery' }) }, 'EvoLab'),
      topNav('settings')),
    h('main', { class: 'settings' },
      h('h1', null, 'Settings'),
      h('section', { class: 'panel form' },
        h('h3', null, 'Concept generator (LLM)'),
        h('p', { class: 'muted' }, 'EvoLab turns a sentence into a playable environment by asking an OpenAI-compatible model. ',
          'The concept text is sent only to the endpoint below and nowhere else.'),
        h('div', { class: 'form-field' },
          h('span', { class: 'field-label', id: 'set-provider-label' }, 'Provider'),
          h('div', { class: 'preset-row', role: 'group', 'aria-labelledby': 'set-provider-label' }, ...PROVIDER_IDS.map((id) => buttons[id])),
          providerHelp),
        field('Base URL', baseUrl),
        warning,
        field('Model', model, modelOptions, h('p', { class: 'field-help' }, 'Test connection lists the models this server offers.')),
        field('API key', apiKey, keyHelp),
        field('Connection mode', mode, active, proxyNote, directHelp),
        error,
        h('div', { class: 'test-row' }, testButton, result)))));
  sync();
  return () => { gone = true; };
};
