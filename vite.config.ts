import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import { llmProxy } from './tools/llmProxy';

export const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; " +
  "worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:";

/**
 * Static hosting (GitHub Pages) cannot set headers, so the built index.html carries the document policy itself.
 * connect-src is open because without the proxy the page calls the user's LLM endpoint directly; generated code never runs
 * on the page, only in workers, where the static scan, lockdown and shadowing (spec section 12.5 layers 1-3) contain it.
 */
const STATIC_CSP = CSP.replace(" 'unsafe-eval'", '').replace("connect-src 'self'", "connect-src 'self' http: https:");
const staticCsp = (): Plugin => ({
  name: 'evolab-static-csp', apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: STATIC_CSP }, injectTo: 'head-prepend' }],
});

/**
 * GitHub Pages has no rewrite rules: a deep link such as /ai-please-learn/pong/2 is not a file, so Pages answers with 404.html.
 * Shipping the app as that file boots it at the requested path (every asset URL in it is absolute). Dev and preview servers
 * fall back to index.html on their own.
 */
const spaFallback = (): Plugin => {
  let out = '';
  return {
    name: 'evolab-spa-fallback', apply: 'build',
    configResolved(c) { out = resolve(c.root, c.build.outDir); },
    closeBundle() { copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html')); },
  };
};

/**
 * The recorded demo (docs/demo/runbook) is a static page beside the app, at <base>demo/: the app's Demo tab opens it and its
 * own top bar links back. A build copies it into the output; dev and preview serve it straight from the docs folder, without
 * the app's CSP header (the page carries an inline script) and with byte ranges (the video seeks by chapter).
 */
const demoPage = (): Plugin => {
  const SRC = resolve('docs/demo/runbook'), TYPES: Record<string, string> = { html: 'text/html', mp4: 'video/mp4', png: 'image/png' };
  let out = '', base = '/', building = false;
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const path = (req.url ?? '').split('?')[0]!;
    if (path === `${base}demo`) { res.writeHead(301, { location: `${base}demo/` }).end(); return; }
    const name = path.startsWith(`${base}demo/`) ? path.slice(base.length + 5) || 'demo.html' : '';
    const file = resolve(SRC, name), ext = name.split('.').pop()!;
    if (!/^[\w.-]+\.(html|mp4|png)$/.test(name) || !existsSync(file)) { next(); return; }
    const size = statSync(file).size, range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    const start = range?.[1] ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(range ? 206 : 200, {
      'content-type': TYPES[ext]!, 'accept-ranges': 'bytes', 'content-length': end - start + 1,
      ...(range && { 'content-range': `bytes ${start}-${end}/${size}` }),
    });
    createReadStream(file, { start, end }).pipe(res);
  };
  return {
    name: 'evolab-demo-page',
    configResolved(c) { out = resolve(c.root, c.build.outDir); base = c.base; building = c.command === 'build'; },
    configureServer(server) { server.middlewares.use(serve); },
    configurePreviewServer(server) { server.middlewares.use(serve); },
    closeBundle() {
      if (!building || !existsSync(resolve(SRC, 'demo.html'))) return;
      mkdirSync(resolve(out, 'demo'), { recursive: true });
      copyFileSync(resolve(SRC, 'demo.html'), resolve(out, 'demo/index.html'));
      for (const f of readdirSync(SRC)) if (/\.(mp4|png)$/.test(f)) copyFileSync(resolve(SRC, f), resolve(out, 'demo', f));
    },
  };
};

export default defineConfig({
  plugins: [llmProxy(), staticCsp(), spaFallback(), demoPage()],
  // EVOLAB_BASE: sub-path hosting (GitHub Pages builds use /ai-please-learn/).
  base: process.env.EVOLAB_BASE ?? '/',
  // EVOLAB_STATIC=1: the build goes to a host that only serves files, so the app must not probe for the LLM proxy
  // (src/gen/settings.ts detectMode). Plain builds keep probing: `vite preview` serves them with the proxy.
  define: { __EVOLAB_STATIC__: JSON.stringify(process.env.EVOLAB_STATIC === '1') },
  server: { headers: { 'Content-Security-Policy': CSP } },
  preview: { headers: { 'Content-Security-Policy': CSP } },
  worker: { format: 'es' },
  // Only workers simulate. The page imports the walker definition for its metadata, and with it the dynamic import of Rapier
  // that it never executes: left to the bundler, that emitted a second 4.3 MB copy of the chunk. This option covers the page
  // bundle only (workers build with `worker.rolldownOptions`), so the worker still bundles Rapier.
  build: { rolldownOptions: { external: ['@dimforge/rapier3d-compat'] } },
  // Rapier ships its WASM inlined as base64; pre-bundling it for a module worker is slow and unnecessary (spec section 16).
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
