/**
 * SOUPFIN-67 — Cash Flow report hardcoded USD and ignored the tenant currency
 *
 * `CashFlowPage` built its own module-level formatter:
 *
 *   const currencyFormatter = new Intl.NumberFormat('en-US', {
 *     style: 'currency', currency: 'USD', ...
 *   });
 *
 * and every figure on the page went through it — the three KPI tiles, each
 * activity row, each section total and the whole summary block. A GHS tenant
 * therefore read its own cedi amounts labelled with a dollar sign, while the
 * same figure showed GH₵ on the dashboard.
 *
 * The fix routes all of them through the account store's `formatCurrency`, the
 * source every other money surface already uses.
 *
 * These tests reach the page the way a person does — sign in, click Reports in
 * the sidebar, then click Cash Flow — rather than navigating straight to the
 * internal route, so the menu path is exercised too.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockLoginApi, mockTokenValidationApi, mockDashboardApi, isLxcMode } from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-67/${name}.png`,
    fullPage: true,
  });
}

/**
 * The cash flow statement has no backend endpoint of its own — the frontend
 * derives it from `/rest/financeReports/accountTransactions` (see
 * getCashFlowStatement in src/api/endpoints/reports.ts), so that is what we mock.
 *
 * The rows are chosen to land one in each of the three sections the page's
 * categorisation heuristic produces, and to give one inflow and one outflow.
 */
const ACCOUNT_TRANSACTIONS = [
  { id: 'tx-1', transactionDate: '2026-09-15', description: 'Customer Payment', debitAmount: 8500.25, creditAmount: 0, balance: 8500.25, ledgerAccountId: 'acc-1', ledgerAccountName: 'Cash', reference: 'INV-001' },
  { id: 'tx-2', transactionDate: '2026-09-16', description: 'Rent Paid', debitAmount: 0, creditAmount: 1200, balance: 7300.25, ledgerAccountId: 'acc-1', ledgerAccountName: 'Cash', reference: 'BILL-001' },
  { id: 'tx-3', transactionDate: '2026-09-17', description: 'Equipment Purchase', debitAmount: 0, creditAmount: 2500.5, balance: 4799.75, ledgerAccountId: 'fa-1', ledgerAccountName: 'Fixed Asset - Equipment', reference: 'PO-001' },
  { id: 'tx-4', transactionDate: '2026-09-18', description: 'Loan Proceeds', debitAmount: 1000, creditAmount: 0, balance: 5799.75, ledgerAccountId: 'loan-1', ledgerAccountName: 'Bank Loan', reference: 'LOAN-001' },
];

/**
 * Point the account settings endpoint at a given currency.
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

async function mockCashFlowData(page: Page) {
  await page.route('**/rest/financeReports/accountTransactions*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ACCOUNT_TRANSACTIONS),
    })
  );
}

/** Sign in through the login form, exactly as a person would. */
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill('admin@soupfinance.com');
  await page.getByTestId('login-password-input').fill('admin123');
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

  // The tenant's settings (and therefore its currency) are only fetched once
  // validateToken() has enriched `tenantId`, which happens on a page load rather
  // than on the sign-in response. The reload is the ordinary "return to the tab"
  // path; the token survives it because it lives in sessionStorage.
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

/** Reach Cash Flow by clicking through the sidebar — never by goto. */
async function navigateToCashFlowViaMenu(page: Page) {
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page).toHaveURL(/\/reports$/, { timeout: 15000 });

  // Sub-items only render once the Reports section is the active one.
  await page.getByRole('link', { name: 'Cash Flow', exact: true }).click();
  await expect(page).toHaveURL(/\/reports\/cash-flow$/, { timeout: 15000 });
  await expect(page.getByTestId('cash-flow-page')).toBeVisible({ timeout: 15000 });
}

test.describe('SOUPFIN-67 — Cash Flow follows the tenant currency', () => {
  test.skip(isLxcMode(), 'Needs a controlled tenant currency and report payload; mock mode only.');

  test.beforeEach(async ({ page }) => {
    await mockLoginApi(page, true);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockCashFlowData(page);
  });

  test('a GHS tenant sees GH₵ on every Cash Flow figure, never $', async ({ page }) => {
    // Arrange
    await mockTenantCurrency(page, 'GHS');
    await signIn(page);

    // Assert baseline on the dashboard first — without this the Cash Flow
    // assertion would pass even if GHS had never been applied at all.
    await expect(page.getByTestId('stat-total-revenue-value')).toContainText('GH₵', {
      timeout: 15000,
    });
    await shot(page, '01-ghs-dashboard-baseline');

    // Act: walk the menu, exactly as a person would.
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page).toHaveURL(/\/reports$/, { timeout: 15000 });
    await shot(page, '02-reports-menu-open');

    await page.getByRole('link', { name: 'Cash Flow', exact: true }).click();
    await expect(page).toHaveURL(/\/reports\/cash-flow$/, { timeout: 15000 });
    await expect(page.getByTestId('cash-flow-page')).toBeVisible({ timeout: 15000 });

    // Assert: the three KPI tiles. Before the fix these read "$8,500.25" etc.
    const stats = page.getByTestId('cash-flow-stats');
    await expect(stats).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('cash-flow-beginning-balance')).toContainText('GH₵');
    await expect(page.getByTestId('cash-flow-net')).toContainText('GH₵5,799.75');
    await expect(page.getByTestId('cash-flow-ending-balance')).toContainText('GH₵');
    await shot(page, '03-cash-flow-ghs-kpi-tiles');

    // Assert: the section totals, and that the inflow "+" prefix survived.
    await expect(page.getByTestId('cash-flow-operating-total')).toContainText('+GH₵7,300.25');
    await expect(page.getByTestId('cash-flow-financing-total')).toContainText('+GH₵1,000.00');
    await expect(page.getByTestId('cash-flow-investing-total')).toContainText('GH₵');

    // Assert: an individual activity row, inflow and outflow.
    await expect(page.getByTestId('operating-activity-0')).toContainText('+GH₵8,500.25');
    await expect(page.getByTestId('operating-activity-1')).toContainText('GH₵');
    await expect(page.getByTestId('operating-activity-1')).not.toContainText('+');
    await shot(page, '04-cash-flow-ghs-sections');

    // Assert: the summary block.
    const summary = page.getByTestId('cash-flow-summary');
    await expect(summary).toContainText('+GH₵5,799.75');
    await expect(summary).not.toContainText('$');
    await shot(page, '05-cash-flow-ghs-summary');

    // Assert: the regression itself — not one dollar sign anywhere on the page.
    await expect(page.getByTestId('cash-flow-page')).not.toContainText('$');
  });

  test('a USD tenant still sees $ (no over-correction)', async ({ page }) => {
    await mockTenantCurrency(page, 'USD');
    await signIn(page);
    await navigateToCashFlowViaMenu(page);

    await expect(page.getByTestId('cash-flow-net')).toContainText('$5,799.75');
    await expect(page.getByTestId('cash-flow-page')).not.toContainText('GH₵');
    await shot(page, '06-cash-flow-usd-unchanged');
  });

  test('a zero-decimal, symbol-after currency (XOF) renders correctly', async ({ page }) => {
    // The hardcoded en-US/USD formatter could express neither the 0 decimals
    // nor the trailing symbol, so this is the case it failed hardest on.
    await mockTenantCurrency(page, 'XOF');
    await signIn(page);
    await navigateToCashFlowViaMenu(page);

    await expect(page.getByTestId('cash-flow-net')).toContainText('5,800 CFA');
    await expect(page.getByTestId('cash-flow-operating-total')).toContainText('+7,300 CFA');
    await expect(page.getByTestId('cash-flow-page')).not.toContainText('$');
    await shot(page, '07-cash-flow-xof-symbol-after');
  });
});
