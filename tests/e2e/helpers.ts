import { expect, type Locator, type Page } from '@playwright/test';

export async function attr(loc: Locator, name: string): Promise<number> { return Number(await loc.getAttribute(name)); }

/** The visible element with this test id: steps 3 and 4 each keep their own network panel in the DOM. */
export function vis(page: Page, testid: string): Locator { return page.locator(`[data-testid="${testid}"]:visible`); }

/**
 * Waits until the stage has shown `n` more frames. While playing, an episode can end before that (an unsteered Snake hits
 * the wall after 6 ticks), so a finished episode is restarted.
 */
export async function waitFrames(page: Page, n: number, timeout = 20000): Promise<void> {
  const stage = page.getByTestId('stage'), target = (await attr(stage, 'data-frames')) + n;
  await expect.poll(async () => {
    if (await page.getByText('Episode over').isVisible()) {
      await page.getByTestId('play-restart').click();
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });   // Space must reach the game, not the button
    }
    return attr(stage, 'data-frames');
  }, { timeout }).toBeGreaterThanOrEqual(target);
}

/** Goes to step 3 when a method is given, then to step 4; sets the population and speed (`max`, `1`, `10`...) and starts. */
export async function startTraining(page: Page, opts: { method?: 'neat' | 'dqn' | 'ppo'; population?: number; speed?: string } = {}): Promise<void> {
  if (opts.method) {
    await page.getByTestId('step-3').click();
    await page.getByTestId(`method-${opts.method}`).check();
  }
  await page.getByTestId('step-4').click();
  if (opts.population !== undefined) {
    const input = page.getByTestId('run-population');
    await input.fill(String(opts.population));
    await input.press('Enter');
    await expect(input).toHaveValue(String(opts.population));
  }
  await page.getByTestId(`speed-${opts.speed ?? 'max'}`).click();
  await page.getByTestId('btn-start').click();
}

/** Polls the fitness chart: one point per NEAT generation or PPO update, one per episode for DQN. */
export async function waitIterations(page: Page, n: number, timeout = 60000): Promise<void> {
  await expect.poll(() => attr(page.getByTestId('fitness-chart'), 'data-points'), { timeout }).toBeGreaterThanOrEqual(n);
}

/** The number in a stats-strip cell (`iteration`, `explore`, `params`...); NaN while it shows a dash. */
export async function statValue(page: Page, id: string): Promise<number> {
  return Number(await page.getByTestId(`stat-${id}`).locator('.stat-value').textContent());
}

/** Raw counter of one reward term in the play panel. */
export async function termValue(page: Page, key: string): Promise<number> {
  return Number(await page.getByTestId(`term-${key}`).locator('.num').first().textContent());
}

/** Attaches `pageerror` and console-error listeners; returns the live array. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // The LLM-proxy probe answers 400 by design (src/gen/settings.ts detectMode) and Chromium logs every failed request.
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.includes('/api/llm/')) errors.push(`console: ${m.text()}`); });
  return errors;
}
