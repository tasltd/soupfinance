/**
 * SOUPFIN-151 — capture industry as a first-class field
 *
 * Before: industry was only a label inside a JSON `metadata` string on the
 * corporate update (the Corporate domain has no such field, so it was dropped),
 * and registration never sent it.
 *
 * After:
 * - Registration has an optional Industry select next to Business type and sends
 *   its code as `industry` in the /account/register.json body.
 * - Company Information preselects the industry saved on the Account and writes a
 *   changed one to Account.industry (via /account/edit + /account/update) before
 *   updating the corporate.
 * - A hint says whether the industry adds a COA overlay for the business type.
 *
 * Both flows are reached by clicking (login "Sign up" link, dashboard KYC banner),
 * never by goto to the target route.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import {
  mockDashboardApi,
  mockTokenValidationApi,
  mockAmbientApi,
  mockCorporate,
  isLxcMode,
} from './fixtures';

/** Git-tracked evidence; the shared takeScreenshot helper writes to the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-151/${name}.png`,
    fullPage: true,
  });
}

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const OVERLAY_HINT = 'Your chart of accounts will include extra accounts for this industry.';
const NO_OVERLAY_HINT = 'Your chart of accounts uses the standard template for your business type.';

test.describe('SOUPFIN-151: industry at registration and onboarding', () => {
  test.skip(isLxcMode(), 'Mock-only spec: the backend has no Account.industry field yet');

  test.describe('Registration', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    });

    test('sends the chosen industry in the register payload', async ({ page }) => {
      const posted: Array<Record<string, unknown>> = [];
      await page.route('**/account/register.json', (route: Route) => {
        posted.push(route.request().postDataJSON());
        return route.fulfill(
          json({ success: true, message: 'Registration successful', requiresConfirmation: false })
        );
      });

      await page.goto('/login');
      await page.getByTestId('login-register-link').click();
      await expect(page.getByTestId('registration-page')).toBeVisible({ timeout: 15000 });

      const industry = page.getByTestId('registration-industry-select');
      await expect(industry).toHaveValue('');
      await expect(page.getByTestId('registration-industry-hint')).toHaveCount(0);
      await shot(page, 'registration-industry-empty');

      // Retail only overlays a TRADING chart; the default business type is SERVICES
      await industry.selectOption('retail');
      await expect(page.getByTestId('registration-industry-hint')).toHaveText(NO_OVERLAY_HINT);
      await shot(page, 'registration-retail-on-services');

      await page.getByTestId('registration-business-type-trading').click();
      await expect(page.getByTestId('registration-industry-hint')).toHaveText(OVERLAY_HINT);

      await page.getByTestId('registration-company-name-input').fill('Accra Retail Ltd');
      await page.getByTestId('registration-country-select').selectOption('GH');
      await page.getByTestId('registration-admin-first-name').fill('Ama');
      await page.getByTestId('registration-admin-last-name').fill('Mensah');
      await page.getByTestId('registration-email-input').fill('ama@accraretail.com');
      await page.getByTestId('registration-password-input').fill('Secret123');
      await page.getByTestId('registration-confirm-password-input').fill('Secret123');
      await shot(page, 'registration-retail-on-trading-filled');

      await page.getByTestId('registration-submit-button').click();
      await expect(page).toHaveURL(/\/login$/);
      await shot(page, 'registration-submitted-login');

      expect(posted).toHaveLength(1);
      expect(posted[0]).toEqual({
        companyName: 'Accra Retail Ltd',
        businessType: 'TRADING',
        industry: 'retail',
        adminFirstName: 'Ama',
        adminLastName: 'Mensah',
        email: 'ama@accraretail.com',
        country: 'GH',
        currency: 'GHS',
        password: 'Secret123',
      });
    });

    test('omits industry from the payload when none is chosen', async ({ page }) => {
      const posted: Array<Record<string, unknown>> = [];
      await page.route('**/account/register.json', (route: Route) => {
        posted.push(route.request().postDataJSON());
        return route.fulfill(
          json({ success: true, message: 'Registration successful', requiresConfirmation: false })
        );
      });

      await page.goto('/login');
      await page.getByTestId('login-register-link').click();
      await expect(page.getByTestId('registration-page')).toBeVisible({ timeout: 15000 });
      await page.getByTestId('registration-company-name-input').fill('Plain Services Ltd');
      await page.getByTestId('registration-country-select').selectOption('GH');
      await page.getByTestId('registration-admin-first-name').fill('Kofi');
      await page.getByTestId('registration-admin-last-name').fill('Boateng');
      await page.getByTestId('registration-email-input').fill('kofi@plainservices.com');
      await page.getByTestId('registration-password-input').fill('Secret123');
      await page.getByTestId('registration-confirm-password-input').fill('Secret123');
      await page.getByTestId('registration-submit-button').click();
      await expect(page).toHaveURL(/\/login$/);

      expect(posted).toHaveLength(1);
      expect(posted[0]).not.toHaveProperty('industry');
      expect(posted[0].businessType).toBe('SERVICES');
    });
  });

  test.describe('Company Information', () => {
    /** The tenant Account as the mock backend holds it; /account/update mutates it. */
    let account: Record<string, unknown>;
    let accountUpdates: Array<Record<string, unknown>>;
    let corporateUpdates: Array<Record<string, unknown>>;

    test.beforeEach(async ({ page }) => {
      account = {
        id: 'account-001',
        name: 'Test Company',
        currency: 'GHS',
        businessLicenceCategory: 'SERVICES',
        industry: 'saas',
      };
      accountUpdates = [];
      corporateUpdates = [];

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

      const corporate = { ...mockCorporate, id: 'corp-001', kycStatus: 'PENDING' };
      await page.route('**/rest/corporate/current*', (route) =>
        route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not Found"}' })
      );
      await page.route('**/rest/corporate/index.json*', (route) => route.fulfill(json([corporate])));
      await page.route('**/rest/corporate/show/*', (route) => route.fulfill(json(corporate)));
      await page.route('**/rest/corporate/update/*', (route) => {
        corporateUpdates.push(route.request().postDataJSON());
        return route.fulfill(json(corporate));
      });
      await page.route('**/rest/corporateAccountPerson/index.json*', (route) => route.fulfill(json([])));

      // Stateful Account: registered after mockTokenValidationApi so these win (LIFO)
      await page.route('**/account/show/*.json*', (route) => route.fulfill(json(account)));
      await page.route('**/account/edit/*.json*', (route) =>
        route.fulfill(json({ ...account, SYNCHRONIZER_TOKEN: 'csrf-151', SYNCHRONIZER_URI: '/account/update' }))
      );
      await page.route('**/account/update/*.json*', (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        accountUpdates.push(body);
        account = { ...account, ...body };
        return route.fulfill(json(account));
      });
    });

    async function openCompanyInfo(page: Page) {
      await page.goto('/dashboard');
      await expect(page.getByTestId('kyc-onboarding-banner')).toBeVisible({ timeout: 15000 });
      await page.getByTestId('kyc-onboarding-banner-cta').click();
      await expect(page).toHaveURL(/\/onboarding\/company\?id=corp-001/);
      await expect(page.getByTestId('company-info-page')).toBeVisible({ timeout: 15000 });
    }

    test('preselects the saved industry and writes a changed one to the Account', async ({ page }) => {
      // State before: the industry chosen at registration
      expect(account.industry).toBe('saas');

      await openCompanyInfo(page);
      const industry = page.getByTestId('company-info-industry-select');
      await expect(industry).toHaveValue('saas');
      await expect(page.getByTestId('company-info-industry-hint')).toHaveText(OVERLAY_HINT);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'company-info-preselected-saas');

      await industry.selectOption('professional-services');
      await expect(page.getByTestId('company-info-industry-hint')).toHaveText(OVERLAY_HINT);
      await shot(page, 'company-info-professional-services');

      await page.getByText('Save & Continue').click();
      await page.waitForURL('**/onboarding/directors?id=corp-001');
      await shot(page, 'company-info-saved-directors');

      // State after: the Account holds the new industry, sent once with its id
      expect(accountUpdates).toEqual([{ id: 'account-001', industry: 'professional-services' }]);
      expect(account.industry).toBe('professional-services');
      expect(corporateUpdates).toHaveLength(1);
      expect(JSON.parse(String(corporateUpdates[0].metadata)).industry).toBe('professional-services');
      // The corporate never receives `industry` as a field: Corporate.industry is a
      // ClientIndustry reference, not this code
      expect(corporateUpdates[0]).not.toHaveProperty('industry');
    });

    test('does not rewrite the Account when the industry is unchanged', async ({ page }) => {
      await openCompanyInfo(page);
      await expect(page.getByTestId('company-info-industry-select')).toHaveValue('saas');

      await page.getByText('Save & Continue').click();
      await page.waitForURL('**/onboarding/directors?id=corp-001');

      expect(accountUpdates).toEqual([]);
      expect(account.industry).toBe('saas');
      expect(corporateUpdates).toHaveLength(1);
    });

    test('tells the user when an industry has no overlay for the business type', async ({ page }) => {
      await openCompanyInfo(page);
      const industry = page.getByTestId('company-info-industry-select');

      // Retail only overlays TRADING charts; this tenant is SERVICES
      await industry.selectOption('retail');
      await expect(page.getByTestId('company-info-industry-hint')).toHaveText(NO_OVERLAY_HINT);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'company-info-retail-no-overlay');
    });
  });
});
