import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.ts',
  outputDir: 'dist-pilot/playwright-results',
  workers: 1,
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  timeout: 30000,
});
