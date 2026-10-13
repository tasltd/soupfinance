/**
 * Payment Management E2E Tests
 * Tests payment listing, recording, and tab switching flows
 */
import { test, expect, type Page } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import {
  isLxcMode,
  mockTokenValidationApi,
  takeScreenshot,
  setupResponseValidation,
  installUnmockedApiGuard,
  mockAmbientApi,
  type UnmockedApiGuard,
} from './fixtures';

// ===========================================================================
// Mock Data
// ===========================================================================

// Fix: paymentMethod is a domain object with id+name (not a string enum)
const mockInvoicePayments = [
  {
    id: 'ip-001',
    invoice: { id: 'inv-001', invoiceNumber: 'INV-2024-001' },
    amount: 2500.0,
    paymentDate: '2024-10-15',
    paymentMethod: { id: 'pm-1', name: 'Bank Transfer' },
    reference: 'TRF-12345',
    dateCreated: '2024-10-15T10:00:00Z',
  },
  {
    id: 'ip-002',
    invoice: { id: 'inv-002', invoiceNumber: 'INV-2024-002' },
    amount: 1500.0,
    paymentDate: '2024-10-16',
    paymentMethod: { id: 'pm-2', name: 'Cash' },
    reference: null,
    dateCreated: '2024-10-16T11:00:00Z',
  },
  {
    id: 'ip-003',
    invoice: { id: 'inv-003', invoiceNumber: 'INV-2024-003' },
    amount: 3200.0,
    paymentDate: '2024-10-17',
    paymentMethod: { id: 'pm-3', name: 'Cheque' },
    reference: 'CHK-789',
    dateCreated: '2024-10-17T09:30:00Z',
  },
];

// Fix: paymentMethod is a domain object with id+name (not a string enum)
const mockBillPayments = [
  {
    id: 'bp-001',
    bill: { id: 'bill-001', billNumber: 'BILL-2024-001' },
    amount: 850.0,
    paymentDate: '2024-10-14',
    paymentMethod: { id: 'pm-1', name: 'Bank Transfer' },
    reference: 'PAY-001',
    dateCreated: '2024-10-14T10:00:00Z',
  },
  {
    id: 'bp-002',
    bill: { id: 'bill-002', billNumber: 'BILL-2024-002' },
    amount: 450.0,
    paymentDate: '2024-10-15',
    paymentMethod: { id: 'pm-4', name: 'Card' },
    reference: 'CARD-456',
    dateCreated: '2024-10-15T14:00:00Z',
  },
];

// Changed: Mock data mirrors Grails domain structure with invoiceItemList/invoicePaymentList
// transformInvoice() computes totalAmount from invoiceItemList and amountDue from payments
const mockUnpaidInvoices = [
  {
    id: 'inv-unpaid-001',
    number: 10,
    accountServices: { id: 'as-001', class: 'soupbroker.kyc.AccountServices', serialised: 'Direct Account : Corporate(ABC Corp)' },
    invoiceDate: '2024-10-01T00:00:00Z',
    paymentDate: '2024-11-01T00:00:00Z',
    status: 'SENT',
    // Fix: invoiceItemList needed so transformInvoice computes totalAmount = 5000
    invoiceItemList: [
      { id: 'ii-u1', quantity: 1, unitPrice: 5000.0, description: 'Consulting Services' },
    ],
    // Fix: partial payment of 2000, so amountDue = 5000 - 2000 = 3000
    invoicePaymentList: [
      { id: 'ip-u1', amount: 2000.0, paymentDate: '2024-10-15T00:00:00Z', paymentMethod: 'BANK_TRANSFER' },
    ],
    dateCreated: '2024-10-01T10:00:00Z',
  },
  {
    id: 'inv-unpaid-002',
    number: 11,
    accountServices: { id: 'as-002', class: 'soupbroker.kyc.AccountServices', serialised: 'Direct Account : Corporate(XYZ Ltd)' },
    invoiceDate: '2024-10-05T00:00:00Z',
    paymentDate: '2024-11-05T00:00:00Z',
    status: 'OVERDUE',
    // Fix: invoiceItemList needed so transformInvoice computes totalAmount = 2000
    invoiceItemList: [
      { id: 'ii-u2', quantity: 4, unitPrice: 500.0, description: 'Design Work' },
    ],
    // No payments yet, so amountDue = 2000
    invoicePaymentList: [],
    dateCreated: '2024-10-05T10:00:00Z',
  },
];

const mockUnpaidBills = [
  {
    id: 'bill-unpaid-001',
    billNumber: 'BILL-2024-010',
    vendor: { id: 'vendor-001', name: 'Office Supplies Co' },
    total: 1200.0,
    amountDue: 800.0,
    status: 'RECEIVED',
    dateCreated: '2024-10-02T10:00:00Z',
  },
  {
    id: 'bill-unpaid-002',
    billNumber: 'BILL-2024-011',
    vendor: { id: 'vendor-002', name: 'Tech Hardware Inc' },
    total: 3500.0,
    amountDue: 3500.0,
    status: 'OVERDUE',
    dateCreated: '2024-10-03T10:00:00Z',
  },
];

// ===========================================================================
// Test Setup
// ===========================================================================

test.describe('Payment Management', () => {
  // Added (SOUPFIN-80): install the unmocked-API guard FIRST. Mocks registered
  // after it take precedence, so it only sees calls nothing else claimed. Left
  // unguarded, such a call proxies to VITE_PROXY_TARGET, a real backend there
  // answers 401, client.ts reloads to /login, the init script restores the token
  // and the page lands on /dashboard, failing a later, unrelated assertion.
  let apiGuard: UnmockedApiGuard;

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test.beforeEach(async ({ page }) => {
    apiGuard = await installUnmockedApiGuard(page);
    // Added (SOUPFIN-80): frontendLog batches (every page, dev mode sends all
    // levels) and the lookup pickers. Tests register their own data mocks later,
    // which take precedence over these defaults.
    await mockAmbientApi(page);
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
    // Added: Validate API response shapes at runtime
    await setupResponseValidation(page);
  });

  // Helper to mock payments API
  async function mockPaymentsApi(
    page: ReturnType<typeof test.page> extends Promise<infer T> ? T : never,
    options?: {
      incomingPayments?: typeof mockInvoicePayments;
      outgoingPayments?: typeof mockBillPayments;
      unpaidInvoices?: typeof mockUnpaidInvoices;
      unpaidBills?: typeof mockUnpaidBills;
    }
  ) {
    await mockTokenValidationApi(page, true);

    const {
      incomingPayments = mockInvoicePayments,
      outgoingPayments = mockBillPayments,
      unpaidInvoices = mockUnpaidInvoices,
      unpaidBills = mockUnpaidBills,
    } = options || {};

    // Mock invoice payments endpoint
    await page.route('**/rest/invoicePayment/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(incomingPayments),
      });
    });

    // Mock bill payments endpoint
    await page.route('**/rest/billPayment/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(outgoingPayments),
      });
    });

    // Mock invoices list endpoint (for form dropdown)
    await page.route('**/rest/invoice/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(unpaidInvoices),
      });
    });

    // Mock bills list endpoint (for form dropdown)
    await page.route('**/rest/bill/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(unpaidBills),
      });
    });

    // Fix: Mock payment methods endpoint — PaymentFormPage fetches /rest/paymentMethod/index.json
    await page.route('**/rest/paymentMethod/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'pm-1', name: 'Bank Transfer' },
          { id: 'pm-2', name: 'Cash' },
          { id: 'pm-3', name: 'Cheque' },
          { id: 'pm-4', name: 'Card' },
          { id: 'pm-5', name: 'Mobile Money' },
          { id: 'pm-6', name: 'Other' },
        ]),
      });
    });

    // Mock bank/cash accounts for deposit dropdown
    await page.route('**/rest/ledgerAccount/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'acct-1', name: 'Main Bank Account', code: '1000' },
          { id: 'acct-2', name: 'Cash on Hand', code: '1010' },
        ]),
      });
    });

    // Mock CSRF token endpoints (required before save)
    await page.route('**/rest/invoicePayment/create.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          SYNCHRONIZER_TOKEN: 'mock-csrf-token-invoice',
          SYNCHRONIZER_URI: '/rest/invoicePayment/save',
        }),
      });
    });

    await page.route('**/rest/billPayment/create.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          SYNCHRONIZER_TOKEN: 'mock-csrf-token-bill',
          SYNCHRONIZER_URI: '/rest/billPayment/save',
        }),
      });
    });

    // Mock record invoice payment
    await page.route('**/rest/invoicePayment/save*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'ip-new',
          invoice: { id: 'inv-unpaid-001', invoiceNumber: 'INV-2024-010' },
          amount: 1000.0,
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethod: 'BANK_TRANSFER',
          dateCreated: new Date().toISOString(),
        }),
      });
    });

    // Mock record bill payment
    await page.route('**/rest/billPayment/save*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'bp-new',
          bill: { id: 'bill-unpaid-001', billNumber: 'BILL-2024-010' },
          amount: 500.0,
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethod: 'BANK_TRANSFER',
          dateCreated: new Date().toISOString(),
        }),
      });
    });
  }

  // ===========================================================================
  // Payment List Tests
  // ===========================================================================

  test.describe('Payment List Page', () => {
    test('displays payment list with tabs', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments');
      await expect(page.getByTestId('payment-list-page')).toBeVisible();
      await expect(page.getByTestId('payment-list-heading')).toHaveText('Payments');

      // Verify tabs are visible
      await expect(page.getByTestId('payment-tabs')).toBeVisible();
      await expect(page.getByTestId('tab-incoming')).toBeVisible();
      await expect(page.getByTestId('tab-outgoing')).toBeVisible();

      await takeScreenshot(page, 'payment-list-page');
    });

    test('shows incoming payments in table', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments');
      await expect(page.getByTestId('payment-table')).toBeVisible();

      // Verify incoming payments are displayed
      await expect(page.getByTestId('payment-row-ip-001')).toBeVisible();
      await expect(page.getByTestId('payment-row-ip-002')).toBeVisible();
      await expect(page.getByTestId('payment-row-ip-003')).toBeVisible();

      // Verify payment data
      // Fix (SOUPFIN-180): scoped to the row badge; a bare text match hit the hidden
      // <option> in the SOUPFIN-177 method filter first
      await expect(page.getByTestId('payment-method-badge-ip-001')).toHaveText('Bank Transfer');
      await expect(page.locator('text=+$2,500.00')).toBeVisible();

      // Verify summary is visible
      await expect(page.getByTestId('payment-summary')).toBeVisible();

      await takeScreenshot(page, 'payment-list-incoming');
    });

    test('switches to outgoing payments tab', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments');
      await expect(page.getByTestId('payment-table')).toBeVisible();

      // Click outgoing tab
      await page.getByTestId('tab-outgoing').click();

      // Wait for table to update
      await expect(page.getByTestId('payment-row-bp-001')).toBeVisible();
      await expect(page.getByTestId('payment-row-bp-002')).toBeVisible();

      // Verify outgoing payment shows negative amounts (no thousands separator needed for < 1000)
      await expect(page.locator('text=-$850.00')).toBeVisible();

      await takeScreenshot(page, 'payment-list-outgoing');
    });

    test('shows loading state while fetching', async ({ page }) => {
      await mockTokenValidationApi(page, true);

      // Delay payment responses
      await page.route('**/rest/invoicePayment/index.json*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockInvoicePayments),
        });
      });

      await page.route('**/rest/billPayment/index.json*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockBillPayments),
        });
      });

      await page.goto('/payments', { waitUntil: 'commit' });
      await page.waitForSelector('[data-testid="payment-list-page"]', { timeout: 5000 });

      // Should show loading state
      await expect(page.getByTestId('payment-list-loading')).toBeVisible({ timeout: 2000 });
      await takeScreenshot(page, 'payment-list-loading');

      // Wait for data to load
      await expect(page.getByTestId('payment-table')).toBeVisible({ timeout: 10000 });
    });

    test('shows empty state when no incoming payments', async ({ page }) => {
      await mockPaymentsApi(page, { incomingPayments: [] });

      await page.goto('/payments');

      // Should show empty state
      await expect(page.getByTestId('payment-list-empty')).toBeVisible();
      await expect(page.locator('text=No incoming payments')).toBeVisible();

      await takeScreenshot(page, 'payment-list-empty-incoming');
    });

    test('shows empty state when no outgoing payments', async ({ page }) => {
      await mockPaymentsApi(page, { outgoingPayments: [] });

      await page.goto('/payments');

      // Switch to outgoing tab
      await page.getByTestId('tab-outgoing').click();

      // Should show empty state
      await expect(page.getByTestId('payment-list-empty')).toBeVisible();
      await expect(page.locator('text=No outgoing payments')).toBeVisible();

      await takeScreenshot(page, 'payment-list-empty-outgoing');
    });

    test('shows error state on API failure', async ({ page }) => {
      await mockTokenValidationApi(page, true);

      // Mock API error
      await page.route('**/rest/invoicePayment/index.json*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.route('**/rest/billPayment/index.json*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto('/payments');

      // Should show error state
      await expect(page.getByTestId('payment-list-error')).toBeVisible();
      // Changed (SOUPFIN-180): ApiErrorState names the cause instead of a generic card
      await expect(page.getByTestId('payment-list-error')).toHaveAttribute('data-error-kind', 'server_error');
      await expect(page.getByTestId('payment-list-error-retry')).toBeVisible();

      await takeScreenshot(page, 'payment-list-error');
    });

    test('can navigate to record payment', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments');
      await page.getByTestId('record-payment-button').click();

      await expect(page).toHaveURL(/\/payments\/new/);
    });

    test('shows payment count badges on tabs', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments');
      await expect(page.getByTestId('payment-table')).toBeVisible();

      // Verify incoming count badge shows 3
      const incomingTab = page.getByTestId('tab-incoming');
      await expect(incomingTab.locator('span.px-2')).toContainText('3');

      // Outgoing count badge shows 2
      const outgoingTab = page.getByTestId('tab-outgoing');
      await expect(outgoingTab.locator('span.px-2')).toContainText('2');
    });
  });

  // ===========================================================================
  // Payment Form Tests
  // ===========================================================================

  test.describe('Payment Form Page', () => {
    test('displays form with payment type toggle', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Verify form is present
      await expect(page.getByTestId('payment-form-page')).toBeVisible();
      await expect(page.getByTestId('payment-form-heading')).toHaveText('Record Payment');

      // Verify payment type toggle
      await expect(page.getByTestId('payment-type-toggle')).toBeVisible();
      await expect(page.getByTestId('type-invoice')).toBeVisible();
      await expect(page.getByTestId('type-bill')).toBeVisible();

      await takeScreenshot(page, 'payment-form-page');
    });

    test('shows invoice dropdown for incoming payment', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Invoice type should be default
      await expect(page.getByTestId('type-invoice')).toHaveClass(/bg-primary/);

      // Wait for invoice dropdown to load
      await expect(page.getByTestId('select-document')).toBeVisible();

      // Changed: Verify invoices are in dropdown (uses number + accountServices.serialised)
      const select = page.getByTestId('select-document');
      await expect(select).toContainText('ABC Corp');
      await expect(select).toContainText('XYZ Ltd');

      await takeScreenshot(page, 'payment-form-invoice-dropdown');
    });

    test('switches to bill payment and shows bill dropdown', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Click bill payment type
      await page.getByTestId('type-bill').click();

      // Bill type should now be active
      await expect(page.getByTestId('type-bill')).toHaveClass(/bg-primary/);

      // Wait for bill dropdown to load
      await expect(page.getByTestId('select-document')).toBeVisible();

      // Verify bills are in dropdown
      const select = page.getByTestId('select-document');
      await expect(select).toContainText('BILL-2024-010');
      await expect(select).toContainText('BILL-2024-011');

      await takeScreenshot(page, 'payment-form-bill-dropdown');
    });

    test('submit button is disabled without document selection', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Fill amount but don't select document
      await page.getByTestId('amount-input').fill('100');

      // Submit button should be disabled
      await expect(page.getByTestId('submit-button')).toBeDisabled();

      await takeScreenshot(page, 'payment-form-validation-disabled');
    });

    test('shows balance due when invoice selected', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Select an invoice
      await page.getByTestId('select-document').selectOption('inv-unpaid-001');

      // Should show balance due text
      await expect(page.locator('text=Balance due:')).toBeVisible();
      // formatCurrency uses toLocaleString('en-US') which adds thousands separator
      await expect(page.getByText('$3,000.00', { exact: true })).toBeVisible();

      // Should show "Pay full balance" button
      await expect(page.getByTestId('pay-full-button')).toBeVisible();
      await expect(page.getByTestId('pay-full-button')).toContainText('$3,000.00');

      await takeScreenshot(page, 'payment-form-balance-due');
    });

    test('pay full balance button fills amount', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Select an invoice
      await page.getByTestId('select-document').selectOption('inv-unpaid-001');

      // Click pay full balance
      await page.getByTestId('pay-full-button').click();

      // Amount should be filled
      await expect(page.getByTestId('amount-input')).toHaveValue('3000.00');
    });

    test('prevents submission when amount exceeds balance due', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Select an invoice with $3000 due
      await page.getByTestId('select-document').selectOption('inv-unpaid-001');

      // Enter amount greater than balance
      await page.getByTestId('amount-input').fill('5000');

      // Changed: Browser's HTML5 validation (max attribute) marks input as invalid
      // Verify the input has the max constraint set
      const amountInput = page.getByTestId('amount-input');
      await expect(amountInput).toHaveAttribute('max', '3000');

      // The form should not navigate away when trying to submit invalid value
      await page.getByTestId('submit-button').click();

      // Should still be on the form page (browser validation prevents navigation)
      await expect(page).toHaveURL(/\/payments\/new/);

      await takeScreenshot(page, 'payment-form-amount-exceeds-balance');
    });

    test('can fill all form fields', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Fill form
      await page.getByTestId('select-document').selectOption('inv-unpaid-001');
      await page.getByTestId('amount-input').fill('1500');
      await page.getByTestId('date-input').fill('2024-10-20');
      // Fix: Select by label — option values are domain IDs (pm-3), not enum strings
      await page.getByTestId('method-select').selectOption({ label: 'Cheque' });
      await page.getByTestId('reference-input').fill('CHK-12345');
      await page.getByTestId('notes-input').fill('Partial payment for services');

      await takeScreenshot(page, 'payment-form-filled');

      // Verify all fields
      await expect(page.getByTestId('amount-input')).toHaveValue('1500');
      await expect(page.getByTestId('reference-input')).toHaveValue('CHK-12345');
    });

    test('can submit invoice payment successfully', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Fill form
      await page.getByTestId('select-document').selectOption('inv-unpaid-001');
      await page.getByTestId('amount-input').fill('1000');

      // Submit
      await page.getByTestId('submit-button').click();

      // Should navigate to payments list
      await expect(page).toHaveURL('/payments');
    });

    test('can submit bill payment successfully', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Switch to bill
      await page.getByTestId('type-bill').click();

      // Fill form
      await page.getByTestId('select-document').selectOption('bill-unpaid-001');
      await page.getByTestId('amount-input').fill('500');

      // Submit
      await page.getByTestId('submit-button').click();

      // Should navigate to payments list
      await expect(page).toHaveURL('/payments');
    });

    test('cancel button returns to payment list', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Click cancel
      await page.getByTestId('cancel-button').click();

      // Should navigate back to list
      await expect(page).toHaveURL('/payments');
    });

    test('shows all payment methods in dropdown', async ({ page }) => {
      await mockPaymentsApi(page);

      await page.goto('/payments/new');

      // Check payment method options
      const methodSelect = page.getByTestId('method-select');
      await expect(methodSelect).toContainText('Bank Transfer');
      await expect(methodSelect).toContainText('Cash');
      await expect(methodSelect).toContainText('Cheque');
      await expect(methodSelect).toContainText('Card');
      await expect(methodSelect).toContainText('Other');
    });

    test('shows loading state while fetching invoices', async ({ page }) => {
      await mockTokenValidationApi(page, true);

      // Fix: Increased delay to 5s to eliminate race condition with page navigation
      await page.route('**/rest/invoice/index.json*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUnpaidInvoices),
        });
      });

      // Fix: the form fires THREE queries — invoices, bills and payment methods
      // (see PaymentFormPage). Only the invoice one may hang; the other two must
      // resolve immediately or they fall through to the dev proxy, 401, and the
      // auth interceptor redirects to /login before the assertion runs. This
      // previously passed on Chromium only because it won that race.
      await page.route('**/rest/bill/index.json*', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });

      await page.route('**/rest/paymentMethod/index.json*', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });

      await page.goto('/payments/new');

      // Fix: Increased timeout to 5s to match the delayed response
      await expect(page.locator('text=Loading')).toBeVisible({ timeout: 5000 });
    });
  });

  // ===========================================================================
  // Responsiveness Tests
  // ===========================================================================

  test.describe('Responsiveness', () => {
    test('payment list is usable on mobile viewport', async ({ page }) => {
      await mockPaymentsApi(page);

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/payments');

      // Page should still be functional
      await expect(page.getByTestId('payment-list-page')).toBeVisible();
      await expect(page.getByTestId('payment-tabs')).toBeVisible();
      await expect(page.getByTestId('record-payment-button')).toBeVisible();

      await takeScreenshot(page, 'payment-list-mobile');
    });

    test('payment form is usable on mobile viewport', async ({ page }) => {
      await mockPaymentsApi(page);

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/payments/new');

      // Form should be accessible
      await expect(page.getByTestId('payment-form-page')).toBeVisible();
      await expect(page.getByTestId('payment-type-toggle')).toBeVisible();
      await expect(page.getByTestId('select-document')).toBeVisible();
      await expect(page.getByTestId('submit-button')).toBeVisible();

      await takeScreenshot(page, 'payment-form-mobile');
    });
  });
});

// ===========================================================================
// SOUPFIN-177: pagination, filters, payment detail and void
// ===========================================================================
//
// Driven from the dashboard by clicks only (sidebar → row → detail → void).
// A small in-memory "server" stands in for the backend: it pages by
// max/offset, filters by from/to on dateCreated, ignores paymentMethod.id
// (as the real InvoicePaymentController does), and deletes on DELETE. Each
// test reads that server state before and after the UI action, so a passing
// UI with no real request behind it fails.
//
// Row shapes mirror the LXC backend (2026-10-13): FKs carry only
// { id, class, serialised } and every index row repeats `totalCount`.

const SOUPFIN_177_SHOTS = 'e2e/playwright/screenshots/soupfin-177';

async function shot177(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SOUPFIN_177_SHOTS}/${name}.png`, fullPage: true });
}

interface ServerPayment {
  id: string;
  invoice?: { id: string; class: string; serialised: string };
  bill?: { id: string; class: string; serialised: string };
  paymentMethod?: { id: string; class: string; serialised: string };
  payInAccount?: { id: string; class: string; serialised: string };
  payOutAccount?: { id: string; class: string; serialised: string };
  amount: number;
  paymentDate: string;
  dateCreated: string;
  quickReference: string;
  currency: string;
  notes?: string;
}

const PM = (id: string, name: string) => ({ id, class: 'soupbroker.finance.PaymentMethod', serialised: name });
const BANK_TRANSFER = PM('pm-001', 'Bank Transfer');
const MOBILE_MONEY = PM('pm-003', 'Mobile Money');

function seedInvoicePayments(count: number): ServerPayment[] {
  // Newest first, as the backend sorts by paymentDate desc. Every third
  // payment is Mobile Money; dateCreated spans September and October.
  return Array.from({ length: count }, (_, i) => {
    const day = 30 - (i % 28);
    const month = i < 20 ? '10' : '09';
    return {
      id: `ip-e2e-${i}`,
      invoice: {
        id: `inv-e2e-${i % 5}`,
        class: 'soupbroker.finance.Invoice',
        serialised: `Invoice(number:${2026100 + (i % 5)}, accountServices:Direct Account : Corporate(Client ${i % 5} Ltd), currency:GHS, total:5000.00)`,
      },
      paymentMethod: i % 3 === 0 ? MOBILE_MONEY : BANK_TRANSFER,
      payInAccount: { id: 'la-1', class: 'soupbroker.finance.LedgerAccount', serialised: 'Main Bank Account - GHS' },
      amount: 100 + i * 10,
      paymentDate: `2026-${month}-${String(day).padStart(2, '0')}T00:00:00Z`,
      dateCreated: `2026-${month}-${String(day).padStart(2, '0')}T09:00:00Z`,
      quickReference: `QR${String(i).padStart(4, '0')}`,
      currency: 'GHS',
      notes: i === 0 ? 'Deposit for October retainer' : undefined,
    };
  });
}

function seedBillPayments(): ServerPayment[] {
  return [
    {
      id: 'bp-e2e-1',
      bill: { id: 'bill-e2e-1', class: 'soupbroker.finance.Bill', serialised: 'Bill((Volta Power Services)[SUPPLIER], 77)' },
      paymentMethod: PM('pm-004', 'Cheque'),
      payOutAccount: { id: 'la-2', class: 'soupbroker.finance.LedgerAccount', serialised: 'Cash on Hand - GHS' },
      amount: 3565,
      paymentDate: '2026-10-09T00:00:00Z',
      dateCreated: '2026-10-09T10:00:00Z',
      quickReference: 'QRB0001',
      currency: 'GHS',
    },
  ];
}

/** Install the stateful payment "server". Registered after the guide mocks, so it wins. */
async function installPaymentServer(
  page: Page,
  options: { deleteReply?: (id: string) => { status: number; body?: unknown } } = {}
) {
  const state = {
    invoicePayments: seedInvoicePayments(45),
    billPayments: seedBillPayments(),
    indexRequests: [] as Array<{ kind: 'invoice' | 'bill'; params: Record<string, string> }>,
    deletes: [] as string[],
  };

  const register = async (kind: 'invoice' | 'bill') => {
    const controller = kind === 'invoice' ? 'invoicePayment' : 'billPayment';
    const rows = () => (kind === 'invoice' ? state.invoicePayments : state.billPayments);

    await page.route(`**/rest/${controller}/index.json*`, (route) => {
      const params = Object.fromEntries(new URL(route.request().url()).searchParams);
      state.indexRequests.push({ kind, params });
      let list = rows();
      // The invoice detail page asks for one invoice's payments.
      if (params['invoice.id']) list = list.filter((p) => p.invoice?.id === params['invoice.id']);
      if (params['bill.id']) list = list.filter((p) => p.bill?.id === params['bill.id']);
      // Like the backend: from/to compare dateCreated; paymentMethod.id is ignored.
      if (params.from) list = list.filter((p) => p.dateCreated.slice(0, 10) >= params.from);
      if (params.to) list = list.filter((p) => p.dateCreated.slice(0, 10) <= params.to);
      const offset = Number(params.offset || 0);
      const max = Number(params.max || 10);
      const pageRows = list.slice(offset, offset + max).map((p) => ({ ...p, totalCount: list.length }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pageRows) });
    });

    await page.route(`**/rest/${controller}/show/*.json*`, (route) => {
      const id = route.request().url().match(/show\/([^./?]+)\.json/)?.[1];
      const row = rows().find((p) => p.id === id);
      return row
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) })
        : route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });

    await page.route(`**/rest/${controller}/delete/*.json*`, (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      const id = route.request().url().match(/delete\/([^./?]+)\.json/)?.[1] ?? '';
      const reply = options.deleteReply?.(id);
      if (reply) {
        return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body ?? '') });
      }
      state.deletes.push(`${controller}:${id}`);
      if (kind === 'invoice') state.invoicePayments = state.invoicePayments.filter((p) => p.id !== id);
      else state.billPayments = state.billPayments.filter((p) => p.id !== id);
      return route.fulfill({ status: 204, body: '' });
    });
  };

  await register('invoice');
  await register('bill');
  return state;
}

test.describe('SOUPFIN-177: payment history, detail and void', () => {
  test.skip(isLxcMode(), 'Mock-only spec: the payment server is in-memory');
  test.use({ viewport: { width: 1440, height: 900 } });

  let apiGuard177: UnmockedApiGuard;

  test.beforeEach(async ({ page }) => {
    apiGuard177 = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
  });

  test.afterEach(() => {
    apiGuard177?.assertNone();
  });

  async function openPaymentsFromSidebar(page: Page, server?: Parameters<typeof installPaymentServer>[1]) {
    await installGuideMocks(page);
    const state = await installPaymentServer(page, server);
    await seedAuthenticatedSession(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
    await page.locator('aside').locator('a[href="/payments"]').first().click();
    await expect(page).toHaveURL(/\/payments$/);
    await expect(page.getByTestId('payment-table')).toBeVisible();
    return state;
  }

  test('pages through payments on the server', async ({ page }) => {
    const state = await openPaymentsFromSidebar(page);

    await expect(page.getByTestId('pagination-range')).toHaveText('Showing 1–20 of 45 incoming payments');
    const first = state.indexRequests.filter((r) => r.kind === 'invoice').at(-1)!;
    expect(first.params).toMatchObject({ max: '20', offset: '0', sort: 'paymentDate', order: 'desc' });
    // Method badge comes from the PaymentMethod record, not an enum map
    await expect(page.getByTestId('payment-method-badge-ip-e2e-0')).toHaveText('Mobile Money');
    await expect(page.getByTestId('payment-method-badge-ip-e2e-1')).toHaveText('Bank Transfer');
    await expect(page.getByTestId('tab-incoming')).toContainText('45');
    await shot177(page, 'payments-list-page-1');

    await page.getByTestId('pagination-next').click();
    await expect(page.getByTestId('payment-row-ip-e2e-20')).toBeVisible();
    await expect(page.getByTestId('payment-row-ip-e2e-0')).toHaveCount(0);
    await expect(page.getByTestId('pagination-range')).toHaveText('Showing 21–40 of 45 incoming payments');
    expect(state.indexRequests.filter((r) => r.kind === 'invoice').at(-1)!.params.offset).toBe('20');

    await page.getByTestId('pagination-page-3').click();
    await expect(page.getByTestId('pagination-range')).toHaveText('Showing 41–45 of 45 incoming payments');
    await expect(page.getByTestId('pagination-next')).toBeDisabled();
    await shot177(page, 'payments-list-page-3');
  });

  test('filters by recorded date and by payment method', async ({ page }) => {
    const state = await openPaymentsFromSidebar(page);

    await page.getByTestId('filter-from').fill('2026-10-01');
    await page.getByTestId('filter-to').fill('2026-10-31');
    await expect(page.getByTestId('pagination-range')).toHaveText('Showing 1–20 of 20 incoming payments');
    expect(state.indexRequests.filter((r) => r.kind === 'invoice').at(-1)!.params).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-31',
      offset: '0',
    });
    await shot177(page, 'payments-filter-dates');

    // Method options come from /rest/paymentMethod (the tenant's own records)
    await expect(page.getByTestId('filter-method').locator('option')).toHaveText([
      'All methods',
      'Bank Transfer',
      'Cash',
      'Mobile Money',
      'Cheque',
    ]);
    await page.getByTestId('filter-method').selectOption({ label: 'Mobile Money' });
    // October rows are ip-e2e-0..19; every third is Mobile Money → 0,3,…,18 = 7
    await expect(page.getByTestId('pagination-range')).toHaveText('Showing 1–7 of 7 incoming payments');
    const badges = page.locator('[data-testid^="payment-method-badge-"]');
    await expect(badges).toHaveCount(7);
    for (const text of await badges.allTextContents()) expect(text).toBe('Mobile Money');
    expect(state.indexRequests.filter((r) => r.kind === 'invoice').at(-1)!.params['paymentMethod.id']).toBe('pm-003');
    await shot177(page, 'payments-filter-method');

    await page.getByTestId('filter-from').fill('2031-01-01');
    await page.getByTestId('filter-to').fill('2031-01-31');
    await expect(page.getByTestId('payment-list-no-matches')).toBeVisible();
    await shot177(page, 'payments-filter-no-matches');

    await page.getByTestId('filter-clear').click();
    await expect(page.getByTestId('pagination-range')).toHaveText('Showing 1–20 of 45 incoming payments');
  });

  test('opens a payment and voids it', async ({ page }) => {
    const state = await openPaymentsFromSidebar(page);
    expect(state.invoicePayments).toHaveLength(45);

    await page.getByTestId('payment-view-ip-e2e-0').click();
    await expect(page).toHaveURL(/\/payments\/invoice\/ip-e2e-0$/);
    await expect(page.getByTestId('payment-detail-amount')).toHaveText('+GH₵100.00');
    await expect(page.getByTestId('payment-detail-document-link')).toHaveText('Invoice #2026100');
    await expect(page.getByTestId('payment-detail-party')).toHaveText('Client 0 Ltd');
    await expect(page.getByTestId('payment-detail-method')).toHaveText('Mobile Money');
    await expect(page.getByTestId('payment-detail-account')).toHaveText('Main Bank Account - GHS');
    await expect(page.getByTestId('payment-detail-reference')).toHaveText('QR0000');
    await expect(page.getByTestId('payment-detail-date')).toHaveText('2026-10-30');
    await expect(page.getByTestId('payment-detail-notes')).toHaveText('Deposit for October retainer');
    await shot177(page, 'payment-detail');

    await page.getByTestId('payment-void-button').click();
    await expect(page.getByTestId('payment-void-dialog')).toBeVisible();
    await shot177(page, 'payment-void-confirm');

    // "Keep payment" changes nothing on the server
    await page.getByTestId('payment-void-cancel').click();
    await expect(page.getByTestId('payment-void-dialog')).toHaveCount(0);
    expect(state.deletes).toEqual([]);

    const indexCallsBefore = state.indexRequests.length;
    await page.getByTestId('payment-void-button').click();
    await page.getByTestId('payment-void-confirm').click();

    await expect(page).toHaveURL(/\/payments$/);
    await expect(page.getByText('Payment voided.')).toBeVisible();
    // Server state after: one DELETE, one fewer payment, and the list re-fetched
    expect(state.deletes).toEqual(['invoicePayment:ip-e2e-0']);
    expect(state.invoicePayments).toHaveLength(44);
    await expect(page.getByTestId('pagination-range')).toHaveText('Showing 1–20 of 44 incoming payments');
    await expect(page.getByTestId('payment-row-ip-e2e-0')).toHaveCount(0);
    expect(state.indexRequests.length).toBeGreaterThan(indexCallsBefore);
    await shot177(page, 'payments-list-after-void');
  });

  test('a refused void leaves the payment in place and says why', async ({ page }) => {
    const state = await openPaymentsFromSidebar(page, {
      deleteReply: (id) => ({
        status: 200,
        body: { relatedList: [{ relatedModule: 'finance', relatedToClassSimpleName: 'paymentAllocation' }], targetId: id },
      }),
    });

    await page.getByTestId('payment-view-ip-e2e-1').click();
    await page.getByTestId('payment-void-button').click();
    await page.getByTestId('payment-void-confirm').click();

    await expect(page.getByTestId('payment-void-error')).toHaveText(
      'This payment was not voided because other records still use it (finance).'
    );
    await expect(page).toHaveURL(/\/payments\/invoice\/ip-e2e-1$/);
    expect(state.invoicePayments.some((p) => p.id === 'ip-e2e-1')).toBe(true);
    await shot177(page, 'payment-void-refused');
  });

  test('voids a bill payment and returns to the outgoing tab', async ({ page }) => {
    const state = await openPaymentsFromSidebar(page);

    await page.getByTestId('tab-outgoing').click();
    await expect(page).toHaveURL(/\/payments\?tab=outgoing$/);
    await expect(page.getByTestId('payment-row-bp-e2e-1')).toContainText('Bill #77');
    await expect(page.getByTestId('payment-method-badge-bp-e2e-1')).toHaveText('Cheque');

    await page.getByTestId('payment-view-bp-e2e-1').click();
    await expect(page).toHaveURL(/\/payments\/bill\/bp-e2e-1$/);
    await expect(page.getByTestId('payment-detail-heading')).toHaveText('Payment made');
    await expect(page.getByTestId('payment-detail-account')).toHaveText('Cash on Hand - GHS');
    await shot177(page, 'payment-detail-bill');

    await page.getByTestId('payment-void-button').click();
    await page.getByTestId('payment-void-confirm').click();

    await expect(page).toHaveURL(/\/payments\?tab=outgoing$/);
    expect(state.deletes).toEqual(['billPayment:bp-e2e-1']);
    expect(state.billPayments).toHaveLength(0);
    await expect(page.getByTestId('payment-list-empty')).toContainText('No outgoing payments');
    await shot177(page, 'payments-outgoing-after-void');
  });
});
