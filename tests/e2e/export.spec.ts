import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { ChampionExport } from '../../src/persist/exportImport';
import { startTraining, waitFrames, waitIterations } from './helpers';

test('pong: export a champion, import it in a fresh browser profile, refuse it for another concept', async ({ page, browser, baseURL }) => {
  await page.goto('/pong/4');
  await startTraining(page);
  await waitIterations(page, 3);
  await page.getByTestId('btn-pause').click();
  await page.getByTestId('hof-item').first().click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-mode', 'replay');
  const downloading = page.waitForEvent('download');
  await page.getByTestId('btn-export').click();
  const download = await downloading, file = await download.path();
  expect(download.suggestedFilename()).toBe('evolab-pong-neat-g1.json');
  const data: ChampionExport = JSON.parse(readFileSync(file, 'utf8'));
  expect(data).toMatchObject({ format: 'evolab-champion', version: 1, env: { id: 'pong' }, learner: { kind: 'neat' }, policy: { kind: 'neat' }, iteration: 1 });

  // A new context has empty storage: the champion comes from the file alone.
  const context = await browser.newContext({ baseURL });
  try {
    const fresh = await context.newPage(), stage = fresh.getByTestId('stage');
    await fresh.goto('/pong/4');
    await expect(fresh.getByTestId('hof-item')).toHaveCount(0);
    await fresh.getByTestId('input-import').setInputFiles(file);
    await expect(fresh.getByTestId('hof-item')).toHaveText(/imported/);
    await expect(stage).toHaveAttribute('data-mode', 'replay');
    await expect(fresh.getByTestId('stage-header')).toHaveText('Replay: imported champion');
    await waitFrames(fresh, 5);

    await fresh.goto('/snake/4');
    await expect(fresh.locator('.crumb .here')).toHaveText('Snake');
    await fresh.getByTestId('input-import').setInputFiles(file);
    await expect(fresh.locator('.hof-panel .errors')).toContainText('This champion is for "pong", not "snake"');
    await expect(fresh.getByTestId('hof-item')).toHaveCount(0);
  } finally { await context.close(); }
});
