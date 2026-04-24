// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_EMAIL, TEST_PASSWORD, SEL_LOGIN } = require('./helpers/constants');
const { loginViaUI, loginViaAPI, logout } = require('./helpers/auth');
const { isOnprem } = require('./helpers/mode');

test.describe('Login & Logout', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure clean state — no token
    await page.goto('/login');
    await page.evaluate(() => localStorage.removeItem('shenmay_portal_token'));
  });

  test('login page loads with form fields', async ({ page }) => {
    await page.goto('/login');
    // Post-Direction-B rebrand the login H1 is "Welcome back." with a "Sign in"
    // kicker above it — no single stable heading string to anchor on. Rely on
    // the form fields instead; if the login page itself were broken they
    // wouldn't render.
    await expect(page.locator(SEL_LOGIN.emailInput)).toBeVisible();
    await expect(page.locator(SEL_LOGIN.passwordInput)).toBeVisible();
    await expect(page.locator(SEL_LOGIN.submitBtn)).toBeVisible();
    // Sign-up link is hidden in self-hosted (registration is disabled there).
    if (!isOnprem()) {
      await expect(page.locator(SEL_LOGIN.signupLink)).toBeVisible();
    }
  });

  test('shows error on empty form submit', async ({ page }) => {
    await page.goto('/login');
    // Clear the required attribute so the browser doesn't block submission
    await page.evaluate(() => {
      document.querySelectorAll('input[required]').forEach((el) => {
        el.removeAttribute('required');
      });
    });
    await page.click(SEL_LOGIN.submitBtn);
    // The form handler shows "Please fill in all fields."
    await expect(page.getByText('Please fill in all fields')).toBeVisible({ timeout: 5000 });
  });

  test('shows error on wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.fill(SEL_LOGIN.emailInput, TEST_EMAIL);
    await page.fill(SEL_LOGIN.passwordInput, 'wrong_password_xyz');
    await page.click(SEL_LOGIN.submitBtn);
    // Wait for the error message to appear
    await expect(page.locator(SEL_LOGIN.errorMsg)).toBeVisible({ timeout: 10_000 });
  });

  test('successful login navigates to dashboard', async ({ page }) => {
    await loginViaUI(page);
    // Should be on dashboard or onboarding
    expect(page.url()).toMatch(/\/(dashboard|onboarding)/);
  });

  test('dashboard redirects to login when token cleared', async ({ page }) => {
    // Login first
    await loginViaAPI(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

    // Logout — clear token
    await logout(page);
    await page.goto('/dashboard');
    // Should redirect to login — anchor on the visible email input
    // (brand copy on the heading varies and isn't a stable selector).
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page.locator(SEL_LOGIN.emailInput)).toBeVisible({ timeout: 5_000 });
  });

  test('forgot password flow shows success message', async ({ page }) => {
    await page.goto('/login');
    await page.click(SEL_LOGIN.forgotLink);
    // Post-rebrand copy: "Enter the email on your account" (prompt) +
    // "reset link is on its way" (success). Any of either is fine.
    await expect(page.getByText(/reset|email on your account/i).first()).toBeVisible({ timeout: 5000 });

    await page.fill('#forgot-email', TEST_EMAIL);
    await page.click('button[type="submit"]');
    // Enumeration-safe success text — match any of the current phrasings.
    await expect(
      page.getByText(/reset link is on its way|check your inbox|reset link has been sent/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('signup link navigates to registration page', async ({ page }) => {
    test.skip(isOnprem(), 'Sign-up link is hidden in self-hosted mode (registration disabled).');
    await page.goto('/login');
    await page.click(SEL_LOGIN.signupLink);
    await page.waitForURL(/\/signup/);
    expect(page.url()).toContain('/signup');
  });

  test('already-authenticated user is redirected from login to dashboard', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/login');
    // useEffect in ShenmayLogin checks isLoggedIn() and redirects
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
  });
});
