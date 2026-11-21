import { beforeEach, describe, expect, it } from 'vitest';
import { setStorage } from '../persist/storage';
import { DEFAULT_LLM, PRESETS, detectMode, isLocalUrl, loadSettings, normalizeBaseUrl, resolveMode, saveSettings, validateSettings } from './settings';

const map = new Map<string, string>();
beforeEach(() => {
  map.clear();
  setStorage({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } });
});

describe('LLM settings', () => {
  it('returns defaults when nothing is stored or the value is corrupt', () => {
    expect(loadSettings()).toEqual(DEFAULT_LLM);
    expect(DEFAULT_LLM.baseUrl).toBe(PRESETS.ollama);
    map.set('evolab.settings.v1', '{not json');
    expect(loadSettings()).toEqual(DEFAULT_LLM);
    map.set('evolab.settings.v1', JSON.stringify({ baseUrl: 'ftp://x', model: 'm', apiKey: '' }));
    expect(loadSettings()).toEqual(DEFAULT_LLM);
  });
  it('round trips', () => {
    const s = { baseUrl: 'http://localhost:1234/v1', model: 'm', apiKey: 'k', mode: 'direct' as const };
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
    expect(validateSettings({ baseUrl: 'http://localhost:1/v1/', model: 'm', apiKey: '' })).toEqual({ baseUrl: 'http://localhost:1/v1', model: 'm', apiKey: '', mode: 'auto' });
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
