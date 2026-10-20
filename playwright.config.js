import { defineConfig } from '@playwright/test';
export default defineConfig({
  outputDir: 'test-results/core', testDir: './tests', testIgnore: '**/pwa/**', timeout: 60_000, workers: 1,
  use: { baseURL: 'http://localhost:5173', channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
});
