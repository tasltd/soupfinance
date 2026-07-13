/**
 * SOUPFIN-25 — Vendors nav visibility by business licence category
 *
 * Issue #2: the sidebar "Vendors" link was shown regardless of businessLicenceCategory.
 * For SERVICES tenants (who don't use suppliers/inventory, and whose trading VendorController
 * is gated by the backend TradingModuleInterceptor) the item must be hidden.
 *
 * These are mock-mode tests: we drive the tenant's businessLicenceCategory via the mocked
 * /account/show response and assert the sidebar reflects it, capturing screenshots at each
 * validation point.
 *
 * Runs on the repo's configured `chromium` project. The Firefox-default drift is tracked
 * separately in SOUPFIN-26.
 */
import { test, expect } from '@playwright/test';
import {
  mockTokenValidationApi,
  mockDashboardApi,
  mockVendorsApi,
  setupResponseValidation,
  takeScreenshot,
  isLxcMode,
} from './fixtures';

const SHOT = 'soupfin-25';

/**
 * Override the account/show mock so the tenant reports a specific businessLicenceCategory.
 * Registered AFTER mockTokenValidationApi so Playwright's LIFO route resolution picks it.
 */
async function mockAccountCategory(page: import('@playwright/test').Page, category: string) {
  await page.route('**/account/show/*.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'account-001',
        name: 'Test Company',
        currency: 'USD',
        businessLicenceCategory: category,
        dateCreated: '2024-01-01T00:00:00Z',
      }),
    });
  });
}

test.describe('SOUPFIN-25: Vendors nav visibility', () => {
  test.skip(isLxcMode(), 'Mock-only test: category is driven via mocked /account/show');

  test.beforeEach(async ({ page }) => {
    // Authenticated shell (mirrors vendors.spec.ts) — token validation still runs and
    // enriches tenantId, which triggers the app-wide account-settings fetch.
    await page.addInitScript(() => {
      const mockUser = {
        username: 'admin',
        email: 'admin@soupfinance.com',
        roles: ['ROLE_ADMIN', 'ROLE_USER'],
      };
      localStorage.setItem('access_token', 'mock-jwt-token');
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { user: mockUser, isAuthenticated: true }, version: 0 })
      );
    });
    await setupResponseValidation(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockVendorsApi(page);
  });

  test('hides Vendors in the sidebar for SERVICES tenants', async ({ page }) => {
    await mockAccountCategory(page, 'SERVICES');

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });
    // Wait for the account settings fetch to settle (currency/category applied).
    await expect(sidebar.getByRole('link', { name: /invoices/i })).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, `${SHOT}-services-sidebar`);

    // The Vendors link must NOT be present for SERVICES tenants.
    await expect(sidebar.getByRole('link', { name: /vendors/i })).toHaveCount(0);
    // Other nav items remain.
    await expect(sidebar.getByRole('link', { name: /clients/i })).toBeVisible();
    await takeScreenshot(page, `${SHOT}-services-no-vendors`);
  });

  test('shows Vendors in the sidebar for TRADING tenants and it navigates', async ({ page }) => {
    await mockAccountCategory(page, 'TRADING');

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });
    await expect(sidebar.getByRole('link', { name: /invoices/i })).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, `${SHOT}-trading-sidebar`);

    const vendorsLink = sidebar.getByRole('link', { name: /vendors/i });
    await expect(vendorsLink).toBeVisible();

    // Navigate via the menu click (not a direct URL) and confirm the Vendors page loads.
    await vendorsLink.click();
    await expect(page).toHaveURL(/\/vendors/);
    await page.waitForLoadState('domcontentloaded');
    await takeScreenshot(page, `${SHOT}-trading-vendors-page`);
  });
});
