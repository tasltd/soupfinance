/**
 * SOUPFIN-85 — KYC Documents page sent users to a Directors page with no upload
 *
 * Step 4 of the KYC wizard carried an "Additional Information" card: "Director
 * ID copies should be uploaded via the Directors page", with a "Go to Directors"
 * link. The Directors page person form only takes name, email, phone and role.
 * It has no file input, so a user who followed the instruction hit a dead end.
 *
 * The card is removed until the person form can attach a proof of identity.
 * These tests walk the wizard by clicking, from the dashboard banner to step 4,
 * and confirm step 4 no longer gives the instruction.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockAmbientApi,
  mockCorporate,
  mockCorporateApi,
  mockDashboardApi,
  mockDirector,
  mockDirectorsApi,
  mockDocumentsApi,
  mockTokenValidationApi,
  installUnmockedApiGuard,
  isLxcMode,
  type UnmockedApiGuard,
} from './fixtures';

const CORPORATE_ID = 'corp-085';

/**
 * Screenshots go to a git-tracked directory. The shared `takeScreenshot`
 * fixture writes under `test-results/`, which Playwright wipes on every run.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-85/${name}.png`,
    fullPage: true,
  });
}

/** Click from the dashboard banner through steps 1 and 3 to step 4. */
async function walkToDocumentsStep(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('kyc-onboarding-banner')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('kyc-onboarding-banner-cta').click();

  await expect(page).toHaveURL(new RegExp(`/onboarding/company\\?id=${CORPORATE_ID}`));
  await page.getByText('Skip for Now').click();

  await expect(page).toHaveURL(new RegExp(`/onboarding/directors\\?id=${CORPORATE_ID}`));
  await expect(page.getByText('Directors & Signatories')).toBeVisible({ timeout: 15000 });
  await page.getByText('Continue to Documents').click();

  await expect(page).toHaveURL(new RegExp(`/onboarding/documents\\?id=${CORPORATE_ID}`));
  await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Certificate of Incorporation')).toBeVisible();
}

test.describe('SOUPFIN-85: Documents step does not point at a missing director ID upload', () => {
  test.skip(isLxcMode(), 'Mock-only spec: corporate KYC state is seeded, not controllable on LXC');

  let guard: UnmockedApiGuard;

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

    // Guard first: Playwright matches the last-registered route, so the
    // specific mocks below win and the guard only sees what they miss.
    guard = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);

    const corporate = { ...mockCorporate, id: CORPORATE_ID, kycStatus: 'PENDING' as const };
    await mockCorporateApi(page, CORPORATE_ID, corporate);
    await page.route('**/rest/corporate/index.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([corporate]),
      })
    );
    await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
    await mockDocumentsApi(page, CORPORATE_ID, []);
  });

  test.afterEach(() => guard.assertNone('SOUPFIN-85'));

  test('the Directors person form has no file upload', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('kyc-onboarding-banner')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('kyc-onboarding-banner-cta').click();
    await page.getByText('Skip for Now').click();
    await expect(page.getByText('Directors & Signatories')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /add person/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Add Person' })).toBeVisible();
    await shot(page, 'directors-add-person-form');

    // This is why the old instruction was a dead end.
    await expect(page.locator('form input[type="file"]')).toHaveCount(0);
  });

  test('step 4 no longer tells users to upload director IDs on the Directors page', async ({
    page,
  }) => {
    await walkToDocumentsStep(page);
    await shot(page, 'documents-step-reached');

    await expect(page.getByText('Additional Information', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Director ID/i)).toHaveCount(0);
    await expect(page.getByText('Go to Directors')).toHaveCount(0);

    // The four document slots and their uploads are unchanged.
    for (const label of [
      'Certificate of Incorporation',
      'Board Resolution',
      'Memorandum & Articles',
      'Proof of Address',
    ]) {
      // Required slots append a "*" to the heading, so match the start only.
      await expect(page.getByRole('heading', { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await expect(page.locator('input[type="file"]')).toHaveCount(4);
    await shot(page, 'documents-no-director-id-card');
  });

  test('Back still returns to the Directors step', async ({ page }) => {
    await walkToDocumentsStep(page);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/onboarding/directors\\?id=${CORPORATE_ID}`));
    await expect(page.getByText('Directors & Signatories')).toBeVisible({ timeout: 15000 });
    await shot(page, 'back-to-directors');
  });
});
