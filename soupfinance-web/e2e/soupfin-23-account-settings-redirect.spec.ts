/**
 * SOUPFIN-23 — Account Settings form must not silently render blank on session expiry.
 *
 * Failure mode: when the backend session has expired, GET /account/show/{id}.json
 * returns a 302 redirect to the TAS login page. The browser FOLLOWS the redirect and
 * the request resolves 200 with the login HTML — so the request "succeeds" with a body
 * that is NOT an Account. Before this fix, accountSettingsApi.get() returned that HTML
 * as the settings, the page rendered a blank/default editable form, and no error banner
 * appeared (the SOUPFIN-21 lock keys off a thrown error, and nothing threw). A user
 * could then Save the blank form over their real settings.
 *
 * The fix (isValidAccountSettings guard in settings.ts) detects the non-account payload
 * and throws, routing the case into the existing SOUPFIN-21 lock: banner shown + form
 * disabled + Retry offered. This spec exercises the REAL accountSettingsApi.get() guard
 * in a browser (the SOUPFIN-21 spec only covers a thrown 500).
 *
 * Mock mode (default): deterministic, intercepted routes. Screenshots under
 * test-results/screenshots/soupfin-23/.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, takeScreenshot, isLxcMode } from './fixtures';

async function setupMockAuth(page: Page) {
  await page.addInitScript(() => {
    const mockUser = {
      username: 'admin',
      email: 'admin@soupfinance.com',
      roles: ['ROLE_ADMIN', 'ROLE_USER'],
      tenantId: 'tenant-soupfin',
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

// The HTML body the browser lands on after following a 302 → TAS login. This is what
// account/show resolves to (200) when the backend session has expired.
const LOGIN_PAGE_HTML =
  '<!DOCTYPE html><html><head><title>Sign in</title></head>' +
  '<body><form action="/login/authenticate"><input name="username"/>' +
  '<input name="password" type="password"/></form></body></html>';

test.describe('SOUPFIN-23 — session-expiry redirect on account/show locks the form', () => {
  test('a followed 302→login (200 HTML) locks the settings form; a valid retry unlocks it', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }

    await setupMockAuth(page);
    // Base mocks (200 /rest/user/current.json → tenantId). mockTokenValidationApi also
    // registers a 200 account/show route; the override below (registered later → LIFO
    // precedence) makes EVERY account/show resolve with the login HTML instead.
    await mockTokenValidationApi(page, true);

    // Simulate the followed redirect: 200 OK but the body is the login page HTML, not an
    // Account. Unconditional so both callers (app account store + settings query) hit it.
    await page.route('**/account/show/*.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: LOGIN_PAGE_HTML,
      })
    );

    await page.goto('/settings/account');
    await page.waitForLoadState('domcontentloaded');

    // The guard makes the "successful" HTML response throw → the load-error banner
    // appears and the form is LOCKED, so the blank fields cannot be Saved over the
    // user's real settings.
    await expect(page.getByTestId('account-settings-load-error')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('account-settings-fieldset')).toBeDisabled();
    await expect(page.getByTestId('account-settings-save')).toBeDisabled();
    await expect(page.getByPlaceholder(/Your company name/i)).toBeDisabled();
    // Retry stays usable (outside the locked fieldset).
    await expect(page.getByTestId('account-settings-load-error-retry')).toBeEnabled();
    await takeScreenshot(page, 'soupfin-23/account-settings-locked-on-login-redirect');

    // Session recovers: account/show now returns a real Account. Retry → unlock + populate.
    await page.unroute('**/account/show/*.json*');
    await page.route('**/account/show/*.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'tenant-soupfin',
          name: 'Saved Company Name',
          currency: 'GHS',
          startOfFiscalYear: '',
        }),
      })
    );
    await page.getByTestId('account-settings-load-error-retry').click();

    await expect(page.getByTestId('account-settings-load-error')).toHaveCount(0);
    await expect(page.getByTestId('account-settings-fieldset')).toBeEnabled();
    await expect(page.getByPlaceholder(/Your company name/i)).toHaveValue('Saved Company Name');
    await takeScreenshot(page, 'soupfin-23/account-settings-unlocked-after-retry');
  });
});
