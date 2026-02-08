/**
 * Payment Management E2E Tests
 * Tests payment listing, recording, and tab switching flows
 */
import { test, expect } from '@playwright/test';
import { mockTokenValidationApi, takeScreenshot } from './fixtures';

// ===========================================================================
// Mock Data
// ===========================================================================

const mockInvoicePayments = [
  {
    id: 'ip-001',
    invoice: { id: 'inv-001', invoiceNumber: 'INV-2024-001' },
    amount: 2500.0,
    paymentDate: '2024-10-15',
    paymentMethod: 'BANK_TRANSFER',
    reference: 'TRF-12345',
    dateCreated: '2024-10-15T10:00:00Z',
  },
  {
    id: 'ip-002',
    invoice: { id: 'inv-002', invoiceNumber: 'INV-2024-002' },
    amount: 1500.0,
    paymentDate: '2024-10-16',
    paymentMethod: 'CASH',
    reference: null,
    dateCreated: '2024-10-16T11:00:00Z',
  },
  {
    id: 'ip-003',
    invoice: { id: 'inv-003', invoiceNumber: 'INV-2024-003' },
    amount: 3200.0,
    paymentDate: '2024-10-17',
    paymentMethod: 'CHEQUE',
    reference: 'CHK-789',
    dateCreated: '2024-10-17T09:30:00Z',
  },
];

const mockBillPayments = [
  {
    id: 'bp-001',
    bill: { id: 'bill-001', billNumber: 'BILL-2024-001' },
    amount: 850.0,
    paymentDate: '2024-10-14',
    paymentMethod: 'BANK_TRANSFER',
    reference: 'PAY-001',
    dateCreated: '2024-10-14T10:00:00Z',
  },
  {
    id: 'bp-002',
    bill: { id: 'bill-002', billNumber: 'BILL-2024-002' },
    amount: 450.0,
    paymentDate: '2024-10-15',
    paymentMethod: 'CARD',
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
      await expect(page.locator('text=Bank Transfer').first()).toBeVisible();
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
      await expect(page.locator('text=Failed to load payments')).toBeVisible();

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
      await page.getByTestId('method-select').selectOption('CHEQUE');
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

      // Delay invoice response
      await page.route('**/rest/invoice/index.json*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUnpaidInvoices),
        });
      });

      await page.route('**/rest/billPayment/index.json*', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });

      await page.goto('/payments/new');

      // Should show loading text in dropdown area
      await expect(page.locator('text=Loading')).toBeVisible({ timeout: 2000 });
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
