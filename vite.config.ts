import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
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
 * GitHub Pages has no rewrite rules: a deep link such as /evolab/pong/2 is not a file, so Pages answers with 404.html.
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

export default defineConfig({
  plugins: [llmProxy(), staticCsp(), spaFallback()],
  // EVOLAB_BASE: sub-path hosting (GitHub Pages builds use /evolab/).
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
