import { execSync } from 'node:child_process';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { expect, test } from '@playwright/test';
import { GOOD, toResponse } from '../../src/gen/fixtures';
import { startFakeLlm } from './fakeLlm';
import { collectErrors, startTraining, waitFrames, waitIterations } from './helpers';

// The GitHub Pages deployment: built with the /ai-please-learn/ base and served by a server that only hands out files
// (no LLM proxy, no response headers beyond the content type).
const ROOT = 'test-results/pages', OUT = `${ROOT}/ai-please-learn`;
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
let server: http.Server, origin = '';

test.beforeAll(async () => {
  test.setTimeout(180000);
  execSync(`npx vite build --outDir ${OUT} --emptyOutDir`, { env: { ...process.env, EVOLAB_BASE: '/ai-please-learn/', EVOLAB_STATIC: '1' }, stdio: 'pipe' });
  server = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname);
    let file = normalize(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
    // Like GitHub Pages: a path that is not a file gets the site's 404.html, with status 404.
    if (!file.startsWith(ROOT) || !statSync(file, { throwIfNoEntry: false })?.isFile()) { res.statusCode = 404; file = `${OUT}/404.html`; }
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
  await page.goto(`${origin}/ai-please-learn/`);
  await expect(page.locator('a.card')).toHaveCount(7);          // six built-ins and the "Make your own" card
  await page.getByTestId('card-pong').click();
  await waitFrames(page, 10);
  await startTraining(page);
  await waitIterations(page, 2);
  await page.getByTestId('btn-pause').click();
  await page.getByTestId('hof-item').first().click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-mode', 'replay');
  await waitFrames(page, 5);
  await page.reload();                                       // a deep link under the sub-path: the host answers with 404.html
  await expect(page).toHaveURL(`${origin}/ai-please-learn/pong/4`);
  await expect(page.getByTestId('btn-start')).toBeVisible();
  await expect(page.getByTestId('error-banner')).toBeHidden();
  expect(errors).toEqual([]);
});

test('static sub-path build: Walker loads three.js on the page and Rapier in the worker', async ({ page }) => {
  test.setTimeout(240000);
  const errors = collectErrors(page);
  await page.goto(`${origin}/ai-please-learn/walker/1`);
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
    await page.goto(`${origin}/ai-please-learn/settings`);
    await expect(page.getByTestId('settings-mode-active')).toContainText('direct');
    await page.getByTestId('settings-provider-ollama').click();
    await expect(page.getByTestId('settings-provider-help')).toContainText(`OLLAMA_ORIGINS=${origin} ollama serve`);
    await expect(page.getByTestId('settings-direct-help')).toContainText('Paste a response');
    await page.getByTestId('settings-base-url').fill(llm.baseUrl);
    await page.getByTestId('settings-model').fill('fake-model');
    await page.getByTestId('settings-model').blur();
    await page.getByTestId('settings-test').click();
    await expect(page.getByTestId('settings-test-result')).toContainText('Connected');
  } finally { await llm.close(); }
  await page.goto(`${origin}/ai-please-learn/create`);
  await page.reload();                                       // a deep link survives a reload on a static host
  await expect(page.getByTestId('nav-create')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('new-concept-paste').click();
  await page.getByTestId('new-concept-paste-input').fill(toResponse(GOOD));
  await page.getByTestId('new-concept-paste-submit').click();
  await expect(page).toHaveURL(/\/ai-please-learn\/gen-[a-z0-9-]+\/1$/);
  await startTraining(page);
  await waitIterations(page, 2);
  await expect(page.getByTestId('error-banner')).toBeHidden();
  expect(probes).toEqual([]);
  expect(errors).toEqual([]);
});

test('static sub-path build: deep links boot through 404.html, old hash links redirect, unknown paths say so', async ({ page }) => {
  const errors = collectErrors(page);
  const deep = await page.goto(`${origin}/ai-please-learn/pong/2`);
  expect(deep!.status()).toBe(404);                          // no such file: what arrived is 404.html
  await expect(page.getByTestId('step-2')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.crumb .here')).toHaveText('Pong');
  // Nothing in the document is relative to the nested path: the icon, and the policy the static host cannot send as a header.
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/ai-please-learn/favicon.svg');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  expect((await page.request.get(`${origin}/ai-please-learn/favicon.svg`)).status()).toBe(200);

  await page.goto(`${origin}/ai-please-learn/pong/1`);
  await waitFrames(page, 5);
  await page.goto(`${origin}/ai-please-learn/create`);
  await expect(page.getByTestId('nav-create')).toHaveAttribute('aria-current', 'page');

  // In-app links change the path without a page load, and Back returns.
  await page.evaluate(() => { document.body.dataset.same = '1'; });
  await page.getByTestId('nav-settings').click();
  await expect(page).toHaveURL(`${origin}/ai-please-learn/settings`);
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(`${origin}/ai-please-learn/create`);
  await expect(page.getByTestId('create')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-same', '1');

  for (const [old, clean] of [['#/c/pong', 'pong'], ['#/c/snake/3', 'snake/3'], ['#/settings', 'settings'], ['#/create', 'create'], ['#/', '']]) {
    await page.goto('about:blank');                          // so the old link is a page load, as a shared link is
    await page.goto(`${origin}/ai-please-learn/${old}`);
    await expect(page).toHaveURL(`${origin}/ai-please-learn/${clean}`);
  }
  await page.goto(`${origin}/ai-please-learn/pong/1#/c/snake/3`);     // an old hash typed into a page that is already open
  await expect(page).toHaveURL(`${origin}/ai-please-learn/snake/3`);
  await expect(page.locator('.crumb .here')).toHaveText('Snake');

  for (const missing of ['nope', 'assets', 'pong/2/extra']) {
    await page.goto(`${origin}/ai-please-learn/${missing}`);
    await expect(page.getByTestId('not-found')).toContainText('does not exist');
    await page.getByRole('link', { name: 'Back to the gallery' }).click();
    await expect(page).toHaveURL(`${origin}/ai-please-learn/`);
    await expect(page.getByTestId('gallery')).toBeVisible();
  }

  // The demo is a file beside the app: its link is a page load, not a route. (No demo file in this build, so 404.html answers.)
  await page.evaluate(() => { document.body.dataset.same = '1'; });
  await expect(page.getByTestId('gallery-demo')).toHaveAttribute('href', '/ai-please-learn/demo/');
  await page.getByTestId('gallery-demo').click();
  await expect(page).toHaveURL(`${origin}/ai-please-learn/demo/`);
  await expect(page.getByTestId('not-found')).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-same');
  expect(errors).toEqual([]);
});
