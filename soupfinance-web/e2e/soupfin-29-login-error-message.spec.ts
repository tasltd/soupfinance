/**
 * SOUPFIN-29 E2E: Login/Signup shows a user-friendly error, never raw HTTP.
 *
 * Bug: entering wrong credentials showed "Request failed with status code 401".
 * Fix: authStore uses getLoginErrorMessage() → "Invalid username or password.",
 *      while descriptive backend messages (email not confirmed) pass through so
 *      the Resend Confirmation link still appears.
 *
 * Mock-mode only: we drive the real UI (fill form, click submit) and assert the
 * rendered error text. Skipped against the LXC backend (can't force a 401 body).
 */
import { test, expect } from '@playwright/test';
import { takeScreenshot, isLxcMode } from './fixtures';

test.describe('SOUPFIN-29 — friendly login error messages', () => {
  test.skip(isLxcMode(), 'Mock-only: needs a forced 401/403 response body');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('401 renders "Invalid username or password.", not the raw status code', async ({ page }) => {
    // Backend rejects bad credentials with 401 + a jargon body we must NOT show.
    await page.route('**/rest/api/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized', message: 'Bad credentials' }),
      }),
    );

    await page.goto('/login');
    await takeScreenshot(page, 'soupfin-29-login-initial');

    await page.getByTestId('login-email-input').fill('wrong@example.com');
    await page.getByTestId('login-password-input').fill('wrongpassword');
    await takeScreenshot(page, 'soupfin-29-login-form-filled');

    await page.getByTestId('login-submit-button').click();

    const errorBox = page.getByTestId('login-error');
    await expect(errorBox).toBeVisible();
    // The fix: friendly copy, no HTTP jargon leaked to the user.
    await expect(errorBox).toContainText('Invalid username or password.');
    await expect(errorBox).not.toContainText('status code');
    await expect(errorBox).not.toContainText('Bad credentials');
    await takeScreenshot(page, 'soupfin-29-login-friendly-error');

    // Stayed on the login page — no navigation on failure.
    await expect(page).toHaveURL(/\/login/);
  });

  test('descriptive "email not confirmed" message passes through with Resend link', async ({ page }) => {
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

    const errorBox = page.getByTestId('login-error');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toContainText('email is not confirmed');
    await expect(errorBox).not.toContainText('status code');
    // The account-state message must still trigger the Resend Confirmation link.
    await expect(page.getByTestId('login-resend-confirmation-link')).toBeVisible();
    await takeScreenshot(page, 'soupfin-29-login-unconfirmed-with-resend');
  });

  test('server 5xx shows a friendly temporary-unavailable message', async ({ page }) => {
    await page.route('**/rest/api/login', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/login');
    await page.getByTestId('login-email-input').fill('user@example.com');
    await page.getByTestId('login-password-input').fill('password');
    await page.getByTestId('login-submit-button').click();

    const errorBox = page.getByTestId('login-error');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).not.toContainText('status code');
    await expect(errorBox).toContainText(/temporarily unavailable|try again/i);
    await takeScreenshot(page, 'soupfin-29-login-server-error');
  });
});
