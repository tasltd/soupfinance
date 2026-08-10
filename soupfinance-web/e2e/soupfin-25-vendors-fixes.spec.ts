/**
 * SOUPFIN-25 — Vendors page fixes (V15)
 *
 * Fix 1: Vendor API module prefix. VendorController lives in the soupbroker.trading
 *   package, so the SPA must call /rest/trading/vendor/* (not the bare /rest/vendor/*).
 *   Validated here by intercepting the trading-prefixed route: if the SPA still used the
 *   bare path, this route would never fire and the vendor list would stay empty.
 *
 * Fix 2: Vendors nav visibility. The sidebar "Vendors" link must be HIDDEN for SERVICES
 *   tenants (no suppliers/inventory) and SHOWN for TRADING tenants.
 *
 * Mock mode (default): deterministic, intercepted routes. Screenshots are saved under
 * test-results/screenshots/soupfin-25/.
 */
import { test, expect, type Page } from '@playwright/test';
import type { BusinessLicenceCategory } from '../src/types/settings';
import { mockTokenValidationApi, mockDashboardApi, takeScreenshot, isLxcMode } from './fixtures';

async function setupMockAuth(page: Page) {
  await page.addInitScript(() => {
    const mockUser = {
      username: 'admin',
      email: 'admin@soupfinance.com',
      roles: ['ROLE_ADMIN', 'ROLE_USER'],
      tenantId: 'account-001',
    };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { user: mockUser, isAuthenticated: true, isInitialized: true },
        version: 0,
      })
    );
  });
}

/**
 * Override the account/show mock (registered by mockTokenValidationApi) to return a
 * specific business licence category. Playwright routes are LIFO, so registering this
 * after mockTokenValidationApi makes it win.
 */
async function mockBusinessCategory(page: Page, category: BusinessLicenceCategory) {
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

const mockVendors = [
  {
    id: 'vendor-001',
    name: 'Office Supplies Co',
    email: 'contact@officesupplies.com',
    phoneNumber: '+1-555-0101',
    paymentTerms: 30,
    status: 'ACTIVE',
    dateCreated: '2024-01-15T10:00:00Z',
  },
];

test.describe('SOUPFIN-25 #2 — Vendors nav visibility by business category', () => {
  test('hides the Vendors nav item for SERVICES tenants', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await setupMockAuth(page);
    await mockTokenValidationApi(page, true);
    // Fix: the dashboard fetches invoices + bills on mount. Without these routes the
    // page never finishes loading and dashboard-page never becomes visible.
    await mockDashboardApi(page);
    await mockBusinessCategory(page, 'SERVICES');

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, 'soupfin-25/services-dashboard-loaded');

    // The Vendors link must not be present once account settings resolve to SERVICES.
    // toBeHidden auto-retries, so any brief pre-settings flash is tolerated.
    const vendorsLink = page.locator('aside a[href="/vendors"]');
    await expect(vendorsLink).toHaveCount(0, { timeout: 15000 });
    // Sanity: other nav items still render.
    await expect(page.locator('aside a[href="/dashboard"]').first()).toBeVisible();
    await expect(page.locator('aside a[href="/clients"]').first()).toBeVisible();
    await takeScreenshot(page, 'soupfin-25/services-vendors-nav-hidden');
  });

  test('shows the Vendors nav item for TRADING tenants and navigation works', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await setupMockAuth(page);
    await mockTokenValidationApi(page, true);
    // Fix: see above — the dashboard's own data endpoints must be mocked for it to render.
    await mockDashboardApi(page);
    await mockBusinessCategory(page, 'TRADING');

    // Fix 1 validation: intercept ONLY the trading-prefixed vendor list route.
    // If the SPA still called /rest/vendor/index.json this would never fire.
    let tradingVendorRouteHit = false;
    await page.route('**/rest/trading/vendor/index.json*', (route) => {
      tradingVendorRouteHit = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockVendors),
      });
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

    const vendorsLink = page.locator('aside a[href="/vendors"]');
    await expect(vendorsLink).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, 'soupfin-25/trading-vendors-nav-visible');

    // Navigate via the menu click (NOT page.goto) per E2E navigation rules.
    await vendorsLink.click();
    await expect(page).toHaveURL(/\/vendors$/);
    await expect(page.getByTestId('vendor-list-page')).toBeVisible({ timeout: 15000 });
    // The list rendered from the trading-prefixed endpoint.
    await expect(page.getByText('Office Supplies Co')).toBeVisible({ timeout: 15000 });
    expect(tradingVendorRouteHit).toBe(true);
    await takeScreenshot(page, 'soupfin-25/trading-vendor-list-loaded');
  });
});

test.describe('SOUPFIN-25 #1 — Vendor API uses the trading module prefix', () => {
  test('vendor list request goes to /rest/trading/vendor/index.json', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await setupMockAuth(page);
    await mockTokenValidationApi(page, true);
    await mockBusinessCategory(page, 'TRADING');

    const requestedUrls: string[] = [];
    await page.route('**/vendor/index.json*', (route) => {
      requestedUrls.push(route.request().url());
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockVendors),
      });
    });

    await page.goto('/vendors');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('vendor-list-page')).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, 'soupfin-25/vendor-list-direct-load');

    // Assert the app requested the trading-prefixed path and NOT the bare one.
    expect(requestedUrls.length).toBeGreaterThan(0);
    expect(requestedUrls.some((u) => u.includes('/rest/trading/vendor/index.json'))).toBe(true);
    expect(requestedUrls.some((u) => /\/rest\/vendor\/index\.json/.test(u))).toBe(false);
  });
});
