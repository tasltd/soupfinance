/**
 * SOUPFIN-49 — a 401 must land the user on the LOGIN FORM, not back on /dashboard.
 *
 * Failure mode: the 401 branch of the response interceptor (src/api/client.ts) cleared
 * `access_token` and `user` from both storages, then set window.location.href = '/login'.
 * It did NOT clear Zustand's persisted `auth-storage` key, which is what
 * useAuthStore.isAuthenticated rehydrates from. So on arriving at /login, PublicRoute
 * (src/App.tsx) saw isAuthenticated === true and immediately forwarded the user to
 * /dashboard — an app that still renders the avatar and KPI tiles as though signed in,
 * but where every subsequent request 401s and nothing ever loads.
 *
 * The fix (handleUnauthorized in client.ts) clears the persisted key AND resets the
 * in-memory store, so PublicRoute sees an unauthenticated user and renders the form.
 *
 * This spec drives the real browser: it logs in through the form, navigates by clicking
 * the sidebar, and expires the session mid-navigation. It asserts the FINAL settled URL,
 * which is the whole point of the bug — the pre-fix app also touched /login briefly
 * before bouncing to /dashboard, so an assertion that catches the hop mid-flight proves
 * nothing.
 *
 * Screenshots land in e2e/playwright/screenshots/soupfin-49/ and are committed.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockLoginApi,
  mockTokenValidationApi,
  mockAmbientApi,
  mockInvoicesApi,
  mockBillsApi,
  isLxcMode,
} from './fixtures';

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-49/${name}.png`,
    fullPage: true,
  });
}

/** Read the auth artefacts the way the app does (dual-storage + persisted store). */
async function readAuthState(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('auth-storage');
    let persistedIsAuthenticated: boolean | null = null;
    if (raw) {
      try {
        persistedIsAuthenticated = JSON.parse(raw).state?.isAuthenticated ?? null;
      } catch {
        persistedIsAuthenticated = null;
      }
    }
    return {
      persistedIsAuthenticated,
      token:
        localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || null,
    };
  });
}

/** Sign in through the real form. /login is the one URL allowed to be entered directly. */
async function signIn(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('login-email-input').fill('admin@soupfinance.com');
  await page.getByTestId('login-password-input').fill('password123');
  await page.getByTestId('login-submit-button').click();

  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20000 });
}

test.describe('SOUPFIN-49 — session expiry lands on the login form', () => {
  test.beforeEach(async ({ page }) => {
    if (isLxcMode()) return;
    // mockAmbientApi FIRST — it exists precisely because an unmocked /rest/* call in
    // "mock" mode is proxied to a real backend that answers 401, which now (correctly)
    // signs the user out mid-test. Registration order matters: Playwright matches route
    // handlers in reverse registration order, so anything registered later wins.
    await mockAmbientApi(page);
    await mockInvoicesApi(page, []);
    await mockBillsApi(page, []);
    await mockLoginApi(page, true);
    await mockTokenValidationApi(page, true);
  });

  test('a 401 while opening Invoices settles on /login with the form visible', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }

    // --- Arrange: a genuinely signed-in session -----------------------------
    await signIn(page);
    await shot(page, '01-signed-in-dashboard');

    const afterLogin = await readAuthState(page);
    expect(afterLogin.persistedIsAuthenticated).toBe(true);
    expect(afterLogin.token).not.toBeNull();

    // --- Act: the backend session expires; the next call 401s ---------------
    // Registered after the base mocks so it wins (Playwright route matching is LIFO).
    await page.route('**/rest/invoice/**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized', message: 'Token expired or invalid' }),
      })
    );
    // /rest/user/current.json must 401 too — otherwise the reload re-validates the
    // stale token successfully and re-authenticates, which is not session expiry.
    await page.route('**/rest/user/current.json*', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized', message: 'Token expired or invalid' }),
      })
    );

    // Navigate by CLICKING the sidebar, never page.goto for an internal route.
    await page.getByRole('link', { name: 'Invoices' }).click();

    // --- Assert: the FINAL settled state, not a mid-flight hop --------------
    await page.waitForURL('**/login', { timeout: 20000 });
    // Let any bounce-back to /dashboard happen before asserting; before the fix this
    // is exactly where the app moved off /login.
    await page.waitForTimeout(2000);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('login-email-input')).toBeVisible();
    await expect(page.getByTestId('dashboard-page')).toHaveCount(0);
    await shot(page, '02-settles-on-login-form');

    // The persisted key must no longer claim an authenticated session — this is the
    // exact value PublicRoute reads.
    const afterExpiry = await readAuthState(page);
    expect(afterExpiry.persistedIsAuthenticated).not.toBe(true);
    expect(afterExpiry.token).toBeNull();
  });

  test('no authenticated chrome survives, and the user can sign in again', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }

    await signIn(page);

    await page.route('**/rest/invoice/**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    );
    await page.route('**/rest/user/current.json*', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    );

    await page.getByRole('link', { name: 'Invoices' }).click();
    await page.waitForURL('**/login', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // The reported symptom was an app that "still renders the admin avatar and KPI
    // tiles as though logged in". None of that authenticated chrome may remain.
    await expect(page.getByTestId('logout-button')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-page')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Invoices' })).toHaveCount(0);
    await shot(page, '03-no-authenticated-chrome-remains');

    // NOTE: the store's "Session expired" message is deliberately NOT asserted here.
    // handleUnauthorized navigates via window.location.href, which is a full document
    // load, and authStore's persist partialize keeps only { user, isAuthenticated } —
    // so `error` cannot survive the reload. It is only user-visible on the no-reload
    // path (a 401 arriving while already on /login), which the unit test covers.

    // Round trip: the recovered session signs in cleanly from this very form, so the
    // user is not stranded. Restore healthy responses first.
    await page.unroute('**/rest/invoice/**');
    await page.unroute('**/rest/user/current.json*');
    await mockTokenValidationApi(page, true);

    await page.getByTestId('login-email-input').fill('admin@soupfinance.com');
    await page.getByTestId('login-password-input').fill('password123');
    await page.getByTestId('login-submit-button').click();

    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20000 });
    await shot(page, '04-signs-back-in-successfully');
  });

  test('a healthy session still navigates normally (guards over-clearing)', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }

    // Arrange: the beforeEach catch-all already resolves every /rest/* call 200 —
    // no 401 anywhere in this test.
    await signIn(page);
    await page.getByRole('link', { name: 'Invoices' }).click();

    // Assert: the fix must not log healthy users out. Staying on /invoices with the
    // session intact is what separates "clears on 401" from "clears on everything".
    await expect(page.getByTestId('invoice-list-page')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/invoices$/);
    // Wait for the list to SETTLE before shooting — a capture taken while
    // "Loading invoices..." is on screen is not evidence the page works.
    await expect(page.getByText(/loading invoices/i)).toHaveCount(0, { timeout: 20000 });

    const state = await readAuthState(page);
    expect(state.persistedIsAuthenticated).toBe(true);
    expect(state.token).not.toBeNull();
    await shot(page, '05-healthy-session-unaffected');
  });
});
