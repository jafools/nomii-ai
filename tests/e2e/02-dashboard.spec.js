// @ts-check
const { test, expect } = require('@playwright/test');
const { SEL_DASHBOARD } = require('./helpers/constants');
const { loginViaAPI } = require('./helpers/auth');

test.describe('Dashboard Navigation', () => {
  let authToken = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    const body = await loginViaAPI(page);
    authToken = body.token;
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    // Inject the shared token rather than re-logging in for every test
    await page.goto('/nomii/login');
    await page.evaluate((token) => {
      localStorage.setItem('nomii_portal_token', token);
    }, authToken);
    await page.goto('/nomii/dashboard');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test('dashboard overview loads with welcome heading', async ({ page }) => {
    const heading = page.locator(SEL_DASHBOARD.welcomeHeading).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('navigate to conversations page', async ({ page }) => {
    const link = page.locator(SEL_DASHBOARD.navConversations).first();
    await link.click();
    await page.waitForURL(/\/conversations/, { timeout: 10_000 });
    expect(page.url()).toContain('/conversations');
  });

  test('navigate to customers page', async ({ page }) => {
    const link = page.locator(SEL_DASHBOARD.navCustomers).first();
    await link.click();
    await page.waitForURL(/\/customers/, { timeout: 10_000 });
    expect(page.url()).toContain('/customers');
  });

  test('navigate to tools page', async ({ page }) => {
    const link = page.locator(SEL_DASHBOARD.navTools).first();
    await link.click();
    await page.waitForURL(/\/tools/, { timeout: 10_000 });
    expect(page.url()).toContain('/tools');
  });

  test('navigate to settings page', async ({ page }) => {
    const link = page.locator(SEL_DASHBOARD.navSettings).first();
    await link.click();
    await page.waitForURL(/\/settings/, { timeout: 10_000 });
    expect(page.url()).toContain('/settings');
  });

  test('navigate to team page', async ({ page }) => {
    const link = page.locator(SEL_DASHBOARD.navTeam).first();
    await link.click();
    await page.waitForURL(/\/team/, { timeout: 10_000 });
    expect(page.url()).toContain('/team');
  });

  test('profile page loads', async ({ page }) => {
    // Navigate via URL since profile may not always be in sidebar nav
    await page.goto('/nomii/dashboard/profile');
    await page.waitForURL(/\/profile/, { timeout: 10_000 });
    expect(page.url()).toContain('/profile');
  });

  test('plans page loads', async ({ page }) => {
    await page.goto('/nomii/dashboard/plans');
    await page.waitForURL(/\/plans/, { timeout: 10_000 });
    expect(page.url()).toContain('/plans');
  });

  test('invalid dashboard route stays within dashboard shell', async ({ page }) => {
    await page.goto('/nomii/dashboard/nonexistent-page');
    // Should still be authenticated — not redirected to login
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/login');
  });
});
