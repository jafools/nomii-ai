/**
 * Auth helpers for Playwright E2E tests
 *
 * Handles portal login via the UI or API, and widget session creation.
 */
const { TEST_EMAIL, TEST_PASSWORD, API_BASE, SEL_LOGIN } = require('./constants');

/**
 * Log in via the login page UI. Returns once the dashboard loads.
 */
async function loginViaUI(page) {
  await page.goto('/nomii/login');
  await page.waitForSelector(SEL_LOGIN.emailInput);
  await page.fill(SEL_LOGIN.emailInput, TEST_EMAIL);
  await page.fill(SEL_LOGIN.passwordInput, TEST_PASSWORD);
  await page.click(SEL_LOGIN.submitBtn);
  // Wait for navigation to dashboard or onboarding
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
}

/**
 * Log in via the API and inject the token into localStorage.
 * Faster than UI login — use for tests that aren't testing the login itself.
 */
async function loginViaAPI(page) {
  const res = await page.request.post(`${API_BASE}/api/onboard/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  const body = await res.json();
  if (!res.ok()) throw new Error(`Login API failed: ${body.error || res.status()}`);

  // Inject token into localStorage before navigating
  await page.goto('/nomii/login');
  await page.evaluate((token) => {
    localStorage.setItem('nomii_portal_token', token);
  }, body.token);

  return body;
}

/**
 * Get widget key from the /me endpoint after portal login.
 */
async function getWidgetKey(page) {
  const token = await page.evaluate(() => localStorage.getItem('nomii_portal_token'));
  const res = await page.request.get(`${API_BASE}/api/portal/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body.tenant?.widget_key;
}

/**
 * Clear the portal token (simulate logout).
 */
async function logout(page) {
  await page.evaluate(() => {
    localStorage.removeItem('nomii_portal_token');
  });
}

module.exports = { loginViaUI, loginViaAPI, getWidgetKey, logout };
