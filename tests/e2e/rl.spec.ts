import { expect, test } from '@playwright/test';
import { attr, startTraining, statValue, vis, waitFrames, waitIterations } from './helpers';

test('pong with DQN: picker, RL charts, replay', async ({ page }) => {
  await page.goto('/#/c/pong/3');
  await page.getByTestId('method-dqn').check();
  await expect(page.getByTestId('method-explainer')).toContainText('replay buffer');
  await startTraining(page);
  await expect.poll(() => attr(page.getByTestId('loss-chart'), 'data-points'), { timeout: 90000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('explore-chart')).toBeVisible();
  await expect(page.getByTestId('species-chart')).toBeHidden();
  await expect(page.getByTestId('outputs-bar')).toBeVisible();
  await page.getByTestId('btn-pause').click();
  await page.getByTestId('hof-item').first().click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-mode', 'replay');
  await expect(page.getByTestId('error-banner')).toBeHidden();
});

test('car: DQN is disabled with a reason, PPO trains', async ({ page }) => {
  await page.goto('/#/c/car/3');
  await expect(page.getByTestId('method-dqn')).toBeDisabled();
  await expect(page.getByTestId('method-reason-dqn')).toContainText('continuous');
  await startTraining(page, { method: 'ppo' });
  await waitIterations(page, 2, 90000);
  await expect(page.getByTestId('error-banner')).toBeHidden();
});

test('snake with DQN: loss, epsilon, Q-values and the fixed 32-32 network', async ({ page }) => {
  await page.goto('/#/c/snake/3');
  await page.getByTestId('method-dqn').check();
  const [, inputs, outputs] = (await page.locator('.nn-foot').innerText()).match(/(\d+) inputs -> (\d+) outputs/)!;
  const nodes = Number(inputs) + 32 + 32 + Number(outputs);
  await expect(page.getByTestId('nn-graph')).toHaveAttribute('data-nodes', String(nodes));
  await startTraining(page);
  await expect.poll(() => attr(page.getByTestId('loss-chart'), 'data-points'), { timeout: 90000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('explore-chart')).toBeVisible();
  const epsilon = await statValue(page, 'explore');
  expect(epsilon).toBeGreaterThan(0);
  expect(epsilon).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('outputs-bar')).toBeVisible();
  await expect(vis(page, 'nn-graph')).toHaveAttribute('data-nodes', String(nodes));
  await expect(page.getByTestId('error-banner')).toBeHidden();
});

test('flappy with PPO: entropy chart, parameter count, champion replay', async ({ page }) => {
  await page.goto('/#/c/flappy/3');
  await startTraining(page, { method: 'ppo' });
  await waitIterations(page, 2, 90000);
  await expect(page.getByTestId('explore-chart')).toBeVisible();
  await expect(page.getByTestId('stat-explore')).toContainText('Entropy');
  expect(await statValue(page, 'params')).toBeGreaterThan(1000);
  await page.getByTestId('btn-pause').click();
  await page.getByTestId('hof-item').first().click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-mode', 'replay');
  await waitFrames(page, 5);
  await expect(page.getByTestId('error-banner')).toBeHidden();
});

test('walker with PPO reaches two updates', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/#/c/walker/3');
  await expect(page.getByTestId('method-dqn')).toBeDisabled();
  await startTraining(page, { method: 'ppo' });
  await waitIterations(page, 2, 180000);
  await expect(page.getByTestId('stat-iteration')).toContainText('Update');
  await expect(page.getByTestId('error-banner')).toBeHidden();
});

test('tetris: DQN and PPO are disabled with visible reasons', async ({ page }) => {
  await page.goto('/#/c/tetris/3');
  for (const kind of ['dqn', 'ppo']) {
    await expect(page.getByTestId(`method-${kind}`)).toBeDisabled();
    await expect(page.getByTestId(`method-reason-${kind}`)).toBeVisible();
    await expect(page.getByTestId(`method-reason-${kind}`)).toContainText('placement');
  }
  await expect(page.getByTestId('method-neat')).toBeChecked();
});

test('switching method during a run offers a restart with the new method', async ({ page }) => {
  await page.goto('/#/c/pong/4');
  await startTraining(page);
  await waitIterations(page, 3);
  await expect(page.getByTestId('stat-iteration')).toContainText('Generation');
  await page.getByTestId('speed-1').click();              // x1: the restarted run stays on its first update long enough to read
  await page.getByTestId('step-3').click();
  await expect(page.getByTestId('method-note')).toBeHidden();
  await page.getByTestId('method-ppo').check();
  await expect(page.getByTestId('method-restart')).toHaveText('Restart with PPO');
  await page.getByTestId('method-restart').click();
  await expect(page.getByTestId('method-note')).toBeHidden();
  await page.getByTestId('step-4').click();
  await expect(page.getByTestId('stat-iteration')).toContainText('Update');
  expect(await statValue(page, 'iteration')).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('species-chart')).toBeHidden();
  await expect(page.getByTestId('error-banner')).toBeHidden();
});
