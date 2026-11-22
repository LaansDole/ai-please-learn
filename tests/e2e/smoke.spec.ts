import { expect, test } from '@playwright/test';
import { JOURNEY_ENVS } from './envs';
import { collectErrors } from './helpers';

test('gallery lists the six built-in concepts and the way to make your own', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('gallery')).toBeVisible();
  for (const env of JOURNEY_ENVS) {
    const card = page.getByTestId(`card-${env.id}`);
    await expect(card.locator('h2')).toHaveText(env.name);
    await expect(card.locator('.badge-dim')).toHaveText(env.dims.toUpperCase());
  }
  await expect(page.locator('a.card:not([data-testid="card-create"])')).toHaveCount(JOURNEY_ENVS.length);          // reach1d stays hidden
  await expect(page.getByTestId('nav-gallery')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('"Make your own" lives on its own page: nav tab, gallery card, reload', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('gallery')).toBeVisible();
  await expect(page.getByTestId('new-concept-input')).toHaveCount(0);
  await expect(page.getByTestId('concept-import')).toHaveCount(0);
  await page.getByTestId('nav-create').click();
  await expect(page).toHaveURL(/#\/create$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make your own');
  await expect(page.getByTestId('nav-create')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('nav-gallery')).not.toHaveAttribute('aria-current');
  for (const id of ['new-concept-input', 'new-concept-submit', 'new-concept-paste', 'concept-import']) await expect(page.getByTestId(id)).toBeAttached();
  await expect(page.getByTestId('new-concept-input')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/#\/create$/);
  await expect(page.getByTestId('new-concept-input')).toBeVisible();
  await page.getByTestId('nav-gallery').click();
  await page.getByTestId('card-create').click();
  await expect(page).toHaveURL(/#\/create$/);
  await expect(page.getByTestId('new-concept')).toBeVisible();
  expect(errors).toEqual([]);
});
