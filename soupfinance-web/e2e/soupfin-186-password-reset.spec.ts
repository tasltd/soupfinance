/**
 * SOUPFIN-186 — password recovery pages
 *
 * The backend actions /account/forgotPassword.json and /account/resetPassword.json
 * do not exist yet (plans/soupfin-186-password-reset-backend.md). Today the backend
 * answers 302 to https://tas.soupmarkets.com/login/auth. That page sends CORS
 * headers for app.soupfinance.com, so the browser follows the redirect and the
 * request "succeeds" with a 200 HTML page. This spec covers what the pages must do:
 *
 *   1. Forgot password, reached by clicking the link on the sign-in page:
 *      - a 200 shows the generic "link sent" banner and posts the typed email
 *      - today's 302 shows an error, never "link sent"
 *   2. Reset password, reached from the emailed link (an external URL, so goto):
 *      - TOKEN_EXPIRED swaps the form for a "request a new link" screen whose
 *        button leads back to forgot password
 *      - success leads to sign in
 *
 * Mock mode only: the responses follow the contract in the backend plan. The LXC
 * round trip (request, token, reset, login) lands once the backend ships.
 *
 * Run: npx playwright test e2e/soupfin-186-password-reset.spec.ts --project=firefox
 */
import { test, expect, type Page } from '@playwright/test';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-186';

test.use({ viewport: { width: 1440, height: 900 } });

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

/** Sign-in page → "Forgot password?" by clicking, the way a user gets there. */
async function openForgotPasswordFromLogin(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-forgot-password-link').click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByTestId('forgot-password-heading')).toBeVisible();
}

test.describe('SOUPFIN-186 password recovery', () => {
  test.skip(isLxcMode(), 'Mock-mode spec: the backend actions are not deployed yet');

  let guard: UnmockedApiGuard;

  test.beforeEach(async ({ page }) => {
    // Installed first so the specific mocks below take precedence (last route wins)
    guard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    guard.assertNone('SOUPFIN-186');
  });

  test('forgot password: a 200 shows the generic "link sent" banner', async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route('**/account/forgotPassword.json', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'If an account exists for that email, a password reset link has been sent.',
        }),
      });
    });

    await openForgotPasswordFromLogin(page);
    await shot(page, '01-forgot-password-page');

    await page.getByTestId('forgot-password-email-input').fill('jane@acme.com');
    await shot(page, '02-forgot-password-filled');
    await page.getByTestId('forgot-password-submit-button').click();

    const banner = page.getByTestId('forgot-password-success');
    await expect(banner).toContainText('jane@acme.com');
    await expect(page.getByTestId('forgot-password-error')).toHaveCount(0);
    expect(bodies).toEqual([{ email: 'jane@acme.com' }]);
    await shot(page, '03-forgot-password-sent');
  });

  test('forgot password: today\'s 302 to the backend login shows an error, not "link sent"', async ({ page }) => {
    // Replays production on 2026-10-13: 302 to the backend's own login page,
    // which answers 200 text/html with Access-Control-Allow-Origin for the app.
    await page.route('**/account/forgotPassword.json', (route) =>
      route.fulfill({ status: 302, headers: { location: 'https://tas.soupmarkets.com/login/auth' } }),
    );
    await page.route('https://tas.soupmarkets.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html;charset=UTF-8',
        headers: { 'access-control-allow-origin': '*' },
        body: '<html><body>Login</body></html>',
      }),
    );

    await openForgotPasswordFromLogin(page);
    await page.getByTestId('forgot-password-email-input').fill('jane@acme.com');
    await page.getByTestId('forgot-password-submit-button').click();

    await expect(page.getByTestId('forgot-password-error')).toBeVisible();
    await expect(page.getByTestId('forgot-password-error-message')).toHaveText(
      'Password reset is not available right now. Please try again later or contact support.',
    );
    await expect(page.getByTestId('forgot-password-success')).toHaveCount(0);
    // No cooldown after a failure: the user can try again at once
    await expect(page.getByTestId('forgot-password-submit-button')).toBeEnabled();
    await shot(page, '04-forgot-password-failed');
  });

  test('reset password: an expired link offers a new one', async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route('**/account/resetPassword.json', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'This password reset link has expired.',
        }),
      });
    });

    // The link arrives by email, so the user opens it from outside the app
    await page.goto('/reset-password?token=tok_expired_123');
    await expect(page.getByTestId('reset-password-heading')).toBeVisible();
    await page.getByTestId('reset-password-input').fill('NewPass123!');
    await page.getByTestId('reset-password-confirm-input').fill('NewPass123!');
    await shot(page, '05-reset-password-filled');
    await page.getByTestId('reset-password-submit-button').click();

    await expect(page.getByTestId('reset-password-link-error-heading')).toHaveText('Reset Link Expired');
    await expect(page.getByTestId('reset-password-link-error-message')).toHaveText(
      'This password reset link has expired.',
    );
    await expect(page.getByTestId('reset-password-form')).toHaveCount(0);
    expect(bodies).toEqual([
      { token: 'tok_expired_123', password: 'NewPass123!', confirmPassword: 'NewPass123!' },
    ]);
    await shot(page, '06-reset-password-link-expired');

    await page.getByTestId('reset-password-request-new-link').click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByTestId('forgot-password-heading')).toBeVisible();
    await shot(page, '07-back-to-forgot-password');
  });

  test('reset password: a 200 HTML page is not reported as a reset', async ({ page }) => {
    await page.route('**/account/resetPassword.json', (route) =>
      route.fulfill({ status: 302, headers: { location: 'https://tas.soupmarkets.com/login/auth' } }),
    );
    await page.route('https://tas.soupmarkets.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html;charset=UTF-8',
        headers: { 'access-control-allow-origin': '*' },
        body: '<html><body>Login</body></html>',
      }),
    );

    await page.goto('/reset-password?token=tok_any_789');
    await page.getByTestId('reset-password-input').fill('NewPass123!');
    await page.getByTestId('reset-password-confirm-input').fill('NewPass123!');
    await page.getByTestId('reset-password-submit-button').click();

    await expect(page.getByTestId('reset-password-error-message')).toHaveText(
      'Password reset is not available right now. Please try again later or contact support.',
    );
    await expect(page.getByTestId('reset-password-success-heading')).toHaveCount(0);
    await expect(page.getByTestId('reset-password-form')).toBeVisible();
    await shot(page, '08-reset-password-unavailable');
  });

  test('reset password: success leads to sign in', async ({ page }) => {
    await page.route('**/account/resetPassword.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Your password has been reset. You can now sign in.' }),
      }),
    );

    await page.goto('/reset-password?token=tok_good_456');
    await page.getByTestId('reset-password-input').fill('NewPass123!');
    await page.getByTestId('reset-password-confirm-input').fill('NewPass123!');
    await page.getByTestId('reset-password-submit-button').click();

    await expect(page.getByTestId('reset-password-success-heading')).toBeVisible();
    await shot(page, '09-reset-password-success');

    await page.getByTestId('reset-password-login-link').click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
