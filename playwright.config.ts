import { defineConfig, devices } from '@playwright/test';

/**
 * The browser suite: `npm run test:e2e`.
 *
 * A real browser against the running platform's public address, the way a
 * student uses it. Runs on the Edge already installed on the machine
 * (E2E_BROWSER_CHANNEL=chrome for Chrome), so it needs no browser download.
 *
 *     cd deploy && docker compose up -d --wait
 *     npm run test:e2e                         # E2E_BASE_URL defaults to http://localhost:8090
 *
 * Like the system suite it creates real, clearly named accounts on example.com.
 */
const baseURL = (process.env.E2E_BASE_URL ?? 'http://localhost:8090').replace(/\/+$/, '');
const channel = process.env.E2E_BROWSER_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  // One at a time: Code Coach rate-limits sign-ups per client, and two tests
  // listening on the extension's loopback port would collide.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    channel,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1366, height: 860 } },
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], channel },
      testMatch: /sections\.spec\.ts/,
    },
  ],
});
