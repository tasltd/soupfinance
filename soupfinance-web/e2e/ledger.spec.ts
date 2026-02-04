/**
 * Ledger Management E2E Tests
 * Tests Chart of Accounts and Ledger Transactions pages
 */
import { test, expect } from '@playwright/test';
import { mockTokenValidationApi, takeScreenshot } from './fixtures';

// ===========================================================================
// Mock Data
// ===========================================================================

const mockLedgerAccounts = [
  // Assets
  {
    id: 'acc-001',
    code: '1000',
    name: 'Cash',
    ledgerGroup: 'ASSET',
    balance: 25000.0,
    isActive: true,
    dateCreated: '2024-01-01T00:00:00Z',
  },
  {
    id: 'acc-002',
    code: '1100',
    name: 'Accounts Receivable',
    ledgerGroup: 'ASSET',
    balance: 15000.0,
    isActive: true,
    dateCreated: '2024-01-01T00:00:00Z',
  },
  {
    id: 'acc-003',
    code: '1200',
    name: 'Inventory',
    ledgerGroup: 'ASSET',
    balance: 8000.0,
    isActive: false,
    dateCreated: '2024-01-01T00:00:00Z',
  },
  // Liabilities
  {
    id: 'acc-004',
    code: '2000',
    name: 'Accounts Payable',
    ledgerGroup: 'LIABILITY',
    balance: 5000.0,
    isActive: true,
    dateCreated: '2024-01-01T00:00:00Z',
  },
  {
    id: 'acc-005',
    code: '2100',
    name: 'Accrued Expenses',
    ledgerGroup: 'LIABILITY',
    balance: 2500.0,
    isActive: true,
    dateCreated: '2024-01-01T00:00:00Z',
  },
  // Equity
  {
    id: 'acc-006',
    code: '3000',
    name: 'Owner Equity',
    ledgerGroup: 'EQUITY',
    balance: 50000.0,
    isActive: true,
    dateCreated: '2024-01-01T00:00:00Z',
  },
  // Income
  {
    id: 'acc-007',
    code: '4000',
    name: 'Sales Revenue',
    ledgerGroup: 'INCOME',
    balance: 75000.0,
    isActive: true,
    dateCreated: '2024-01-01T00:00:00Z',
  },
  // Expenses
  {
    id: 'acc-008',
    code: '5000',
    name: 'Operating Expenses',
    ledgerGroup: 'EXPENSE',
    balance: 12000.0,
    isActive: true,
    dateCreated: '2024-01-01T00:00:00Z',
  },
  {
    id: 'acc-009',
    code: '5100',
    name: 'Utilities',
    ledgerGroup: 'EXPENSE',
    balance: 3000.0,
    isActive: true,
    dateCreated: '2024-01-01T00:00:00Z',
  },
];

const mockLedgerTransactions = [
  {
    id: 'tx-001',
    transactionNumber: 'JE-2024-001',
    transactionDate: '2024-10-15',
    ledgerAccount: { id: 'acc-001', code: '1000', name: 'Cash' },
    description: 'Initial cash deposit',
    amount: 10000.0,
    transactionState: 'DEBIT',
    status: 'POSTED',
    dateCreated: '2024-10-15T10:00:00Z',
  },
  {
    id: 'tx-002',
    transactionNumber: 'JE-2024-001',
    transactionDate: '2024-10-15',
    ledgerAccount: { id: 'acc-006', code: '3000', name: 'Owner Equity' },
    description: 'Initial cash deposit',
    amount: 10000.0,
    transactionState: 'CREDIT',
    status: 'POSTED',
    dateCreated: '2024-10-15T10:00:00Z',
  },
  {
    id: 'tx-003',
    transactionNumber: 'JE-2024-002',
    transactionDate: '2024-10-16',
    ledgerAccount: { id: 'acc-008', code: '5000', name: 'Operating Expenses' },
    description: 'Office supplies purchase',
    amount: 500.0,
    transactionState: 'DEBIT',
    status: 'POSTED',
    dateCreated: '2024-10-16T11:00:00Z',
  },
  {
    id: 'tx-004',
    transactionNumber: 'JE-2024-002',
    transactionDate: '2024-10-16',
    ledgerAccount: { id: 'acc-001', code: '1000', name: 'Cash' },
    description: 'Office supplies purchase',
    amount: 500.0,
    transactionState: 'CREDIT',
    status: 'POSTED',
    dateCreated: '2024-10-16T11:00:00Z',
  },
  {
    id: 'tx-005',
    transactionNumber: 'JE-2024-003',
    transactionDate: '2024-10-17',
    ledgerAccount: { id: 'acc-002', code: '1100', name: 'Accounts Receivable' },
    description: 'Invoice for services',
    amount: 2500.0,
    transactionState: 'DEBIT',
    status: 'PENDING',
    dateCreated: '2024-10-17T09:00:00Z',
  },
  {
    id: 'tx-006',
    transactionNumber: 'JE-2024-004',
    transactionDate: '2024-10-18',
    ledgerAccount: { id: 'acc-004', code: '2000', name: 'Accounts Payable' },
    description: 'Vendor bill accrual',
    amount: 1200.0,
    transactionState: 'CREDIT',
    status: 'DRAFT',
    dateCreated: '2024-10-18T14:00:00Z',
  },
];

// ===========================================================================
// Test Setup
// ===========================================================================

test.describe('Ledger Management', () => {
  test.beforeEach(async ({ page }) => {
    // Set up authenticated state
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
    // Mock token validation API - required for authenticated pages
    await mockTokenValidationApi(page, true);
  });

  // Helper to mock ledger APIs
  async function mockLedgerApi(
    page: ReturnType<typeof test.page> extends Promise<infer T> ? T : never,
    options?: {
      accounts?: typeof mockLedgerAccounts;
      transactions?: typeof mockLedgerTransactions;
    }
  ) {
    await mockTokenValidationApi(page, true);

    const { accounts = mockLedgerAccounts, transactions = mockLedgerTransactions } = options || {};

    // Mock ledger accounts endpoint
    await page.route('**/rest/ledgerAccount/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(accounts),
      });
    });

    // Mock ledger transactions endpoint
    await page.route('**/rest/ledgerTransaction/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(transactions),
      });
    });
  }

  // ===========================================================================
  // Chart of Accounts Tests
  // ===========================================================================

  test.describe('Chart of Accounts Page', () => {
    test('displays page with account groups', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/accounts');
      await expect(page.getByTestId('chart-of-accounts-page')).toBeVisible();
      await expect(page.getByTestId('coa-heading')).toHaveText('Chart of Accounts');

      // Verify groups are displayed
      await expect(page.getByTestId('coa-groups')).toBeVisible();

      await takeScreenshot(page, 'chart-of-accounts-page');
    });

    test('shows all account groups with correct labels', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/accounts');

      // Verify all groups are present (those with accounts)
      await expect(page.getByTestId('coa-group-asset')).toBeVisible();
      await expect(page.getByTestId('coa-group-liability')).toBeVisible();
      await expect(page.getByTestId('coa-group-equity')).toBeVisible();
      await expect(page.getByTestId('coa-group-income')).toBeVisible();
      await expect(page.getByTestId('coa-group-expense')).toBeVisible();

      // Verify group labels (using heading role to avoid matching account names like "Owner Equity")
      await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Liabilities' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Equity' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Income' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();
    });

    test('shows account count per group', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/accounts');

      // Assets group should show "3 accounts"
      const assetGroup = page.getByTestId('coa-group-asset');
      await expect(assetGroup.locator('text=3 accounts')).toBeVisible();

      // Expense group should show "2 accounts"
      const expenseGroup = page.getByTestId('coa-group-expense');
      await expect(expenseGroup.locator('text=2 accounts')).toBeVisible();
    });

    test('displays accounts in expanded groups', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/accounts');

      // Groups should be expanded by default
      await expect(page.getByTestId('coa-table-asset')).toBeVisible();

      // Verify accounts are shown
      await expect(page.getByTestId('coa-account-acc-001')).toBeVisible();
      await expect(page.getByTestId('coa-account-acc-002')).toBeVisible();

      // Verify account data
      await expect(page.locator('text=1000')).toBeVisible(); // Code
      await expect(page.locator('text=Cash')).toBeVisible(); // Name
      // Changed: Balance includes thousand separator formatting
      await expect(page.locator('text=$25,000.00')).toBeVisible(); // Balance
    });

    test('can collapse and expand account groups', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/accounts');

      // Table should be visible initially
      await expect(page.getByTestId('coa-table-asset')).toBeVisible();

      // Click to collapse
      await page.getByTestId('coa-group-toggle-asset').click();

      // Table should be hidden
      await expect(page.getByTestId('coa-table-asset')).not.toBeVisible();

      // Click to expand again
      await page.getByTestId('coa-group-toggle-asset').click();

      // Table should be visible again
      await expect(page.getByTestId('coa-table-asset')).toBeVisible();

      await takeScreenshot(page, 'chart-of-accounts-collapsed');
    });

    test('shows active and inactive status badges', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/accounts');

      // Should show both Active and Inactive badges
      await expect(page.locator('text=Active').first()).toBeVisible();
      await expect(page.locator('text=Inactive').first()).toBeVisible();
    });

    test('shows loading state while fetching', async ({ page }) => {
      await mockTokenValidationApi(page, true);

      // Delay accounts response
      await page.route('**/rest/ledgerAccount/index.json*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockLedgerAccounts),
        });
      });

      await page.goto('/ledger/accounts', { waitUntil: 'commit' });
      await page.waitForSelector('[data-testid="chart-of-accounts-page"]', { timeout: 5000 });

      // Should show loading state
      await expect(page.getByTestId('coa-loading')).toBeVisible({ timeout: 2000 });
      await takeScreenshot(page, 'chart-of-accounts-loading');

      // Wait for data to load
      await expect(page.getByTestId('coa-groups')).toBeVisible({ timeout: 10000 });
    });

    test('shows empty state when no accounts', async ({ page }) => {
      await mockLedgerApi(page, { accounts: [] });

      await page.goto('/ledger/accounts');

      // Should show empty state
      await expect(page.getByTestId('coa-empty')).toBeVisible();
      await expect(page.locator('text=No accounts found')).toBeVisible();

      await takeScreenshot(page, 'chart-of-accounts-empty');
    });

    test('shows error state on API failure', async ({ page }) => {
      await mockTokenValidationApi(page, true);

      // Mock API error
      await page.route('**/rest/ledgerAccount/index.json*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto('/ledger/accounts');

      // Should show error state
      await expect(page.getByTestId('coa-error')).toBeVisible();
      await expect(page.locator('text=Failed to load accounts')).toBeVisible();

      await takeScreenshot(page, 'chart-of-accounts-error');
    });

    test('sorts accounts by code within groups', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/accounts');

      // Get the asset table rows
      const assetTable = page.getByTestId('coa-table-asset');
      const rows = assetTable.locator('tbody tr');

      // First row should be acc-001 (code 1000)
      await expect(rows.first()).toContainText('1000');
      // Last row should be acc-003 (code 1200)
      await expect(rows.last()).toContainText('1200');
    });
  });

  // ===========================================================================
  // Ledger Transactions Tests
  // ===========================================================================

  test.describe('Ledger Transactions Page', () => {
    test('displays page with filters and transactions', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');
      await expect(page.getByTestId('ledger-transactions-page')).toBeVisible();
      await expect(page.getByTestId('ledger-transactions-heading')).toHaveText('Ledger Transactions');

      // Verify filters are present
      await expect(page.getByTestId('ledger-filters')).toBeVisible();
      await expect(page.getByTestId('account-filter')).toBeVisible();
      await expect(page.getByTestId('start-date-filter')).toBeVisible();
      await expect(page.getByTestId('end-date-filter')).toBeVisible();
      await expect(page.getByTestId('status-filter')).toBeVisible();

      await takeScreenshot(page, 'ledger-transactions-page');
    });

    test('shows transactions in table', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');
      await expect(page.getByTestId('ledger-table')).toBeVisible();

      // Verify transactions are displayed
      await expect(page.getByTestId('ledger-row-tx-001')).toBeVisible();
      await expect(page.getByTestId('ledger-row-tx-002')).toBeVisible();

      // Verify transaction data
      await expect(page.locator('text=JE-2024-001').first()).toBeVisible();
      await expect(page.locator('text=Initial cash deposit').first()).toBeVisible();

      // Verify summary is visible
      await expect(page.getByTestId('ledger-summary')).toBeVisible();

      await takeScreenshot(page, 'ledger-transactions-table');
    });

    test('shows debit and credit columns correctly', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');

      // First transaction (tx-001) is a DEBIT of $10000
      // Changed: Balance formatting includes thousand separator
      const row1 = page.getByTestId('ledger-row-tx-001');
      await expect(row1.locator('td').nth(4)).toContainText('$10,000.00'); // Debit column
      await expect(row1.locator('td').nth(5)).toContainText('-'); // Credit column should be empty

      // Second transaction (tx-002) is a CREDIT of $10000
      const row2 = page.getByTestId('ledger-row-tx-002');
      await expect(row2.locator('td').nth(4)).toContainText('-'); // Debit column
      await expect(row2.locator('td').nth(5)).toContainText('$10,000.00'); // Credit column
    });

    test('shows status badges with correct styling', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');

      // Verify different status badges
      await expect(page.getByTestId('ledger-status-tx-001')).toHaveText('POSTED');
      await expect(page.getByTestId('ledger-status-tx-005')).toHaveText('PENDING');
      await expect(page.getByTestId('ledger-status-tx-006')).toHaveText('DRAFT');
    });

    test('can filter by account', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');
      await expect(page.getByTestId('ledger-table')).toBeVisible();

      // Select Cash account filter
      await page.getByTestId('account-filter').selectOption('acc-001');

      // Clear filter button should appear
      await expect(page.getByTestId('clear-filters-button')).toBeVisible();

      await takeScreenshot(page, 'ledger-transactions-filtered-account');
    });

    test('can filter by status', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');

      // Select PENDING status filter
      await page.getByTestId('status-filter').selectOption('PENDING');

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // Only PENDING transaction should be visible
      await expect(page.getByTestId('ledger-row-tx-005')).toBeVisible();
      // POSTED transactions should not be visible
      await expect(page.getByTestId('ledger-row-tx-001')).not.toBeVisible();

      await takeScreenshot(page, 'ledger-transactions-filtered-status');
    });

    test('can filter by date range', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');

      // Wait for table to load first
      await expect(page.getByTestId('ledger-table')).toBeVisible();

      // Set date range - use type for date inputs instead of fill
      const startInput = page.getByTestId('start-date-filter');
      const endInput = page.getByTestId('end-date-filter');

      // Type dates and trigger change
      await startInput.click();
      await startInput.fill('2024-10-15');
      await endInput.click();
      await endInput.fill('2024-10-16');

      // Wait for React state to update
      await page.waitForTimeout(300);

      // Clear filter button should appear
      await expect(page.getByTestId('clear-filters-button')).toBeVisible();

      await takeScreenshot(page, 'ledger-transactions-filtered-date');
    });

    test('can clear all filters', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');

      // Set a filter
      await page.getByTestId('status-filter').selectOption('POSTED');

      // Clear filters
      await page.getByTestId('clear-filters-button').click();

      // Filter should be reset
      await expect(page.getByTestId('status-filter')).toHaveValue('');

      // Clear button should be hidden
      await expect(page.getByTestId('clear-filters-button')).not.toBeVisible();
    });

    test('shows loading state while fetching', async ({ page }) => {
      await mockTokenValidationApi(page, true);

      // Mock accounts immediately
      await page.route('**/rest/ledgerAccount/index.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockLedgerAccounts),
        });
      });

      // Delay transactions response
      await page.route('**/rest/ledgerTransaction/index.json*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockLedgerTransactions),
        });
      });

      await page.goto('/ledger/transactions', { waitUntil: 'commit' });
      await page.waitForSelector('[data-testid="ledger-transactions-page"]', { timeout: 5000 });

      // Should show loading state
      await expect(page.getByTestId('ledger-loading')).toBeVisible({ timeout: 2000 });
      await takeScreenshot(page, 'ledger-transactions-loading');

      // Wait for data to load
      await expect(page.getByTestId('ledger-table')).toBeVisible({ timeout: 10000 });
    });

    test('shows empty state when no transactions', async ({ page }) => {
      await mockLedgerApi(page, { transactions: [] });

      await page.goto('/ledger/transactions');

      // Should show empty state
      await expect(page.getByTestId('ledger-empty')).toBeVisible();
      await expect(page.locator('text=No transactions yet')).toBeVisible();

      // Should show create button
      await expect(page.getByTestId('create-first-entry-button')).toBeVisible();

      await takeScreenshot(page, 'ledger-transactions-empty');
    });

    test('shows filtered empty state when no matching transactions', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');

      // Filter to a status with no matches
      await page.getByTestId('status-filter').selectOption('REVERSED');

      // Should show filtered empty state
      await expect(page.getByTestId('ledger-empty')).toBeVisible();
      await expect(page.locator('text=No matching transactions')).toBeVisible();

      // Should NOT show create button for filtered empty
      await expect(page.getByTestId('create-first-entry-button')).not.toBeVisible();

      await takeScreenshot(page, 'ledger-transactions-empty-filtered');
    });

    test('shows error state on API failure', async ({ page }) => {
      await mockTokenValidationApi(page, true);

      // Mock accounts successfully
      await page.route('**/rest/ledgerAccount/index.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockLedgerAccounts),
        });
      });

      // Mock transactions error
      await page.route('**/rest/ledgerTransaction/index.json*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto('/ledger/transactions');

      // Should show error state
      await expect(page.getByTestId('ledger-error')).toBeVisible();
      await expect(page.locator('text=Failed to load transactions')).toBeVisible();

      await takeScreenshot(page, 'ledger-transactions-error');
    });

    test('can navigate to create new journal entry', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');
      await page.getByTestId('new-journal-entry-button').click();

      await expect(page).toHaveURL(/\/accounting\/journal-entry\/new/);
    });

    test('shows totals in summary', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');

      // Verify summary shows totals
      const summary = page.getByTestId('ledger-summary');
      await expect(summary).toContainText('Total Debits');
      await expect(summary).toContainText('Total Credits');
    });

    test('account filter shows all accounts', async ({ page }) => {
      await mockLedgerApi(page);

      await page.goto('/ledger/transactions');

      // Check account filter has options
      const accountFilter = page.getByTestId('account-filter');
      await expect(accountFilter).toContainText('All Accounts');
      await expect(accountFilter).toContainText('1000 - Cash');
      await expect(accountFilter).toContainText('2000 - Accounts Payable');
    });
  });

  // ===========================================================================
  // Responsiveness Tests
  // ===========================================================================

  test.describe('Responsiveness', () => {
    test('chart of accounts is usable on mobile viewport', async ({ page }) => {
      await mockLedgerApi(page);

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/ledger/accounts');

      // Page should still be functional
      await expect(page.getByTestId('chart-of-accounts-page')).toBeVisible();
      await expect(page.getByTestId('coa-groups')).toBeVisible();

      await takeScreenshot(page, 'chart-of-accounts-mobile');
    });

    test('ledger transactions is usable on mobile viewport', async ({ page }) => {
      await mockLedgerApi(page);

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/ledger/transactions');

      // Page should still be functional
      await expect(page.getByTestId('ledger-transactions-page')).toBeVisible();
      await expect(page.getByTestId('ledger-filters')).toBeVisible();
      await expect(page.getByTestId('new-journal-entry-button')).toBeVisible();

      await takeScreenshot(page, 'ledger-transactions-mobile');
    });
  });
});
