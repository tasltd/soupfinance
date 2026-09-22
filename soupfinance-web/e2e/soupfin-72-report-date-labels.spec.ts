/**
 * SOUPFIN-72 — report date LABELS render a day early west of UTC.
 *
 * Mirror image of SOUPFIN-64, on the READ side. Cash Flow, Balance Sheet and
 * P&L each formatted a YYYY-MM-DD string by handing it straight to
 * `new Date()`. The ECMAScript date-only form is parsed as UTC midnight, and
 * `toLocaleDateString()` then renders it in LOCAL time, so at any negative UTC
 * offset the label shows the previous day:
 *
 *   UTC               -> August 1, 2026   (correct)
 *   Europe/Paris      -> August 1, 2026   (correct)
 *   America/New_York  -> July 31, 2026    (wrong)
 *
 * A user in the Americas sets a Cash Flow range of 1-31 August and the header
 * reads "July 31, 2026 to August 30, 2026", while the inputs and the figures
 * are correctly August. The numbers are right; only the label lies.
 *
 * This spec pins the fix through the real browser. The context runs in
 * America/New_York — a NEGATIVE offset, the only condition under which this bug
 * is observable. SOUPFIN-64 needed a POSITIVE offset, so the two specs
 * deliberately run in opposite timezones; neither alone catches both, and a UTC
 * run catches neither.
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
    path: `e2e/playwright/screenshots/soupfin-72/${name}.png`,
    fullPage: true,
  });
}

/**
 * Midday UTC mid-month. New York is UTC-04:00 in August, so the local calendar
 * day is the same 15th — this spec is about FORMATTING a correct date string,
 * not about picking the right one (that is SOUPFIN-64's job). Keeping the two
 * days equal here means any failure below can only be the label bug.
 */
const FROZEN_NOW = new Date('2026-08-15T12:00:00Z');

/** The default range the pages open on: first of the local month .. local today. */
const MONTH_START_LABEL = 'August 1, 2026';
const TODAY_LABEL = 'August 15, 2026';

/** What the pre-fix build rendered in New York. Named so a failure reads clearly. */
const BUGGY_MONTH_START_LABEL = 'July 31, 2026';
const BUGGY_TODAY_LABEL = 'August 14, 2026';

// A negative UTC offset is required to observe this bug at all.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

test.describe('SOUPFIN-72: report date labels follow the local calendar', () => {
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
  });

  /**
   * Report responses carrying real rows, so the pages render their POPULATED
   * header rather than the empty state. The header dates come from the filters,
   * so what is asserted below is purely how those filter dates are formatted.
   */
  async function mockPopulatedReports(page: Page) {
    await page.route('**/rest/financeReports/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ledgerAccountList: [
            {
              id: 'acc-1',
              name: 'Cash at Bank',
              ledgerGroup: 'ASSET',
              startingBalance: 1000,
              calculatedBalance: 1000,
            },
            {
              id: 'acc-2',
              name: 'Share Capital',
              ledgerGroup: 'EQUITY',
              startingBalance: 1000,
              calculatedBalance: 1000,
            },
            {
              id: 'acc-3',
              name: 'Consulting Revenue',
              ledgerGroup: 'REVENUE',
              startingBalance: 0,
              calculatedBalance: -5000,
            },
            {
              id: 'acc-4',
              name: 'Office Rent',
              ledgerGroup: 'EXPENSE',
              startingBalance: 0,
              calculatedBalance: 2000,
            },
          ],
          resultList: [
            {
              id: 'tx-1',
              ledgerAccountName: 'Cash at Bank',
              description: 'Client payment',
              debitAmount: 5000,
              creditAmount: 0,
            },
          ],
        }),
      })
    );
  }

  /** Report responses with no rows, which drives each page into its empty state. */
  async function mockEmptyReports(page: Page) {
    await page.route('**/rest/financeReports/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ledgerAccountList: [], resultList: [] }),
      })
    );
  }

  /** Open a Reports sub-page by clicking the sidebar group, then the child link. */
  async function navigateToReport(page: Page, childLabel: string) {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await page.getByRole('link', { name: childLabel, exact: true }).click();
  }

  test('Cash Flow header names the period the user actually chose', async ({ page }) => {
    await mockPopulatedReports(page);
    await navigateToReport(page, 'Cash Flow');

    const pageRoot = page.getByTestId('cash-flow-page');
    await expect(pageRoot).toBeVisible({ timeout: 15000 });
    // The header only renders once the query resolves.
    await expect(
      pageRoot.getByText(`${MONTH_START_LABEL} to ${TODAY_LABEL}`)
    ).toBeVisible({ timeout: 15000 });
    await shot(page, 'cash-flow-header-new-york');

    // The inputs and the label must agree — the bug was that they did not.
    await expect(page.getByTestId('cash-flow-from-date')).toHaveValue('2026-08-01');
    await expect(page.getByTestId('cash-flow-to-date')).toHaveValue('2026-08-15');

    // Spell the defect out so a regression names itself.
    await expect(pageRoot).not.toContainText(BUGGY_MONTH_START_LABEL);
    await expect(pageRoot).not.toContainText(BUGGY_TODAY_LABEL);
  });

  test('Profit & Loss header names the period the user actually chose', async ({ page }) => {
    await mockPopulatedReports(page);
    await navigateToReport(page, 'Profit & Loss');

    const pageRoot = page.getByTestId('profit-loss-page');
    await expect(pageRoot).toBeVisible({ timeout: 15000 });
    await expect(
      pageRoot.getByText(`${MONTH_START_LABEL} - ${TODAY_LABEL}`)
    ).toBeVisible({ timeout: 15000 });
    await shot(page, 'profit-loss-header-new-york');

    await expect(page.getByTestId('profit-loss-from-date')).toHaveValue('2026-08-01');
    await expect(page.getByTestId('profit-loss-to-date')).toHaveValue('2026-08-15');

    await expect(pageRoot).not.toContainText(BUGGY_MONTH_START_LABEL);
    await expect(pageRoot).not.toContainText(BUGGY_TODAY_LABEL);
  });

  test('Balance Sheet header names the as-of day the user actually chose', async ({ page }) => {
    await mockPopulatedReports(page);
    await navigateToReport(page, 'Balance Sheet');

    const pageRoot = page.getByTestId('balance-sheet-page');
    await expect(pageRoot).toBeVisible({ timeout: 15000 });
    await expect(pageRoot.getByText(`As of ${TODAY_LABEL}`)).toBeVisible({ timeout: 15000 });
    await shot(page, 'balance-sheet-header-new-york');

    await expect(page.locator('input[type="date"]').first()).toHaveValue('2026-08-15');
    await expect(pageRoot).not.toContainText(BUGGY_TODAY_LABEL);
  });

  test('a user-picked range is labelled with the same days it was typed as', async ({ page }) => {
    await mockPopulatedReports(page);
    await navigateToReport(page, 'Cash Flow');
    await expect(page.getByTestId('cash-flow-page')).toBeVisible({ timeout: 15000 });

    // The exact range from the issue report: 1-31 August, which the pre-fix
    // build labelled "July 31, 2026 to August 30, 2026".
    await page.getByTestId('cash-flow-from-date').fill('2026-08-01');
    await page.getByTestId('cash-flow-to-date').fill('2026-08-31');

    const pageRoot = page.getByTestId('cash-flow-page');
    await expect(pageRoot.getByText('August 1, 2026 to August 31, 2026')).toBeVisible({
      timeout: 15000,
    });
    await shot(page, 'cash-flow-user-range-new-york');

    await expect(pageRoot).not.toContainText('July 31, 2026');
    await expect(pageRoot).not.toContainText('August 30, 2026');
  });

  test('empty states name the period rather than the day before it', async ({ page }) => {
    await mockEmptyReports(page);
    await navigateToReport(page, 'Cash Flow');

    const empty = page.getByTestId('cash-flow-empty');
    await expect(empty).toBeVisible({ timeout: 15000 });
    await shot(page, 'cash-flow-empty-new-york');

    await expect(empty).toContainText(MONTH_START_LABEL);
    await expect(empty).toContainText(TODAY_LABEL);
    await expect(empty).not.toContainText(BUGGY_MONTH_START_LABEL);
    await expect(empty).not.toContainText(BUGGY_TODAY_LABEL);
  });

  test('Balance Sheet empty state names the as-of day, not the day before', async ({ page }) => {
    await mockEmptyReports(page);
    await navigateToReport(page, 'Balance Sheet');

    const empty = page.getByTestId('balance-sheet-empty');
    await expect(empty).toBeVisible({ timeout: 15000 });
    await shot(page, 'balance-sheet-empty-new-york');

    await expect(empty).toContainText(TODAY_LABEL);
    await expect(empty).not.toContainText(BUGGY_TODAY_LABEL);
  });
});
