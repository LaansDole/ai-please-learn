import { expect, test } from '@playwright/test';
import { termValue, waitFrames } from './helpers';

test('R restarts the game on step 1 after a game over and mid-game, and only there', async ({ page }) => {
  await page.goto('/snake/1');
  const restart = page.getByTestId('play-restart');
  await expect(restart.locator('kbd')).toHaveText('R');
  await expect(restart).toHaveAttribute('aria-keyshortcuts', 'R');
  // An unsteered snake hits the wall after 6 ticks.
  await expect(page.getByText('Episode over')).toBeVisible();
  const dead = await termValue(page, 'survive');
  await page.keyboard.press('r');
  await expect(page.getByText('Episode over')).toBeHidden();
  await expect.poll(() => termValue(page, 'survive'), { intervals: [20] }).toBeLessThan(dead);

  // Mid-game: Pong never ends on its own this fast, and its jitter counter only rises while the paddle moves.
  await page.goto('/pong/1');
  await waitFrames(page, 10);
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => termValue(page, 'jitter')).toBeGreaterThan(0);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('r');
  await expect.poll(() => termValue(page, 'jitter'), { intervals: [20] }).toBe(0);
  await expect(page.getByText('Episode over')).toBeHidden();

  // Step 2: the play panel is gone, so R does nothing (the stage keeps its last frame count).
  await page.getByTestId('step-2').click();
  await expect(restart).toHaveCount(0);
  const frames = await page.getByTestId('stage').getAttribute('data-frames');
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('stage')).toHaveAttribute('data-frames', frames!);
});

test('the walker binds R to a knee, so its restart shortcut falls back to N', async ({ page }) => {
  await page.goto('/walker/1');
  await expect(page.getByTestId('play-restart').locator('kbd')).toHaveText('N');
});

test('the top bar links to the repository on every page', async ({ page }) => {
  for (const url of ['/', '/snake/1', '/settings', '/create']) {
    await page.goto(url);
    const link = page.getByTestId('nav-repo');
    await expect(link).toHaveAttribute('href', 'https://github.com/LaansDole/ai-please-learn');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAccessibleName('EvoLab on GitHub');
    await expect(link.locator('svg')).toBeVisible();
  }
});
