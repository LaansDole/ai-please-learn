import { expect, test } from '@playwright/test';
import { JOURNEY_ENVS } from './envs';
import { collectErrors } from './helpers';

test('gallery lists the six built-in concepts and the new-concept box', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('gallery')).toBeVisible();
  for (const env of JOURNEY_ENVS) {
    const card = page.getByTestId(`card-${env.id}`);
    await expect(card.locator('h2')).toHaveText(env.name);
    await expect(card.locator('.badge-dim')).toHaveText(env.dims.toUpperCase());
  }
  await expect(page.locator('a.card')).toHaveCount(JOURNEY_ENVS.length);          // reach1d stays hidden
  await expect(page.getByTestId('new-concept')).toBeVisible();
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  expect(errors).toEqual([]);
});
