// @ts-check
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config({ path: './server/.env' });

/**
 * Playwright E2E config for Nomii AI
 *
 * Expects the server (PORT=3001) and client (PORT=5173) to be running.
 * Start both with `npm run dev` from the root before running tests.
 *
 * Required env vars in server/.env:
 *   TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
 *
 * Optional:
 *   TEST_WIDGET_KEY — skips the /me lookup to get widget_key
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,          // run tests in order — some depend on auth state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                    // sequential — shared auth state
  reporter: [
    ['html', { open: 'never', outputFolder: 'tests/e2e/report' }],
    ['list'],
  ],

  use: {
    baseURL: `http://localhost:${process.env.VITE_PORT || 5173}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start both server and client before tests run */
  webServer: [
    {
      command: 'cd server && npm run dev',
      port: Number(process.env.PORT) || 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'cd client && npm run dev',
      port: Number(process.env.VITE_PORT) || 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
