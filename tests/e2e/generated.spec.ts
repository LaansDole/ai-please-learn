import { expect, test } from '@playwright/test';
import { GOOD, INFINITE_LOOP, WRONG_SIZE, toResponse } from '../../src/gen/fixtures';
import { startFakeLlm } from './fakeLlm';

test('concept from text: repair once, then play, train, and find it in the gallery', async ({ page }) => {
  // The repaired answer is held back until the log shows the repair round: unheld, validate -> repair -> save -> navigate
  // finishes between two polls and the log is gone before the assertion can see it.
  const hold = Promise.withResolvers<void>();
  const llm = await startFakeLlm([toResponse(WRONG_SIZE), toResponse(GOOD)], hold.promise);
  try {
    await page.goto('/settings');
    await page.getByTestId('settings-base-url').fill(llm.baseUrl);
    await page.getByTestId('settings-model').fill('fake-model');
    await page.getByTestId('settings-model').blur();
    await expect(page.getByTestId('settings-mode-active')).toContainText('proxy');
    await page.getByTestId('settings-test').click();
    await expect(page.getByTestId('settings-test-result')).toContainText('Connected');
    await expect(page.locator('[data-testid="settings-model-options"] option')).toHaveAttribute('value', 'fake-model');
    await page.goto('/create');
    await page.getByTestId('new-concept-input').fill('slide a dot onto a target');
    await page.getByTestId('new-concept-submit').click();
    await expect(page.getByTestId('new-concept-log')).toContainText('repairing 1/3', { timeout: 30000 });
    hold.resolve();
    await expect(page).toHaveURL(/4173\/gen-reach-the-target-[0-9a-f]{4}\/1$/, { timeout: 30000 });
    const stage = page.getByTestId('stage');
    await expect.poll(async () => Number(await stage.getAttribute('data-frames'))).toBeGreaterThan(10);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => Number(await page.getByTestId('term-effort').locator('.num').first().textContent())).toBeGreaterThan(0);
    await page.keyboard.up('ArrowRight');
    await page.getByTestId('step-4').click();
    await page.getByTestId('speed-max').click();
    await page.getByTestId('btn-start').click();
    await expect.poll(async () => Number(await page.getByTestId('fitness-chart').getAttribute('data-points')), { timeout: 60000 }).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('error-banner')).toBeHidden();
    // Generated envs run in the locked-down worker; MAX must leave the main thread as responsive as for built-ins.
    await page.waitForTimeout(5000);
    const t0 = Date.now();
    await page.getByTestId('speed-1').click({ timeout: 60000 });
    expect(Date.now() - t0).toBeLessThan(1000);
    await page.goto('/');
    const card = page.locator('[data-testid^="card-gen-reach-the-target-"]').first();
    await expect(card.getByTestId('badge-generated')).toBeVisible();
    expect(llm.requests.length).toBe(2);
    expect(llm.requests[1]!.messages.at(-1)!.content).toContain('failed validation');
  } finally { await llm.close(); }
});

test('manual paste fallback, view source, export, delete; hung modules time out', async ({ page }) => {
  await page.goto('/create');
  await page.getByTestId('new-concept-paste').click();
  await page.getByTestId('new-concept-paste-input').fill(toResponse(INFINITE_LOOP));
  await page.getByTestId('new-concept-paste-submit').click();
  await expect(page.getByTestId('new-concept-errors')).toContainText('timed out', { timeout: 15000 });
  await page.getByTestId('new-concept-paste-input').fill(toResponse(GOOD));
  await page.getByTestId('new-concept-paste-submit').click();
  await expect(page).toHaveURL(/4173\/gen-/);
  await page.goto('/');
  const card = page.locator('[data-testid^="card-gen-"]').first();
  const id = (await card.getAttribute('data-testid'))!.slice('card-'.length);
  await page.getByTestId(`card-source-${id}`).click();
  await expect(page.getByTestId('source-modal')).toContainText('function createEnv(sdk)');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('source-modal')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByTestId(`card-export-${id}`).click();
  expect((await download).suggestedFilename()).toBe(`${id}.evolab-concept.json`);
  page.once('dialog', (d) => d.accept());
  await page.getByTestId(`card-delete-${id}`).click();
  await expect(page.getByTestId(`card-${id}`)).toHaveCount(0);
});
