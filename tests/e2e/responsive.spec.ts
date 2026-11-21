import { expect, test, type Page } from '@playwright/test';

/** Wall time for 30 requestAnimationFrame callbacks: 500 ms on an idle 60 Hz page, far more when the main thread is starved. */
const thirtyFrames = (page: Page) => page.evaluate(() => new Promise<number>((resolve) => {
  const t0 = performance.now();
  let n = 0;
  const tick = () => { if (++n >= 30) resolve(performance.now() - t0); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));

// Training at MAX must never starve the main thread: frames keep coming and controls keep answering.
for (const [env, method] of [['pong', 'neat'], ['snake', 'neat'], ['pong', 'ppo'], ['snake', 'dqn']] as const) {
  const id = method === 'neat' ? env : `${env} with ${method.toUpperCase()}`;
  test(`${id}: the UI stays responsive after 20 s at MAX`, async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(`card-${env}`).click();
    await page.getByTestId('step-3').click();
    await page.getByTestId(`method-${method}`).check();
    await page.getByTestId('step-4').click();
    // Headless Chromium does not always deliver 60 frames per second even to an idle page (30 callbacks took 1.1-1.6 s
    // on about:blank where this was written), so the frame budget is the larger of 1500 ms and 1.5x this page's idle time.
    const idleMs = Math.max(await thirtyFrames(page), await thirtyFrames(page));
    await page.getByTestId('speed-max').click();
    await page.getByTestId('btn-start').click();
    await page.waitForTimeout(20000);
    const generations = Number(await page.getByTestId('fitness-chart').getAttribute('data-points'));
    const rafMs = await thirtyFrames(page);
    const t0 = Date.now();
    await page.getByTestId('speed-1').click({ timeout: 60000 });
    const clickMs = Date.now() - t0;
    console.log(`[responsive] ${id}: ${generations} generations, 30 rAF callbacks ${rafMs.toFixed(0)} ms (idle ${idleMs.toFixed(0)} ms), speed-1 click ${clickMs} ms`);
    expect(generations).toBeGreaterThan(1);
    expect(rafMs).toBeLessThan(Math.max(1500, 1.5 * idleMs));
    expect(clickMs).toBeLessThan(1000);
    await expect(page.getByTestId('error-banner')).toBeHidden();
  });
}
