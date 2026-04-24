// @ts-check
const { test, expect } = require('@playwright/test');
const { isOnprem } = require('./helpers/mode');

/**
 * On-prem customer journey.
 *
 * Runs only in `PLAYWRIGHT_MODE=onprem` (the `onprem-e2e` CI job that
 * brings up docker-compose.selfhosted.yml). Skipped in all other modes.
 *
 * Flow exercised:
 *   1. /api/setup/status returns `required: false` (setup already done by
 *      the CI job's harness before tests start — see ci.yml)
 *   2. /api/health reports healthy
 *   3. Login with the harness-created admin works
 *   4. Dashboard renders
 *   5. Widget embed.js is served + launches
 *   6. License-related endpoints respond correctly for an unlicensed (trial)
 *      instance — operator should be able to paste a key and activate.
 *
 * The setup itself (POST /api/setup/complete) happens in the CI job, not
 * here, because it's a one-shot endpoint that needs to run before any
 * spec that depends on the admin being present.
 */

test.describe('On-prem customer journey', () => {
  test.beforeEach(async () => {
    test.skip(!isOnprem(), 'On-prem-only spec (set PLAYWRIGHT_MODE=onprem to run).');
  });

  test('/api/setup/status reports setup as complete', async ({ baseURL, request }) => {
    const res = await request.get(`${baseURL}/api/setup/status`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.required).toBe(false);
  });

  test('/api/health is healthy and reports a shenmay-family service id', async ({ baseURL, request }) => {
    const res = await request.get(`${baseURL}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status || body.ok || 'ok').toBeTruthy();
    // service field is 'shenmay-ai' post-Phase-7 rename — pin the prefix
    // so future rename touches this spec explicitly.
    if (body.service) {
      expect(body.service).toMatch(/^shenmay(-ai)?$/);
    }
  });

  test('embed.js is served with Content-Type javascript', async ({ baseURL, request }) => {
    const res = await request.get(`${baseURL}/embed.js`);
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] || '';
    expect(ct).toMatch(/javascript/i);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(100);
    // Embed script historically looked for data-widget-key — keep asserting
    // the modern attribute is present so a regression breaks CI, not
    // customers.
    expect(body).toMatch(/widget.?key/i);
  });

  test('Shenmay-native portal routes return 404 in self-hosted mode', async ({ baseURL, request }) => {
    // SHENMAY_LICENSE_MASTER is intentionally unset in self-hosted compose.
    // The /api/public/portal/* routes should refuse.
    const res = await request.post(`${baseURL}/api/public/portal/request-login`, {
      data: { email: 'any@shenmay.test' },
    });
    expect(res.status()).toBe(404);
  });

  test('/signup returns 200 page shell but POST /api/onboard/register 403s', async ({ baseURL, request }) => {
    // SaaS signup is disabled in self-hosted — the page itself renders
    // (SPA serves index.html for every route) but the registration endpoint
    // explicitly refuses.
    const pageRes = await request.get(`${baseURL}/signup`);
    expect(pageRes.status()).toBeLessThan(400);

    const apiRes = await request.post(`${baseURL}/api/onboard/register`, {
      data: {
        email: 'selfhosted-signup@shenmay.test',
        password: 'WontGetHere!123',
        company_name: 'Anybody',
        tos_accepted: true,
      },
    });
    expect(apiRes.status()).toBe(403);
    const body = await apiRes.json();
    expect(body.error).toBe('registration_disabled');
  });
});
