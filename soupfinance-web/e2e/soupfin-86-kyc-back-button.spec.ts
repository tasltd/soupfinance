/**
 * SOUPFIN-86 — KYC step 1 Back button sends a signed-in user to /register
 *
 * Since SOUPFIN-55 the wizard is opened from the dashboard banner, so the user
 * on step 1 is always signed in. Back called navigate('/register'), and
 * /register is NOT wrapped in PublicRoute, so a signed-in user landed on the
 * new-company registration form instead of returning to where they came from.
 *
 * The fix sends Back to /dashboard. This spec drives the whole trip by clicking:
 * dashboard banner -> step 1 -> Back -> dashboard.
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
 * The dashboard fades in with a GSAP entrance, which Playwright's
 * `animations: 'disabled'` cannot stop. Wait for the hero heading and the
 * activity section to finish before capturing, or the evidence is half-drawn.
 */
async function waitForDashboardEntrance(page: Page) {
  await page.waitForFunction(() =>
    ['[data-anim="hero-heading"]', '[data-anim="activity-section"]'].every((sel) => {
      const el = document.querySelector(sel);
      return el !== null && getComputedStyle(el).opacity === '1';
    })
  );
}

/** Screenshots live in a git-tracked dir; test-results/ is wiped every run. */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-86/${name}.png`,
    fullPage: true,
  });
}

async function mockCorporateLookup(page: Page) {
  const corporate = { ...mockCorporate, id: 'corp-086', kycStatus: 'PENDING' };

  // Matches production: CorporateController has no `current` action.
  await page.route('**/rest/corporate/current*', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not Found' }),
    })
  );
  await page.route('**/rest/corporate/index.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([corporate]),
    })
  );
  await page.route('**/rest/corporate/show/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(corporate),
    })
  );
}

test.describe('SOUPFIN-86: KYC step 1 Back button', () => {
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
    await mockCorporateLookup(page);
  });

  test('Back on step 1 returns a signed-in user to the dashboard, not /register', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('kyc-onboarding-banner')).toBeVisible({ timeout: 15000 });
    await waitForDashboardEntrance(page);
    await shot(page, 'dashboard-banner');

    await page.getByTestId('kyc-onboarding-banner-cta').click();
    await expect(page).toHaveURL(/\/onboarding\/company\?id=corp-086$/);
    await expect(page.getByTestId('company-info-page')).toBeVisible({ timeout: 15000 });
    await shot(page, 'step-1-company-info');

    await page.getByTestId('company-info-page').getByRole('button', { name: 'Back', exact: true }).click();

    // Anchored: /dashboard exactly, never /register.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('company-info-page')).toHaveCount(0);
    await expect(page.getByTestId('kyc-onboarding-banner')).toBeVisible({ timeout: 15000 });
    await waitForDashboardEntrance(page);
    await shot(page, 'after-back-dashboard');
  });
});
