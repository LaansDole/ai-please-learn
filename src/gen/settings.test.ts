import { beforeEach, describe, expect, it } from 'vitest';
import { setStorage } from '../persist/storage';
import { DEFAULT_LLM, PROVIDERS, describeEndpoint, detectMode, detectProvider, isLocalUrl, loadSettings, missingKey, normalizeBaseUrl, presetFor, resolveMode, saveSettings, validateSettings } from './settings';

const map = new Map<string, string>();
beforeEach(() => {
  map.clear();
  setStorage({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } });
});

describe('LLM settings', () => {
  it('returns defaults when nothing is stored or the value is corrupt', () => {
    expect(loadSettings()).toEqual(DEFAULT_LLM);
    expect(DEFAULT_LLM).toEqual({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-luna', apiKey: '', mode: 'auto' });
    map.set('evolab.settings.v1', '{not json');
    expect(loadSettings()).toEqual(DEFAULT_LLM);
    map.set('evolab.settings.v1', JSON.stringify({ baseUrl: 'ftp://x', model: 'm', apiKey: '' }));
    expect(loadSettings()).toEqual(DEFAULT_LLM);
  });
  it('round trips', () => {
    const s = { provider: 'lmstudio' as const, baseUrl: 'http://localhost:1234/v1', model: 'm', apiKey: 'k', mode: 'direct' as const };
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
    expect(JSON.parse(map.get('evolab.settings.v1')!)).toEqual(s);
  });
  it('normalises base URLs and recognises local hosts', () => {
    expect(normalizeBaseUrl(' http://localhost:11434/v1/ ')).toBe('http://localhost:11434/v1');
    for (const u of ['http://localhost:1234/v1', 'http://127.0.0.1:8080/v1', 'http://[::1]:1/v1']) expect(isLocalUrl(u)).toBe(true);
    expect(isLocalUrl('https://api.example.com/v1')).toBe(false);
    expect(isLocalUrl('not a url')).toBe(false);
  });
  it('validates', () => {
    expect(validateSettings({ baseUrl: 'file:///etc/passwd', model: 'm', apiKey: '' })).toBeNull();
    expect(validateSettings({ baseUrl: 'http://localhost:1/v1', model: ' ', apiKey: '' })).toBeNull();
    expect(validateSettings({ baseUrl: 'http://localhost:1/v1', model: 'm', apiKey: '', mode: 'weird' })).toBeNull();
    expect(validateSettings(null)).toBeNull();
    // Settings stored before the connection mode existed stay valid.
    expect(validateSettings({ baseUrl: 'http://localhost:1/v1/', model: 'm', apiKey: '' })).toEqual({ provider: 'ollama', baseUrl: 'http://localhost:1/v1', model: 'm', apiKey: '', mode: 'auto' });
  });
  it('presets: OpenAI needs a key, the local servers do not, LM Studio leaves the model to the server', () => {
    expect(presetFor('ollama')).toMatchObject({ baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5-coder:14b' });
    expect(presetFor('lmstudio')).toMatchObject({ baseUrl: 'http://localhost:1234/v1', model: '' });
    expect([PROVIDERS.openai.needsKey, PROVIDERS.lmstudio.needsKey, PROVIDERS.ollama.needsKey]).toEqual([true, false, false]);
    expect(validateSettings(presetFor('lmstudio'))).toEqual(presetFor('lmstudio'));      // an empty model is valid only where the preset has none
    expect(validateSettings({ ...presetFor('openai'), model: '' })).toBeNull();
  });
  it('migrates settings saved before providers existed without changing their values', () => {
    const old = { baseUrl: 'http://localhost:11434/v1', model: 'llama3', apiKey: '', mode: 'direct' };
    map.set('evolab.settings.v1', JSON.stringify(old));
    expect(loadSettings()).toEqual({ ...old, provider: 'ollama' });
    expect(detectProvider('http://localhost:1234/v1/')).toBe('lmstudio');
    expect(detectProvider('http://127.0.0.1:1234/v1')).toBe('lmstudio');
    expect(detectProvider('http://127.0.0.1:8080/v1')).toBe('ollama');
    expect(detectProvider('https://api.openai.com/v1')).toBe('openai');
    expect(detectProvider('https://openrouter.ai/api/v1')).toBe('openai');     // a remote OpenAI-compatible endpoint sits under OpenAI
    // A stored provider wins over detection, and an unknown one falls back to it.
    expect(validateSettings({ ...old, provider: 'openai' })?.provider).toBe('openai');
    expect(validateSettings({ ...old, provider: 'nope' })?.provider).toBe('ollama');
  });
  it('no-key guard: only a remote endpoint under a provider that needs a key', () => {
    expect(missingKey(DEFAULT_LLM)).toBe(true);
    expect(missingKey({ ...DEFAULT_LLM, apiKey: '  ' })).toBe(true);
    expect(missingKey({ ...DEFAULT_LLM, apiKey: 'k' })).toBe(false);
    expect(missingKey({ ...DEFAULT_LLM, baseUrl: 'http://127.0.0.1:9/v1' })).toBe(false);
    expect(missingKey(presetFor('ollama'))).toBe(false);
    expect(missingKey(presetFor('lmstudio'))).toBe(false);
  });
  it('describes the endpoint by provider, or by URL once it is customised', () => {
    expect(describeEndpoint(DEFAULT_LLM)).toBe('gpt-6-luna via OpenAI');
    expect(describeEndpoint(presetFor('lmstudio'))).toBe('the first loaded model via LM Studio');
    expect(describeEndpoint({ ...presetFor('ollama'), baseUrl: 'http://127.0.0.1:9/v1', model: 'm' })).toBe('m at http://127.0.0.1:9/v1');
  });
});

describe('connection mode detection', () => {
  const answering = (status: number, type: string) => (async () => new Response('{}', { status, headers: { 'content-type': type } })) as unknown as typeof fetch;
  it('is proxy when the proxy answers its own 400 for a missing base-url header', async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response('{"error":"x"}', { status: 400, headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch;
    expect(await detectMode(f)).toBe('proxy');
    expect(urls).toEqual(['/api/llm/models']);
  });
  it('is direct on a static host (404), an SPA fallback (200 html) or a network failure', async () => {
    expect(await detectMode(answering(404, 'text/html'))).toBe('direct');
    expect(await detectMode(answering(200, 'text/html'))).toBe('direct');
    expect(await detectMode((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).toBe('direct');
  });
  it('an explicit mode wins over detection', async () => {
    expect(await resolveMode({ ...DEFAULT_LLM, mode: 'direct' }, answering(400, 'application/json'))).toBe('direct');
    expect(await resolveMode({ ...DEFAULT_LLM, mode: 'proxy' }, answering(404, 'text/html'))).toBe('proxy');
    expect(await resolveMode(DEFAULT_LLM, answering(404, 'text/html'))).toBe('direct');
  });
  it('a static build is direct without any network probe', async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response('{}', { status: 400, headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch;
    expect(await detectMode(f, true)).toBe('direct');
    expect(calls).toBe(0);
    expect(await detectMode(f, false)).toBe('proxy');      // dev, preview and plain builds still probe
    expect(calls).toBe(1);
  });
});
