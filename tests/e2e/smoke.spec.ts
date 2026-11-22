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
  await expect(page).toHaveURL(/4173\/create$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make your own');
  await expect(page.getByTestId('nav-create')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('nav-gallery')).not.toHaveAttribute('aria-current');
  for (const id of ['new-concept-input', 'new-concept-submit', 'new-concept-paste', 'concept-import']) await expect(page.getByTestId(id)).toBeAttached();
  await expect(page.getByTestId('new-concept-input')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/4173\/create$/);
  await expect(page.getByTestId('new-concept-input')).toBeVisible();
  await page.getByTestId('nav-gallery').click();
  await page.getByTestId('card-create').click();
  await expect(page).toHaveURL(/4173\/create$/);
  await expect(page.getByTestId('new-concept')).toBeVisible();
  expect(errors).toEqual([]);
});

test('router: the open page\'s own tab keeps the page, Back returns to where the reader was', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 500 });
  await page.goto('/create');
  await page.getByTestId('new-concept-input').fill('balance a pole on a cart');
  await page.getByTestId('nav-create').click();
  await expect(page.getByTestId('new-concept-input')).toHaveValue('balance a pole on a cart');   // not remounted: the form is not wiped

  await page.goto('/');
  await page.getByTestId('card-create').scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(100);
  await page.getByTestId('card-create').click();
  await expect(page.getByTestId('create')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);                                      // a link opens its page at the top
  await page.goBack();
  await expect(page.getByTestId('gallery')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
});

test('the Demo tab opens the recorded demo, whose top bar is the app\'s and leads back', async ({ page }) => {
  const errors = collectErrors(page), TABS = ['Gallery', 'Create', 'Demo', 'Settings', 'GitHub'];
  for (const url of ['/snake/1', '/settings', '/create', '/']) {
    await page.goto(url);
    await expect(page.getByTestId('nav-demo')).toHaveAttribute('href', '/demo/');
    await expect(page.getByTestId('nav-demo')).not.toHaveAttribute('aria-current');
  }
  await expect(page.locator('.topnav a')).toHaveText(TABS);
  await page.evaluate(() => { document.body.dataset.same = '1'; });
  await page.getByTestId('nav-demo').click();
  await expect(page).toHaveURL(/4173\/demo\/$/);
  await expect(page.locator('body')).not.toHaveAttribute('data-same');        // a page load, not a route
  await expect(page.locator('.topnav a')).toHaveText(TABS);
  await expect(page.locator('.topnav [aria-current="page"]')).toHaveText('Demo');
  await expect(page.locator('.brand')).toHaveText('EvoLab');

  // Chapters are buttons: keyboard reaches them, and one press seeks the video and marks the step.
  const step = page.getByRole('button', { name: /Switch to DQN/ });
  await step.focus();
  await page.keyboard.press('Enter');
  await expect(step).toHaveAttribute('aria-current', 'step');
  await expect.poll(() => page.getByTestId('demo-video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(96);

  for (const [tab, testid, path] of [['nav-settings', 'settings', 'settings'], ['nav-create', 'create', 'create'], ['nav-gallery', 'gallery', '']] as const) {
    await page.getByTestId(tab).click();
    await expect(page).toHaveURL(new RegExp(`4173/${path}$`));
    await expect(page.getByTestId(testid)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/4173\/demo\/$/);
  }
  await page.locator('.brand').click();
  await expect(page.getByTestId('gallery')).toBeVisible();
  expect(errors).toEqual([]);
});
