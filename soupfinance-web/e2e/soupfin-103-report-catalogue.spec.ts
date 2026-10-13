/**
 * SOUPFIN-103 — report catalogue: registry, shared shell, comparison, export,
 * favourites.
 *
 * Walks the feature the way a user meets it: the sidebar's Reports link, the
 * hub's categories, search and favourites, then each report opened from its
 * hub card. Every report request is captured, so the assertions check what the
 * page ASKED the backend for (dates, comparison period, export format) as well
 * as what it shows.
 *
 * The tenant is pinned to Ghana cedi: no amount on any report may print "$".
 * The browser runs WEST of UTC (Los Angeles), where `new Date('2026-08-01')`
 * prints July 31, and a second block runs EAST of UTC (Kiritimati, UTC+14),
 * where the SOUPFIN-64 default-range bug lived. Navigation is by clicking,
 * never `page.goto` on an internal route.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import {
  installUnmockedApiGuard,
  isLxcMode,
  mockAmbientApi,
  mockDashboardApi,
  mockTokenValidationApi,
  type UnmockedApiGuard,
} from './fixtures';

/** Git-tracked screenshot dir — `test-results/` is wiped at the start of every run. */
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/playwright/screenshots/soupfin-103/${name}.png`, fullPage: true });
}

// Midday UTC on the 15th: 05:00 on Aug 15 in Los Angeles, 02:00 on Aug 16 in Kiritimati.
const FROZEN_NOW = new Date('2026-08-15T12:00:00Z');

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Seeded session + GHS tenant + every mock the dashboard and reports need. */
async function setUp(page: Page) {
  await page.clock.install({ time: FROZEN_NOW });
  await page.addInitScript(() => {
    const user = { username: 'admin', email: 'admin@soupfinance.com', roles: ['ROLE_ADMIN', 'ROLE_USER'], tenantId: 'account-001' };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('auth-storage', JSON.stringify({ state: { user, isAuthenticated: true }, version: 0 }));
  });
  await mockAmbientApi(page);
  await mockTokenValidationApi(page, true);
  await mockDashboardApi(page);
  // Registered after mockTokenValidationApi: routes are LIFO, so GHS wins over its USD default.
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill(json({ id: 'account-001', name: 'Accra Consulting', currency: 'GHS', dateCreated: '2024-01-01T00:00:00Z' }))
  );
}

/** Every financeReports request the page makes, as URLs. */
function captureReportRequests(page: Page): URL[] {
  const urls: URL[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/rest/financeReports/')) urls.push(new URL(req.url()));
  });
  return urls;
}

/** An export request answers with file bytes; anything else falls through to the data mock. */
async function fulfilExport(route: Route): Promise<boolean> {
  const format = new URL(route.request().url()).searchParams.get('f');
  if (!format) return false;
  await route.fulfill({
    status: 200,
    contentType: format === 'csv' ? 'text/csv' : format === 'excel' ? 'application/vnd.ms-excel' : 'application/pdf',
    body: format === 'csv' ? 'Account,Amount\nConsulting,1250000\n' : 'binary-report-bytes',
  });
  return true;
}

async function mockReports(page: Page) {
  await page.route('**/rest/financeReports/incomeStatement.json*', async (route) => {
    if (await fulfilExport(route)) return;
    const from = new URL(route.request().url()).searchParams.get('from') ?? '';
    const current = from.startsWith('2026-08');
    await route.fulfill(
      json({
        ledgerAccountList: current
          ? [
              { id: 'r1', name: 'Consulting fees', currency: 'GHS', calculatedBalance: -1_250_000, ledgerGroup: 'REVENUE' },
              { id: 'r2', name: 'Training', currency: 'GHS', calculatedBalance: -30_000, ledgerGroup: 'REVENUE' },
              { id: 'e1', name: 'Office rent', currency: 'GHS', calculatedBalance: 400_000, ledgerGroup: 'EXPENSE' },
            ]
          : [
              { id: 'r1', name: 'Consulting fees', currency: 'GHS', calculatedBalance: -900_000, ledgerGroup: 'REVENUE' },
              { id: 'e1', name: 'Office rent', currency: 'GHS', calculatedBalance: 380_000, ledgerGroup: 'EXPENSE' },
            ],
      })
    );
  });

  await page.route('**/rest/financeReports/balanceSheet.json*', async (route) => {
    if (await fulfilExport(route)) return;
    const to = new URL(route.request().url()).searchParams.get('to') ?? '';
    const cash = to >= '2026-08-01' ? 2_500_000 : 1_800_000;
    await route.fulfill(
      json({
        ledgerAccountList: [
          { id: 'a1', name: 'Cash at bank', currency: 'GHS', startingBalance: 0, calculatedBalance: cash, ledgerGroup: 'ASSET' },
          { id: 'l1', name: 'Supplier loan', currency: 'GHS', startingBalance: 0, calculatedBalance: -500_000, ledgerGroup: 'LIABILITY' },
          { id: 'q1', name: 'Owner equity', currency: 'GHS', startingBalance: 0, calculatedBalance: cash - 500_000, ledgerGroup: 'EQUITY' },
        ],
      })
    );
  });

  await page.route('**/rest/financeReports/trialBalance.json*', async (route) => {
    if (await fulfilExport(route)) return;
    await route.fulfill(
      json({
        resultList: {
          ASSET: { accountList: [{ id: 'a1', name: 'Cash at bank', currency: 'GHS', endingDebit: 2_500_000, endingCredit: 0 }] },
          EQUITY: { accountList: [{ id: 'q1', name: 'Owner equity', currency: 'GHS', endingDebit: 0, endingCredit: 2_500_000 }] },
        },
        totalDebit: 2_500_000,
        totalCredit: 2_500_000,
      })
    );
  });

  await page.route('**/rest/financeReports/accountBalances.json*', async (route) => {
    if (await fulfilExport(route)) return;
    await route.fulfill(
      json({
        resultList: {
          ASSET: {
            accountList: [
              { id: 'a1', name: 'Cash at bank', currency: 'GHS', startingBalance: 1_000_000, calculatedDebitBalance: 1_700_000, calculatedCreditBalance: 200_000, netMovement: 1_500_000, endingBalance: 2_500_000 },
            ],
          },
          LIABILITY: {
            accountList: [
              { id: 'l1', name: 'Supplier loan', currency: 'GHS', startingBalance: -450_000, calculatedDebitBalance: 0, calculatedCreditBalance: 50_000, netMovement: -50_000, endingBalance: -500_000 },
            ],
          },
        },
        totalDebit: 1_700_000,
        totalCredit: 250_000,
      })
    );
  });

  const aging = (name: string) => ({
    name,
    notYetOverdue: 10_000,
    thirtyOrLess: 5_000,
    thirtyOneToSixty: 0,
    sixtyOneToNinety: 0,
    ninetyOneOrMore: 2_000,
    totalUnpaid: 17_000,
  });
  await page.route('**/rest/financeReports/agedReceivables.json*', async (route) => {
    if (await fulfilExport(route)) return;
    await route.fulfill(json({ agedReceivablesList: [aging('Akosua Ltd')] }));
  });
  await page.route('**/rest/financeReports/agedPayables.json*', async (route) => {
    if (await fulfilExport(route)) return;
    await route.fulfill(json({ agedPayablesList: [aging('Kofi Supplies')] }));
  });
}

/** Dashboard → sidebar "Reports" → the hub. */
async function openHub(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  await page.locator('aside').locator('a[href="/reports"]').first().click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByTestId('reports-page')).toBeVisible();
}

/** The no-"$" rule, on whatever the report page is showing. */
async function expectNoDollars(page: Page, pageTestId: string) {
  await expect(page.getByTestId(pageTestId)).not.toContainText('$');
}

test.describe('SOUPFIN-103: report catalogue (west of UTC)', () => {
  test.skip(isLxcMode(), 'Mock-only spec: it pins the clock, the timezone and a GHS tenant');
  test.use({ timezoneId: 'America/Los_Angeles', locale: 'en-US' });

  let guard: UnmockedApiGuard;

  test.beforeEach(async ({ page }) => {
    guard = await installUnmockedApiGuard(page);
    await setUp(page);
    await mockReports(page);
  });

  test.afterEach(() => guard.assertNone());

  test('the hub lists reports by category, searches them, and keeps favourites', async ({ page }) => {
    await openHub(page);
    for (const category of ['business-overview', 'who-owes-you', 'what-you-owe', 'for-my-accountant']) {
      await expect(page.getByTestId(`reports-category-${category}`)).toBeVisible();
    }
    await expect(page.getByTestId('reports-favourites-empty')).toBeVisible();
    await shot(page, '01-hub-by-category');

    // Search narrows the catalogue.
    await page.getByTestId('reports-search').fill('aging');
    await expect(page.getByTestId('report-link-ar-aging')).toBeVisible();
    await expect(page.getByTestId('report-link-ap-aging')).toBeVisible();
    await expect(page.getByTestId('report-link-profit-loss')).toHaveCount(0);
    await shot(page, '02-hub-search-aging');

    await page.getByTestId('reports-search').fill('payroll');
    await expect(page.getByTestId('reports-no-results')).toContainText('No reports match “payroll”');
    await shot(page, '03-hub-search-no-results');
    await page.getByTestId('reports-clear-search').click();
    await expect(page.getByTestId('report-link-profit-loss')).toBeVisible();

    // Star two reports; they appear under Favourites in the order starred.
    await page.getByTestId('report-favourite-toggle-trial-balance').click();
    await page.getByTestId('report-favourite-toggle-profit-loss').click();
    const favourites = page.getByTestId('reports-favourites');
    await expect(favourites.getByTestId(/^report-favourite-card-/)).toHaveCount(2);
    await expect(favourites.getByTestId(/^report-favourite-card-/).first()).toContainText('Trial Balance');
    await shot(page, '04-hub-favourites-starred');

    // Favourites survive a reload (they are saved in the browser, per user).
    await page.reload();
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await expect(page.getByTestId('report-favourite-toggle-trial-balance')).toHaveAttribute('aria-pressed', 'true');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('report-favourites') ?? '{}'));
    expect(saved.state.byUser.admin).toEqual(['trial-balance', 'profit-loss']);

    // And a favourite card opens its report.
    await favourites.getByTestId('report-favourite-card-trial-balance').getByRole('link').click();
    await expect(page.getByTestId('trial-balance-page')).toBeVisible();
    await expectNoDollars(page, 'trial-balance-page');
    await shot(page, '05-trial-balance-from-favourite');
  });

  test('Profit & Loss: tenant currency, a previous-year comparison, and an Excel export', async ({ page }) => {
    const requests = captureReportRequests(page);
    await openHub(page);
    await page.getByTestId('report-link-profit-loss').click();
    await expect(page).toHaveURL(/\/reports\/pnl$/);

    await expect(page.getByTestId('profit-loss-total-income')).toHaveText('GH₵1,280,000.00');
    await expect(page.getByTestId('profit-loss-currency')).toHaveText(/GHS/);
    // West of UTC the old subtitle printed "July 31, 2026" for a range starting Aug 1.
    await expect(page.getByTestId('profit-loss-subtitle')).toHaveText('August 1, 2026 – August 15, 2026');
    await expectNoDollars(page, 'profit-loss-page');
    await shot(page, '06-pnl-ghs-tenant');

    await page.getByTestId('profit-loss-comparison').selectOption('previousYear');
    await expect(page.getByTestId('profit-loss-comparison-range')).toHaveText(
      'Compared with August 1, 2025 – August 15, 2025'
    );
    await expect(page.getByTestId('profit-loss-total-income-previous')).toHaveText('Previous: GH₵900,000.00');
    await expect(page.getByTestId('income-item-1-previous')).toHaveText('GH₵0.00');
    const asked = requests.filter((u) => u.pathname.endsWith('/incomeStatement.json') && !u.searchParams.has('f'));
    expect(asked.map((u) => `${u.searchParams.get('from')}..${u.searchParams.get('to')}`)).toEqual([
      '2026-08-01..2026-08-15',
      '2025-08-01..2025-08-15',
    ]);
    await shot(page, '07-pnl-compared-previous-year');

    const download = page.waitForEvent('download');
    await page.getByTestId('profit-loss-export-excel').click();
    expect((await download).suggestedFilename()).toBe('profit-loss-2026-08-01-to-2026-08-15.xls');
    const exportRequest = requests.find((u) => u.searchParams.get('f') === 'excel');
    expect(exportRequest?.pathname).toMatch(/\/financeReports\/incomeStatement\.json$/);
    expect(exportRequest?.searchParams.get('from')).toBe('2026-08-01');
    expect(exportRequest?.searchParams.get('to')).toBe('2026-08-15');
    await shot(page, '08-pnl-after-excel-export');
  });

  test('Balance Sheet: compares with the month before and exports a PDF', async ({ page }) => {
    const requests = captureReportRequests(page);
    await openHub(page);
    await page.getByTestId('report-link-balance-sheet').click();

    await expect(page.getByTestId('balance-sheet-total-assets')).toHaveText('GH₵2,500,000.00');
    await page.getByTestId('balance-sheet-comparison').selectOption('previousPeriod');
    await expect(page.getByTestId('balance-sheet-total-assets-previous')).toHaveText('Previous: GH₵1,800,000.00');
    expect(requests.some((u) => u.pathname.endsWith('/balanceSheet.json') && u.searchParams.get('to') === '2026-07-15')).toBe(true);
    await expectNoDollars(page, 'balance-sheet-page');
    await shot(page, '09-balance-sheet-compared');

    const download = page.waitForEvent('download');
    await page.getByTestId('balance-sheet-export-pdf').click();
    expect((await download).suggestedFilename()).toBe('balance-sheet-2026-08-15.pdf');
  });

  test('Trial Balance refuses a reversed date range instead of asking the backend for it', async ({ page }) => {
    const requests = captureReportRequests(page);
    await openHub(page);
    await page.getByTestId('report-link-trial-balance').click();
    await expect(page.getByTestId('trial-balance-total-debit')).toHaveText('GH₵2,500,000.00');

    await page.getByTestId('trial-balance-filter-from').fill('2026-09-30');
    await expect(page.getByTestId('trial-balance-invalid-range')).toHaveText(
      'Pick a start date that is on or before the end date.'
    );
    await expect(page.getByTestId('trial-balance-filter-apply')).toBeDisabled();
    await expect(page.getByTestId('trial-balance-export-pdf')).toBeDisabled();
    // No "No accounts found between September 30 and August 31" for dates never searched.
    await expect(page.getByTestId('trial-balance-empty')).toHaveCount(0);
    await expect(page.getByTestId('trial-balance-table')).toHaveCount(0);
    await shot(page, '10-trial-balance-reversed-range');
    expect(requests.some((u) => u.searchParams.get('from') === '2026-09-30')).toBe(false);

    // Reset brings back the whole month.
    await page.getByTestId('trial-balance-filter-reset').click();
    await expect(page.getByTestId('trial-balance-filter-from')).toHaveValue('2026-08-01');
    await expect(page.getByTestId('trial-balance-filter-to')).toHaveValue('2026-08-31');
    await expect(page.getByTestId('trial-balance-invalid-range')).toHaveCount(0);
  });

  test('Account Balances, a registry-only report, opens from the hub and exports CSV', async ({ page }) => {
    const requests = captureReportRequests(page);
    await openHub(page);
    await page.getByTestId('report-link-account-balances').click();
    await expect(page).toHaveURL(/\/reports\/view\/account-balances$/);

    const table = page.getByTestId('account-balances-table');
    await expect(table).toBeVisible();
    await expect(page.getByTestId('account-balances-row-0')).toContainText('Cash at bank');
    await expect(page.getByTestId('account-balances-row-0')).toContainText('GH₵2,500,000.00');
    await expect(page.getByTestId('account-balances-row-1')).toContainText('-GH₵500,000.00');
    await expect(page.getByTestId('account-balances-totals')).toContainText('GH₵2,000,000.00');
    await expectNoDollars(page, 'account-balances-page');
    const data = requests.find((u) => u.pathname.endsWith('/accountBalances.json') && !u.searchParams.has('f'));
    expect(data?.searchParams.get('from')).toBe('2026-08-01');
    expect(data?.searchParams.get('to')).toBe('2026-08-31');
    await shot(page, '11-account-balances-registry-only');

    const download = page.waitForEvent('download');
    await page.getByTestId('account-balances-export-csv').click();
    expect((await download).suggestedFilename()).toBe('account-balances-2026-08-01-to-2026-08-31.csv');
    expect(requests.some((u) => u.pathname.endsWith('/accountBalances.json') && u.searchParams.get('f') === 'csv')).toBe(true);
  });

  test('A/P Aging opens the shared aging page with its own export', async ({ page }) => {
    const requests = captureReportRequests(page);
    await openHub(page);
    await page.getByTestId('report-link-ap-aging').click();
    await expect(page).toHaveURL(/\/reports\/aging$/);
    await expect(page.getByTestId('ap-aging-row-0')).toContainText('Kofi Supplies');
    await expectNoDollars(page, 'aging-reports-page');
    await shot(page, '12-aging-from-hub');

    const download = page.waitForEvent('download');
    await page.getByTestId('ap-aging-export-csv').click();
    expect((await download).suggestedFilename()).toBe('ap-aging-2026-08-15.csv');
    const exported = requests.find((u) => u.searchParams.get('f') === 'csv');
    expect(exported?.pathname).toMatch(/\/agedPayables\.json$/);
  });
});

test.describe('SOUPFIN-103: report dates east of UTC', () => {
  test.skip(isLxcMode(), 'Mock-only spec: it pins the clock, the timezone and a GHS tenant');
  // UTC+14: at FROZEN_NOW the local day is already Aug 16.
  test.use({ timezoneId: 'Pacific/Kiritimati', locale: 'en-US' });

  test.beforeEach(async ({ page }) => {
    await setUp(page);
    await mockReports(page);
  });

  test('Profit & Loss opens on the local month to date and compares with the days just before', async ({ page }) => {
    const requests = captureReportRequests(page);
    await openHub(page);
    await page.getByTestId('report-link-profit-loss').click();

    await expect(page.getByTestId('profit-loss-from-date')).toHaveValue('2026-08-01');
    await expect(page.getByTestId('profit-loss-to-date')).toHaveValue('2026-08-16');
    await page.getByTestId('profit-loss-comparison').selectOption('previousPeriod');
    // 16 days (Aug 1-16) compare with the 16 days before: Jul 16-31.
    await expect(page.getByTestId('profit-loss-comparison-range')).toHaveText(
      'Compared with July 16, 2026 – July 31, 2026'
    );
    await expect(page.getByTestId('profit-loss-total-income-previous')).toBeVisible();
    expect(
      requests.some((u) => u.searchParams.get('from') === '2026-07-16' && u.searchParams.get('to') === '2026-07-31')
    ).toBe(true);
    await shot(page, '13-pnl-kiritimati-previous-period');
  });
});
