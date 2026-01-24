/**
 * Financial Reports E2E Tests
 *
 * Comprehensive tests for all financial report pages:
 * - Trial Balance (/reports/trial-balance)
 * - Profit & Loss (/reports/pnl)
 * - Balance Sheet (/reports/balance-sheet)
 * - Cash Flow (/reports/cash-flow)
 * - Aging Reports (/reports/aging) - includes A/R and A/P
 *
 * Tests cover: navigation, date filters, data rendering, empty/error states,
 * export functionality, and responsive layout.
 */
import { test, expect } from '@playwright/test';
import { takeScreenshot } from './fixtures';

// =============================================================================
// Mock Data
// =============================================================================

// Trial Balance mock data matching backend response structure
const mockTrialBalanceResponse = {
  resultList: {
    ASSET: {
      accountList: [
        { id: 'acc-1', name: 'Cash and Cash Equivalents', currency: 'USD', endingDebit: 50000, endingCredit: 0 },
        { id: 'acc-2', name: 'Accounts Receivable', currency: 'USD', endingDebit: 25000, endingCredit: 0 },
      ],
    },
    LIABILITY: {
      accountList: [
        { id: 'acc-3', name: 'Accounts Payable', currency: 'USD', endingDebit: 0, endingCredit: 15000 },
        { id: 'acc-4', name: 'Accrued Expenses', currency: 'USD', endingDebit: 0, endingCredit: 10000 },
      ],
    },
    EQUITY: {
      accountList: [
        { id: 'acc-5', name: 'Common Stock', currency: 'USD', endingDebit: 0, endingCredit: 30000 },
        { id: 'acc-6', name: 'Retained Earnings', currency: 'USD', endingDebit: 0, endingCredit: 20000 },
      ],
    },
    REVENUE: {
      accountList: [
        { id: 'acc-7', name: 'Service Revenue', currency: 'USD', endingDebit: 0, endingCredit: 40000 },
      ],
    },
    EXPENSE: {
      accountList: [
        { id: 'acc-8', name: 'Operating Expenses', currency: 'USD', endingDebit: 35000, endingCredit: 0 },
        { id: 'acc-9', name: 'Utilities', currency: 'USD', endingDebit: 5000, endingCredit: 0 },
      ],
    },
  },
  totalDebit: 115000,
  totalCredit: 115000,
};

// Profit & Loss mock data matching backend incomeStatement response
const mockIncomeStatementResponse = {
  ledgerAccountList: [
    { id: 'rev-1', name: 'Service Revenue', currency: 'USD', calculatedBalance: -45000, ledgerGroup: 'REVENUE' },
    { id: 'rev-2', name: 'Product Sales', currency: 'USD', calculatedBalance: -15000, ledgerGroup: 'REVENUE' },
    { id: 'exp-1', name: 'Salaries and Wages', currency: 'USD', calculatedBalance: 25000, ledgerGroup: 'EXPENSE' },
    { id: 'exp-2', name: 'Rent Expense', currency: 'USD', calculatedBalance: 8000, ledgerGroup: 'EXPENSE' },
    { id: 'exp-3', name: 'Utilities', currency: 'USD', calculatedBalance: 2000, ledgerGroup: 'EXPENSE' },
  ],
};

// Balance Sheet mock data matching backend balanceSheet response
const mockBalanceSheetResponse = {
  ledgerAccountList: [
    { id: 'asset-1', name: 'Cash', currency: 'USD', startingBalance: 0, calculatedBalance: 75000, ledgerGroup: 'ASSET' },
    { id: 'asset-2', name: 'Accounts Receivable', currency: 'USD', startingBalance: 0, calculatedBalance: 25000, ledgerGroup: 'ASSET' },
    { id: 'asset-3', name: 'Equipment', currency: 'USD', startingBalance: 0, calculatedBalance: 50000, ledgerGroup: 'ASSET' },
    { id: 'liab-1', name: 'Accounts Payable', currency: 'USD', startingBalance: 0, calculatedBalance: -20000, ledgerGroup: 'LIABILITY' },
    { id: 'liab-2', name: 'Notes Payable', currency: 'USD', startingBalance: 0, calculatedBalance: -30000, ledgerGroup: 'LIABILITY' },
    { id: 'eq-1', name: 'Common Stock', currency: 'USD', startingBalance: 0, calculatedBalance: 50000, ledgerGroup: 'EQUITY' },
    { id: 'eq-2', name: 'Retained Earnings', currency: 'USD', startingBalance: 0, calculatedBalance: 50000, ledgerGroup: 'EQUITY' },
  ],
};

// Cash Flow mock data - built from account transactions
const mockAccountTransactionsResponse = [
  { id: 'tx-1', transactionDate: '2026-01-15', description: 'Customer Payment', debitAmount: 5000, creditAmount: 0, balance: 5000, ledgerAccountId: 'acc-1', ledgerAccountName: 'Cash', reference: 'INV-001' },
  { id: 'tx-2', transactionDate: '2026-01-16', description: 'Vendor Payment', debitAmount: 0, creditAmount: 2000, balance: 3000, ledgerAccountId: 'acc-1', ledgerAccountName: 'Cash', reference: 'BILL-001' },
  { id: 'tx-3', transactionDate: '2026-01-17', description: 'Equipment Purchase', debitAmount: 0, creditAmount: 10000, balance: -7000, ledgerAccountId: 'fixed-asset-1', ledgerAccountName: 'Fixed Asset - Equipment', reference: 'PO-001' },
  { id: 'tx-4', transactionDate: '2026-01-18', description: 'Loan Proceeds', debitAmount: 15000, creditAmount: 0, balance: 8000, ledgerAccountId: 'loan-1', ledgerAccountName: 'Bank Loan', reference: 'LOAN-001' },
];

// A/R Aging mock data
const mockAgedReceivablesResponse = {
  agedReceivablesList: [
    { name: 'Acme Corp', notYetOverdue: 5000, thirtyOrLess: 2000, thirtyOneToSixty: 1000, sixtyOneToNinety: 500, ninetyOneOrMore: 200, totalUnpaid: 8700 },
    { name: 'TechStart Inc', notYetOverdue: 3000, thirtyOrLess: 1500, thirtyOneToSixty: 0, sixtyOneToNinety: 0, ninetyOneOrMore: 0, totalUnpaid: 4500 },
    { name: 'Global Solutions', notYetOverdue: 0, thirtyOrLess: 0, thirtyOneToSixty: 2500, sixtyOneToNinety: 1000, ninetyOneOrMore: 500, totalUnpaid: 4000 },
  ],
};

// A/P Aging mock data
const mockAgedPayablesResponse = {
  agedPayablesList: [
    { name: 'Office Supplies Co', notYetOverdue: 1500, thirtyOrLess: 500, thirtyOneToSixty: 0, sixtyOneToNinety: 0, ninetyOneOrMore: 0, totalUnpaid: 2000 },
    { name: 'Tech Vendor LLC', notYetOverdue: 0, thirtyOrLess: 3000, thirtyOneToSixty: 1500, sixtyOneToNinety: 500, ninetyOneOrMore: 0, totalUnpaid: 5000 },
  ],
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Set up authenticated state in localStorage
 */
async function setupAuth(page: any) {
  await page.addInitScript(() => {
    const mockUser = {
      username: 'admin',
      email: 'admin@soupfinance.com',
      roles: ['ROLE_ADMIN', 'ROLE_USER'],
    };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { user: mockUser, isAuthenticated: true },
        version: 0,
      })
    );
  });
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get first day of current month in YYYY-MM-DD format
 */
function getFirstDayOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

// =============================================================================
// Trial Balance Tests
// =============================================================================

test.describe('Trial Balance Report', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('navigates to trial balance page', async ({ page }) => {
    await page.route('**/rest/financeReports/trialBalance*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrialBalanceResponse),
      });
    });

    await page.goto('/reports/trial-balance');
    await takeScreenshot(page, 'trial-balance-page');

    await expect(page.getByTestId('trial-balance-page')).toBeVisible();
    await expect(page.getByTestId('trial-balance-heading')).toHaveText('Trial Balance');
  });

  test('displays default date filters (current month)', async ({ page }) => {
    await page.route('**/rest/financeReports/trialBalance*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrialBalanceResponse),
      });
    });

    await page.goto('/reports/trial-balance');

    // Check that filter section is visible
    await expect(page.getByTestId('trial-balance-filters')).toBeVisible();

    // Verify from/to date inputs exist
    await expect(page.getByTestId('trial-balance-filter-from')).toBeVisible();
    await expect(page.getByTestId('trial-balance-filter-to')).toBeVisible();
  });

  test('date filter interaction changes API request', async ({ page }) => {
    let capturedUrl = '';
    await page.route('**/rest/financeReports/trialBalance*', (route) => {
      capturedUrl = route.request().url();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrialBalanceResponse),
      });
    });

    await page.goto('/reports/trial-balance');

    // Wait for initial load
    await expect(page.getByTestId('trial-balance-table')).toBeVisible({ timeout: 10000 });

    // Change date filters
    await page.getByTestId('trial-balance-filter-from').fill('2025-01-01');
    await page.getByTestId('trial-balance-filter-to').fill('2025-12-31');

    // Click Generate Report
    await page.getByTestId('trial-balance-filter-apply').click();

    // Wait for new data
    await page.waitForTimeout(500);

    // Verify URL includes new dates
    expect(capturedUrl).toContain('2025-01-01');
    expect(capturedUrl).toContain('2025-12-31');

    await takeScreenshot(page, 'trial-balance-date-filter');
  });

  test('renders report data with accounts and totals', async ({ page }) => {
    await page.route('**/rest/financeReports/trialBalance*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrialBalanceResponse),
      });
    });

    await page.goto('/reports/trial-balance');

    // Wait for table to render
    await expect(page.getByTestId('trial-balance-table')).toBeVisible({ timeout: 10000 });

    // Check ledger group sections exist
    await expect(page.getByTestId('trial-balance-group-ASSET')).toBeVisible();
    await expect(page.getByTestId('trial-balance-group-LIABILITY')).toBeVisible();
    await expect(page.getByTestId('trial-balance-group-EQUITY')).toBeVisible();
    await expect(page.getByTestId('trial-balance-group-REVENUE')).toBeVisible();
    await expect(page.getByTestId('trial-balance-group-EXPENSE')).toBeVisible();

    // Check totals footer exists
    await expect(page.getByTestId('trial-balance-totals')).toBeVisible();

    // Verify balance status banner shows balanced
    await expect(page.getByTestId('trial-balance-status')).toBeVisible();
    await expect(page.getByTestId('trial-balance-status')).toContainText('balanced');

    await takeScreenshot(page, 'trial-balance-data');
  });

  test('shows empty state when no accounts', async ({ page }) => {
    await page.route('**/rest/financeReports/trialBalance*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          resultList: { ASSET: { accountList: [] }, LIABILITY: { accountList: [] }, EQUITY: { accountList: [] }, REVENUE: { accountList: [] }, EXPENSE: { accountList: [] } },
          totalDebit: 0,
          totalCredit: 0,
        }),
      });
    });

    await page.goto('/reports/trial-balance');

    await expect(page.getByTestId('trial-balance-empty')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('trial-balance-empty')).toContainText('No accounts found');

    await takeScreenshot(page, 'trial-balance-empty');
  });

  test('shows error state on API failure', async ({ page }) => {
    await page.route('**/rest/financeReports/trialBalance*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/reports/trial-balance');

    await expect(page.getByTestId('trial-balance-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('trial-balance-error')).toContainText('Failed to load report');

    await takeScreenshot(page, 'trial-balance-error');
  });

  test('export buttons are visible', async ({ page }) => {
    await page.route('**/rest/financeReports/trialBalance*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrialBalanceResponse),
      });
    });

    await page.goto('/reports/trial-balance');

    await expect(page.getByTestId('trial-balance-export-pdf')).toBeVisible();
    await expect(page.getByTestId('trial-balance-export-excel')).toBeVisible();
    await expect(page.getByTestId('trial-balance-export-csv')).toBeVisible();
  });

  test('responsive layout on mobile viewport', async ({ page }) => {
    await page.route('**/rest/financeReports/trialBalance*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrialBalanceResponse),
      });
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/reports/trial-balance');

    await expect(page.getByTestId('trial-balance-page')).toBeVisible();
    await expect(page.getByTestId('trial-balance-table-container')).toBeVisible();

    await takeScreenshot(page, 'trial-balance-mobile');
  });
});

// =============================================================================
// Profit & Loss Tests
// =============================================================================

test.describe('Profit & Loss Report', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('navigates to profit & loss page', async ({ page }) => {
    await page.route('**/rest/financeReports/incomeStatement*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockIncomeStatementResponse),
      });
    });

    await page.goto('/reports/pnl');
    await takeScreenshot(page, 'profit-loss-page');

    await expect(page.getByTestId('profit-loss-page')).toBeVisible();
    await expect(page.getByTestId('profit-loss-heading')).toHaveText('Profit & Loss');
  });

  test('displays date range filters', async ({ page }) => {
    await page.route('**/rest/financeReports/incomeStatement*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockIncomeStatementResponse),
      });
    });

    await page.goto('/reports/pnl');

    await expect(page.getByTestId('profit-loss-toolbar')).toBeVisible();
    await expect(page.getByTestId('profit-loss-from-date')).toBeVisible();
    await expect(page.getByTestId('profit-loss-to-date')).toBeVisible();
  });

  test('date filter interaction works', async ({ page }) => {
    let capturedUrl = '';
    await page.route('**/rest/financeReports/incomeStatement*', (route) => {
      capturedUrl = route.request().url();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockIncomeStatementResponse),
      });
    });

    await page.goto('/reports/pnl');

    // Wait for initial load
    await expect(page.getByTestId('profit-loss-stats')).toBeVisible({ timeout: 10000 });

    // Change dates and refresh
    await page.getByTestId('profit-loss-from-date').fill('2025-06-01');
    await page.getByTestId('profit-loss-to-date').fill('2025-06-30');
    await page.getByTestId('profit-loss-refresh').click();

    await page.waitForTimeout(500);

    expect(capturedUrl).toContain('2025-06-01');
    expect(capturedUrl).toContain('2025-06-30');
  });

  test('renders income and expense data', async ({ page }) => {
    await page.route('**/rest/financeReports/incomeStatement*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockIncomeStatementResponse),
      });
    });

    await page.goto('/reports/pnl');

    // Check summary cards
    await expect(page.getByTestId('profit-loss-stats')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('profit-loss-total-income')).toBeVisible();
    await expect(page.getByTestId('profit-loss-total-expenses')).toBeVisible();
    await expect(page.getByTestId('profit-loss-net-profit')).toBeVisible();

    // Check sections
    await expect(page.getByTestId('profit-loss-sections')).toBeVisible();
    await expect(page.getByTestId('profit-loss-section-income')).toBeVisible();
    await expect(page.getByTestId('profit-loss-section-expenses')).toBeVisible();

    // Check net profit summary
    await expect(page.getByTestId('profit-loss-net-profit-summary')).toBeVisible();

    await takeScreenshot(page, 'profit-loss-data');
  });

  test('shows empty state when no transactions', async ({ page }) => {
    await page.route('**/rest/financeReports/incomeStatement*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ledgerAccountList: [] }),
      });
    });

    await page.goto('/reports/pnl');

    await expect(page.getByTestId('profit-loss-empty')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('profit-loss-empty')).toContainText('No transactions found');

    await takeScreenshot(page, 'profit-loss-empty');
  });

  test('shows error state on API failure', async ({ page }) => {
    await page.route('**/rest/financeReports/incomeStatement*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    });

    await page.goto('/reports/pnl');

    await expect(page.getByTestId('profit-loss-error')).toBeVisible({ timeout: 10000 });

    await takeScreenshot(page, 'profit-loss-error');
  });

  test('export buttons are visible', async ({ page }) => {
    await page.route('**/rest/financeReports/incomeStatement*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockIncomeStatementResponse),
      });
    });

    await page.goto('/reports/pnl');

    await expect(page.getByTestId('profit-loss-export-pdf')).toBeVisible();
    await expect(page.getByTestId('profit-loss-export-excel')).toBeVisible();
    await expect(page.getByTestId('profit-loss-export-csv')).toBeVisible();
  });

  test('responsive layout on mobile viewport', async ({ page }) => {
    await page.route('**/rest/financeReports/incomeStatement*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockIncomeStatementResponse),
      });
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/reports/pnl');

    await expect(page.getByTestId('profit-loss-page')).toBeVisible();

    await takeScreenshot(page, 'profit-loss-mobile');
  });
});

// =============================================================================
// Balance Sheet Tests
// =============================================================================

test.describe('Balance Sheet Report', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('navigates to balance sheet page', async ({ page }) => {
    await page.route('**/rest/financeReports/balanceSheet*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBalanceSheetResponse),
      });
    });

    await page.goto('/reports/balance-sheet');
    await takeScreenshot(page, 'balance-sheet-page');

    await expect(page.getByTestId('balance-sheet-page')).toBeVisible();
    await expect(page.getByTestId('balance-sheet-heading')).toHaveText('Balance Sheet');
  });

  test('displays as-of date picker', async ({ page }) => {
    await page.route('**/rest/financeReports/balanceSheet*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBalanceSheetResponse),
      });
    });

    await page.goto('/reports/balance-sheet');

    await expect(page.getByTestId('balance-sheet-toolbar')).toBeVisible();
    await expect(page.getByTestId('balance-sheet-date-picker')).toBeVisible();
  });

  test('date filter interaction works', async ({ page }) => {
    let capturedUrl = '';
    await page.route('**/rest/financeReports/balanceSheet*', (route) => {
      capturedUrl = route.request().url();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBalanceSheetResponse),
      });
    });

    await page.goto('/reports/balance-sheet');

    // Wait for initial load
    await expect(page.getByTestId('balance-sheet-stats')).toBeVisible({ timeout: 10000 });

    // Change date and refresh
    await page.getByTestId('balance-sheet-date-picker').fill('2025-12-31');
    await page.getByTestId('balance-sheet-refresh').click();

    await page.waitForTimeout(500);

    expect(capturedUrl).toContain('2025-12-31');
  });

  test('renders assets, liabilities, and equity sections', async ({ page }) => {
    await page.route('**/rest/financeReports/balanceSheet*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBalanceSheetResponse),
      });
    });

    await page.goto('/reports/balance-sheet');

    // Check summary cards
    await expect(page.getByTestId('balance-sheet-stats')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('balance-sheet-total-assets')).toBeVisible();
    await expect(page.getByTestId('balance-sheet-total-liabilities')).toBeVisible();
    await expect(page.getByTestId('balance-sheet-total-equity')).toBeVisible();

    // Check accounting equation
    await expect(page.getByTestId('balance-sheet-equation')).toBeVisible();

    // Check sections
    await expect(page.getByTestId('balance-sheet-sections')).toBeVisible();
    await expect(page.getByTestId('balance-sheet-section-assets')).toBeVisible();
    await expect(page.getByTestId('balance-sheet-section-liabilities')).toBeVisible();
    await expect(page.getByTestId('balance-sheet-section-equity')).toBeVisible();

    // Check grand total
    await expect(page.getByTestId('balance-sheet-grand-total')).toBeVisible();

    await takeScreenshot(page, 'balance-sheet-data');
  });

  test('shows empty state when no accounts', async ({ page }) => {
    await page.route('**/rest/financeReports/balanceSheet*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ledgerAccountList: [] }),
      });
    });

    await page.goto('/reports/balance-sheet');

    await expect(page.getByTestId('balance-sheet-empty')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('balance-sheet-empty')).toContainText('No accounts found');

    await takeScreenshot(page, 'balance-sheet-empty');
  });

  test('shows error state on API failure', async ({ page }) => {
    await page.route('**/rest/financeReports/balanceSheet*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    });

    await page.goto('/reports/balance-sheet');

    await expect(page.getByTestId('balance-sheet-error')).toBeVisible({ timeout: 10000 });

    await takeScreenshot(page, 'balance-sheet-error');
  });

  test('export buttons are visible', async ({ page }) => {
    await page.route('**/rest/financeReports/balanceSheet*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBalanceSheetResponse),
      });
    });

    await page.goto('/reports/balance-sheet');

    await expect(page.getByTestId('balance-sheet-export-pdf')).toBeVisible();
    await expect(page.getByTestId('balance-sheet-export-excel')).toBeVisible();
    await expect(page.getByTestId('balance-sheet-export-csv')).toBeVisible();
  });

  test('responsive layout on mobile viewport', async ({ page }) => {
    await page.route('**/rest/financeReports/balanceSheet*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBalanceSheetResponse),
      });
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/reports/balance-sheet');

    await expect(page.getByTestId('balance-sheet-page')).toBeVisible();

    await takeScreenshot(page, 'balance-sheet-mobile');
  });
});

// =============================================================================
// Cash Flow Tests
// =============================================================================

test.describe('Cash Flow Statement Report', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('navigates to cash flow page', async ({ page }) => {
    await page.route('**/rest/financeReports/accountTransactions*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAccountTransactionsResponse),
      });
    });

    await page.goto('/reports/cash-flow');
    await takeScreenshot(page, 'cash-flow-page');

    await expect(page.getByTestId('cash-flow-page')).toBeVisible();
    await expect(page.getByTestId('cash-flow-heading')).toHaveText('Cash Flow Statement');
  });

  test('displays date range filters', async ({ page }) => {
    await page.route('**/rest/financeReports/accountTransactions*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAccountTransactionsResponse),
      });
    });

    await page.goto('/reports/cash-flow');

    await expect(page.getByTestId('cash-flow-toolbar')).toBeVisible();
    await expect(page.getByTestId('cash-flow-from-date')).toBeVisible();
    await expect(page.getByTestId('cash-flow-to-date')).toBeVisible();
  });

  test('date filter interaction works', async ({ page }) => {
    let capturedUrl = '';
    await page.route('**/rest/financeReports/accountTransactions*', (route) => {
      capturedUrl = route.request().url();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAccountTransactionsResponse),
      });
    });

    await page.goto('/reports/cash-flow');

    // Wait for initial load
    await expect(page.getByTestId('cash-flow-stats')).toBeVisible({ timeout: 10000 });

    // Change dates and refresh
    await page.getByTestId('cash-flow-from-date').fill('2025-07-01');
    await page.getByTestId('cash-flow-to-date').fill('2025-07-31');
    await page.getByTestId('cash-flow-refresh').click();

    await page.waitForTimeout(500);

    expect(capturedUrl).toContain('2025-07-01');
    expect(capturedUrl).toContain('2025-07-31');
  });

  test('renders cash flow sections and summary', async ({ page }) => {
    await page.route('**/rest/financeReports/accountTransactions*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAccountTransactionsResponse),
      });
    });

    await page.goto('/reports/cash-flow');

    // Check summary cards
    await expect(page.getByTestId('cash-flow-stats')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('cash-flow-beginning-balance')).toBeVisible();
    await expect(page.getByTestId('cash-flow-net')).toBeVisible();
    await expect(page.getByTestId('cash-flow-ending-balance')).toBeVisible();

    // Check activity sections
    await expect(page.getByTestId('cash-flow-sections')).toBeVisible();
    await expect(page.getByTestId('cash-flow-section-operating')).toBeVisible();
    await expect(page.getByTestId('cash-flow-section-investing')).toBeVisible();
    await expect(page.getByTestId('cash-flow-section-financing')).toBeVisible();

    // Check summary section
    await expect(page.getByTestId('cash-flow-summary')).toBeVisible();

    await takeScreenshot(page, 'cash-flow-data');
  });

  test('shows empty state when no activities', async ({ page }) => {
    await page.route('**/rest/financeReports/accountTransactions*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/reports/cash-flow');

    await expect(page.getByTestId('cash-flow-empty')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('cash-flow-empty')).toContainText('No cash flow activities');

    await takeScreenshot(page, 'cash-flow-empty');
  });

  test('shows error state on API failure', async ({ page }) => {
    await page.route('**/rest/financeReports/accountTransactions*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    });

    await page.goto('/reports/cash-flow');

    await expect(page.getByTestId('cash-flow-error')).toBeVisible({ timeout: 10000 });

    await takeScreenshot(page, 'cash-flow-error');
  });

  test('export buttons are visible (disabled as backend not ready)', async ({ page }) => {
    await page.route('**/rest/financeReports/accountTransactions*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAccountTransactionsResponse),
      });
    });

    await page.goto('/reports/cash-flow');

    // Export buttons exist but are disabled for cash flow
    await expect(page.getByTestId('cash-flow-export-pdf')).toBeVisible();
    await expect(page.getByTestId('cash-flow-export-excel')).toBeVisible();
    await expect(page.getByTestId('cash-flow-export-csv')).toBeVisible();

    // They should be disabled
    await expect(page.getByTestId('cash-flow-export-pdf')).toBeDisabled();
    await expect(page.getByTestId('cash-flow-export-excel')).toBeDisabled();
    await expect(page.getByTestId('cash-flow-export-csv')).toBeDisabled();
  });

  test('responsive layout on mobile viewport', async ({ page }) => {
    await page.route('**/rest/financeReports/accountTransactions*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAccountTransactionsResponse),
      });
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/reports/cash-flow');

    await expect(page.getByTestId('cash-flow-page')).toBeVisible();

    await takeScreenshot(page, 'cash-flow-mobile');
  });
});

// =============================================================================
// Aging Reports Tests (A/R and A/P)
// =============================================================================

test.describe('Aging Reports', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('navigates to aging reports page', async ({ page }) => {
    await page.route('**/rest/financeReports/agedReceivables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedReceivablesResponse),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedPayablesResponse),
      });
    });

    await page.goto('/reports/aging');
    await takeScreenshot(page, 'aging-reports-page');

    await expect(page.getByTestId('aging-reports-page')).toBeVisible();
    await expect(page.getByTestId('aging-reports-heading')).toHaveText('Aging Reports');
  });

  test('displays as-of date picker', async ({ page }) => {
    await page.route('**/rest/financeReports/agedReceivables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedReceivablesResponse),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedPayablesResponse),
      });
    });

    await page.goto('/reports/aging');

    await expect(page.getByTestId('aging-reports-date-picker')).toBeVisible();
    await expect(page.getByTestId('aging-reports-reset-date')).toBeVisible();
  });

  test('date filter changes API request', async ({ page }) => {
    let arCapturedUrl = '';
    let apCapturedUrl = '';

    await page.route('**/rest/financeReports/agedReceivables*', (route) => {
      arCapturedUrl = route.request().url();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedReceivablesResponse),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', (route) => {
      apCapturedUrl = route.request().url();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedPayablesResponse),
      });
    });

    await page.goto('/reports/aging');

    // Wait for initial load
    await expect(page.getByTestId('ar-aging-table')).toBeVisible({ timeout: 10000 });

    // Change date
    await page.getByTestId('aging-reports-date-picker').fill('2025-06-30');

    // Wait for API calls
    await page.waitForTimeout(500);

    expect(arCapturedUrl).toContain('2025-06-30');
    expect(apCapturedUrl).toContain('2025-06-30');
  });

  test('renders both A/R and A/P tables', async ({ page }) => {
    await page.route('**/rest/financeReports/agedReceivables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedReceivablesResponse),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedPayablesResponse),
      });
    });

    await page.goto('/reports/aging');

    // Check A/R section
    await expect(page.getByTestId('ar-aging-container')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('ar-aging-table')).toBeVisible();
    await expect(page.getByTestId('ar-aging-totals')).toBeVisible();

    // Check A/P section
    await expect(page.getByTestId('ap-aging-container')).toBeVisible();
    await expect(page.getByTestId('ap-aging-table')).toBeVisible();
    await expect(page.getByTestId('ap-aging-totals')).toBeVisible();

    // Check summary cards
    await expect(page.getByTestId('aging-summary-cards')).toBeVisible();

    await takeScreenshot(page, 'aging-reports-data');
  });

  test('displays aging data rows with correct structure', async ({ page }) => {
    await page.route('**/rest/financeReports/agedReceivables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedReceivablesResponse),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedPayablesResponse),
      });
    });

    await page.goto('/reports/aging');

    // Check A/R rows
    await expect(page.getByTestId('ar-aging-row-0')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('ar-aging-row-1')).toBeVisible();
    await expect(page.getByTestId('ar-aging-row-2')).toBeVisible();

    // Check A/P rows
    await expect(page.getByTestId('ap-aging-row-0')).toBeVisible();
    await expect(page.getByTestId('ap-aging-row-1')).toBeVisible();
  });

  test('shows empty state for A/R when no receivables', async ({ page }) => {
    await page.route('**/rest/financeReports/agedReceivables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ agedReceivablesList: [] }),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedPayablesResponse),
      });
    });

    await page.goto('/reports/aging');

    await expect(page.getByTestId('ar-aging-empty')).toBeVisible({ timeout: 10000 });

    await takeScreenshot(page, 'aging-ar-empty');
  });

  test('shows empty state for A/P when no payables', async ({ page }) => {
    await page.route('**/rest/financeReports/agedReceivables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedReceivablesResponse),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ agedPayablesList: [] }),
      });
    });

    await page.goto('/reports/aging');

    await expect(page.getByTestId('ap-aging-empty')).toBeVisible({ timeout: 10000 });

    await takeScreenshot(page, 'aging-ap-empty');
  });

  test('shows error state on A/R API failure', async ({ page }) => {
    await page.route('**/rest/financeReports/agedReceivables*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedPayablesResponse),
      });
    });

    await page.goto('/reports/aging');

    await expect(page.getByTestId('ar-aging-error')).toBeVisible({ timeout: 10000 });

    await takeScreenshot(page, 'aging-ar-error');
  });

  test('export buttons are visible for both A/R and A/P', async ({ page }) => {
    await page.route('**/rest/financeReports/agedReceivables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedReceivablesResponse),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedPayablesResponse),
      });
    });

    await page.goto('/reports/aging');

    // A/R export buttons
    await expect(page.getByTestId('ar-aging-export-pdf')).toBeVisible();
    await expect(page.getByTestId('ar-aging-export-excel')).toBeVisible();
    await expect(page.getByTestId('ar-aging-export-csv')).toBeVisible();

    // A/P export buttons
    await expect(page.getByTestId('ap-aging-export-pdf')).toBeVisible();
    await expect(page.getByTestId('ap-aging-export-excel')).toBeVisible();
    await expect(page.getByTestId('ap-aging-export-csv')).toBeVisible();
  });

  test('responsive layout on mobile viewport', async ({ page }) => {
    await page.route('**/rest/financeReports/agedReceivables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedReceivablesResponse),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedPayablesResponse),
      });
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/reports/aging');

    await expect(page.getByTestId('aging-reports-page')).toBeVisible();

    // Tables should stack vertically on mobile
    await expect(page.getByTestId('ar-aging-container')).toBeVisible();
    await expect(page.getByTestId('ap-aging-container')).toBeVisible();

    await takeScreenshot(page, 'aging-reports-mobile');
  });
});

// =============================================================================
// Cross-Report Navigation Tests
// =============================================================================

test.describe('Report Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('navigates between different report pages', async ({ page }) => {
    // Mock all report endpoints
    await page.route('**/rest/financeReports/trialBalance*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrialBalanceResponse),
      });
    });

    await page.route('**/rest/financeReports/incomeStatement*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockIncomeStatementResponse),
      });
    });

    await page.route('**/rest/financeReports/balanceSheet*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBalanceSheetResponse),
      });
    });

    // Navigate through reports
    await page.goto('/reports/trial-balance');
    await expect(page.getByTestId('trial-balance-page')).toBeVisible();

    await page.goto('/reports/pnl');
    await expect(page.getByTestId('profit-loss-page')).toBeVisible();

    await page.goto('/reports/balance-sheet');
    await expect(page.getByTestId('balance-sheet-page')).toBeVisible();

    await takeScreenshot(page, 'report-navigation');
  });

  test('protected routes require authentication', async ({ page }) => {
    // Clear auth state
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/reports/trial-balance');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});

// =============================================================================
// Loading State Tests
// =============================================================================

test.describe('Report Loading States', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('shows loading state for trial balance', async ({ page }) => {
    // Delay API response to show loading
    await page.route('**/rest/financeReports/trialBalance*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTrialBalanceResponse),
      });
    });

    await page.goto('/reports/trial-balance');

    await expect(page.getByTestId('trial-balance-loading')).toBeVisible();

    await takeScreenshot(page, 'trial-balance-loading');

    // Wait for data to load
    await expect(page.getByTestId('trial-balance-table')).toBeVisible({ timeout: 10000 });
  });

  test('shows loading state for profit & loss', async ({ page }) => {
    await page.route('**/rest/financeReports/incomeStatement*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockIncomeStatementResponse),
      });
    });

    await page.goto('/reports/pnl');

    await expect(page.getByTestId('profit-loss-loading')).toBeVisible();

    await takeScreenshot(page, 'profit-loss-loading');
  });

  test('shows loading state for balance sheet', async ({ page }) => {
    await page.route('**/rest/financeReports/balanceSheet*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBalanceSheetResponse),
      });
    });

    await page.goto('/reports/balance-sheet');

    await expect(page.getByTestId('balance-sheet-loading')).toBeVisible();

    await takeScreenshot(page, 'balance-sheet-loading');
  });

  test('shows loading state for cash flow', async ({ page }) => {
    await page.route('**/rest/financeReports/accountTransactions*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAccountTransactionsResponse),
      });
    });

    await page.goto('/reports/cash-flow');

    await expect(page.getByTestId('cash-flow-loading')).toBeVisible();

    await takeScreenshot(page, 'cash-flow-loading');
  });

  test('shows loading states for aging reports', async ({ page }) => {
    await page.route('**/rest/financeReports/agedReceivables*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedReceivablesResponse),
      });
    });

    await page.route('**/rest/financeReports/agedPayables*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgedPayablesResponse),
      });
    });

    await page.goto('/reports/aging');

    await expect(page.getByTestId('ar-aging-loading')).toBeVisible();
    await expect(page.getByTestId('ap-aging-loading')).toBeVisible();

    await takeScreenshot(page, 'aging-loading');
  });
});
