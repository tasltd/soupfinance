/**
 * SOUPFIN-62 — CorporateController has no `current` action, so
 * /rest/corporate/current.json 404s.
 *
 * The backend fix belongs in soupmarkets-web (see
 * `plans/soupfin-62-corporate-current-endpoint.md`). What this spec pins is the
 * frontend half of the report: `getCurrentCorporate()` used to swallow every
 * error with a bare `catch { return null }`, so a 500 from that endpoint was
 * indistinguishable from "this user has no corporate".
 *
 * Two behaviours must hold through the UI:
 *   1. current.json failing for a reason other than 404 must not take the KYC
 *      entry point down — the index fallback still answers.
 *   2. Once the backend action exists, the resolver must prefer it and stop
 *      calling the index fallback at all.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockDashboardApi,
  mockTokenValidationApi,
  mockAmbientApi,
  mockCorporate,
  isLxcMode,
} from './fixtures';

/** Git-tracked screenshot dir — `test-results/` is wiped on every run. */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-62/${name}.png`,
    fullPage: true,
  });
}

test.describe('SOUPFIN-62: corporate/current.json error handling', () => {
  test.skip(isLxcMode(), 'Mock-only spec: the backend failure modes are simulated, not seeded');

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

  test('a 500 from current.json still leaves the KYC entry point usable', async ({ page }) => {
    const consoleWarnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning') consoleWarnings.push(msg.text());
    });

    let indexCalls = 0;
    await page.route('**/rest/corporate/current*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
    );
    await page.route('**/rest/corporate/index.json*', (route) => {
      indexCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ ...mockCorporate, id: 'corp-500', kycStatus: 'PENDING' }]),
      });
    });
    await page.route('**/rest/corporate/show/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockCorporate, id: 'corp-500', kycStatus: 'PENDING' }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    const banner = page.getByTestId('kyc-onboarding-banner');
    await expect(banner).toBeVisible({ timeout: 15000 });
    await shot(page, 'banner-survives-current-500');

    // The fallback ran, so the user keeps their way into the wizard...
    expect(indexCalls).toBeGreaterThan(0);
    await expect(page.getByTestId('kyc-onboarding-banner-cta')).toHaveAttribute(
      'href',
      '/onboarding/company?id=corp-500'
    );

    // ...and the failure was reported rather than swallowed.
    expect(
      consoleWarnings.some((text) => text.includes('corporate/current.json failed'))
    ).toBe(true);

    // The entry point still works end to end.
    await page.getByTestId('kyc-onboarding-banner-cta').click();
    await expect(page).toHaveURL(/\/onboarding\/company\?id=corp-500/);
    await expect(page.getByTestId('company-info-page')).toBeVisible({ timeout: 15000 });
    await shot(page, 'wizard-reached-after-current-500');
  });

  test('once current.json answers, the index fallback is not called at all', async ({ page }) => {
    // This is the state the backend plan delivers: CorporateController.current
    // returns the signed-in user's corporate.
    let indexCalls = 0;
    await page.route('**/rest/corporate/current*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockCorporate, id: 'corp-from-current', kycStatus: 'PENDING' }),
      })
    );
    await page.route('**/rest/corporate/index.json*', (route) => {
      indexCalls += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/rest/corporate/show/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockCorporate, id: 'corp-from-current', kycStatus: 'PENDING' }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('kyc-onboarding-banner')).toBeVisible({ timeout: 15000 });
    await shot(page, 'banner-from-current-endpoint');

    // The corporate came from current.json, not from the guessed first row.
    await expect(page.getByTestId('kyc-onboarding-banner-cta')).toHaveAttribute(
      'href',
      '/onboarding/company?id=corp-from-current'
    );
    expect(indexCalls).toBe(0);
  });

  test('a 404 from current.json is still treated as "nothing to resume"', async ({ page }) => {
    // Production today: the action does not exist, so the resolver must fall
    // through quietly and an empty tenant must show no banner.
    await page.route('**/rest/corporate/current*', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not Found"}' })
    );
    await page.route('**/rest/corporate/index.json*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('dashboard-kpi-cards')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('kyc-onboarding-banner')).toHaveCount(0);
    await shot(page, 'no-banner-when-current-404s');
  });
});
