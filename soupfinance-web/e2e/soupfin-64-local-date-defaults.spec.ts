/**
 * SOUPFIN-64 — report default date ranges are off by one day east of UTC.
 *
 * `new Date(y, m, 1).toISOString().split('T')[0]` builds a Date at LOCAL
 * midnight then converts it to UTC, so at any positive UTC offset the string
 * rolls back a day. Trial Balance, Cash Flow and P&L therefore opened on
 * 2026-07-31 .. 2026-08-30 instead of 2026-08-01 .. 2026-08-31 — the last day
 * of the month silently excluded from every default view, so month-end figures
 * read low. The milder `new Date().toISOString().split('T')[0]` "today" gave
 * UTC today rather than local today on Balance Sheet, Aging and the invoice,
 * bill and payment forms.
 *
 * This spec pins the fix through the real browser: the context runs in
 * Europe/Paris (UTC+02:00 in August) with the clock frozen at an instant where
 * the local calendar day and the UTC day differ (see FROZEN_NOW below), so every
 * default the user actually sees must be the LOCAL date. Against the pre-fix
 * build every assertion below reads one day early.
 *
 * Navigation is by CLICKING the sidebar, never `page.goto` on an internal route.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockAmbientApi,
  mockTokenValidationApi,
  mockDashboardApi,
  isLxcMode,
} from './fixtures';

/** Git-tracked screenshot dir — `test-results/` is wiped at the start of every run. */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-64/${name}.png`,
    fullPage: true,
  });
}

/**
 * Frozen instant, chosen so BOTH halves of the bug are observable at once:
 * 23:30 UTC on the 15th is already 01:30 on the 16th in Paris (UTC+02:00).
 *
 *   local calendar day  -> 2026-08-16   (what the user sees)
 *   toISOString() day   -> 2026-08-15   (what the old code returned)
 *
 * Picking midday UTC instead would make the two agree, and every "today"
 * assertion below would pass against the pre-fix build — the trap that makes
 * this bug invisible from Ghana in the first place.
 */
const FROZEN_NOW = new Date('2026-08-15T23:30:00Z');
const LOCAL_TODAY = '2026-08-16';
const MONTH_START = '2026-08-01';
const MONTH_END = '2026-08-31';

/** The dates the pre-fix build produced in Paris. Named so failures read clearly. */
const BUGGY_MONTH_START = '2026-07-31';
const BUGGY_MONTH_END = '2026-08-30';
/** UTC "today" at FROZEN_NOW — a day behind the user's own calendar. */
const BUGGY_TODAY = '2026-08-15';

// Europe/Paris is UTC+02:00 in August — a positive offset, which is the only
// condition under which this bug is observable. A UTC run cannot catch it.
test.use({ timezoneId: 'Europe/Paris', locale: 'en-GB' });

test.describe('SOUPFIN-64: date defaults follow the local calendar, not UTC', () => {
  test.skip(isLxcMode(), 'Mock-only spec: it freezes the clock and forces a timezone');

  test.beforeEach(async ({ page }) => {
    // Freeze before any app script runs so every `new Date()` sees FROZEN_NOW.
    await page.clock.install({ time: FROZEN_NOW });

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

    // Capture the query string every report request carries, so the assertions
    // can check what the page ASKED FOR, not only what it displays.
    await page.route('**/rest/financeReports/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resultList: {}, accountList: [], itemList: [] }),
      })
    );
  });

  /** Open a Reports sub-page by clicking the sidebar group, then the child link. */
  async function navigateToReport(page: Page, childLabel: string) {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await page.getByRole('link', { name: childLabel, exact: true }).click();
  }

  test('Trial Balance opens on the whole local month, not one day short at each end', async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/financeReports/trialBalance')) requested.push(req.url());
    });

    await navigateToReport(page, 'Trial Balance');
    await expect(page.getByTestId('trial-balance-page')).toBeVisible({ timeout: 15000 });
    await shot(page, 'trial-balance-default-range-paris');

    const from = page.getByTestId('trial-balance-filter-from');
    const to = page.getByTestId('trial-balance-filter-to');

    await expect(from).toHaveValue(MONTH_START);
    await expect(to).toHaveValue(MONTH_END);
    // Spell the defect out so a regression names itself.
    await expect(from).not.toHaveValue(BUGGY_MONTH_START);
    await expect(to).not.toHaveValue(BUGGY_MONTH_END);

    // And the request actually sent carried the same range.
    await expect.poll(() => requested.length).toBeGreaterThan(0);
    expect(requested[0]).toContain(`from=${MONTH_START}`);
    expect(requested[0]).toContain(`to=${MONTH_END}`);
  });

  test('Cash Flow opens on the first of the local month through local today', async ({ page }) => {
    await navigateToReport(page, 'Cash Flow');
    await expect(page.getByTestId('cash-flow-page')).toBeVisible({ timeout: 15000 });
    await shot(page, 'cash-flow-default-range-paris');

    await expect(page.getByTestId('cash-flow-from-date')).toHaveValue(MONTH_START);
    await expect(page.getByTestId('cash-flow-from-date')).not.toHaveValue(BUGGY_MONTH_START);
    await expect(page.getByTestId('cash-flow-to-date')).toHaveValue(LOCAL_TODAY);
    await expect(page.getByTestId('cash-flow-to-date')).not.toHaveValue(BUGGY_TODAY);
  });

  test('Profit & Loss opens on the first of the local month through local today', async ({
    page,
  }) => {
    await navigateToReport(page, 'Profit & Loss');
    await expect(page.getByTestId('profit-loss-page')).toBeVisible({ timeout: 15000 });
    await shot(page, 'profit-loss-default-range-paris');

    await expect(page.getByTestId('profit-loss-from-date')).toHaveValue(MONTH_START);
    await expect(page.getByTestId('profit-loss-from-date')).not.toHaveValue(BUGGY_MONTH_START);
    await expect(page.getByTestId('profit-loss-to-date')).toHaveValue(LOCAL_TODAY);
    await expect(page.getByTestId('profit-loss-to-date')).not.toHaveValue(BUGGY_TODAY);
  });

  test('Balance Sheet is "as of" the local day', async ({ page }) => {
    await navigateToReport(page, 'Balance Sheet');
    await expect(page.getByTestId('balance-sheet-page')).toBeVisible({ timeout: 15000 });
    await shot(page, 'balance-sheet-as-of-paris');

    const asOf = page.locator('input[type="date"]').first();
    await expect(asOf).toHaveValue(LOCAL_TODAY);
    await expect(asOf).not.toHaveValue(BUGGY_TODAY);
  });

  test('Aging Reports are "as of" the local day', async ({ page }) => {
    await navigateToReport(page, 'Aging Reports');
    await expect(page.getByTestId('aging-reports-page')).toBeVisible({ timeout: 15000 });
    await shot(page, 'aging-as-of-paris');

    const asOf = page.locator('input[type="date"]').first();
    await expect(asOf).toHaveValue(LOCAL_TODAY);
    await expect(asOf).not.toHaveValue(BUGGY_TODAY);
  });

  test('a new invoice defaults to the local day, not UTC today', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Invoices', exact: true }).click();
    await expect(page.getByTestId('invoice-list-page')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('invoice-new-button').click();

    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });
    await shot(page, 'invoice-form-default-date-paris');

    await expect(page.getByTestId('invoice-date-input')).toHaveValue(LOCAL_TODAY);
    await expect(page.getByTestId('invoice-date-input')).not.toHaveValue(BUGGY_TODAY);
  });
});
