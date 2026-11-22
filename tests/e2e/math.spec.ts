import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers';

test('the Math tab opens the report: equations typeset, contents jump within the page, Back returns', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/settings');
  await expect(page.getByTestId('nav-math')).toHaveText('Math');
  await expect(page.locator('.topnav a')).toHaveText(['Gallery', 'Create', 'Demo', 'Math', 'Settings', 'GitHub']);
  await page.evaluate(() => { document.body.dataset.same = '1'; });
  await page.getByTestId('nav-math').click();
  await expect(page).toHaveURL(/4173\/math$/);
  await expect(page.getByTestId('nav-math')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How the learners work');

  const doc = page.getByTestId('math-doc');
  await expect(doc.locator('h2')).toHaveCount(13);
  expect(await doc.locator('.katex').count()).toBeGreaterThanOrEqual(20);
  await expect(doc.locator('.katex-error')).toHaveCount(0);
  // The math is typeset in KaTeX's own face, loaded from this origin.
  await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.includes('KaTeX') && f.status === 'loaded'))).toBe(true);
  // A wide equation scrolls inside its plate, never the page.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The contents list every section and jump to it without leaving the page.
  const toc = page.getByTestId('math-toc').locator('a');
  await expect(toc).toHaveCount(13);
  await expect(toc.first()).toHaveText('Purpose of ai-please-learn');
  await toc.filter({ hasText: 'Room for improvement' }).click();
  await expect(page).toHaveURL(/4173\/math#11-room-for-improvement$/);
  await expect(page.locator('[id="11-room-for-improvement"]')).toBeInViewport();
  await expect(toc.filter({ hasText: 'Room for improvement' })).toHaveAttribute('aria-current');
  expect(await page.evaluate(() => document.body.dataset.same)).toBe('1');
  await expect(doc.locator('h2')).toHaveCount(13);

  // Back leaves the section first, then the report.
  await page.goBack();
  await expect(page).toHaveURL(/4173\/math$/);
  await expect(doc.locator('h2')).toHaveCount(13);
  await page.goBack();
  await expect(page).toHaveURL(/4173\/settings$/);
  await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('a deep link to a section of the report survives a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/math#6-ppo');
  await expect(page.locator('[id="6-ppo"]')).toBeInViewport();
  await page.reload();
  await expect(page.getByTestId('nav-math')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[id="6-ppo"]')).toBeInViewport();
  expect(await page.getByTestId('math-doc').locator('.katex').count()).toBeGreaterThanOrEqual(20);
  expect(errors).toEqual([]);
});
