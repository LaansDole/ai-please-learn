import { expect, test } from '@playwright/test';
import { SMOKE_ENVS } from './envs';

for (const id of SMOKE_ENVS) {
  test(`${id}: play, evolve at MAX, replay from the hall of fame`, async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(`card-${id}`).click();
    const stage = page.getByTestId('stage');
    await expect(stage).toHaveAttribute('data-mode', 'play');
    if (id === 'walker') await expect(page.locator('[data-testid="stage"] canvas[data-kind="3d"]')).toBeVisible();
    // Deviation from the plan: an unsteered Snake hits the wall after 6 ticks and the episode (and its frames) ends,
    // so restart the episode whenever it is over; `data-frames` counts every frame the stage has shown.
    await expect.poll(async () => {
      if (await page.getByText('Episode over').isVisible()) await page.getByTestId('play-restart').click();
      return Number(await stage.getAttribute('data-frames'));
    }).toBeGreaterThan(10);
    await page.getByTestId('step-3').click();
    await expect.poll(async () => Number(await page.getByTestId('nn-graph').getAttribute('data-nodes'))).toBeGreaterThan(2);
    await page.getByTestId('step-4').click();
    await page.getByTestId('speed-max').click();
    await page.getByTestId('btn-start').click();
    await expect.poll(async () => Number(await page.getByTestId('fitness-chart').getAttribute('data-points')), { timeout: 90000 }).toBeGreaterThanOrEqual(2);
    await page.getByTestId('btn-pause').click();
    await page.getByTestId('hof-item').first().click();
    await expect(stage).toHaveAttribute('data-mode', 'replay');
    const before = Number(await stage.getAttribute('data-frames'));
    await expect.poll(async () => Number(await stage.getAttribute('data-frames'))).toBeGreaterThan(before + 5);
    await expect(page.getByTestId('error-banner')).toBeHidden();
  });
}
