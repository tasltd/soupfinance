/**
 * SOUPFIN-188 — after a 401 sends the user to /login, the login page says why.
 *
 * Before: the redirect is a full page load, so the store's "Session expired"
 * message was lost and the user arrived at a bare login form with no
 * explanation. Now the 401 handler (handleUnauthorized in src/api/client.ts)
 * leaves a one-shot sessionStorage flag, and LoginPage turns it into an info
 * banner, then clears it.
 *
 * The session is expired mid-navigation by clicking the sidebar, never by
 * page.goto on an internal route. Screenshots land in
 * e2e/playwright/screenshots/soupfin-188/ and are committed.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockLoginApi,
  mockTokenValidationApi,
  mockAmbientApi,
  mockInvoicesApi,
  mockBillsApi,
  mockVendorsApi,
  isLxcMode,
} from './fixtures';

const NOTICE = 'Your session has expired. Please sign in again.';

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-188/${name}.png`,
    fullPage: true,
  });
}

/** Sign in through the real form. /login is the one URL allowed to be entered directly. */
async function signIn(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('login-email-input').fill('admin@soupfinance.com');
  await page.getByTestId('login-password-input').fill('password123');
  await page.getByTestId('login-submit-button').click();
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20000 });
}

/**
 * Fix (SOUPFIN-188): leave the dashboard before a test expires the session.
 * The dashboard queries recent invoices on its own schedule, so an invoice 401
 * installed while it is mounted can redirect before the sidebar click lands.
 */
async function leaveDashboard(page: Page) {
  await page.getByRole('link', { name: 'Vendors' }).click();
  await expect(page.getByTestId('vendor-list-page')).toBeVisible({ timeout: 20000 });
}

/** The backend forgets the token: the next call, and re-validation, both 401. */
async function expireSession(page: Page) {
  const unauthorized = { status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) };
  await page.route('**/rest/invoice/**', (route) => route.fulfill(unauthorized));
  await page.route('**/rest/user/current.json*', (route) => route.fulfill(unauthorized));
}

const readFlag = (page: Page) => page.evaluate(() => sessionStorage.getItem('session_expired'));

test.describe('SOUPFIN-188 — session expired notice on /login', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(isLxcMode(), 'mock-mode spec: it forces the 401');
    await mockAmbientApi(page);
    await mockInvoicesApi(page, []);
    await mockBillsApi(page, []);
    await mockVendorsApi(page, []);
    await mockLoginApi(page, true);
    await mockTokenValidationApi(page, true);
  });

  test('a 401 lands on /login with the info notice, shown once', async ({ page }) => {
    await signIn(page);
    await shot(page, '01-signed-in');
    expect(await readFlag(page)).toBeNull();
    await leaveDashboard(page);

    await expireSession(page);
    await page.getByRole('link', { name: 'Invoices' }).click();

    await page.waitForURL('**/login', { timeout: 20000 });
    const notice = page.getByTestId('login-session-expired');
    await expect(notice).toBeVisible({ timeout: 15000 });
    // toContainText: the banner's icon ligatures ("info", "close") are text nodes too
    await expect(notice).toContainText(NOTICE);
    // Exactly one message: the info banner replaces the store's red error
    await expect(page.getByTestId('login-error')).toHaveCount(0);
    await expect(page.getByTestId('login-form')).toBeVisible();
    // One-shot: LoginPage consumed the flag as it rendered the notice
    expect(await readFlag(page)).toBeNull();
    await shot(page, '02-login-shows-session-expired');

    // A plain reload of /login is not a new expiry, so no notice
    await page.reload();
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('login-session-expired')).toHaveCount(0);
    await shot(page, '03-reload-no-notice');
  });

  test('the notice can be dismissed, and signing back in works', async ({ page }) => {
    await signIn(page);
    await leaveDashboard(page);
    await expireSession(page);
    await page.getByRole('link', { name: 'Invoices' }).click();
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page.getByTestId('login-session-expired')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Dismiss alert' }).click();
    await expect(page.getByTestId('login-session-expired')).toHaveCount(0);
    await shot(page, '04-notice-dismissed');

    await page.unroute('**/rest/invoice/**');
    await page.unroute('**/rest/user/current.json*');
    await mockTokenValidationApi(page, true);
    await page.getByTestId('login-email-input').fill('admin@soupfinance.com');
    await page.getByTestId('login-password-input').fill('password123');
    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20000 });
    await shot(page, '05-signed-back-in');
  });

  test('a wrong password is not reported as an expired session', async ({ page }) => {
    // Re-register the login route to fail; Playwright matches the latest route first
    await mockLoginApi(page, false);
    await page.goto('/login');
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('login-email-input').fill('admin@soupfinance.com');
    await page.getByTestId('login-password-input').fill('wrong-password');
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('login-session-expired')).toHaveCount(0);
    expect(await readFlag(page)).toBeNull();
    await shot(page, '06-wrong-password-no-notice');
  });
});
