/**
 * SOUPFIN-58 — Logout leaves the previous tenant currency in localStorage
 *
 * `accountStore` persists `settings` and `currencyConfig` under the localStorage
 * key `account-storage`. `authStore.logout()` removed `access_token`, `user`,
 * `auth-storage` and `auth_storage_type` — but never `account-storage`, and never
 * called `useAccountStore.reset()`.
 *
 * So on a shared or multi-tenant browser: sign in as a GHS tenant, sign out, sign
 * in as a USD tenant, and every amount rendered with GH₵ until the new account
 * settings fetch resolved. One tenant's figures under another tenant's currency.
 *
 * These tests drive the full flow through the UI — fill the login form, click the
 * logout button, log in again — rather than poking localStorage directly, so they
 * exercise the same path a person does.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockLoginApi, mockTokenValidationApi, mockDashboardApi, isLxcMode } from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-58/${name}.png`,
    fullPage: true,
  });
}

/**
 * Override the account settings endpoint for the next sign-in.
 *
 * Registered AFTER `mockTokenValidationApi` on purpose — Playwright routes are
 * LIFO, so the last registration wins over the fixture's USD default.
 *
 * `delayMs` reproduces the defect's window: the gap between the new sign-in and
 * the settings fetch resolving is exactly when the stale symbol was on screen.
 */
async function mockTenantCurrency(page: Page, currency: string, delayMs = 0) {
  await page.route('**/account/show/*.json*', async (route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'account-001',
        name: `${currency} Tenant`,
        currency,
        dateCreated: '2024-01-01T00:00:00Z',
      }),
    });
  });
}

/** Sign in through the login form, exactly as a person would. */
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill('admin@soupfinance.com');
  await page.getByTestId('login-password-input').fill('admin123');
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

/**
 * Sign in and then reload, which is what actually loads the tenant's settings.
 *
 * `login()` (src/api/auth.ts) never returns `tenantId` — the login response has
 * no such field — so only `initialize()` → `validateToken()` on a page load
 * enriches it, and App.tsx gates the settings fetch on `tenantId` being present.
 * The reload is therefore the ordinary "return to the tab" path, and the token
 * survives it because it sits in sessionStorage.
 *
 * (That the fetch does not fire on the sign-in itself is SOUPFIN-53, a separate
 * defect — not something these tests assert on.)
 */
async function signInAndLoadSettings(page: Page) {
  await signIn(page);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

const revenue = (page: Page) => page.getByTestId('stat-total-revenue-value');

test.describe('SOUPFIN-58 — logout clears the previous tenant currency', () => {
  test.skip(isLxcMode(), 'Needs two tenants with different currencies; mock mode only.');

  test.beforeEach(async ({ page }) => {
    await mockLoginApi(page, true);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
  });

  test('a USD tenant never sees the previous GHS tenant currency', async ({ page }) => {
    // Two full sign-in cycles plus a deliberately delayed settings fetch does not
    // fit the suite's 30s per-test budget once the whole suite runs in parallel.
    // The work is genuinely slow rather than stuck, so widen the budget.
    test.slow();

    // Arrange + Act 1: the GHS tenant signs in.
    await mockTenantCurrency(page, 'GHS');
    await signInAndLoadSettings(page);

    // Assert baseline — without this the final assertion would pass even if the
    // GHS currency had never been applied in the first place.
    await expect(revenue(page)).toContainText('GH₵', { timeout: 15000 });
    await shot(page, '01-ghs-tenant-dashboard');

    // Act 2: the GHS tenant signs out.
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await shot(page, '02-after-logout');

    // Assert: the persisted key is gone, so a reload cannot rehydrate GHS.
    expect(await page.evaluate(() => localStorage.getItem('account-storage'))).toBeNull();

    // Act 3: the USD tenant signs in on the same browser. The settings fetch is
    // deliberately slow — this is the exact window the defect lived in.
    await mockTenantCurrency(page, 'USD', 1200);
    await signInAndLoadSettings(page);

    // Assert: during the in-flight window the amount must NOT carry GH₵.
    // This is the regression: before the fix it read "GH₵125,430.50".
    await expect(revenue(page)).toBeVisible({ timeout: 15000 });
    await expect(revenue(page)).not.toContainText('GH₵');
    await shot(page, '03-usd-tenant-while-settings-load');

    // Assert: once the fetch resolves the USD tenant sees its own currency.
    await expect(revenue(page)).toContainText('$', { timeout: 15000 });
    await shot(page, '04-usd-tenant-settings-loaded');
  });

  test('logout removes account-storage and leaves the auth keys cleared', async ({ page }) => {
    // Arrange
    await mockTenantCurrency(page, 'GHS');
    await signInAndLoadSettings(page);
    await expect(revenue(page)).toContainText('GH₵', { timeout: 15000 });

    // Confirm the key is actually written before logout, so the assertion below
    // is evidence of removal rather than of the key never existing.
    expect(await page.evaluate(() => localStorage.getItem('account-storage'))).not.toBeNull();

    // Act
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });

    // Assert: full storage state after logout
    const storage = await page.evaluate(() => ({
      accountStorage: localStorage.getItem('account-storage'),
      accessToken: localStorage.getItem('access_token'),
      sessionToken: sessionStorage.getItem('access_token'),
      user: localStorage.getItem('user'),
      storageType: localStorage.getItem('auth_storage_type'),
    }));

    expect(storage.accountStorage).toBeNull();
    expect(storage.accessToken).toBeNull();
    expect(storage.sessionToken).toBeNull();
    expect(storage.user).toBeNull();
    expect(storage.storageType).toBeNull();
    await shot(page, '05-storage-cleared-after-logout');
  });
});
