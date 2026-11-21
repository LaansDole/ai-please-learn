import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120000,
  workers: 1,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'npm run dev -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true },
});
