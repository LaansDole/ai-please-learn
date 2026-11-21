import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const ROUTES: Record<string, { method: string; path: string }> = {
  '/api/llm/chat/completions': { method: 'POST', path: '/chat/completions' },
  '/api/llm/models': { method: 'GET', path: '/models' },
};

/** Forwards the two OpenAI-compatible routes to the endpoint named in the x-evolab-base-url header (spec section 12.2). */
export function llmProxyMiddleware(opts: { timeoutMs?: number; maxBody?: number } = {}) {
  const timeoutMs = opts.timeoutMs ?? 120000, maxBody = opts.maxBody ?? 1_000_000;
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = (req.url ?? '').split('?')[0]!;
    if (!url.startsWith('/api/llm/')) { next(); return; }
    const send = (status: number, body: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
    const route = ROUTES[url];
    if (!route) return send(404, { error: 'unknown LLM route' });
    if (req.method !== route.method) return send(405, { error: 'method not allowed' });
    const origin = req.headers.origin;
    if (origin && URL.parse(origin)?.host !== req.headers.host) return send(403, { error: 'cross-origin requests are not allowed' });
    const base = String(req.headers['x-evolab-base-url'] ?? '');
    const protocol = URL.parse(base)?.protocol;
    if (protocol !== 'http:' && protocol !== 'https:') return send(400, { error: 'x-evolab-base-url header must be an http(s) URL' });

    const chunks: Buffer[] = []; let size = 0, tooBig = false;
    req.on('data', (c: Buffer) => { size += c.length; if (size > maxBody) tooBig = true; else chunks.push(c); });
    req.on('end', () => {
      if (tooBig) return send(413, { error: 'request body too large' });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (typeof req.headers.authorization === 'string') headers.authorization = req.headers.authorization;
      fetch(base.replace(/\/+$/, '') + route.path, {
        method: route.method, headers, signal: ctrl.signal,
        body: route.method === 'POST' ? Buffer.concat(chunks) : undefined,
      }).then(async (up) => {
        const body = Buffer.from(await up.arrayBuffer());
        res.statusCode = up.status;
        res.setHeader('content-type', up.headers.get('content-type') ?? 'application/json');
        res.end(body);
      }).catch((e: unknown) => {
        if (ctrl.signal.aborted) send(504, { error: 'LLM endpoint timed out' });
        else send(502, { error: `cannot reach LLM endpoint: ${e instanceof Error ? e.message : String(e)}` });
      }).finally(() => clearTimeout(timer));
    });
  };
}

export function llmProxy(): Plugin {
  return {
    name: 'evolab-llm-proxy',
    configureServer(server) { server.middlewares.use(llmProxyMiddleware()); },
    configurePreviewServer(server) { server.middlewares.use(llmProxyMiddleware()); },
  };
}
