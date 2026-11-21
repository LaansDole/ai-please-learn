import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173', viewport: { width: 1440, height: 900 },
    // Software WebGL so the 3D stage works in headless Chromium. 2D canvases stay on the CPU rasteriser: routed through
    // SwiftShader they made a frame take 230 ms while training at MAX (responsive.spec.ts measured 7 s for 30 frames).
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-accelerated-2d-canvas'] },
  },
  webServer: { command: 'npm run dev -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true },
});
