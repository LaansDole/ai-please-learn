import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeLlm {
  baseUrl: string;
  requests: { messages: { role: string; content: string }[] }[];
  close(): Promise<void>;
}

/**
 * An OpenAI-compatible server on an ephemeral port: answers chat completions with the queued responses (repeating the last one)
 * and lists one model. It allows any origin, like a local server configured for direct (static-hosting) mode.
 */
export function startFakeLlm(responses: string[]): Promise<FakeLlm> {
  const requests: FakeLlm['requests'] = [];
  const server = http.createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/v1/models') { res.end(JSON.stringify({ data: [{ id: 'fake-model' }] })); return; }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      requests.push(JSON.parse(body) as FakeLlm['requests'][number]);
      const content = responses[Math.min(requests.length - 1, responses.length - 1)];
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      requests,
      close: () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); }),
    }));
  });
}
