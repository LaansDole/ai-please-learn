import { expect, test } from '@playwright/test';
import { attr, startTraining, statValue, waitIterations } from './helpers';

test('snake: a reward change mid-run marks the chart, survives a reload, and bad JSON changes nothing', async ({ page }) => {
  const chart = page.getByTestId('fitness-chart'), food = page.getByTestId('weight-num-food');
  await page.goto('/#/c/snake/4');
  await startTraining(page, { population: 150 });
  await waitIterations(page, 2);
  await page.getByTestId('btn-pause').click();
  await expect(page.getByTestId('btn-pause')).toHaveText('Resume');
  expect(await attr(chart, 'data-markers')).toBe(0);
  const before = await statValue(page, 'iteration');
  await page.getByTestId('btn-pause').click();

  await page.getByTestId('step-2').click();
  await expect(food).toHaveValue('10');
  await page.getByTestId('preset-survivalist').click();
  await expect(food).toHaveValue('5');
  await expect(page.locator('.reward-note')).toContainText('Applies from the next generation');
  await page.getByTestId('step-4').click();
  await expect.poll(() => attr(chart, 'data-markers'), { timeout: 30000 }).toBe(1);
  // The run went on through the change: the counter never went back.
  const after = await statValue(page, 'iteration');
  expect(after).toBeGreaterThan(before);
  await expect.poll(() => statValue(page, 'iteration')).toBeGreaterThan(after);

  await page.reload();
  await page.getByTestId('step-2').click();
  await expect(food).toHaveValue('5');
  await expect(page.getByTestId('preset-survivalist')).toHaveAttribute('aria-pressed', 'true');

  const json = page.getByTestId('reward-json'), errors = page.getByTestId('reward-errors').locator('li');
  await json.fill('{ "weights": ');
  await page.getByTestId('reward-json-apply').click();
  await expect(errors.first()).toContainText('Not valid JSON');
  await expect(food).toHaveValue('5');
  await json.fill(JSON.stringify({ version: 1, envId: 'snake', weights: { food: -3 } }));
  await page.getByTestId('reward-json-apply').click();
  await expect(errors.first()).toContainText('must be >= 0');
  await expect(food).toHaveValue('5');
  await json.fill(JSON.stringify({ version: 1, envId: 'snake', preset: null, weights: { food: 3, approach: 0, retreat: 0, death: 20, starve: 2, survive: 0.05 } }));
  await page.getByTestId('reward-json-apply').click();
  await expect(food).toHaveValue('3');
  await expect(errors).toHaveCount(0);
  await expect(page.getByTestId('preset-survivalist')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('error-banner')).toBeHidden();
});
