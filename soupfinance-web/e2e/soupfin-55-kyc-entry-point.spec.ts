/**
 * SOUPFIN-55 — KYC onboarding wizard has no entry point in the app
 *
 * The four /onboarding/* routes were fully built and wired in App.tsx, but
 * nothing in src/ ever navigated to /onboarding/company. The only reference was
 * the Back button on step 2. A user could therefore only start — or resume —
 * company verification from a link we emailed them.
 *
 * These tests drive the fix through the UI: the dashboard banner is the entry
 * point, and clicking it lands on step 1 of the wizard with the corporate id
 * carried in the query string.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockDashboardApi,
  mockTokenValidationApi,
  mockAmbientApi,
  mockCorporate,
  isLxcMode,
} from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-55/${name}.png`,
    fullPage: true,
  });
}

/** Mock the corporate lookup the banner performs. */
async function mockCorporateLookup(
  page: import('@playwright/test').Page,
  options: {
    /** Does the backend expose /rest/corporate/current.json? It does not today. */
    currentActionExists?: boolean;
    /** Corporates returned by the index fallback. */
    corporates?: Array<Record<string, unknown>>;
  } = {}
) {
  const { currentActionExists = false, corporates = [] } = options;

  await page.route('**/rest/corporate/current*', (route) => {
    if (currentActionExists && corporates[0]) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(corporates[0]),
      });
      return;
    }
    // Matches production: CorporateController has no `current` action.
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not Found' }),
    });
  });

  await page.route('**/rest/corporate/index.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(corporates),
    })
  );

  // Step 1 of the wizard loads the corporate it was handed.
  await page.route('**/rest/corporate/show/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(corporates[0] ?? mockCorporate),
    })
  );
}

test.describe('SOUPFIN-55: KYC onboarding entry point', () => {
  test.skip(isLxcMode(), 'Mock-only spec: corporate KYC state is seeded, not controllable on LXC');

  test.beforeEach(async ({ page }) => {
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
        JSON.stringify({ state: { user: mockUser, isAuthenticated: true }, version: 0 })
      );
    });
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
  });

  test('dashboard offers a way into the wizard when verification is pending', async ({ page }) => {
    await mockCorporateLookup(page, {
      corporates: [{ ...mockCorporate, id: 'corp-001', kycStatus: 'PENDING' }],
    });

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    const banner = page.getByTestId('kyc-onboarding-banner');
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('kyc-onboarding-banner-title')).toHaveText(
      'Company verification in progress'
    );
    await shot(page, 'dashboard-banner-pending');

    // The point of the ticket: the id must ride along, or step 1 is useless.
    await expect(page.getByTestId('kyc-onboarding-banner-cta')).toHaveAttribute(
      'href',
      '/onboarding/company?id=corp-001'
    );
  });

  test('clicking the banner opens step 1 of the wizard with the corporate id', async ({ page }) => {
    await mockCorporateLookup(page, {
      corporates: [{ ...mockCorporate, id: 'corp-001', kycStatus: 'PENDING' }],
    });

    await page.goto('/dashboard');
    await expect(page.getByTestId('kyc-onboarding-banner')).toBeVisible({ timeout: 15000 });
    await shot(page, 'before-click');

    // Click, never goto — this is the navigation the ticket says does not exist.
    await page.getByTestId('kyc-onboarding-banner-cta').click();

    await expect(page).toHaveURL(/\/onboarding\/company\?id=corp-001/);
    await expect(page.getByTestId('company-info-page')).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole('heading', { name: /company information/i })
    ).toBeVisible();
    await shot(page, 'wizard-step-1-reached');
  });

  test('a rejected application gets its own wording and still opens the wizard', async ({ page }) => {
    await mockCorporateLookup(page, {
      corporates: [{ ...mockCorporate, id: 'corp-002', kycStatus: 'REJECTED' }],
    });

    await page.goto('/dashboard');
    await expect(page.getByTestId('kyc-onboarding-banner')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('kyc-onboarding-banner-title')).toHaveText(
      'Company verification needs attention'
    );
    await shot(page, 'dashboard-banner-rejected');

    await page.getByTestId('kyc-onboarding-banner-cta').click();
    await expect(page).toHaveURL(/\/onboarding\/company\?id=corp-002/);
    await expect(page.getByTestId('company-info-page')).toBeVisible({ timeout: 15000 });
    await shot(page, 'wizard-reached-after-rejection');
  });

  test('the entry point is reachable from the sidebar, not only on first load', async ({ page }) => {
    await mockCorporateLookup(page, {
      corporates: [{ ...mockCorporate, id: 'corp-001', kycStatus: 'PENDING' }],
    });

    await page.goto('/dashboard');
    await expect(page.getByTestId('kyc-onboarding-banner')).toBeVisible({ timeout: 15000 });

    // Leave the dashboard, then come back via the menu — the way a user who
    // abandoned the wizard mid-session would find their way back.
    // The loose regex here used to be mandatory: the Material icon ligature was
    // part of every top-level link's accessible name ("receipt_long Invoices"),
    // so an exact match never matched. SOUPFIN-63 hid the icons from the
    // accessibility tree, so these can now name the link precisely.
    await page.locator('nav').getByRole('link', { name: 'Invoices', exact: true }).click();
    await expect(page).toHaveURL(/\/invoices/);
    await shot(page, 'navigated-away');

    await page.locator('nav').getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('kyc-onboarding-banner')).toBeVisible({ timeout: 15000 });
    await shot(page, 'returned-via-menu');
  });

  test('no banner once verification is approved', async ({ page }) => {
    await mockCorporateLookup(page, {
      corporates: [{ ...mockCorporate, id: 'corp-003', kycStatus: 'APPROVED' }],
    });

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('dashboard-kpi-cards')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('kyc-onboarding-banner')).toHaveCount(0);
    await shot(page, 'dashboard-no-banner-approved');
  });

  test('no banner when the tenant has no corporate application at all', async ({ page }) => {
    await mockCorporateLookup(page, { corporates: [] });

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('dashboard-kpi-cards')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('kyc-onboarding-banner')).toHaveCount(0);
    await shot(page, 'dashboard-no-banner-no-corporate');
  });

  test('a forbidden corporate lookup does not break the dashboard', async ({ page }) => {
    // The corporate/KYC controller can 403 for a tenant whose module is off.
    // That must degrade to "no banner", never an error on an unrelated page.
    await page.route('**/rest/corporate/current*', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: '{}' })
    );
    await page.route('**/rest/corporate/index.json*', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: '{}' })
    );

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('dashboard-kpi-cards')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('kyc-onboarding-banner')).toHaveCount(0);
    await shot(page, 'dashboard-corporate-lookup-forbidden');
  });
});
