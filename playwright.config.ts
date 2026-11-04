import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/visual', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4176/emikman_builder/', viewport: { width: 1440, height: 1000 }, colorScheme: 'light' },
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4176 --strictPort', url: 'http://127.0.0.1:4176/emikman_builder/', reuseExistingServer: false },
});
