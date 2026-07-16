/**
 * SOUPFIN-29 E2E: Friendly login/signup error messages
 *
 * Bug: an invalid login showed the raw Axios message
 * "Request failed with status code 401" instead of a user-friendly message.
 *
 * These tests drive the real LoginPage through the UI (menu/link navigation),
 * mock the /rest/api/login endpoint with the various failure shapes the backend
 * can return, and assert the rendered error banner is human-readable — never the
 * raw HTTP status string. Screenshots are captured at every validation point.
 *
 * Mock-only: skipped in LXC mode (we control the 401 response shape here).
 */
import { test, expect } from '@playwright/test';
import { takeScreenshot, isLxcMode } from './fixtures';

const SCREENSHOT_PREFIX = 'soupfin-29-login-error';

test.describe('SOUPFIN-29 — login error messaging', () => {
  test.skip(isLxcMode(), 'Mock-only test: controls the 401 response shape');

  test.beforeEach(async ({ page }) => {
    // Start from a clean auth state so we always land on the login page.
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('bare 401 (no body) shows friendly message, not "status code 401"', async ({ page }) => {
    // Reproduce the exact bug: backend rejects with 401 and an empty body.
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

  test('descriptive "email not confirmed" message is surfaced with a resend link', async ({ page }) => {
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
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-05-unconfirmed-email`);
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
    await expect(errorBanner).not.toHaveText(/session expired/i);
    await takeScreenshot(page, `${SCREENSHOT_PREFIX}-06-server-error`);
  });
});
