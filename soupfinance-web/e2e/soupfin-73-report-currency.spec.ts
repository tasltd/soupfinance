/**
 * SOUPFIN-73 — P&L, Balance Sheet and Trial Balance hardcoded USD
 *
 * ProfitLossPage and BalanceSheetPage each declared a module-level
 *   new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
 * and TrialBalancePage a local `formatCurrency(amount, currency = 'USD')`.
 *
 * So a GHS tenant read its own cedi figures labelled with a dollar sign on all
 * three reports: the same number showed as GH₵1,200.00 on the dashboard and on
 * the aging reports, but $1,200.00 here.
 *
 * These tests sign in as a GHS tenant and walk to each report THROUGH THE SIDE
 * NAV, exactly as a person does, then assert the rendered page carries GH₵ and
 * no dollar sign at all. The aging report is included as the control: it was
 * already correct (SOUPFIN-33 #4), so it proves the GHS tenant setup itself is
 * sound rather than the assertions passing vacuously.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockAmbientApi, mockTokenValidationApi, mockDashboardApi, isLxcMode } from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-73/${name}.png`,
    fullPage: true,
  });
}

/**
 * Point the tenant at GHS.
 *
 * Registered AFTER `mockTokenValidationApi` on purpose — Playwright routes are
 * LIFO, so the last registration wins over the fixture's USD default.
 */
async function mockTenantCurrency(page: Page, currency: string) {
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'account-001',
        name: `${currency} Tenant`,
        currency,
        dateCreated: '2024-01-01T00:00:00Z',
      }),
    })
  );
}

// Backend-shaped report payloads. Amounts are deliberately four-figure so the
// thousands separator is exercised alongside the symbol.
async function mockReportApis(page: Page) {
  await page.route('**/financeReports/trialBalance.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        resultList: {
          ASSET: {
            accountList: [
              { id: 'acc-1', name: 'Cash at Bank', currency: 'GHS', endingDebit: 1200, endingCredit: 0 },
            ],
          },
          LIABILITY: {
            accountList: [
              { id: 'acc-2', name: 'Accounts Payable', currency: 'GHS', endingDebit: 0, endingCredit: 450 },
            ],
          },
          EQUITY: {
            accountList: [
              { id: 'acc-3', name: 'Retained Earnings', currency: 'GHS', endingDebit: 0, endingCredit: 750 },
            ],
          },
          REVENUE: { accountList: [] },
          EXPENSE: { accountList: [] },
        },
        totalDebit: 1200,
        totalCredit: 1200,
      }),
    })
  );

  await page.route('**/financeReports/incomeStatement.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ledgerAccountList: [
          { id: 'rev-1', name: 'Consulting Revenue', currency: 'GHS', calculatedBalance: -1200, ledgerGroup: 'REVENUE' },
          { id: 'exp-1', name: 'Office Rent', currency: 'GHS', calculatedBalance: 450, ledgerGroup: 'EXPENSE' },
        ],
      }),
    })
  );

  await page.route('**/financeReports/balanceSheet.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ledgerAccountList: [
          { id: 'asset-1', name: 'Cash at Bank', currency: 'GHS', startingBalance: 0, calculatedBalance: 1200, ledgerGroup: 'ASSET' },
          { id: 'liab-1', name: 'Accounts Payable', currency: 'GHS', startingBalance: 0, calculatedBalance: -450, ledgerGroup: 'LIABILITY' },
          { id: 'eq-1', name: 'Retained Earnings', currency: 'GHS', startingBalance: 0, calculatedBalance: 750, ledgerGroup: 'EQUITY' },
        ],
      }),
    })
  );

  // Control: the aging report was already fixed under SOUPFIN-33 #4.
  // Backend bucket names, not the frontend AgingItem field names — the endpoint
  // maps them through transformAgingItem, and a bare array yields an empty table.
  const agingItem = {
    name: 'Acme Supplies',
    notYetOverdue: 1200,
    thirtyOrLess: 0,
    thirtyOneToSixty: 0,
    sixtyOneToNinety: 0,
    ninetyOneOrMore: 0,
    totalUnpaid: 1200,
  };
  await page.route('**/financeReports/agedPayables.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ agedPayablesList: [agingItem] }),
    })
  );
  await page.route('**/financeReports/agedReceivables.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ agedReceivablesList: [agingItem] }),
    })
  );
}

/**
 * Seed the session before any script runs, the way soupfin-63 does.
 *
 * `addInitScript` re-applies on every navigation, so the session survives the
 * menu clicks below. Signing in through the form instead would add a dependency
 * on SOUPFIN-53 (the settings fetch does not fire on the sign-in itself, only on
 * a subsequent load), which is a separate defect and not what this ticket is about.
 */
async function seedSession(page: Page) {
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
}

/** Land on the dashboard — the app entry point every report walk starts from. */
async function openDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20000 });
}

/**
 * Walk to a report through the side nav rather than page.goto().
 *
 * The Reports sub-items only render once the Reports parent is the active
 * route, so this is genuinely two clicks — the same two a person makes.
 */
async function navigateToReport(page: Page, childLabel: string) {
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page).toHaveURL(/\/reports/, { timeout: 15000 });
  await page.getByRole('link', { name: childLabel, exact: true }).click();
}

test.describe('SOUPFIN-73 — report amounts follow the tenant currency', () => {
  test.skip(isLxcMode(), 'Needs a GHS tenant fixture; mock mode only.');

  test.beforeEach(async ({ page }) => {
    await seedSession(page);
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    // Registered last on purpose: routes are LIFO, so these win over the
    // fixtures' USD default and their empty report stubs.
    await mockTenantCurrency(page, 'GHS');
    await mockReportApis(page);
  });

  test('Aging Reports already render GH₵ (control for the GHS tenant setup)', async ({ page }) => {
    await openDashboard(page);
    await navigateToReport(page, 'Aging Reports');

    const table = page.getByTestId('ap-aging-table');
    await expect(table).toBeVisible({ timeout: 15000 });
    await expect(table).toContainText('GH₵');
    await shot(page, '01-aging-control-ghs');
  });

  test('Profit & Loss renders GH₵ and no dollar sign', async ({ page }) => {
    await openDashboard(page);
    await navigateToReport(page, 'Profit & Loss');

    const stats = page.getByTestId('profit-loss-stats');
    await expect(stats).toBeVisible({ timeout: 15000 });
    await shot(page, '02-profit-loss-ghs');

    await expect(stats).toContainText('GH₵1,200.00');
    await expect(stats).toContainText('GH₵450.00');
    // The defect: the hardcoded USD formatter.
    expect(await stats.innerText()).not.toContain('$');

    // Section totals and account rows use the same formatter.
    await expect(page.getByTestId('profit-loss-income-total')).toContainText('GH₵1,200.00');
    expect(await page.getByTestId('profit-loss-sections').innerText()).not.toContain('$');
  });

  test('Balance Sheet renders GH₵ and no dollar sign', async ({ page }) => {
    await openDashboard(page);
    await navigateToReport(page, 'Balance Sheet');

    const stats = page.getByTestId('balance-sheet-stats');
    await expect(stats).toBeVisible({ timeout: 15000 });
    await shot(page, '03-balance-sheet-ghs');

    await expect(stats).toContainText('GH₵1,200.00');
    await expect(stats).toContainText('GH₵450.00');
    expect(await stats.innerText()).not.toContain('$');

    // The accounting-equation panel and the grand total share the formatter.
    await expect(page.getByTestId('balance-sheet-equation')).toContainText('GH₵');
    expect(await page.getByTestId('balance-sheet-equation').innerText()).not.toContain('$');
    await expect(page.getByTestId('balance-sheet-grand-total')).toContainText('GH₵1,200.00');
  });

  test('Trial Balance renders GH₵, and a zero balance is a zero rather than a blank', async ({ page }) => {
    await openDashboard(page);
    await navigateToReport(page, 'Trial Balance');

    const totals = page.getByTestId('trial-balance-totals');
    await expect(totals).toBeVisible({ timeout: 15000 });
    await shot(page, '04-trial-balance-ghs');

    await expect(page.getByTestId('trial-balance-total-debit')).toHaveText('GH₵1,200.00');
    await expect(page.getByTestId('trial-balance-total-credit')).toHaveText('GH₵1,200.00');

    // The removed zero short-circuit: the unused side of an account row used to
    // render as an empty cell. The Currency column still prints the per-account
    // code as text, so that information is not lost.
    const assetRow = page.getByTestId('trial-balance-account-acc-1');
    await expect(assetRow).toContainText('GH₵1,200.00');
    await expect(assetRow).toContainText('GH₵0.00');

    expect(await page.getByTestId('trial-balance-table').innerText()).not.toContain('$');
  });
});
