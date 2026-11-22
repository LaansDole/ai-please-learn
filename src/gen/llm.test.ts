import { describe, expect, it } from 'vitest';
import { createChat, listModels, pickChatModel } from './llm';
import type { ChatMessage } from './prompt';
import type { LlmSettings } from './settings';

const settings: LlmSettings = { provider: 'ollama', baseUrl: 'http://localhost:11434/v1/', model: 'm1', apiKey: '', mode: 'auto' };
const messages: ChatMessage[] = [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }];

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}
const ok = { choices: [{ message: { content: 'hello' } }] };

describe('LLM client through the proxy', () => {
  it('posts the chat request to the proxy with the base URL header', async () => {
    const f = fakeFetch(200, ok);
    expect(await createChat(settings, f.impl)(messages)).toBe('hello');
    const { url, init } = f.calls[0]!;
    expect(url).toBe('/api/llm/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-evolab-base-url': 'http://localhost:11434/v1' });
    expect(JSON.parse(init.body as string)).toEqual({ model: 'm1', messages, stream: false });
  });
  it('sends the authorization header only when a key is set', async () => {
    const f = fakeFetch(200, ok);
    await createChat({ ...settings, apiKey: 'k' }, f.impl)(messages);
    expect((f.calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer k');
  });
  it('reports HTTP errors and empty answers', async () => {
    await expect(createChat(settings, fakeFetch(500, 'x'.repeat(300)).impl)(messages)).rejects.toThrow(`LLM request failed (500): ${'x'.repeat(200)}`);
    await expect(createChat(settings, fakeFetch(200, { choices: [] }).impl)(messages)).rejects.toThrow('LLM returned no content');
    await expect(createChat(settings, fakeFetch(200, 'not json').impl)(messages)).rejects.toThrow('LLM returned no content');
  });
  it('lists models', async () => {
    const f = fakeFetch(200, { data: [{ id: 'a' }, { id: 'b' }] });
    expect(await listModels(settings, f.impl)).toEqual(['a', 'b']);
    expect(f.calls[0]!.url).toBe('/api/llm/models');
    expect(f.calls[0]!.init.method).toBe('GET');
  });
  it('picks the first chat model, skipping embedding models', () => {
    expect(pickChatModel(['text-embedding-nomic-embed-text-v1.5', 'qwen2.5-coder-14b', 'llama-3'])).toBe('qwen2.5-coder-14b');
    expect(pickChatModel(['text-embedding-3-small'])).toBeUndefined();
  });
});

describe('LLM client in direct mode (static hosting, no proxy)', () => {
  it('calls <baseUrl>/chat/completions itself, without the proxy header', async () => {
    const f = fakeFetch(200, ok);
    expect(await createChat({ ...settings, apiKey: 'k' }, f.impl, 'direct')(messages)).toBe('hello');
    const { url, init } = f.calls[0]!;
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer k' });
    expect(JSON.parse(init.body as string)).toEqual({ model: 'm1', messages, stream: false });
  });
  it('lists models with a simple GET (no preflight-forcing headers)', async () => {
    const f = fakeFetch(200, { data: [{ id: 'a' }] });
    expect(await listModels(settings, f.impl, 'direct')).toEqual(['a']);
    expect(f.calls[0]).toEqual({ url: 'http://localhost:11434/v1/models', init: { method: 'GET', headers: {} } });
  });
  it('turns a blocked or failed call into the CORS hint and the paste fallback', async () => {
    const blocked = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const err = await createChat(settings, blocked, 'direct')(messages).catch((e: Error) => e.message);
    expect(err).toContain('http://localhost:11434/v1');
    expect(err).toContain('OLLAMA_ORIGINS=');
    expect(err).toContain('CORS');
    expect(err).toContain('Paste a response');
    await expect(createChat(settings, blocked)(messages)).rejects.toThrow(/proxy/);
  });
  it('still reports HTTP errors from the endpoint', async () => {
    await expect(createChat(settings, fakeFetch(404, 'model not found').impl, 'direct')(messages)).rejects.toThrow('LLM request failed (404): model not found');
  });
});
