/**
 * SOUPFIN-25 — Vendors page fixes (V15)
 *
 * Fix 1: Vendor API module prefix. VendorController lives in the soupbroker.trading
 *   package, so the SPA must call /rest/trading/vendor/* (not the bare /rest/vendor/*).
 *   Validated here by intercepting the trading-prefixed route: if the SPA still used the
 *   bare path, this route would never fire and the vendor list would stay empty.
 *
 * Fix 2 (reversed by SOUPFIN-173): SOUPFIN-25 hid the sidebar "Vendors" link for SERVICES
 *   tenants. SERVICES tenants still record bills, and a bill requires a vendor, so the
 *   link is now shown for every business category. The backend agrees: SOUP-2018 lets
 *   FINANCE-only (SERVICES) tenants reach the vendor controllers.
 *
 * Mock mode (default): deterministic, intercepted routes. SOUPFIN-173 screenshots are
 * committed under e2e/playwright/screenshots/soupfin-173/.
 */
import { test, expect, type Page } from '@playwright/test';
import type { BusinessLicenceCategory } from '../src/types/settings';
import {
  mockTokenValidationApi,
  mockDashboardApi,
  mockBillsApi,
  mockAmbientApi,
  installUnmockedApiGuard,
  takeScreenshot,
  isLxcMode,
  type UnmockedApiGuard,
} from './fixtures';

// Added (SOUPFIN-173): takeScreenshot writes to the git-ignored test-results/, so the
// SOUPFIN-173 evidence goes to a committed directory instead.
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-173/${name}.png`,
    fullPage: true,
  });
}

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

/**
 * Mock only the trading-prefixed vendor list. If the SPA called the bare
 * /rest/vendor/index.json this route would never fire. Returns a getter for
 * whether it was hit.
 */
async function mockTradingVendorList(page: Page) {
  let hit = false;
  await page.route('**/rest/trading/vendor/index.json*', (route) => {
    hit = true;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockVendors),
    });
  });
  return () => hit;
}

test.describe('SOUPFIN-173 — Vendors nav is shown for every business category', () => {
  test.skip(isLxcMode(), 'Mock-only test: the business category is mocked');

  // Added: the SOUPFIN-25 versions of these tests rotted when the layout gained
  // corporate/current and frontendLog calls: unmocked, they 401 and bounce the page
  // to /login. The guard (lowest priority) turns that into a named failure, and
  // mockAmbientApi covers the layout's own calls.
  let guard: UnmockedApiGuard;
  test.beforeEach(async ({ page }) => {
    guard = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
  });
  test.afterEach(() => guard.assertNone());

  for (const category of ['SERVICES', 'TRADING'] as const) {
    test(`shows Vendors for ${category} tenants and the link opens the vendor list`, async ({
      page,
    }) => {
      const slug = category.toLowerCase();
      await setupMockAuth(page);
      await mockTokenValidationApi(page, true);
      // The dashboard fetches invoices + bills on mount; without these it never renders.
      await mockDashboardApi(page);
      await mockBusinessCategory(page, category);
      const vendorRouteHit = await mockTradingVendorList(page);

      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

      // Settings have resolved to this category once the account/show mock answered;
      // a category filter would remove the link after that, so wait for it first.
      const vendorsLink = page.locator('aside a[href="/vendors"]');
      await expect(vendorsLink).toBeVisible({ timeout: 15000 });
      await expect(vendorsLink).toHaveText(/Vendors$/);
      await shot(page, `${slug}-vendors-nav-visible`);

      // Navigate via the menu click (NOT page.goto) per E2E navigation rules.
      await vendorsLink.click();
      await expect(page).toHaveURL(/\/vendors$/);
      await expect(page.getByTestId('vendor-list-page')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Office Supplies Co')).toBeVisible({ timeout: 15000 });
      expect(vendorRouteHit()).toBe(true);
      await shot(page, `${slug}-vendor-list-loaded`);
    });
  }

  test('a SERVICES tenant can go from the bill form to vendor management through the nav', async ({
    page,
  }) => {
    // The acceptance check for SOUPFIN-173: Bills requires a vendor, so the page that
    // manages vendors must be reachable from the nav while on the bill form.
    await setupMockAuth(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockBillsApi(page);
    await mockBusinessCategory(page, 'SERVICES');
    const vendorRouteHit = await mockTradingVendorList(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

    await page.locator('aside a[href="/bills"]').click();
    await expect(page).toHaveURL(/\/bills$/);
    await page.getByRole('link', { name: /new bill/i }).first().click();
    await expect(page).toHaveURL(/\/bills\/new$/);

    // The required vendor field is filled from the same vendor list.
    const vendorSelect = page.getByTestId('bill-vendor-select');
    await expect(vendorSelect).toBeVisible({ timeout: 15000 });
    await expect(vendorSelect.locator('option', { hasText: 'Office Supplies Co' })).toHaveCount(1, {
      timeout: 15000,
    });
    await shot(page, 'services-bill-form-vendor-required');

    await page.locator('aside a[href="/vendors"]').click();
    await expect(page).toHaveURL(/\/vendors$/);
    await expect(page.getByTestId('vendor-list-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Office Supplies Co')).toBeVisible({ timeout: 15000 });
    expect(vendorRouteHit()).toBe(true);
    await shot(page, 'services-vendor-list-from-bill-form');
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
