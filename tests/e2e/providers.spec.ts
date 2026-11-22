import { expect, test } from '@playwright/test';

test('settings: OpenAI by default, LM Studio and Ollama as presets, saved values survive a reload', async ({ page }) => {
  await page.goto('/settings');
  const pressed = (id: string) => expect(page.getByTestId(`settings-provider-${id}`)).toHaveAttribute('aria-pressed', 'true');
  const url = page.getByTestId('settings-base-url'), model = page.getByTestId('settings-model'), help = page.getByTestId('settings-provider-help');
  await pressed('openai');
  await expect(url).toHaveValue('https://api.openai.com/v1');
  await expect(model).toHaveValue('gpt-6-luna');
  await expect(help).toContainText('API key');
  await expect(page.getByTestId('settings-key-help')).toContainText('Required for OpenAI');

  await page.getByTestId('settings-provider-ollama').click();
  await pressed('ollama');
  await expect(url).toHaveValue('http://localhost:11434/v1');
  await expect(model).toHaveValue('qwen2.5-coder:14b');
  await expect(help).toContainText('ollama serve');
  await expect(page.getByTestId('settings-remote-warning')).toBeHidden();

  await page.getByTestId('settings-provider-lmstudio').click();
  await pressed('lmstudio');
  await expect(url).toHaveValue('http://localhost:1234/v1');
  await expect(model).toHaveValue('');                       // LM Studio: the first chat model its /models lists
  await expect(help).toContainText('LM Studio');
  await expect(page.getByTestId('settings-error')).toBeEmpty();

  await model.fill('my-local-model');
  await model.blur();
  await page.reload();
  await pressed('lmstudio');
  await expect(url).toHaveValue('http://localhost:1234/v1');
  await expect(model).toHaveValue('my-local-model');
  await page.goto('/create');
  await expect(page.getByTestId('new-concept')).toContainText('my-local-model via LM Studio');
  await expect(page.getByTestId('new-concept-needs-key')).toHaveCount(0);
});

test('create: OpenAI without a key asks for one in Settings instead of sending a request', async ({ page }) => {
  const calls: string[] = [];
  await page.route('https://api.openai.com/**', (r) => { calls.push(r.request().url()); return r.abort(); });
  await page.goto('/create');
  await expect(page.getByTestId('new-concept')).toContainText('gpt-6-luna via OpenAI');
  await page.getByTestId('new-concept-input').fill('balance a pole on a cart');
  await expect(page.getByTestId('new-concept-submit')).toBeDisabled();
  await page.getByTestId('new-concept-input').press('Enter');
  await page.getByTestId('new-concept-needs-key').getByRole('link').click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByTestId('settings-api-key').fill('not-a-real-key');
  await page.getByTestId('settings-api-key').blur();
  await page.goto('/create');
  await expect(page.getByTestId('new-concept-needs-key')).toHaveCount(0);
  await page.getByTestId('new-concept-input').fill('balance a pole on a cart');
  await expect(page.getByTestId('new-concept-submit')).toBeEnabled();
  expect(calls).toEqual([]);
});

test('settings saved before providers existed keep their values under the matching preset', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('evolab.settings.v1', JSON.stringify({ baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', apiKey: '', mode: 'auto' })));
  await page.goto('/settings');
  await expect(page.getByTestId('settings-provider-ollama')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('settings-base-url')).toHaveValue('http://localhost:11434/v1');
  await expect(page.getByTestId('settings-model')).toHaveValue('llama3.2');
});

test('settings: a Test connection reply that arrives after the provider changed is dropped', async ({ page }) => {
  // The proxy probe carries no base-URL header and goes through; the model list of the LM Studio preset answers late.
  await page.route('**/api/llm/models', async (r) => {
    if (!r.request().headers()['x-evolab-base-url']) return r.continue();
    await new Promise((done) => setTimeout(done, 600));
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'lm-studio-model' }] }) });
  });
  await page.goto('/settings');
  await page.getByTestId('settings-provider-lmstudio').click();
  await page.getByTestId('settings-test').click();
  await expect(page.getByTestId('settings-test')).toBeDisabled();
  await page.getByTestId('settings-provider-openai').click();
  await expect(page.getByTestId('settings-test')).toBeEnabled();              // the late reply has arrived
  await expect(page.getByTestId('settings-model')).toHaveValue('gpt-6-luna');
  await expect(page.getByTestId('settings-test-result')).toBeEmpty();
  await page.reload();
  await expect(page.getByTestId('settings-provider-openai')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('settings-model')).toHaveValue('gpt-6-luna');
});
