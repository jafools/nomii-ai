// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Onboarding Wizard E2E tests
 *
 * NOTE: These tests are designed to validate the onboarding UI flow
 * without actually completing registration (which would create duplicate
 * tenants in the test database). They verify:
 *   - Signup page loads with the registration form
 *   - Form validation works (required fields, password rules)
 *   - Navigation between onboarding steps (if auth token present)
 *
 * For a full onboarding E2E test, you'd need a test teardown that
 * deletes the created tenant.
 */

test.describe('Signup Page', () => {
  test('signup page loads with registration form', async ({ page }) => {
    await page.goto('/shenmay/signup');
    // Should have heading and form fields
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    // Should have at least an email input
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput.first()).toBeVisible();
  });

  test('signup page has link back to login', async ({ page }) => {
    await page.goto('/shenmay/signup');
    const loginLink = page.locator('a[href*="login"]');
    await expect(loginLink.first()).toBeVisible({ timeout: 5_000 });
    await loginLink.first().click();
    await page.waitForURL(/\/login/);
  });
});

test.describe('Onboarding Wizard (authenticated)', () => {
  const { loginViaAPI } = require('./helpers/auth');

  test('onboarding page loads for authenticated user', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/shenmay/onboarding');
    // Should load the onboarding page (either show steps or redirect to dashboard)
    await page.waitForTimeout(3000);
    // If onboarding is already complete, user gets redirected to dashboard
    const url = page.url();
    const isOnboarding = url.includes('/onboarding');
    const isDashboard = url.includes('/dashboard');
    expect(isOnboarding || isDashboard).toBe(true);
  });

  test('onboarding page is protected — redirects unauthenticated users', async ({ page }) => {
    await page.goto('/shenmay/login');
    await page.evaluate(() => localStorage.removeItem('nomii_portal_token'));
    await page.goto('/shenmay/onboarding');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });
});

test.describe('Email Verification', () => {
  test('verify page with invalid token shows error', async ({ page }) => {
    await page.goto('/shenmay/verify/invalid-token-abc123');
    // Should show error or redirect
    await page.waitForTimeout(3000);
    // The page either shows an error message anywhere in the body, or
    // redirects to login. We check the full body text (not getByText, which
    // throws on multiple matches in strict mode) so any of the legitimate
    // error messages counts: "Invalid or expired verification link" (happy
    // path), "Verification failed" (heading), "Too many requests" (rate
    // limiter kicks in during batched test runs).
    const bodyText = (await page.textContent('body').catch(() => '')) || '';
    const hasError = /invalid|expired|error|failed|too many/i.test(bodyText);
    const onLogin = page.url().includes('/login');
    expect(hasError || onLogin).toBe(true);
  });

  test('reset password page loads', async ({ page }) => {
    await page.goto('/shenmay/reset-password');
    await page.waitForTimeout(2000);
    // Should show the reset password form or redirect
    const url = page.url();
    expect(url).toMatch(/\/(reset-password|login)/);
  });
});
