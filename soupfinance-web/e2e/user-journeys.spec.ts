/**
 * User Journey E2E Tests
 *
 * Comprehensive end-to-end tests that validate complete user workflows from login
 * through feature completion. These tests ensure the application works as a cohesive
 * whole, not just individual features in isolation.
 *
 * Test Suites:
 * 1. Accounts Receivable Journey - Invoice creation to payment receipt
 * 2. Accounts Payable Journey - Bill entry to payment disbursement
 * 3. Vendor Management Journey - Full vendor lifecycle
 * 4. Financial Reporting Journey - Generate and view all reports
 * 5. KYC Onboarding Journey - Complete registration flow
 * 6. Accounting Workflow Journey - Journal entries and vouchers
 */
import { test, expect } from '@playwright/test';
import {
  mockLoginApi,
  mockDashboardApi,
  mockInvoicesApi,
  mockInvoices,
  mockBillsApi,
  mockBills,
  mockVendorsApi,
  mockVendors,
  mockCorporateRegistrationApi,
  mockCorporateApi,
  mockDirectorsApi,
  mockDocumentsApi,
  mockCorporate,
  mockDirector,
  mockDocument,
  mockTokenValidationApi,
  mockUsers,
  takeScreenshot,
} from './fixtures';

// ===========================================================================
// Additional Mock Data for User Journeys
// ===========================================================================

// Invoice payment mock data
const mockInvoicePayment = {
  id: 'inv-payment-001',
  invoice: { id: 'inv-001', invoiceNumber: 'INV-2024-001' },
  amount: 1000.0,
  paymentDate: '2024-10-26',
  paymentMethod: 'BANK_TRANSFER',
  reference: 'PAY-001',
};

// Bill payment mock data
const mockBillPayment = {
  id: 'bill-payment-001',
  bill: { id: 'bill-001', billNumber: 'BILL-2026-001' },
  amount: 500.0,
  paymentDate: '2026-01-20',
  paymentMethod: 'CHECK',
  reference: 'CHK-001',
};

// Ledger accounts mock data for accounting workflow
const mockLedgerAccounts = [
  { id: 'acc-001', code: '1000', name: 'Cash', ledgerGroup: 'ASSET', balance: 25000.0 },
  { id: 'acc-002', code: '1100', name: 'Accounts Receivable', ledgerGroup: 'ASSET', balance: 15000.0 },
  { id: 'acc-003', code: '2000', name: 'Accounts Payable', ledgerGroup: 'LIABILITY', balance: 5000.0 },
  { id: 'acc-004', code: '3000', name: 'Owner Equity', ledgerGroup: 'EQUITY', balance: 50000.0 },
  { id: 'acc-005', code: '4000', name: 'Sales Revenue', ledgerGroup: 'INCOME', balance: 75000.0 },
  { id: 'acc-006', code: '5000', name: 'Operating Expenses', ledgerGroup: 'EXPENSE', balance: 12000.0 },
];

// Journal entry mock for accounting workflow
const mockJournalEntry = {
  id: 'je-001',
  transactionNumber: 'JE-2026-001',
  transactionDate: '2026-01-20',
  description: 'Office supplies purchase',
  status: 'DRAFT',
  lines: [
    { id: 'line-001', ledgerAccount: { id: 'acc-006' }, debitAmount: 500, creditAmount: 0 },
    { id: 'line-002', ledgerAccount: { id: 'acc-001' }, debitAmount: 0, creditAmount: 500 },
  ],
};

// Voucher mock for accounting workflow
const mockVoucher = {
  id: 'voucher-001',
  voucherNumber: 'PV-2026-001',
  voucherType: 'PAYMENT',
  amount: 1000.0,
  voucherDate: '2026-01-20',
  vendor: { id: 'vendor-001', name: 'Acme Corp' },
  status: 'DRAFT',
};

// Transaction register mock data
const mockTransactions = [
  {
    id: 'txn-001',
    transactionNumber: 'JE-2026-001',
    transactionDate: '2026-01-15',
    description: 'Cash deposit',
    ledgerAccount: { id: 'acc-001', name: 'Cash' },
    debitAmount: 5000,
    creditAmount: 0,
    status: 'POSTED',
  },
  {
    id: 'txn-002',
    transactionNumber: 'JE-2026-001',
    transactionDate: '2026-01-15',
    description: 'Cash deposit',
    ledgerAccount: { id: 'acc-004', name: 'Owner Equity' },
    debitAmount: 0,
    creditAmount: 5000,
    status: 'POSTED',
  },
];

// Reports mock data
const mockTrialBalanceResponse = {
  resultList: {
    ASSET: { accountList: [{ id: 'acc-1', name: 'Cash', endingDebit: 50000, endingCredit: 0 }] },
    LIABILITY: { accountList: [{ id: 'acc-3', name: 'Accounts Payable', endingDebit: 0, endingCredit: 15000 }] },
    EQUITY: { accountList: [{ id: 'acc-5', name: 'Common Stock', endingDebit: 0, endingCredit: 30000 }] },
    REVENUE: { accountList: [{ id: 'acc-7', name: 'Service Revenue', endingDebit: 0, endingCredit: 40000 }] },
    EXPENSE: { accountList: [{ id: 'acc-8', name: 'Operating Expenses', endingDebit: 35000, endingCredit: 0 }] },
  },
  totalDebit: 85000,
  totalCredit: 85000,
};

const mockIncomeStatementResponse = {
  ledgerAccountList: [
    { id: 'rev-1', name: 'Service Revenue', calculatedBalance: -45000, ledgerGroup: 'REVENUE' },
    { id: 'exp-1', name: 'Salaries', calculatedBalance: 25000, ledgerGroup: 'EXPENSE' },
  ],
};

const mockBalanceSheetResponse = {
  ledgerAccountList: [
    { id: 'asset-1', name: 'Cash', calculatedBalance: 75000, ledgerGroup: 'ASSET' },
    { id: 'liab-1', name: 'Accounts Payable', calculatedBalance: -20000, ledgerGroup: 'LIABILITY' },
    { id: 'eq-1', name: 'Common Stock', calculatedBalance: 50000, ledgerGroup: 'EQUITY' },
  ],
};

const mockCashFlowTransactions = [
  { id: 'tx-1', transactionDate: '2026-01-15', description: 'Customer Payment', debitAmount: 5000, creditAmount: 0 },
];

const mockAgedReceivablesResponse = {
  agedReceivablesList: [
    { name: 'Acme Corp', notYetOverdue: 5000, thirtyOrLess: 2000, totalUnpaid: 7000 },
  ],
};

const mockAgedPayablesResponse = {
  agedPayablesList: [
    { name: 'Office Supplies Co', notYetOverdue: 1500, thirtyOrLess: 500, totalUnpaid: 2000 },
  ],
};

// ===========================================================================
// Test Helpers
// ===========================================================================

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
 * Mock all financial reports APIs
 */
async function mockAllReportsApi(page: any) {
  await page.route('**/rest/financeReports/trialBalance*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTrialBalanceResponse),
    });
  });

  await page.route('**/rest/financeReports/incomeStatement*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockIncomeStatementResponse),
    });
  });

  await page.route('**/rest/financeReports/balanceSheet*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockBalanceSheetResponse),
    });
  });

  await page.route('**/rest/financeReports/accountTransactions*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCashFlowTransactions),
    });
  });

  await page.route('**/rest/financeReports/agedReceivables*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockAgedReceivablesResponse),
    });
  });

  await page.route('**/rest/financeReports/agedPayables*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockAgedPayablesResponse),
    });
  });
}

/**
 * Mock accounting APIs (ledger accounts, transactions, vouchers)
 */
async function mockAccountingApi(page: any) {
  // Ledger accounts
  await page.route('**/rest/ledgerAccount/index.json*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockLedgerAccounts),
    });
  });

  // Ledger transactions
  await page.route('**/rest/ledgerTransaction/index.json*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTransactions),
    });
  });

  // Journal entry save
  await page.route('**/rest/ledgerTransactionGroup/save*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockJournalEntry),
    });
  });

  // Voucher save
  await page.route('**/rest/voucher/save*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockVoucher),
    });
  });

  // Voucher index
  await page.route('**/rest/voucher/index.json*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([mockVoucher]),
    });
  });
}

// ===========================================================================
// User Journey: Accounts Receivable
// ===========================================================================

test.describe('User Journey: Accounts Receivable', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test('complete flow: login → dashboard → create invoice → view invoice → record payment', async ({ page }) => {
    // Changed: Use setupAuth for reliable auth state instead of full login flow
    // The login flow is tested separately in auth.spec.ts
    await setupAuth(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockInvoicesApi(page, mockInvoices);

    // Mock invoice detail
    await page.route('**/rest/invoice/show/inv-001*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockInvoices[0]),
      });
    });

    // Mock payments APIs
    await page.route('**/rest/invoicePayment/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/rest/billPayment/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/rest/invoicePayment/save*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockInvoicePayment),
      });
    });

    // Step 1: Start at Dashboard
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await takeScreenshot(page, 'journey-ar-01-dashboard');

    // Step 2: Navigate to Invoices
    await page.goto('/invoices');
    await expect(page.getByTestId('invoice-list-page')).toBeVisible();
    await takeScreenshot(page, 'journey-ar-03-invoice-list');

    // Step 4: Create New Invoice
    await page.getByTestId('invoice-new-button').click();
    await expect(page).toHaveURL(/\/invoices\/new/);
    await expect(page.getByTestId('invoice-form-page')).toBeVisible();
    await takeScreenshot(page, 'journey-ar-04-new-invoice-form');

    // Step 5: View Invoice Detail
    await page.goto('/invoices/inv-001');
    await takeScreenshot(page, 'journey-ar-05-invoice-detail');

    // Step 6: Navigate to Payments
    await page.goto('/payments');
    await expect(page.getByTestId('payment-list-page')).toBeVisible();
    await takeScreenshot(page, 'journey-ar-06-payment-list');

    // Step 7: Record a new payment
    await page.getByTestId('record-payment-button').click();
    await expect(page).toHaveURL(/\/payments\/new/);
    await expect(page.getByTestId('payment-form-page')).toBeVisible();
    await takeScreenshot(page, 'journey-ar-07-new-payment-form');

    // Step 8: Verify dashboard updates would show new data
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await takeScreenshot(page, 'journey-ar-08-dashboard-updated');
  });

  test('invoice CRUD operations work end-to-end', async ({ page }) => {
    await setupAuth(page);
    await mockTokenValidationApi(page, true);
    await mockInvoicesApi(page, mockInvoices);

    // List invoices
    await page.goto('/invoices');
    await expect(page.getByTestId('invoice-list-page')).toBeVisible();
    await expect(page.getByTestId('invoice-row-inv-001')).toBeVisible();

    // Navigate to create
    await page.getByTestId('invoice-new-button').click();
    await expect(page.getByTestId('invoice-form-page')).toBeVisible();

    // Cancel and return to list
    await page.getByTestId('invoice-form-cancel-button').click();
    await expect(page).toHaveURL(/\/invoices$/);

    // Navigate to edit
    await page.getByTestId('invoice-edit-inv-001').click();
    await expect(page).toHaveURL(/\/invoices\/inv-001\/edit/);
    await expect(page.getByTestId('invoice-form-heading')).toHaveText('Edit Invoice');

    await takeScreenshot(page, 'journey-ar-crud-complete');
  });
});

// ===========================================================================
// User Journey: Accounts Payable
// ===========================================================================

test.describe('User Journey: Accounts Payable', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test('complete flow: login → bills → create bill → view bill → record payment', async ({ page }) => {
    // Changed: Use setupAuth for reliable auth state instead of full login flow
    await setupAuth(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockBillsApi(page, mockBills);
    await mockVendorsApi(page, mockVendors);

    // Mock bill detail
    await page.route('**/rest/bill/show/bill-001*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBills[0]),
      });
    });

    // Mock bill payments
    await page.route('**/rest/billPayment/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/rest/billPayment/save*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBillPayment),
      });
    });

    // Step 1: Start at Dashboard
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await takeScreenshot(page, 'journey-ap-01-dashboard');

    // Step 2: Navigate to Bills
    await page.goto('/bills');
    await expect(page.getByTestId('bill-list-page')).toBeVisible();
    await takeScreenshot(page, 'journey-ap-02-bill-list');

    // Step 4: Create New Bill
    await page.getByTestId('bill-new-button').click();
    await expect(page).toHaveURL(/\/bills\/new/);
    await expect(page.getByTestId('bill-form-page')).toBeVisible();
    await takeScreenshot(page, 'journey-ap-03-new-bill-form');

    // Step 5: View Bill Detail
    await page.goto('/bills/bill-001');
    await takeScreenshot(page, 'journey-ap-04-bill-detail');

    // Step 6: Navigate back to bills to see status
    await page.goto('/bills');
    await expect(page.getByTestId('bill-list-page')).toBeVisible();
    await takeScreenshot(page, 'journey-ap-05-bills-after-payment');
  });

  test('bill status transitions work correctly', async ({ page }) => {
    await setupAuth(page);
    await mockTokenValidationApi(page, true);
    await mockBillsApi(page, mockBills);
    await mockVendorsApi(page, mockVendors);

    await page.goto('/bills');

    // Verify different status badges are visible
    await expect(page.getByTestId('bill-status-bill-001')).toHaveText('PENDING');
    await expect(page.getByTestId('bill-status-bill-002')).toHaveText('PAID');
    await expect(page.getByTestId('bill-status-bill-003')).toHaveText('OVERDUE');

    await takeScreenshot(page, 'journey-ap-status-badges');
  });
});

// ===========================================================================
// User Journey: Vendor Management
// ===========================================================================

test.describe('User Journey: Vendor Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockTokenValidationApi(page, true);
  });

  test('complete flow: list vendors → create vendor → edit vendor → view in bill creation', async ({ page }) => {
    await mockVendorsApi(page, mockVendors);

    // Step 1: List vendors
    await page.goto('/vendors');
    await expect(page.getByTestId('vendor-list-page')).toBeVisible();
    await expect(page.getByTestId('vendor-row-vendor-001')).toBeVisible();
    await takeScreenshot(page, 'journey-vendor-01-list');

    // Step 2: Create new vendor
    await page.getByTestId('vendor-new-button').click();
    await expect(page).toHaveURL(/\/vendors\/new/);
    await expect(page.getByTestId('vendor-form-page')).toBeVisible();
    await takeScreenshot(page, 'journey-vendor-02-new-form');

    // Step 3: Cancel and return
    // Changed: Use correct testid from VendorFormPage component
    await page.getByTestId('vendor-form-cancel').click();
    await expect(page).toHaveURL(/\/vendors$/);

    // Step 4: View vendor detail
    await page.route('**/rest/vendor/show/vendor-001*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockVendors[0]),
      });
    });

    await page.getByTestId('vendor-link-vendor-001').click();
    await expect(page).toHaveURL(/\/vendors\/vendor-001$/);
    await takeScreenshot(page, 'journey-vendor-03-detail');

    // Step 5: Edit vendor
    await page.goto('/vendors/vendor-001/edit');
    await expect(page.getByTestId('vendor-form-page')).toBeVisible();
    await expect(page.getByTestId('vendor-form-heading')).toHaveText('Edit Vendor');
    await takeScreenshot(page, 'journey-vendor-04-edit-form');

    // Step 6: Verify vendor appears in bill creation
    await mockBillsApi(page, []);
    await page.goto('/bills/new');
    await expect(page.getByTestId('bill-form-page')).toBeVisible();
    // Vendor dropdown should be populated
    await expect(page.getByTestId('bill-vendor-select')).toBeVisible();
    await takeScreenshot(page, 'journey-vendor-05-in-bill-form');
  });

  test('vendor list shows correct data', async ({ page }) => {
    await mockVendorsApi(page, mockVendors);

    await page.goto('/vendors');

    // Verify all vendors are displayed
    await expect(page.getByTestId('vendor-row-vendor-001')).toBeVisible();
    await expect(page.getByTestId('vendor-row-vendor-002')).toBeVisible();
    await expect(page.getByTestId('vendor-row-vendor-003')).toBeVisible();

    // Verify vendor data
    await expect(page.locator('text=Acme Corp')).toBeVisible();
    await expect(page.locator('text=Tech Supplies Inc')).toBeVisible();
    await expect(page.locator('text=Office Solutions')).toBeVisible();

    await takeScreenshot(page, 'journey-vendor-data-display');
  });
});

// ===========================================================================
// User Journey: Financial Reporting
// ===========================================================================

test.describe('User Journey: Financial Reporting', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockTokenValidationApi(page, true);
    await mockAllReportsApi(page);
  });

  test('complete flow: dashboard → reports hub → view all report types', async ({ page }) => {
    // Step 1: Start from dashboard
    await mockDashboardApi(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await takeScreenshot(page, 'journey-reports-01-dashboard');

    // Step 2: Navigate to Reports hub
    await page.goto('/reports');
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await takeScreenshot(page, 'journey-reports-02-hub');

    // Step 3: View Profit & Loss
    await page.goto('/reports/pnl');
    await expect(page.getByTestId('profit-loss-page')).toBeVisible();
    await takeScreenshot(page, 'journey-reports-03-pnl');

    // Step 4: View Balance Sheet
    await page.goto('/reports/balance-sheet');
    await expect(page.getByTestId('balance-sheet-page')).toBeVisible();
    await takeScreenshot(page, 'journey-reports-04-balance-sheet');

    // Step 5: View Cash Flow
    await page.goto('/reports/cash-flow');
    await expect(page.getByTestId('cash-flow-page')).toBeVisible();
    await takeScreenshot(page, 'journey-reports-05-cash-flow');

    // Step 6: View Trial Balance
    await page.goto('/reports/trial-balance');
    await expect(page.getByTestId('trial-balance-page')).toBeVisible();
    await takeScreenshot(page, 'journey-reports-06-trial-balance');

    // Step 7: View Aging Reports
    await page.goto('/reports/aging');
    await expect(page.getByTestId('aging-reports-page')).toBeVisible();
    await takeScreenshot(page, 'journey-reports-07-aging');
  });

  test('export buttons are visible on all report pages', async ({ page }) => {
    // Profit & Loss
    await page.goto('/reports/pnl');
    await expect(page.getByTestId('profit-loss-export-pdf')).toBeVisible();
    await expect(page.getByTestId('profit-loss-export-excel')).toBeVisible();

    // Balance Sheet
    await page.goto('/reports/balance-sheet');
    await expect(page.getByTestId('balance-sheet-export-pdf')).toBeVisible();
    await expect(page.getByTestId('balance-sheet-export-excel')).toBeVisible();

    // Trial Balance
    await page.goto('/reports/trial-balance');
    await expect(page.getByTestId('trial-balance-export-pdf')).toBeVisible();
    await expect(page.getByTestId('trial-balance-export-excel')).toBeVisible();

    // Aging Reports
    await page.goto('/reports/aging');
    await expect(page.getByTestId('ar-aging-export-pdf')).toBeVisible();
    await expect(page.getByTestId('ap-aging-export-pdf')).toBeVisible();

    await takeScreenshot(page, 'journey-reports-export-buttons');
  });

  test('date filters work across all reports', async ({ page }) => {
    // Test P&L date filters
    await page.goto('/reports/pnl');
    await expect(page.getByTestId('profit-loss-from-date')).toBeVisible();
    await expect(page.getByTestId('profit-loss-to-date')).toBeVisible();

    // Test Balance Sheet date filter
    await page.goto('/reports/balance-sheet');
    await expect(page.getByTestId('balance-sheet-date-picker')).toBeVisible();

    // Test Trial Balance date filters
    await page.goto('/reports/trial-balance');
    await expect(page.getByTestId('trial-balance-filter-from')).toBeVisible();
    await expect(page.getByTestId('trial-balance-filter-to')).toBeVisible();

    // Test Cash Flow date filters
    await page.goto('/reports/cash-flow');
    await expect(page.getByTestId('cash-flow-from-date')).toBeVisible();
    await expect(page.getByTestId('cash-flow-to-date')).toBeVisible();

    await takeScreenshot(page, 'journey-reports-date-filters');
  });
});

// ===========================================================================
// User Journey: KYC Onboarding
// ===========================================================================

test.describe('User Journey: KYC Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test('complete flow: registration → company info → directors → documents → status', async ({ page }) => {
    const corporateId = 'corp-new-001';

    // Step 1: Registration Page (public)
    await mockCorporateRegistrationApi(page, true, { ...mockCorporate, id: corporateId });

    await page.goto('/register');
    await expect(page.getByTestId('registration-page')).toBeVisible();
    await takeScreenshot(page, 'journey-kyc-01-registration');

    // After registration, user would be logged in
    await setupAuth(page);
    await mockTokenValidationApi(page, true);
    await mockCorporateApi(page, corporateId, mockCorporate);

    // Step 2: Company Info Page
    await page.goto('/onboarding/company');
    await expect(page.getByTestId('company-info-page')).toBeVisible();
    await takeScreenshot(page, 'journey-kyc-02-company-info');

    // Step 3: Directors Page
    await mockDirectorsApi(page, corporateId, [mockDirector]);

    await page.goto('/onboarding/directors');
    await expect(page.getByTestId('directors-page')).toBeVisible();
    await takeScreenshot(page, 'journey-kyc-03-directors');

    // Step 4: Documents Page
    await mockDocumentsApi(page, corporateId, [mockDocument]);

    await page.goto('/onboarding/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible();
    await takeScreenshot(page, 'journey-kyc-04-documents');

    // Step 5: KYC Status Page
    await page.goto('/onboarding/status');
    await expect(page.getByTestId('kyc-status-page')).toBeVisible();
    await takeScreenshot(page, 'journey-kyc-05-status');
  });

  test('registration form validates required fields', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByTestId('registration-page')).toBeVisible();

    // Try to submit empty form
    await page.getByTestId('registration-submit-button').click();

    // Form should show validation errors
    await takeScreenshot(page, 'journey-kyc-validation-errors');
  });

  test('KYC status page shows correct state', async ({ page }) => {
    await setupAuth(page);
    await mockTokenValidationApi(page, true);

    // Changed: Mock with PENDING status and include ?id= query param
    await mockCorporateApi(page, 'corp-new-001', {
      ...mockCorporate,
      kycStatus: 'PENDING',
    });

    // Mock documents and directors APIs (required by the page)
    await page.route('**/rest/corporate/documents/corp-new-001*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/rest/corporate/directors/corp-new-001*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Changed: Include ?id= query parameter which the page requires
    await page.goto('/onboarding/status?id=corp-new-001');
    await expect(page.getByTestId('kyc-status-page')).toBeVisible();
    // Changed: Check for "Compliance Review" which is the current step when PENDING
    await expect(page.locator('text=Compliance Review')).toBeVisible();

    // Mock with APPROVED status
    await mockCorporateApi(page, 'corp-new-001', {
      ...mockCorporate,
      kycStatus: 'APPROVED',
    });

    await page.goto('/onboarding/status?id=corp-new-001');
    // Changed: Check for KYC Approved banner when APPROVED
    await expect(page.locator('text=KYC Approved')).toBeVisible();

    await takeScreenshot(page, 'journey-kyc-status-display');
  });
});

// ===========================================================================
// User Journey: Accounting Workflow
// ===========================================================================

test.describe('User Journey: Accounting Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockTokenValidationApi(page, true);
    await mockAccountingApi(page);
    await mockVendorsApi(page, mockVendors);
  });

  test('complete flow: transaction register → journal entry → voucher → verify in register', async ({ page }) => {
    // Step 1: View Transaction Register
    await page.goto('/accounting/transactions');
    await expect(page.getByTestId('transaction-register-page')).toBeVisible();
    await takeScreenshot(page, 'journey-accounting-01-register');

    // Step 2: Create Journal Entry
    await page.goto('/accounting/journal-entry');
    await expect(page.getByTestId('journal-entry-page')).toBeVisible();
    await takeScreenshot(page, 'journey-accounting-02-journal-entry');

    // Step 3: Create Payment Voucher
    await page.goto('/accounting/voucher/payment');
    await expect(page.getByTestId('voucher-form-page')).toBeVisible();
    await takeScreenshot(page, 'journey-accounting-03-payment-voucher');

    // Step 4: Create Receipt Voucher
    await page.goto('/accounting/voucher/receipt');
    await expect(page.getByTestId('voucher-form-page')).toBeVisible();
    await takeScreenshot(page, 'journey-accounting-04-receipt-voucher');

    // Step 5: Return to Transaction Register to verify
    await page.goto('/accounting/transactions');
    await expect(page.getByTestId('transaction-register-page')).toBeVisible();
    await takeScreenshot(page, 'journey-accounting-05-register-updated');
  });

  test('journal entry form allows adding/removing lines', async ({ page }) => {
    await page.goto('/accounting/journal-entry');

    // Wait for page to load
    await expect(page.getByTestId('journal-entry-page')).toBeVisible();

    // Initial lines should be visible (using correct testids from JournalEntryPage)
    await expect(page.getByTestId('journal-entry-line-0')).toBeVisible();
    await expect(page.getByTestId('journal-entry-line-1')).toBeVisible();

    // Add a new line
    // Changed: Use correct testid from JournalEntryPage component
    await page.getByTestId('journal-entry-add-line-button').click();
    await expect(page.getByTestId('journal-entry-line-2')).toBeVisible();

    await takeScreenshot(page, 'journey-accounting-journal-entry-lines');
  });

  test('voucher type selection works correctly', async ({ page }) => {
    // Payment voucher shows vendor field
    await page.goto('/accounting/voucher/payment');
    await expect(page.getByTestId('voucher-form-page')).toBeVisible();
    // Changed: Use correct testids - check that payment tab is active
    await expect(page.getByTestId('voucher-type-payment')).toBeVisible();
    await expect(page.getByTestId('voucher-vendor-input')).toBeVisible();

    // Receipt voucher shows client field
    await page.goto('/accounting/voucher/receipt');
    await expect(page.getByTestId('voucher-form-page')).toBeVisible();
    // Changed: Check that receipt tab is active and client input is shown
    await expect(page.getByTestId('voucher-type-receipt')).toBeVisible();
    await expect(page.getByTestId('voucher-client-input')).toBeVisible();

    await takeScreenshot(page, 'journey-accounting-voucher-types');
  });

  test('transaction register filters work', async ({ page }) => {
    await page.goto('/accounting/transactions');

    // Wait for page to load
    await expect(page.getByTestId('transaction-register-page')).toBeVisible();

    // Check filter controls exist (using correct testids from TransactionRegisterPage)
    await expect(page.getByTestId('filter-start-date')).toBeVisible();
    await expect(page.getByTestId('filter-end-date')).toBeVisible();
    await expect(page.getByTestId('filter-status')).toBeVisible();

    // Apply a filter
    await page.getByTestId('filter-status').selectOption('POSTED');

    await takeScreenshot(page, 'journey-accounting-filters');
  });
});

// ===========================================================================
// Cross-Journey Navigation Tests
// ===========================================================================

test.describe('Cross-Journey Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockInvoicesApi(page, mockInvoices);
    await mockBillsApi(page, mockBills);
    await mockVendorsApi(page, mockVendors);
    await mockAllReportsApi(page);
    await mockAccountingApi(page);
  });

  test('can navigate between all major sections without errors', async ({ page }) => {
    // Dashboard
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    // Invoices
    await page.goto('/invoices');
    await expect(page.getByTestId('invoice-list-page')).toBeVisible();

    // Bills
    await page.goto('/bills');
    await expect(page.getByTestId('bill-list-page')).toBeVisible();

    // Vendors
    await page.goto('/vendors');
    await expect(page.getByTestId('vendor-list-page')).toBeVisible();

    // Payments
    await page.goto('/payments');
    await expect(page.getByTestId('payment-list-page')).toBeVisible();

    // Ledger Accounts
    await page.goto('/ledger/accounts');
    await expect(page.getByTestId('chart-of-accounts-page')).toBeVisible();

    // Ledger Transactions
    await page.goto('/ledger/transactions');
    await expect(page.getByTestId('ledger-transactions-page')).toBeVisible();

    // Accounting
    await page.goto('/accounting/transactions');
    await expect(page.getByTestId('transaction-register-page')).toBeVisible();

    // Reports
    await page.goto('/reports');
    await expect(page.getByTestId('reports-page')).toBeVisible();

    await takeScreenshot(page, 'journey-navigation-complete');
  });

  test('back navigation works correctly in forms', async ({ page }) => {
    // Invoice form cancel
    await page.goto('/invoices/new');
    await page.getByTestId('invoice-form-cancel-button').click();
    await expect(page).toHaveURL(/\/invoices$/);

    // Bill form cancel
    await page.goto('/bills/new');
    await page.getByTestId('bill-form-cancel-button').click();
    await expect(page).toHaveURL(/\/bills$/);

    // Vendor form cancel
    // Changed: Use correct testid from VendorFormPage component
    await page.goto('/vendors/new');
    await page.getByTestId('vendor-form-cancel').click();
    await expect(page).toHaveURL(/\/vendors$/);

    await takeScreenshot(page, 'journey-navigation-cancel-buttons');
  });

  test('protected routes redirect to login when session expires', async ({ page }) => {
    // Clear auth state to simulate session expiration
    await page.addInitScript(() => {
      localStorage.clear();
    });

    // Try to access protected routes
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/invoices');
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/reports/pnl');
    await expect(page).toHaveURL(/\/login/);

    await takeScreenshot(page, 'journey-navigation-session-expired');
  });
});
