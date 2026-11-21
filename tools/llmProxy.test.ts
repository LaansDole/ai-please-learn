import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { llmProxyMiddleware } from './llmProxy';

const seen: { method?: string; url?: string; auth?: string; body: string }[] = [];
const servers: http.Server[] = [];
let up = 0, proxy = 0, small = 0, closed = 0;

const listen = (s: http.Server) => new Promise<number>((resolve) => { servers.push(s); s.listen(0, '127.0.0.1', () => resolve((s.address() as AddressInfo).port)); });
const serve = (mw: ReturnType<typeof llmProxyMiddleware>) => http.createServer((req, res) => mw(req, res, () => { res.statusCode = 299; res.end('next'); }));

beforeAll(async () => {
  up = await listen(http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST' && req.url === '/v1/chat/completions') res.end('{"choices":[{"message":{"content":"hi"}}]}');
      else if (req.method === 'GET' && req.url === '/v1/models') res.end('{"data":[{"id":"m1"}]}');
      else if (req.url === '/slow/chat/completions') { /* never answers */ }
      else { res.statusCode = 404; res.end('{}'); }
    });
  }));
  proxy = await listen(serve(llmProxyMiddleware({ timeoutMs: 300 })));
  small = await listen(serve(llmProxyMiddleware({ maxBody: 100 })));
  const tmp = http.createServer();
  closed = await listen(tmp);
  await new Promise((r) => tmp.close(r));
});
afterAll(() => { for (const s of servers) { s.closeAllConnections(); s.close(); } });

const call = (path: string, init: RequestInit = {}, port = proxy) => fetch(`http://127.0.0.1:${port}${path}`, init);
const base = (p = up, path = '/v1') => ({ 'x-evolab-base-url': `http://127.0.0.1:${p}${path}` });

describe('llm proxy', () => {
  it('ignores other paths', async () => {
    expect((await call('/other')).status).toBe(299);
  });
  it('forwards chat completions with the body and authorization header', async () => {
    const body = JSON.stringify({ model: 'm', messages: [] });
    const r = await call('/api/llm/chat/completions', { method: 'POST', headers: { ...base(), authorization: 'Bearer k', 'content-type': 'application/json' }, body });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ choices: [{ message: { content: 'hi' } }] });
    expect(seen.at(-1)).toEqual({ method: 'POST', url: '/v1/chat/completions', auth: 'Bearer k', body });
  });
  it('lists models and tolerates a trailing slash on the base URL', async () => {
    const r = await call('/api/llm/models', { headers: base(up, '/v1/') });
    expect(await r.json()).toEqual({ data: [{ id: 'm1' }] });
    expect(seen.at(-1)!.url).toBe('/v1/models');
  });
  it('rejects bad requests', async () => {
    expect((await call('/api/llm/models')).status).toBe(400);
    expect((await call('/api/llm/models', { headers: { 'x-evolab-base-url': 'file:///etc/passwd' } })).status).toBe(400);
    expect((await call('/api/llm/chat/completions', { headers: base() })).status).toBe(405);
    expect((await call('/api/llm/embeddings', { method: 'POST', headers: base(), body: '{}' })).status).toBe(404);
    expect((await call('/api/llm/models', { headers: { ...base(), origin: 'http://evil.example' } })).status).toBe(403);
  });
  it('maps upstream failures to 502 and 504', async () => {
    const dead = await call('/api/llm/models', { headers: base(closed) });
    expect(dead.status).toBe(502);
    expect(typeof (await dead.json() as { error: unknown }).error).toBe('string');
    const t0 = Date.now();
    const slow = await call('/api/llm/chat/completions', { method: 'POST', headers: base(up, '/slow'), body: '{}' });
    expect(slow.status).toBe(504);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it('limits the body size', async () => {
    const r = await call('/api/llm/chat/completions', { method: 'POST', headers: base(), body: 'x'.repeat(500) }, small);
    expect(r.status).toBe(413);
  });
});
