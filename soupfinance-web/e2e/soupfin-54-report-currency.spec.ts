/**
 * SOUPFIN-54 — Four report pages hardcoded USD instead of the tenant currency.
 *
 * Reported while capturing user-guide screenshots for SOUPFIN-52: a tenant whose
 * account currency is GHS sees GH₵ on the dashboard, invoice list and bill list, but
 * the Trial Balance, Balance Sheet, Cash Flow and Profit & Loss pages rendered every
 * figure with a dollar sign — the Trial Balance screenshot showed "$160,800.00" for an
 * account configured as GHS.
 *
 * Root cause: each page built its own module-level
 *   new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
 * instead of using useFormatCurrency() from the account store. AgingReportsPage was
 * already fixed this way under SOUPFIN-33 #4; the fix was never carried across.
 *
 * Navigation is done by clicking sidebar menu items (never a direct route `goto`), so
 * these tests also prove each report is reachable through the UI. Screenshots land in
 * e2e/playwright/screenshots/soupfin-54/ and are committed as evidence.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, isLxcMode } from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which Playwright
 * wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-54/${name}.png`,
    fullPage: true,
  });
}

// ---------------------------------------------------------------------------
// Backend-shaped fixtures — src/api/endpoints/reports.ts transforms these before
// the pages ever see them, so the mocks must be in the BACKEND shape.
// ---------------------------------------------------------------------------

/** The exact reported figure: 160,800 on both sides of the trial balance. */
const TRIAL_BALANCE = {
  resultList: {
    ASSET: {
      accountList: [
        {
          id: 'acc-cash',
          name: 'Cash at Bank',
          currency: 'GHS',
          endingDebit: 160800,
          endingCredit: 0,
        },
      ],
    },
    LIABILITY: { accountList: [] },
    EQUITY: { accountList: [] },
    REVENUE: { accountList: [] },
    EXPENSE: {
      accountList: [
        {
          id: 'acc-rent',
          name: 'Office Rent',
          currency: 'GHS',
          endingDebit: 0,
          endingCredit: 160800,
        },
      ],
    },
  },
  totalDebit: 160800,
  totalCredit: 160800,
};

const BALANCE_SHEET = {
  ledgerAccountList: [
    {
      id: 'a1',
      name: 'Cash at Bank',
      currency: 'GHS',
      ledgerGroup: 'ASSET',
      calculatedBalance: 9500.25,
      startingBalance: 0,
    },
    {
      id: 'l1',
      name: 'Accounts Payable',
      currency: 'GHS',
      ledgerGroup: 'LIABILITY',
      calculatedBalance: 2500,
      startingBalance: 0,
    },
    {
      id: 'e1',
      name: 'Retained Earnings',
      currency: 'GHS',
      ledgerGroup: 'EQUITY',
      calculatedBalance: 7000.25,
      startingBalance: 0,
    },
  ],
};

const INCOME_STATEMENT = {
  ledgerAccountList: [
    {
      id: 'r1',
      name: 'Consulting Revenue',
      currency: 'GHS',
      ledgerGroup: 'REVENUE',
      calculatedBalance: 12500.5,
    },
    {
      id: 'x1',
      name: 'Office Rent',
      currency: 'GHS',
      ledgerGroup: 'EXPENSE',
      calculatedBalance: 3200.25,
    },
  ],
};

/** Cash Flow is derived from account transactions, not a dedicated endpoint. */
const ACCOUNT_TRANSACTIONS = [
  {
    id: 'tx1',
    transactionDate: '2026-09-05',
    description: 'Customer receipts',
    debitAmount: 4200.75,
    creditAmount: 0,
    balance: 4200.75,
    ledgerAccountId: 'a1',
    ledgerAccountName: 'Cash at Bank',
  },
  {
    id: 'tx2',
    transactionDate: '2026-09-09',
    description: 'Equipment purchase',
    debitAmount: 0,
    creditAmount: 1200,
    balance: 3000.75,
    ledgerAccountId: 'a2',
    ledgerAccountName: 'Fixed Asset - Equipment',
  },
  {
    id: 'tx3',
    transactionDate: '2026-09-12',
    description: 'Owner contribution',
    debitAmount: 1000,
    creditAmount: 0,
    balance: 4000.75,
    ledgerAccountId: 'a3',
    ledgerAccountName: 'Capital Account',
  },
];

/** Aging payloads are wrapper objects; reports.ts reshapes them for the page. */
const AGED_PAYABLES = {
  agedPayablesList: [
    {
      name: 'Acme Supplies',
      notYetOverdue: 1234.5,
      thirtyOrLess: 0,
      thirtyOneToSixty: 0,
      sixtyOneToNinety: 0,
      ninetyOneOrMore: 500,
      totalUnpaid: 1734.5,
    },
  ],
};

const AGED_RECEIVABLES = { agedReceivablesList: [] };

function setupMockAuth(page: Page) {
  return page.addInitScript(() => {
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
      JSON.stringify({
        state: { user: mockUser, isAuthenticated: true, isInitialized: true },
        version: 0,
      })
    );
  });
}

/**
 * Common mocks + landing on the dashboard, the only direct URL these tests use.
 * Everything after this happens through sidebar menu clicks.
 *
 * @param currency ISO code the tenant account reports — this is the whole point of
 *   the issue, so every test states it explicitly.
 */
async function signInAndLand(page: Page, currency: string) {
  await setupMockAuth(page);

  // Catch-all FIRST so it has the lowest precedence (Playwright routes are LIFO):
  // any endpoint a page touches that this spec does not care about answers with an
  // empty list instead of hanging against a backend that is not running.
  await page.route('**/rest/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await mockTokenValidationApi(page, true);

  // Registered AFTER mockTokenValidationApi so it wins: the shared fixture hardcodes
  // USD, and the tenant currency is exactly what is under test here.
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'account-001',
        name: 'Test Company',
        currency,
        dateCreated: '2024-01-01T00:00:00Z',
      }),
    })
  );

  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route('**/rest/financeReports/trialBalance*', (r) => r.fulfill(json(TRIAL_BALANCE)));
  await page.route('**/rest/financeReports/balanceSheet*', (r) => r.fulfill(json(BALANCE_SHEET)));
  await page.route('**/rest/financeReports/incomeStatement*', (r) =>
    r.fulfill(json(INCOME_STATEMENT))
  );
  await page.route('**/rest/financeReports/accountTransactions*', (r) =>
    r.fulfill(json(ACCOUNT_TRANSACTIONS))
  );
  // Aging uses wrapper-object payloads, not bare arrays — the catch-all's `[]`
  // would leave the page in its empty state with no table to assert on.
  await page.route('**/rest/financeReports/agedPayables*', (r) => r.fulfill(json(AGED_PAYABLES)));
  await page.route('**/rest/financeReports/agedReceivables*', (r) =>
    r.fulfill(json(AGED_RECEIVABLES))
  );

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Click a top-level sidebar entry by its visible label.
 *
 * Top-level entries are the direct `nav > div > a` children; sub-items live one level
 * deeper. Matching by accessible name would not work: each top-level link also renders
 * a Material Symbols span, so its name is "assessment Reports".
 */
async function clickNav(page: Page, label: string) {
  await page.locator('nav > div > a', { hasText: label }).first().click();
}

/** Expand the Reports section, then click one of its sub-items. */
async function openReport(page: Page, child: string) {
  await clickNav(page, 'Reports');
  await page.getByRole('link', { name: child, exact: true }).first().click();
  await page.waitForLoadState('domcontentloaded');
}

test.describe('SOUPFIN-54 — report pages use the tenant currency', () => {
  test.skip(isLxcMode(), 'Mock-only: drives the tenant currency through mocked account settings');

  test('Trial Balance renders GH₵, not the reported $160,800.00', async ({ page }) => {
    await signInAndLand(page, 'GHS');

    await openReport(page, 'Trial Balance');
    const totals = page.getByTestId('trial-balance-totals');
    await expect(totals).toBeVisible({ timeout: 15000 });
    await shot(page, 'trial-balance-ghs');

    // The exact reported string.
    await expect(totals).not.toContainText('$160,800.00');
    await expect(page.getByTestId('trial-balance-total-debit')).toHaveText('GH₵160,800.00');
    await expect(page.getByTestId('trial-balance-total-credit')).toHaveText('GH₵160,800.00');

    // And the account rows inside the table, not just the totals strip.
    await expect(page.getByTestId('trial-balance-table')).toContainText('GH₵160,800.00');
  });

  test('Balance Sheet renders GH₵ in cards, sections and the accounting equation', async ({
    page,
  }) => {
    await signInAndLand(page, 'GHS');

    await openReport(page, 'Balance Sheet');
    const stats = page.getByTestId('balance-sheet-stats');
    await expect(stats).toBeVisible({ timeout: 15000 });
    await shot(page, 'balance-sheet-ghs');

    await expect(page.getByTestId('balance-sheet-total-assets')).toContainText('GH₵9,500.25');
    await expect(page.getByTestId('balance-sheet-total-liabilities')).toContainText('GH₵2,500.00');
    await expect(page.getByTestId('balance-sheet-total-equity')).toContainText('GH₵7,000.25');
    await expect(stats).not.toContainText('$');

    await expect(page.getByTestId('balance-sheet-sections')).toContainText('GH₵9,500.25');
    await expect(page.getByTestId('balance-sheet-equation')).not.toContainText('$');
  });

  test('Cash Flow renders GH₵ in the summary cards and the summary table', async ({ page }) => {
    await signInAndLand(page, 'GHS');

    await openReport(page, 'Cash Flow');
    const stats = page.getByTestId('cash-flow-stats');
    await expect(stats).toBeVisible({ timeout: 15000 });
    await shot(page, 'cash-flow-ghs');

    await expect(stats).toContainText('GH₵');
    await expect(stats).not.toContainText('$');
    await expect(page.getByTestId('cash-flow-summary')).toContainText('GH₵');
    await expect(page.getByTestId('cash-flow-summary')).not.toContainText('$');
  });

  test('Profit & Loss renders GH₵ in cards, sections and the net-profit summary', async ({
    page,
  }) => {
    await signInAndLand(page, 'GHS');

    await openReport(page, 'Profit & Loss');
    const stats = page.getByTestId('profit-loss-stats');
    await expect(stats).toBeVisible({ timeout: 15000 });
    await shot(page, 'profit-loss-ghs');

    await expect(page.getByTestId('profit-loss-total-income')).toContainText('GH₵12,500.50');
    await expect(page.getByTestId('profit-loss-total-expenses')).toContainText('GH₵3,200.25');
    await expect(page.getByTestId('profit-loss-net-profit')).toContainText('GH₵9,300.25');
    await expect(stats).not.toContainText('$');

    await expect(page.getByTestId('profit-loss-sections')).toContainText('GH₵12,500.50');
    await expect(page.getByTestId('profit-loss-net-profit-summary')).not.toContainText('$');
  });

  test('Aging Reports still renders GH₵ (SOUPFIN-33 #4 stays fixed)', async ({ page }) => {
    // The page this fix was copied FROM — guards against a regression while the
    // other four were being changed.
    await signInAndLand(page, 'GHS');

    await openReport(page, 'Aging Reports');
    const table = page.getByTestId('ap-aging-table');
    await expect(table).toBeVisible({ timeout: 15000 });
    await shot(page, 'aging-ghs');

    await expect(table).not.toContainText('$');
  });
});

test.describe('SOUPFIN-54 — no over-correction for a USD tenant', () => {
  test.skip(isLxcMode(), 'Mock-only: drives the tenant currency through mocked account settings');

  test('a USD tenant still sees $ on all four reports', async ({ page }) => {
    await signInAndLand(page, 'USD');

    await openReport(page, 'Trial Balance');
    await expect(page.getByTestId('trial-balance-total-debit')).toHaveText('$160,800.00');
    await shot(page, 'trial-balance-usd');

    await openReport(page, 'Balance Sheet');
    await expect(page.getByTestId('balance-sheet-total-assets')).toContainText('$9,500.25');
    await shot(page, 'balance-sheet-usd');

    await openReport(page, 'Cash Flow');
    await expect(page.getByTestId('cash-flow-stats')).toContainText('$');
    await shot(page, 'cash-flow-usd');

    await openReport(page, 'Profit & Loss');
    await expect(page.getByTestId('profit-loss-total-income')).toContainText('$12,500.50');
    await shot(page, 'profit-loss-usd');
  });
});

test.describe('SOUPFIN-54 — the symbol follows whatever the tenant configured', () => {
  test.skip(isLxcMode(), 'Mock-only: drives the tenant currency through mocked account settings');

  for (const [code, symbol] of [
    ['EUR', '€'],
    ['NGN', '₦'],
    ['GBP', '£'],
  ] as const) {
    test(`${code} tenant sees ${symbol} on Profit & Loss and Trial Balance`, async ({ page }) => {
      await signInAndLand(page, code);

      await openReport(page, 'Profit & Loss');
      await expect(page.getByTestId('profit-loss-total-income')).toContainText(symbol);

      await openReport(page, 'Trial Balance');
      await expect(page.getByTestId('trial-balance-total-debit')).toContainText(symbol);
      await shot(page, `trial-balance-${code.toLowerCase()}`);
    });
  }
});
