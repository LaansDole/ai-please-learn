import { mkdirSync, statSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { GOOD, toResponse } from '../../src/gen/fixtures';
import { attr, startTraining, vis, waitFrames, waitIterations } from './helpers';

// Training is timing-dependent, so every run paints different pixels. A plain `npm run e2e` therefore writes to the ignored
// test-results/ directory; `EVOLAB_SCREENSHOTS=1 npm run e2e -- screenshots` refreshes the committed images in docs/screenshots/.
const DIR = process.env.EVOLAB_SCREENSHOTS ? 'docs/screenshots' : 'test-results/screenshots';

/** The assertions before each call are the test; the image is the artefact. A blank capture would be far below 20 kB. */
async function shot(page: Page, name: string, fullPage = true): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(300);
  const path = `${DIR}/${name}.png`;
  await page.screenshot({ path, fullPage });
  expect(statSync(path).size).toBeGreaterThan(20000);
}

/** NEAT at MAX for `iterations` generations, then x1 so the stage shows the live population. */
async function learnLive(page: Page, id: string, iterations: number, timeout = 90000): Promise<void> {
  await page.goto(`/${id}/4`);
  await startTraining(page);
  await waitIterations(page, iterations, timeout);
  await page.getByTestId('speed-1').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-mode', 'live');
  await waitFrames(page, 90);
  await expect(page.getByTestId('species-chart')).toBeVisible();
  await expect(page.getByTestId('error-banner')).toBeHidden();
}

test.describe('visual acceptance screenshots', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeAll(() => { mkdirSync(DIR, { recursive: true }); });

  test('01 gallery, 17 create, 16 settings, 18 math', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a.card')).toHaveCount(7);          // six built-ins and the "Make your own" card
    await shot(page, '01-gallery');
    await page.getByTestId('nav-create').click();
    await expect(page.getByTestId('new-concept')).toBeVisible();
    await shot(page, '17-create');
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-provider-openai')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('settings-base-url')).toHaveValue('https://api.openai.com/v1');
    await expect(page.getByTestId('settings-mode-active')).toContainText('proxy');
    await shot(page, '16-settings');
    await page.getByTestId('nav-math').click();
    await expect(page.getByTestId('math-toc').locator('a')).toHaveCount(12);
    await expect(page.locator('.math-doc .katex').first()).toBeVisible();
    await shot(page, '18-math', false);                     // the report is some thirty screens long: its first one
  });

  test('02 pong play, 03 pong learn, 10 network, 14 replay', async ({ page }) => {
    await page.goto('/pong/1');
    await waitFrames(page, 60);
    await shot(page, '02-pong-play');
    await learnLive(page, 'pong', 20);
    await expect(page.getByTestId('toggle-ghosts')).toBeChecked();
    await shot(page, '03-pong-learn');
    await vis(page, 'nn-show-disabled').check();
    expect(await attr(vis(page, 'nn-graph'), 'data-nodes')).toBeGreaterThanOrEqual(9);
    await vis(page, 'nn-graph').scrollIntoViewIfNeeded();
    await shot(page, '10-network-neat');
    await page.getByTestId('btn-pause').click();
    await page.getByTestId('hof-item').last().click();
    await expect(page.getByTestId('stage')).toHaveAttribute('data-mode', 'replay');
    await expect(page.getByTestId('stage-header')).toContainText('Replay: generation');
    await waitFrames(page, 60);
    await shot(page, '14-replay');
  });

  test('09 reward panel, 04 snake learn', async ({ page }) => {
    await page.goto('/snake/1');               // by way of step 1, so the stage shows the game instead of an empty canvas
    await waitFrames(page, 20);
    await page.getByTestId('step-2').click();
    await page.getByTestId('preset-aggressive').click();
    await expect(page.getByTestId('preset-aggressive')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('weight-num-food')).toHaveValue('20');
    await shot(page, '09-reward-panel');
    await page.getByTestId('preset-default').click();
    await learnLive(page, 'snake', 30);
    await shot(page, '04-snake-learn');
  });

  test('05 flappy learn', async ({ page }) => {
    await learnLive(page, 'flappy', 25);
    await expect(page.getByTestId('speed-1')).toHaveAttribute('aria-pressed', 'true');
    await shot(page, '05-flappy-learn');
  });

  test('11 method picker, 06 car learn', async ({ page }) => {
    await page.goto('/car/1');
    await waitFrames(page, 20);
    await page.getByTestId('step-3').click();
    await expect(page.getByTestId('method-dqn')).toBeDisabled();
    await expect(page.getByTestId('method-reason-dqn')).toBeVisible();
    await shot(page, '11-method-picker');
    await learnLive(page, 'car', 15);
    await shot(page, '06-car-learn');
  });

  test('07 tetris learn', async ({ page }) => {
    await learnLive(page, 'tetris', 6, 120000);
    await shot(page, '07-tetris-learn');
  });

  test('08 walker learn', async ({ page }) => {
    test.setTimeout(300000);
    await page.goto('/walker/4');
    await startTraining(page, { population: 40 });
    await waitIterations(page, 12, 240000);
    // At MAX the stage replays champions: wait for one that has walked a few metres.
    await expect(page.locator('[data-testid="stage"] canvas[data-kind="3d"]')).toBeVisible();
    await expect.poll(async () => parseFloat((await page.getByTestId('hud-distance').textContent())!), { timeout: 120000 }).toBeGreaterThan(1.5);
    await expect(page.getByTestId('error-banner')).toBeHidden();
    await shot(page, '08-walker-learn');
  });

  test('12 dqn pong', async ({ page }) => {
    await page.goto('/pong/3');
    await startTraining(page, { method: 'dqn' });
    await expect.poll(() => attr(page.getByTestId('loss-chart'), 'data-points'), { timeout: 90000 }).toBeGreaterThanOrEqual(25);
    await expect(page.getByTestId('outputs-bar')).toBeVisible();
    await shot(page, '12-dqn-pong');
  });

  test('13 ppo car', async ({ page }) => {
    await page.goto('/car/3');
    await startTraining(page, { method: 'ppo' });
    await waitIterations(page, 40, 90000);
    await expect(page.getByTestId('explore-chart')).toBeVisible();
    await shot(page, '13-ppo-car');
  });

  test('15 generated concept', async ({ page }) => {
    await page.goto('/create');
    await page.getByTestId('new-concept-paste').click();
    await page.getByTestId('new-concept-paste-input').fill(toResponse(GOOD));
    await page.getByTestId('new-concept-paste-submit').click();
    await expect(page).toHaveURL(/4173\/gen-/);
    await expect(page.getByTestId('badge-generated')).toBeVisible();
    await startTraining(page);
    await waitIterations(page, 10);
    await page.getByTestId('speed-1').click();
    await waitFrames(page, 30);
    await shot(page, '15-generated');
  });
});
