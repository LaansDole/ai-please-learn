import { expect, test } from '@playwright/test';
import { JOURNEY_ENVS } from './envs';
import { attr, collectErrors, startTraining, statValue, termValue, vis, waitFrames, waitIterations } from './helpers';

const SPEEDS = ['speed-1', 'speed-2', 'speed-5', 'speed-10', 'speed-100', 'speed-1000', 'speed-max'];

for (const env of JOURNEY_ENVS) {
  test(`${env.id}: play, shape the reward, see the network, learn, control speed, replay`, async ({ page }) => {
    test.setTimeout(env.timeout + 180000);
    const errors = collectErrors(page);
    const stage = page.getByTestId('stage'), banner = page.getByTestId('error-banner');

    // 1. Gallery -> concept page.
    await page.goto('/');
    await page.getByTestId(`card-${env.id}`).click();
    await expect(page).toHaveURL(new RegExp(`4173/${env.id}(/1)?$`));
    await expect(page.locator('.crumb .here')).toHaveText(env.name);
    await expect(page.getByTestId('stage-header')).toHaveText('You are playing');

    // 2. Play: frames arrive on the right kind of canvas, a held key moves a reward term, restart resets it.
    await waitFrames(page, 10);
    await expect(stage.locator('canvas:visible')).toHaveAttribute('data-kind', env.dims);
    await page.keyboard.down(env.key);
    await expect.poll(() => termValue(page, env.term)).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    await page.keyboard.up(env.key);
    await expect(page.getByTestId('play-fitness')).toHaveText(/^-?\d+\.\d\d$/);
    // Several terms count time, so they are above zero again a frame after the restart: the reset shows as a drop.
    const before = await termValue(page, env.term);
    await page.getByTestId('play-restart').click();
    await expect.poll(() => termValue(page, env.term), { intervals: [20] }).toBeLessThan(before);

    // 3. Reward: a preset changes the weights; an exact weight shows up in the JSON.
    await page.getByTestId('step-2').click();
    const weights = page.locator('[data-testid^="weight-num-"]');
    const values = () => weights.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value).join());
    const defaults = await values();
    await page.locator('[data-testid^="preset-"]').nth(1).click();
    expect(await values()).not.toBe(defaults);
    const firstKey = (await weights.first().getAttribute('data-testid'))!.slice('weight-num-'.length);
    await weights.first().fill('7');
    await expect(page.getByTestId('reward-json')).toHaveValue(new RegExp(`"${firstKey}": 7\\b`));

    // 4. Network: NEAT starts with exactly the inputs and outputs the panel names.
    await page.getByTestId('step-3').click();
    const [, inputs, outputs] = (await page.locator('.nn-foot').innerText()).match(/(\d+) inputs -> (\d+) outputs/)!;
    await expect(page.getByTestId('nn-graph')).toHaveAttribute('data-nodes', String(Number(inputs) + Number(outputs)));
    await page.getByTestId('nn-graph').hover();

    // 5. Learn at MAX.
    await startTraining(page, { population: env.population, speed: 'max' });
    await waitIterations(page, 3, env.timeout);
    expect(await statValue(page, 'iteration')).toBeGreaterThanOrEqual(3);
    await expect(page.getByTestId('stat-population')).toContainText(String(env.population));
    await expect(page.getByTestId('speed-actual')).toHaveText(/\d/);
    await expect(page.getByTestId('species-chart')).toBeVisible();

    // 6. Speed ladder.
    for (const id of SPEEDS) {
        await page.getByTestId(id).click();
      await expect(page.getByTestId(id)).toHaveAttribute('aria-pressed', 'true');
      await expect(banner).toBeHidden();
      if (id === 'speed-1') {
        await expect(stage).toHaveAttribute('data-mode', 'live');
        await waitFrames(page, 5);
      }
    }

    // 7. Pause holds the iteration counter; step advances it by exactly one.
    await page.getByTestId('btn-pause').click();
    await expect(page.getByTestId('btn-pause')).toHaveText('Resume');
    await page.waitForTimeout(500);
    const paused = await statValue(page, 'iteration');
    await page.waitForTimeout(500);
    expect(await statValue(page, 'iteration')).toBe(paused);
    await page.getByTestId('btn-step').click();
    await expect.poll(() => statValue(page, 'iteration'), { timeout: env.timeout }).toBe(paused + 1);
    await page.waitForTimeout(500);
    expect(await statValue(page, 'iteration')).toBe(paused + 1);

    // 8. Ghosts toggle (2D concepts that can draw them; Tetris cannot) while frames keep arriving at x1.
    const ghosts = page.getByTestId('toggle-ghosts');
    if (env.dims === '2d' && await ghosts.isEnabled()) {
      const was = await ghosts.isChecked();
      await page.getByTestId('speed-1').click();          // also resumes the paused run
      await ghosts.click();
      expect(await ghosts.isChecked()).toBe(!was);
      await waitFrames(page, 5);
    }

    // 9. Replay a champion, then back to live.
    await page.getByTestId('hof-item').first().click();
    await expect(stage).toHaveAttribute('data-mode', 'replay');
    await waitFrames(page, 5);
    await expect(vis(page, 'nn-graph')).toHaveCount(1);
    expect(await attr(vis(page, 'nn-graph'), 'data-nodes')).toBeGreaterThanOrEqual(Number(inputs) + Number(outputs));
    await page.getByTestId('btn-back-live').click();
    await expect(stage).toHaveAttribute('data-mode', 'live');

    // 10. Nothing went wrong along the way.
    await expect(banner).toBeHidden();
    expect(errors).toEqual([]);
  });
}
