import { library, parseConceptFile, type StoredConcept } from '../../gen/library';
import { createChat } from '../../gen/llm';
import { slugId, type GeneratedMeta } from '../../gen/meta';
import { parseResponse } from '../../gen/parse';
import { SYSTEM_PROMPT, userMessage } from '../../gen/prompt';
import { MAX_REPAIRS, generateConcept } from '../../gen/repair';
import { loadSettings, resolveMode } from '../../gen/settings';
import { spawnValidateWorker, validateInWorker } from '../../gen/validateClient';
import { h } from '../dom';

const validate = (source: string, meta: unknown) => validateInWorker(spawnValidateWorker, source, meta);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The Create page's form: describe a concept and let the configured LLM write it, or paste a model's answer / import a file.
 * Every path ends in the worker-side validator; nothing here needs a server besides the optional LLM call.
 */
export function createNewConceptPanel(onCreated: (id: string) => void): HTMLElement {
  const settings = loadSettings();
  let running = false;
  const input = h('input', { type: 'text', id: 'new-concept-text', testid: 'new-concept-input', placeholder: 'learn to juggle', maxlength: 500, autocomplete: 'off' });
  const submit = h('button', { type: 'submit', class: 'btn-primary', testid: 'new-concept-submit', disabled: true }, 'Create');
  const endpoint = h('span', { class: 'mono' }, `${settings.model} at ${settings.baseUrl}`);
  const log = h('ol', { class: 'gen-log', testid: 'new-concept-log', 'aria-live': 'polite' });
  const errors = h('div', { class: 'gen-errors', testid: 'new-concept-errors', role: 'alert' });
  const pasteInput = h('textarea', { testid: 'new-concept-paste-input', rows: 6, spellcheck: 'false', 'aria-label': 'Model response',
    placeholder: 'Paste the model\'s whole answer here: one ```json block and one ```js block.' });
  const pasteSubmit = h('button', { type: 'button', testid: 'new-concept-paste-submit', disabled: true }, 'Validate and add');
  const copyNote = h('span', { class: 'field-help', role: 'status' });
  const promptBox = h('textarea', { class: 'prompt-box', rows: 5, readonly: true, hidden: true, 'aria-label': 'Prompt to copy' });
  const copy = h('button', { type: 'button', testid: 'new-concept-copy-prompt' }, 'Copy prompt');
  const file = h('input', { type: 'file', accept: 'application/json,.json', testid: 'concept-import', class: 'file-input' });
  const manual = h('div', { class: 'gen-manual', hidden: true },
    h('p', { class: 'muted' }, 'No endpoint, or the call is blocked? Copy the prompt into any chat model, then paste its whole answer below.'),
    h('div', { class: 'preset-row' }, copy, copyNote), promptBox, pasteInput,
    h('div', { class: 'preset-row' }, pasteSubmit));
  const pasteToggle = h('button', { type: 'button', testid: 'new-concept-paste', 'aria-expanded': 'false' }, 'Paste a response');
  const showManual = (open: boolean) => { manual.hidden = !open; pasteToggle.setAttribute('aria-expanded', String(open)); };
  pasteToggle.addEventListener('click', () => showManual(manual.hidden !== false));

  const sync = () => {
    submit.disabled = running || !input.value.trim();
    pasteSubmit.disabled = running || !pasteInput.value.trim();
    file.disabled = running;
  };
  const showErrors = (title: string, list: string[], lastResponse?: string) => {
    errors.replaceChildren(h('p', { class: 'gen-errors-title' }, title), h('ul', { class: 'errors' }, ...list.map((e) => h('li', null, e))),
      lastResponse ? h('details', null, h('summary', null, 'Last response from the model'), h('pre', null, lastResponse)) : '');
  };
  const step = (text: string, detail?: string[]) => {
    log.append(h('li', null, text, detail?.length ? h('details', null, h('summary', null, `${detail.length} validator error${detail.length === 1 ? '' : 's'}`),
      h('ul', null, ...detail.map((e) => h('li', null, e)))) : null));
  };
  /** Runs one creation path with the controls locked. */
  const busy = async (fn: () => Promise<void>) => {
    if (running) return;
    running = true; sync(); errors.replaceChildren(); log.replaceChildren(); log.dataset.busy = '';
    try { await fn(); } catch (e) { showErrors('Could not add the concept.', [message(e)]); }
    running = false; sync(); delete log.dataset.busy;
  };
  const save = async (meta: GeneratedMeta, source: string, prompt: string, model: string, createdAt = Date.now()) => {
    let id = slugId(meta.name, Math.random);
    while (await library.get(id)) id = slugId(meta.name, Math.random);
    await library.put({ id, name: meta.name, prompt, meta, source, model, createdAt });
    if (el.isConnected) onCreated(id);          // the user may have left the page while the model was thinking
  };

  input.addEventListener('input', sync);
  pasteInput.addEventListener('input', sync);
  void resolveMode(settings).then((mode) => { endpoint.textContent = `${settings.model} at ${settings.baseUrl} (${mode})`; });

  const form = h('form', { class: 'gen-form' }, h('label', { for: input.id }, 'Describe something to learn'), h('div', { class: 'gen-row' }, input, submit));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    void busy(async () => {
      const r = await generateConcept(text, {
        chat: createChat(settings, fetch, await resolveMode(settings)),
        validate,
        onProgress: (e) => {
          if (e.phase === 'prompting') step(`prompting ${settings.model}`);
          else if (e.phase === 'repairing') step(`repairing ${e.attempt}/${MAX_REPAIRS}`, e.errors);
          else step(e.phase);
        },
      });
      if (r.ok) { await save(r.meta, r.source, text, settings.model); return; }
      showErrors(r.lastResponse ? 'The model did not produce a valid environment.' : 'The model could not be reached.', r.errors, r.lastResponse);
      showManual(true);
    });
  });
  pasteSubmit.addEventListener('click', () => void busy(async () => {
    const parsed = parseResponse(pasteInput.value);
    if (!parsed.ok) { showErrors('The pasted response is not in the two-block format.', parsed.errors); return; }
    const report = await validate(parsed.source, parsed.meta);
    if (!report.ok) { showErrors('The pasted environment failed validation.', report.errors); return; }
    await save(parsed.meta as GeneratedMeta, parsed.source, input.value.trim(), 'manual');
  }));
  copy.addEventListener('click', async () => {
    const prompt = `${SYSTEM_PROMPT}\n\n${userMessage(input.value || input.placeholder)}`;
    try { await navigator.clipboard.writeText(prompt); copyNote.textContent = `Copied (${prompt.length} characters).`; promptBox.hidden = true; }
    catch { promptBox.value = prompt; promptBox.hidden = false; promptBox.select(); copyNote.textContent = 'Clipboard is blocked: copy the text below.'; }
  });
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    file.value = '';                            // the same file can be picked again
    if (!f) return;
    void busy(async () => {
      const parsed = parseConceptFile(await f.text());
      if (!parsed.ok) { showErrors(`${f.name} is not a concept file.`, parsed.errors); return; }
      const c: StoredConcept = parsed.concept;
      const report = await validate(c.source, c.meta);    // an imported file is as untrusted as a model's answer
      if (!report.ok) { showErrors(`${f.name} failed validation.`, report.errors); return; }
      await save(c.meta, c.source, c.prompt, c.model, c.createdAt);
    });
  });

  const el = h('section', { class: 'card new-concept', testid: 'new-concept' },
    h('h3', null, 'New concept'),
    form,
    h('p', { class: 'field-help' }, 'Uses ', endpoint, '. ', h('a', { href: '#/settings' }, 'Settings')),
    log, errors,
    h('div', { class: 'preset-row' }, pasteToggle, h('label', { class: 'btn file-btn' }, 'Import concept file', file)),
    manual);
  return el;
}
