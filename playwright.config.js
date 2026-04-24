// @ts-check
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config({ path: './server/.env' });

/**
 * Playwright E2E config for Shenmay AI.
 *
 * Three run modes, picked at runtime based on env:
 *
 *   1. Local dev (default)
 *      — no env needed. Spins up server + client via webServer blocks,
 *        targets http://localhost:5173, seeds TEST_ADMIN into dev DB.
 *
 *   2. CI SaaS (e2e-saas job)
 *      — CI=1, webServer blocks start the app against CI's Postgres
 *        service, TEST_ADMIN is seeded by globalSetup.
 *
 *   3. Remote (staging / on-prem localhost:80)
 *      — set PLAYWRIGHT_BASE_URL=https://nomii-staging.pontensolutions.com
 *        (or http://localhost:80 for on-prem compose). webServer blocks are
 *        disabled; seed is skipped (must be applied out-of-band to the
 *        target DB once). Specs that require DB access will skip themselves
 *        — see PLAYWRIGHT_MODE handling inside individual specs.
 *
 * Required env vars in server/.env (or CI env):
 *   TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
 *
 * Optional:
 *   TEST_WIDGET_KEY       — skips the /me lookup to get widget_key
 *   PLAYWRIGHT_BASE_URL   — override base URL (triggers remote mode)
 *   PLAYWRIGHT_MODE       — 'local' | 'saas-staging' | 'onprem' (informational)
 *   PLAYWRIGHT_SKIP_SEED  — set to '1' to skip DB seed even locally
 */

const REMOTE_BASE = process.env.PLAYWRIGHT_BASE_URL;
const LOCAL_PORT  = Number(process.env.VITE_PORT) || 5173;
const LOCAL_URL   = `http://localhost:${LOCAL_PORT}`;
const IS_REMOTE   = !!REMOTE_BASE && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(REMOTE_BASE);

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,          // run tests in order — some depend on auth state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,                    // sequential — shared auth state + deterministic ordering
  timeout: 60_000,
  globalSetup: require.resolve('./tests/e2e/global-setup'),
  reporter: [
    ['html', { open: 'never', outputFolder: 'tests/e2e/report' }],
    ['list'],
    ...(process.env.CI ? [['github']] : []),
  ],

  use: {
    baseURL: REMOTE_BASE || LOCAL_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start server + client locally only. Skipped when PLAYWRIGHT_BASE_URL
   * points at a remote host (we're not going to `npm run dev` on staging). */
  webServer: IS_REMOTE ? undefined : [
    {
      command: 'cd server && npm run dev',
      port: Number(process.env.PORT) || 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'cd client && npm run dev',
      port: LOCAL_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
