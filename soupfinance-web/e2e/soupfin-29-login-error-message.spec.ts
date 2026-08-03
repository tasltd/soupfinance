/**
 * SOUPFIN-29 E2E: Login shows a user-friendly error, never raw HTTP.
 *
 * Bug: entering wrong credentials showed the raw Axios message
 * "Request failed with status code 401" instead of a human-readable message.
 * Fix: authStore routes auth failures through getLoginErrorMessage() →
 *      "Invalid username or password.", while descriptive account-state messages
 *      (email not confirmed, account locked) pass through verbatim so the Resend
 *      Confirmation link still appears.
 *
 * These tests drive the real LoginPage through the UI, mock /rest/api/login with
 * every failure shape the backend can return, and assert the rendered banner.
 * Screenshots are captured at each validation point.
 *
 * Mock-only: skipped in LXC mode (we cannot force a 401/403 body there).
 */
import { test, expect } from '@playwright/test';
import { takeScreenshot, isLxcMode } from './fixtures';

const SCREENSHOT_PREFIX = 'soupfin-29-login-error';

test.describe('SOUPFIN-29 — friendly login error messages', () => {
  test.skip(isLxcMode(), 'Mock-only test: controls the 401/403 response shape');

  test.beforeEach(async ({ page }) => {
    // Start from a clean auth state so we always land on the login page.
    // Both storages: the auth store writes to localStorage only when
    // rememberMe is set, and to sessionStorage otherwise.
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('bare 401 (no body) shows friendly message, not "status code 401"', async ({ page }) => {
    // Reproduce the exact bug: backend rejects with 401 and an empty body, so
    // there is no server message at all to fall back on.
    await page.route('**/rest/api/login', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '' }),
    );

    await page.goto('/login');
    await expect(page.getByTestId('login-page')).toBeVisible();
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-01-initial`);

    await page.getByTestId('login-email-input').fill('wrong@example.com');
    await page.getByTestId('login-password-input').fill('wrongpassword');
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-02-filled`);

    await page.getByTestId('login-submit-button').click();

    const errorBanner = page.getByTestId('login-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toHaveText(/invalid username or password/i);
    // The core regression assertion: raw HTTP jargon must NOT appear.
    await expect(errorBanner).not.toHaveText(/status code/i);
    await expect(errorBanner).not.toHaveText(/\b401\b/);
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-03-friendly-error`);

    // Still on the login page (no navigation on failure).
    await expect(page).toHaveURL(/\/login/);
  });

  test('generic "Bad credentials" body is replaced with the friendly message', async ({ page }) => {
    await page.route('**/rest/api/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Bad credentials' }),
      }),
    );

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill('user@example.com');
    await page.getByTestId('login-password-input').fill('nope');
    await page.getByTestId('login-submit-button').click();

    const errorBanner = page.getByTestId('login-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toHaveText(/invalid username or password/i);
    await expect(errorBanner).not.toHaveText(/status code/i);
    // A generic invalid-credentials error must NOT offer the resend-confirmation link.
    await expect(page.getByTestId('login-resend-confirmation-link')).toHaveCount(0);
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-04-bad-credentials`);
  });

  test('Spring Security {error, message} jargon body is fully suppressed', async ({ page }) => {
    // Both keys carry jargon; extractServerMessage picks `error` first, and the
    // generic-phrase list must reject it rather than rendering either string.
    await page.route('**/rest/api/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized', message: 'Bad credentials' }),
      }),
    );

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill('wrong@example.com');
    await page.getByTestId('login-password-input').fill('wrongpassword');
    await page.getByTestId('login-submit-button').click();

    const errorBanner = page.getByTestId('login-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Invalid username or password.');
    await expect(errorBanner).not.toContainText('status code');
    await expect(errorBanner).not.toContainText('Bad credentials');
    await expect(errorBanner).not.toContainText('Unauthorized');
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-05-jargon-suppressed`);

    // Stayed on the login page — no navigation on failure.
    await expect(page).toHaveURL(/\/login/);
  });

  test('401 error_description "email not confirmed" surfaces with a resend link', async ({ page }) => {
    await page.route('**/rest/api/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error_description: 'Your email is not confirmed. Please check your inbox.',
        }),
      }),
    );

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill('pending@example.com');
    await page.getByTestId('login-password-input').fill('somepassword');
    await page.getByTestId('login-submit-button').click();

    const errorBanner = page.getByTestId('login-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(/not confirmed/i);
    await expect(errorBanner).not.toHaveText(/status code/i);
    // The unconfirmed-email path offers a resend link.
    await expect(page.getByTestId('login-resend-confirmation-link')).toBeVisible();
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-06-unconfirmed-email`);
  });

  test('403 message "email not confirmed" also passes through with a resend link', async ({ page }) => {
    // Same account state, different status + payload key — the backend uses 403
    // when the credentials are valid but the account is not yet usable.
    await page.route('**/rest/api/login', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Your email is not confirmed. Please check your inbox.' }),
      }),
    );

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill('pending@example.com');
    await page.getByTestId('login-password-input').fill('somepassword');
    await page.getByTestId('login-submit-button').click();

    const errorBanner = page.getByTestId('login-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('email is not confirmed');
    await expect(errorBanner).not.toContainText('status code');
    await expect(page.getByTestId('login-resend-confirmation-link')).toBeVisible();
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-07-unconfirmed-403`);
  });

  test('server error (500) shows a friendly message, not a raw status string', async ({ page }) => {
    await page.route('**/rest/api/login', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '' }),
    );

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill('user@example.com');
    await page.getByTestId('login-password-input').fill('password');
    await page.getByTestId('login-submit-button').click();

    const errorBanner = page.getByTestId('login-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toHaveText(/something went wrong/i);
    await expect(errorBanner).not.toHaveText(/status code/i);
    // parseApiError's 401 branch says "Session expired" — must never reach a login.
    await expect(errorBanner).not.toHaveText(/session expired/i);
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-08-server-error`);
  });

  test('server 503 shows the same friendly retry guidance', async ({ page }) => {
    await page.route('**/rest/api/login', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill('user@example.com');
    await page.getByTestId('login-password-input').fill('password');
    await page.getByTestId('login-submit-button').click();

    const errorBanner = page.getByTestId('login-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).not.toContainText('status code');
    await expect(errorBanner).toContainText(/temporarily unavailable|try again/i);
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-09-server-unavailable`);
  });
});
