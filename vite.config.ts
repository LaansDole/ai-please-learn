import { defineConfig } from 'vite';

export const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; " +
  "worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:";

export default defineConfig({
  // EVOLAB_BASE: sub-path hosting (GitHub Pages builds use /evolab/).
  base: process.env.EVOLAB_BASE ?? '/',
  server: { headers: { 'Content-Security-Policy': CSP } },
  preview: { headers: { 'Content-Security-Policy': CSP } },
  worker: { format: 'es' },
});
