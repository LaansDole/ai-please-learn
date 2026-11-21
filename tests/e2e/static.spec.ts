import { execSync } from 'node:child_process';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { expect, test } from '@playwright/test';
import { GOOD, toResponse } from '../../src/gen/fixtures';
import { startFakeLlm } from './fakeLlm';
import { collectErrors, startTraining, waitFrames, waitIterations } from './helpers';

// The GitHub Pages deployment: built with the /evolab/ base and served by a server that only hands out files
// (no LLM proxy, no response headers beyond the content type).
const ROOT = 'test-results/pages', OUT = `${ROOT}/evolab`;
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
let server: http.Server, origin = '';

test.beforeAll(async () => {
  test.setTimeout(180000);
  execSync(`npx vite build --outDir ${OUT} --emptyOutDir`, { env: { ...process.env, EVOLAB_BASE: '/evolab/', EVOLAB_STATIC: '1' }, stdio: 'pipe' });
  server = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname);
    const file = normalize(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
    if (!file.startsWith(ROOT) || !statSync(file, { throwIfNoEntry: false })?.isFile()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => { server?.closeAllConnections(); server?.close(); });

test('the build ships the physics engine once', () => {
  const assets = readdirSync(`${OUT}/assets`);
  // Rapier inlines its WASM (4.3 MB): only the worker runs it, so only the worker's chunk may exist.
  expect(assets.filter((f) => f.startsWith('rapier'))).toHaveLength(1);
  const bytes = assets.reduce((n, f) => n + statSync(`${OUT}/assets/${f}`).size, 0);
  expect(bytes).toBeLessThan(6_000_000);
});

test('static sub-path build: gallery, a 2D concept trains, a champion replays', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${origin}/evolab/`);
  await expect(page.locator('a.card')).toHaveCount(6);
  await page.getByTestId('card-pong').click();
  await waitFrames(page, 10);
  await startTraining(page);
  await waitIterations(page, 2);
  await page.getByTestId('btn-pause').click();
  await page.getByTestId('hof-item').first().click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-mode', 'replay');
  await waitFrames(page, 5);
  await page.reload();                                       // a deep link under the sub-path
  await expect(page).toHaveURL(`${origin}/evolab/#/c/pong/4`);
  await expect(page.getByTestId('btn-start')).toBeVisible();
  await expect(page.getByTestId('error-banner')).toBeHidden();
  expect(errors).toEqual([]);
});

test('static sub-path build: Walker loads three.js on the page and Rapier in the worker', async ({ page }) => {
  test.setTimeout(240000);
  const errors = collectErrors(page);
  await page.goto(`${origin}/evolab/#/c/walker/1`);
  await waitFrames(page, 10);
  await expect(page.locator('[data-testid="stage"] canvas[data-kind="3d"]')).toBeVisible();
  await expect(page.getByTestId('hud-distance')).toHaveText(/m$/);
  await startTraining(page, { population: 20 });
  await waitIterations(page, 1, 180000);
  await expect(page.getByTestId('error-banner')).toBeHidden();
  expect(errors).toEqual([]);
});

test('static sub-path build: direct LLM mode and a pasted concept that trains in the sandboxed worker', async ({ page }) => {
  const errors = collectErrors(page), llm = await startFakeLlm([toResponse(GOOD)]);
  const probes: string[] = [];                               // a static build must not ask for the dev LLM proxy at all
  page.on('request', (r) => { if (r.url().includes('/api/llm/')) probes.push(r.url()); });
  try {
    await page.goto(`${origin}/evolab/#/settings`);
    await expect(page.getByTestId('settings-mode-active')).toContainText('direct');
    await expect(page.getByTestId('settings-direct-help')).toContainText(`OLLAMA_ORIGINS=${origin}`);
    await page.getByTestId('settings-base-url').fill(llm.baseUrl);
    await page.getByTestId('settings-model').fill('fake-model');
    await page.getByTestId('settings-model').blur();
    await page.getByTestId('settings-test').click();
    await expect(page.getByTestId('settings-test-result')).toContainText('Connected');
  } finally { await llm.close(); }
  await page.goto(`${origin}/evolab/`);
  await page.getByTestId('new-concept-paste').click();
  await page.getByTestId('new-concept-paste-input').fill(toResponse(GOOD));
  await page.getByTestId('new-concept-paste-submit').click();
  await expect(page).toHaveURL(/\/evolab\/#\/c\/gen-/);
  await startTraining(page);
  await waitIterations(page, 2);
  await expect(page.getByTestId('error-banner')).toBeHidden();
  expect(probes).toEqual([]);
  expect(errors).toEqual([]);
});
