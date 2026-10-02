import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  use: { baseURL: 'http://127.0.0.1:5173', timezoneId: 'Asia/Bangkok', channel: process.env.PLAYWRIGHT_CHANNEL || undefined, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI,
  },
});
