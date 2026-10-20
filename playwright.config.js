import { defineConfig } from '@playwright/test';

const port = Number(process.env.TEST_PORT) || 4173;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  timeout: 45_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/test-server.js',
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
