/**
 * Bill CRUD E2E Tests
 * Tests bill listing, creation, editing, viewing, and payment flows
 *
 * Added: Comprehensive Playwright E2E tests for bills module
 * Routes tested:
 *   - /bills (BillListPage)
 *   - /bills/new (BillFormPage - create)
 *   - /bills/:id (BillDetailPage)
 *   - /bills/:id/edit (BillFormPage - edit)
 *
 * API endpoints mocked:
 *   - GET /rest/bill/index.json - list bills
 *   - GET /rest/bill/show/:id.json - single bill
 *   - POST /rest/bill/save.json - create bill
 *   - PUT /rest/bill/update/:id.json - update bill
 *   - DELETE /rest/bill/delete/:id.json - delete bill
 *   - GET /rest/billPayment/index.json - list payments
 *   - POST /rest/billPayment/save.json - record payment
 *   - GET /rest/vendor/index.json - list vendors for dropdown
 */
import { test, expect } from '@playwright/test';
import { takeScreenshot, mockTokenValidationApi, mockDashboardApi, isLxcMode, backendTestUsers } from './fixtures';

// =============================================================================
// Mock Data
// =============================================================================

const mockVendors = [
  { id: 'vendor-001', name: 'Acme Corp', email: 'billing@acme.com' },
  { id: 'vendor-002', name: 'Tech Supplies Inc', email: 'accounts@techsupplies.com' },
  { id: 'vendor-003', name: 'Office Solutions', email: 'invoices@officesolutions.com' },
];

const mockBillItems = [
  {
    id: 'item-001',
    bill: { id: 'bill-001' },
    description: 'Office Supplies',
    quantity: 10,
    unitPrice: 50.0,
    taxRate: 10,
    amount: 550.0,
  },
  {
    id: 'item-002',
    bill: { id: 'bill-001' },
    description: 'Printer Cartridges',
    quantity: 5,
    unitPrice: 80.0,
    taxRate: 10,
    amount: 440.0,
  },
];

const mockBills = [
  {
    id: 'bill-001',
    billNumber: 'BILL-2026-001',
    vendor: { id: 'vendor-001', name: 'Acme Corp' },
    billDate: '2026-01-15',
    paymentDate: '2026-02-14',
    status: 'PENDING',
    subtotal: 900.0,
    taxAmount: 90.0,
    totalAmount: 990.0,
    amountPaid: 0,
    amountDue: 990.0,
    items: mockBillItems,
  },
  {
    id: 'bill-002',
    billNumber: 'BILL-2026-002',
    vendor: { id: 'vendor-002', name: 'Tech Supplies Inc' },
    billDate: '2026-01-10',
    paymentDate: '2026-02-10',
    status: 'PAID',
    subtotal: 2000.0,
    taxAmount: 200.0,
    totalAmount: 2200.0,
    amountPaid: 2200.0,
    amountDue: 0,
    items: [],
  },
  {
    id: 'bill-003',
    billNumber: 'BILL-2026-003',
    vendor: { id: 'vendor-003', name: 'Office Solutions' },
    billDate: '2025-12-01',
    paymentDate: '2025-12-31',
    status: 'OVERDUE',
    subtotal: 1500.0,
    taxAmount: 150.0,
    totalAmount: 1650.0,
    amountPaid: 500.0,
    amountDue: 1150.0,
    items: [],
  },
  {
    id: 'bill-004',
    billNumber: 'BILL-2026-004',
    vendor: { id: 'vendor-001', name: 'Acme Corp' },
    billDate: '2026-01-18',
    paymentDate: '2026-02-17',
    status: 'DRAFT',
    subtotal: 300.0,
    taxAmount: 30.0,
    totalAmount: 330.0,
    amountPaid: 0,
    amountDue: 330.0,
    items: [],
  },
  {
    id: 'bill-005',
    billNumber: 'BILL-2026-005',
    vendor: { id: 'vendor-002', name: 'Tech Supplies Inc' },
    billDate: '2026-01-05',
    paymentDate: '2026-02-05',
    status: 'PARTIAL',
    subtotal: 5000.0,
    taxAmount: 500.0,
    totalAmount: 5500.0,
    amountPaid: 2000.0,
    amountDue: 3500.0,
    items: [],
  },
];

const mockBillPayments = [
  {
    id: 'payment-001',
    bill: { id: 'bill-003' },
    amount: 500.0,
    paymentDate: '2026-01-05',
    paymentMethod: 'BANK_TRANSFER',
    reference: 'TRF-001',
    notes: 'Partial payment',
  },
  {
    id: 'payment-002',
    bill: { id: 'bill-005' },
    amount: 2000.0,
    paymentDate: '2026-01-10',
    paymentMethod: 'CHEQUE',
    reference: 'CHQ-5432',
    notes: 'First installment',
  },
];

// =============================================================================
// Authentication Helper
// =============================================================================

async function setupAuth(page: any) {
  if (isLxcMode()) {
    // In LXC mode, authenticate with real backend
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Check if already logged in (redirected away from /login)
    const url = page.url();
    if (!url.includes('/login')) {
      // Already authenticated, continue
      return;
    }

    // Wait for login form to be ready
    await page.getByTestId('login-email-input').waitFor({ state: 'visible', timeout: 10000 });

    // Fill login form and submit
    await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
    await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);

    // Check "Remember me" so token is stored in localStorage (where API client reads from)
    await page.getByTestId('login-remember-checkbox').check();

    await page.getByTestId('login-submit-button').click();

    // Wait for successful login
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Give the auth state a moment to settle
    await page.waitForTimeout(500);

    return;
  }

  // In mock mode, set up fake auth state
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

// =============================================================================
// API Mock Helpers
// =============================================================================

async function mockBillsApi(page: any, bills = mockBills) {
  // Skip mocking in LXC mode - let requests go to real backend
  if (isLxcMode()) return;

  // Mock token validation to keep user authenticated
  await mockTokenValidationApi(page, true);

  // Mock list bills endpoint
  await page.route('**/rest/bill/index.json*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bills),
    });
  });
}

async function mockBillDetailApi(page: any, bill: typeof mockBills[0]) {
  // Skip mocking in LXC mode - let requests go to real backend
  if (isLxcMode()) return;

  // Mock token validation to keep user authenticated
  await mockTokenValidationApi(page, true);

  await page.route(`**/rest/bill/show/${bill.id}.json*`, (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bill),
    });
  });
}

async function mockVendorsApi(page: any, vendors = mockVendors) {
  // Skip mocking in LXC mode - let requests go to real backend
  if (isLxcMode()) return;

  // Mock token validation to keep user authenticated
  await mockTokenValidationApi(page, true);

  await page.route('**/rest/vendor/index.json*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(vendors),
    });
  });
}

async function mockBillPaymentsApi(page: any, billId: string, payments: typeof mockBillPayments = []) {
  // Skip mocking in LXC mode - let requests go to real backend
  if (isLxcMode()) return;

  await page.route(`**/rest/billPayment/index.json*bill.id=${billId}*`, (route: any) => {
    const billPayments = payments.filter((p) => p.bill.id === billId);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(billPayments),
    });
  });
}

async function mockCreateBillApi(page: any, success = true, createdBill?: typeof mockBills[0]) {
  // Skip mocking in LXC mode - let requests go to real backend
  if (isLxcMode()) return;

  await page.route('**/rest/bill/save.json*', (route: any) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          createdBill || {
            id: 'bill-new-001',
            billNumber: 'BILL-2026-006',
            vendor: { id: 'vendor-001', name: 'Acme Corp' },
            billDate: '2026-01-20',
            paymentDate: '2026-02-19',
            status: 'DRAFT',
            subtotal: 1000.0,
            taxAmount: 100.0,
            totalAmount: 1100.0,
            amountPaid: 0,
            amountDue: 1100.0,
            items: [],
          }
        ),
      });
    } else {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Validation failed',
          message: 'Vendor is required',
        }),
      });
    }
  });
}

async function mockUpdateBillApi(page: any, billId: string, success = true) {
  // Skip mocking in LXC mode - let requests go to real backend
  if (isLxcMode()) return;

  await page.route(`**/rest/bill/update/${billId}.json*`, (route: any) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockBills.find((b) => b.id === billId),
          status: 'PENDING',
        }),
      });
    } else {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Update failed',
          message: 'Unable to update bill',
        }),
      });
    }
  });
}

async function mockDeleteBillApi(page: any, billId: string, success = true) {
  // Skip mocking in LXC mode - let requests go to real backend
  if (isLxcMode()) return;

  await page.route(`**/rest/bill/delete/${billId}.json*`, (route: any) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Delete failed',
          message: 'Cannot delete bill with payments',
        }),
      });
    }
  });
}

async function _mockRecordPaymentApi(page: any, success = true) {
  // Skip mocking in LXC mode - let requests go to real backend
  if (isLxcMode()) return;

  await page.route('**/rest/billPayment/save.json*', (route: any) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'payment-new-001',
          bill: { id: 'bill-001' },
          amount: 500.0,
          paymentDate: '2026-01-20',
          paymentMethod: 'BANK_TRANSFER',
          reference: 'TRF-NEW-001',
          notes: 'Payment recorded',
        }),
      });
    } else {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Payment failed',
          message: 'Payment amount exceeds balance',
        }),
      });
    }
  });
}

// =============================================================================
// Bill List Page Tests
// =============================================================================

test.describe('Bill Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test.describe('Bill List Page', () => {
    test('bill list page loads correctly', async ({ page }) => {
      await mockBillsApi(page);

      await page.goto('/bills');
      await takeScreenshot(page, 'bills-list-initial');

      // Verify page elements
      await expect(page.getByTestId('bill-list-page')).toBeVisible();
      await expect(page.getByTestId('bill-list-heading')).toHaveText('Bills');
      await expect(page.getByTestId('bill-new-button')).toBeVisible();
    });

    test('displays bills data in table', async ({ page }) => {
      await mockBillsApi(page, mockBills);

      await page.goto('/bills');

      // Wait for loading to complete
      await expect(page.getByTestId('bill-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Verify table is visible
      await expect(page.getByTestId('bill-list-table')).toBeVisible();

      // Verify bill rows exist
      await expect(page.getByTestId('bill-row-bill-001')).toBeVisible();
      await expect(page.getByTestId('bill-row-bill-002')).toBeVisible();
      await expect(page.getByTestId('bill-row-bill-003')).toBeVisible();

      await takeScreenshot(page, 'bills-list-with-data');
    });

    test('shows loading state while fetching bills', async ({ page }) => {
      // Skip in LXC mode - loading state is hard to catch with real backend
      if (isLxcMode()) {
        test.skip();
        return;
      }

      // Mock token validation to keep user authenticated
      await mockTokenValidationApi(page, true);

      // Set up delayed API response (use longer delay to catch loading state)
      await page.route('**/rest/bill/index.json*', async (route: any) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockBills),
        });
      });

      // Navigate to the page
      await page.goto('/bills', { waitUntil: 'commit' });

      // Should show loading state (check immediately after navigation begins)
      await expect(page.getByTestId('bill-list-loading')).toBeVisible({ timeout: 3000 });
      await takeScreenshot(page, 'bills-list-loading');

      // Wait for table to appear after delay
      await expect(page.getByTestId('bill-list-table')).toBeVisible({ timeout: 5000 });
    });

    test('shows empty state when no bills exist', async ({ page }) => {
      // Mock token validation to keep user authenticated
      await mockTokenValidationApi(page, true);

      await page.route('**/rest/bill/index.json*', (route: any) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/bills');

      // Wait for loading to complete
      await expect(page.getByTestId('bill-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Should show empty state
      await expect(page.getByTestId('bill-list-empty')).toBeVisible();
      await expect(page.getByTestId('bill-list-empty')).toContainText('No bills yet');
      await expect(page.getByTestId('bill-create-first-button')).toBeVisible();

      await takeScreenshot(page, 'bills-empty-state');
    });

    test('displays correct bill status badges', async ({ page }) => {
      await mockBillsApi(page, mockBills);

      await page.goto('/bills');

      // Wait for table to load
      await expect(page.getByTestId('bill-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Check status badges for different statuses
      await expect(page.getByTestId('bill-status-bill-001')).toHaveText('PENDING');
      await expect(page.getByTestId('bill-status-bill-002')).toHaveText('PAID');
      await expect(page.getByTestId('bill-status-bill-003')).toHaveText('OVERDUE');
      await expect(page.getByTestId('bill-status-bill-004')).toHaveText('DRAFT');
      await expect(page.getByTestId('bill-status-bill-005')).toHaveText('PARTIAL');

      await takeScreenshot(page, 'bills-status-badges');
    });

    test('clicking row navigates to bill detail page', async ({ page }) => {
      await mockBillsApi(page, mockBills);
      await mockBillDetailApi(page, mockBills[0]);

      await page.goto('/bills');

      // Wait for table to load
      await expect(page.getByTestId('bill-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Click on bill link
      await page.getByTestId('bill-link-bill-001').click();

      // Should navigate to detail page
      await expect(page).toHaveURL(/\/bills\/bill-001$/);

      await takeScreenshot(page, 'bills-navigate-to-detail');
    });

    test('new bill button navigates to form', async ({ page }) => {
      await mockBillsApi(page);
      await mockVendorsApi(page);

      await page.goto('/bills');
      await takeScreenshot(page, 'bills-before-new');

      // Click New Bill button
      await page.getByTestId('bill-new-button').click();

      // Should navigate to new bill form
      await expect(page).toHaveURL(/\/bills\/new/);
      await expect(page.getByTestId('bill-form-page')).toBeVisible();
      await expect(page.getByTestId('bill-form-heading')).toHaveText('New Bill');

      await takeScreenshot(page, 'bills-new-form');
    });

    test('bills table shows vendor names', async ({ page }) => {
      await mockBillsApi(page, mockBills);

      await page.goto('/bills');

      // Wait for table
      await expect(page.getByTestId('bill-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Check vendor names are displayed within their respective rows
      await expect(page.getByTestId('bill-row-bill-001')).toContainText('Acme Corp');
      await expect(page.getByTestId('bill-row-bill-002')).toContainText('Tech Supplies Inc');
      await expect(page.getByTestId('bill-row-bill-003')).toContainText('Office Solutions');
    });

    test('bills table shows amounts correctly', async ({ page }) => {
      await mockBillsApi(page, mockBills);

      await page.goto('/bills');

      // Wait for table
      await expect(page.getByTestId('bill-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Check amounts are formatted correctly (use .first() to handle multiple matches)
      await expect(page.locator('text=$990.00').first()).toBeVisible();
      await expect(page.locator('text=$2,200.00').or(page.locator('text=$2200.00')).first()).toBeVisible();
    });
  });

  // =============================================================================
  // Bill Form Page Tests - Create
  // =============================================================================

  test.describe('Create New Bill', () => {
    test('new bill form loads with empty fields', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Verify form elements
      await expect(page.getByTestId('bill-form-page')).toBeVisible();
      await expect(page.getByTestId('bill-form-heading')).toHaveText('New Bill');

      // Verify empty form fields
      await expect(page.getByTestId('bill-vendor-select')).toBeVisible();
      await expect(page.getByTestId('bill-date-input')).toBeVisible();
      await expect(page.getByTestId('bill-due-date-input')).toBeVisible();

      await takeScreenshot(page, 'bills-form-empty');
    });

    test('vendor selection dropdown populates with vendors', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Wait for vendors to load (native select element has option elements)
      const vendorSelect = page.getByTestId('bill-vendor-select');
      await expect(vendorSelect).toBeVisible();

      // Verify vendor options are present in the select dropdown (using text content)
      await expect(vendorSelect.locator('option')).toContainText(['Acme Corp', 'Tech Supplies Inc', 'Office Solutions']);

      await takeScreenshot(page, 'bills-form-vendor-dropdown');
    });

    test('can add line items to bill', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Click add line item button
      await page.getByTestId('bill-add-item-button').click();

      // Verify line item table appears
      await expect(page.getByTestId('bill-items-table')).toBeVisible();

      // Fill in line item details
      await page.getByTestId('bill-item-description-0').fill('Test Service');
      await page.getByTestId('bill-item-quantity-0').fill('5');
      await page.getByTestId('bill-item-unitPrice-0').fill('100');
      // Changed: taxRate is now a select dropdown, not an input field
      await page.getByTestId('bill-item-taxRate-0').selectOption('10');

      await takeScreenshot(page, 'bills-form-with-line-item');
    });

    test('can remove line items from bill', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Form starts with one default line item, add one more so we can test removal
      // (Remove button is disabled when only one item exists)
      await page.getByTestId('bill-add-item-button').click();

      // Verify items table is visible
      await expect(page.getByTestId('bill-items-table')).toBeVisible();

      // Verify both item rows exist (index 0 is default, index 1 is newly added)
      await expect(page.getByTestId('bill-item-description-0')).toBeVisible();
      await expect(page.getByTestId('bill-item-description-1')).toBeVisible();

      // Remove second item (index 1)
      await page.getByTestId('bill-item-remove-1').click();

      // Should only have one row now
      await expect(page.getByTestId('bill-item-description-0')).toBeVisible();
      await expect(page.getByTestId('bill-item-description-1')).not.toBeVisible();

      await takeScreenshot(page, 'bills-form-item-removed');
    });

    test('calculates subtotal, tax, and total automatically', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Add line item
      await page.getByTestId('bill-add-item-button').click();

      // Fill in line item (Qty: 10 × Price: $50 = $500, Tax 10% = $50, Total = $550)
      await page.getByTestId('bill-item-quantity-0').fill('10');
      await page.getByTestId('bill-item-unitPrice-0').fill('50');
      // Changed: taxRate is now a select dropdown, not an input field
      await page.getByTestId('bill-item-taxRate-0').selectOption('10');

      // Trigger calculation (blur event on unit price since selectOption auto-triggers change)
      await page.getByTestId('bill-item-unitPrice-0').blur();

      // Verify totals are calculated
      await expect(page.getByTestId('bill-subtotal')).toContainText('500');
      await expect(page.getByTestId('bill-tax')).toContainText('50');
      await expect(page.getByTestId('bill-total')).toContainText('550');

      await takeScreenshot(page, 'bills-form-calculated-totals');
    });

    test('save bill creates bill with DRAFT status', async ({ page }) => {
      await mockVendorsApi(page);
      await mockCreateBillApi(page, true, {
        id: 'bill-new-001',
        billNumber: 'BILL-2026-006',
        vendor: { id: 'vendor-001', name: 'Acme Corp' },
        billDate: '2026-01-20',
        paymentDate: '2026-02-19',
        status: 'DRAFT',
        subtotal: 1000.0,
        taxAmount: 100.0,
        totalAmount: 1100.0,
        amountPaid: 0,
        amountDue: 1100.0,
        items: [],
      });
      await mockBillsApi(page);

      await page.goto('/bills/new');

      // Select vendor using native select element
      await page.getByTestId('bill-vendor-select').selectOption('vendor-001');

      // Fill due date (required field)
      await page.getByTestId('bill-due-date-input').fill('2026-02-14');

      // Fill in the default line item (form starts with one empty item)
      await page.getByTestId('bill-item-description-0').fill('Draft Item');
      await page.getByTestId('bill-item-quantity-0').fill('1');
      await page.getByTestId('bill-item-unitPrice-0').fill('100');

      // Click save (no separate draft button - new bills are saved as DRAFT by default)
      await page.getByTestId('bill-form-save-button').click();

      // Should redirect to bills list
      await expect(page).toHaveURL(/\/bills/);

      await takeScreenshot(page, 'bills-form-saved-draft');
    });

    test('shows validation errors for empty vendor', async ({ page }) => {
      await mockVendorsApi(page);
      await mockCreateBillApi(page, false);

      await page.goto('/bills/new');

      // Fill required fields except vendor
      await page.getByTestId('bill-due-date-input').fill('2026-02-14');
      await page.getByTestId('bill-item-description-0').fill('Test item');

      // Try to save without selecting vendor
      await page.getByTestId('bill-form-save-button').click();

      // Should show validation error (uses bill-form-error-message)
      await expect(page.getByTestId('bill-form-error-message')).toBeVisible();
      await expect(page.getByTestId('bill-form-error-message')).toContainText('vendor');

      await takeScreenshot(page, 'bills-form-validation-error-vendor');
    });

    test('shows validation errors for empty line items', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Select vendor using native select
      await page.getByTestId('bill-vendor-select').selectOption('vendor-001');

      // Fill required date field
      await page.getByTestId('bill-due-date-input').fill('2026-02-14');

      // Clear the default line item description (form validates that at least one item has a description)
      await page.getByTestId('bill-item-description-0').fill('');

      // Try to save without line items
      await page.getByTestId('bill-form-save-button').click();

      // Should show validation error (uses bill-form-error-message)
      await expect(page.getByTestId('bill-form-error-message')).toBeVisible();
      await expect(page.getByTestId('bill-form-error-message')).toContainText('line item');

      await takeScreenshot(page, 'bills-form-validation-error-items');
    });

    test('cancel button navigates back to bill list', async ({ page }) => {
      await mockBillsApi(page);
      await mockVendorsApi(page);

      await page.goto('/bills/new');
      await takeScreenshot(page, 'bills-new-before-cancel');

      // Click cancel
      await page.getByTestId('bill-form-cancel-button').click();

      // Should return to bill list
      await expect(page).toHaveURL(/\/bills$/);
      await expect(page.getByTestId('bill-list-page')).toBeVisible();

      await takeScreenshot(page, 'bills-after-cancel');
    });

    test('empty state create button opens new bill form', async ({ page }) => {
      // Skip mocking in LXC mode
      if (!isLxcMode()) {
        // Mock token validation to keep user authenticated
        await mockTokenValidationApi(page, true);

        await page.route('**/rest/bill/index.json*', (route: any) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        });
      }
      await mockVendorsApi(page);

      await page.goto('/bills');

      // Wait for empty state
      await expect(page.getByTestId('bill-list-empty')).toBeVisible({ timeout: 5000 });

      // Click create button from empty state
      await page.getByTestId('bill-create-first-button').click();

      // Should navigate to new bill form
      await expect(page).toHaveURL(/\/bills\/new/);
      await expect(page.getByTestId('bill-form-page')).toBeVisible();
    });
  });

  // =============================================================================
  // Bill Form Page Tests - Edit
  // =============================================================================

  test.describe('Edit Bill', () => {
    test('edit form loads with existing bill data', async ({ page }) => {
      await mockBillsApi(page, mockBills);
      await mockBillDetailApi(page, mockBills[0]);
      await mockVendorsApi(page);

      await page.goto('/bills/bill-001/edit');

      // Verify form heading
      await expect(page.getByTestId('bill-form-page')).toBeVisible();
      await expect(page.getByTestId('bill-form-heading')).toHaveText('Edit Bill');

      // Verify existing data is loaded
      await expect(page.getByTestId('bill-vendor-select')).toContainText('Acme Corp');
      await expect(page.getByTestId('bill-date-input')).toHaveValue('2026-01-15');
      await expect(page.getByTestId('bill-due-date-input')).toHaveValue('2026-02-14');

      await takeScreenshot(page, 'bills-edit-form-loaded');
    });

    test('edit form shows existing line items', async ({ page }) => {
      await mockBillsApi(page, mockBills);
      await mockBillDetailApi(page, mockBills[0]);
      await mockVendorsApi(page);

      await page.goto('/bills/bill-001/edit');

      // Verify line items are loaded
      await expect(page.getByTestId('bill-items-table')).toBeVisible();
      await expect(page.getByTestId('bill-item-description-0')).toHaveValue('Office Supplies');
      await expect(page.getByTestId('bill-item-quantity-0')).toHaveValue('10');
      await expect(page.getByTestId('bill-item-unitPrice-0')).toHaveValue('50');

      await takeScreenshot(page, 'bills-edit-form-line-items');
    });

    test('can modify fields and save', async ({ page }) => {
      await mockBillsApi(page, mockBills);
      await mockBillDetailApi(page, mockBills[0]);
      await mockVendorsApi(page);
      await mockUpdateBillApi(page, 'bill-001', true);

      await page.goto('/bills/bill-001/edit');

      // Modify due date
      await page.getByTestId('bill-due-date-input').fill('2026-03-01');

      // Modify notes
      await page.getByTestId('bill-notes-textarea').fill('Updated notes for this bill');

      // Click save
      await page.getByTestId('bill-form-save-button').click();

      // Should redirect or show success
      await expect(page).toHaveURL(/\/bills/);

      await takeScreenshot(page, 'bills-edit-form-saved');
    });

    test('clicking edit from list navigates to edit form', async ({ page }) => {
      await mockBillsApi(page, mockBills);
      await mockBillDetailApi(page, mockBills[0]);
      await mockVendorsApi(page);

      await page.goto('/bills');

      // Wait for table to load
      await expect(page.getByTestId('bill-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Click edit on first bill
      await page.getByTestId('bill-edit-bill-001').click();

      // Should navigate to edit form
      await expect(page).toHaveURL(/\/bills\/bill-001\/edit/);
      await expect(page.getByTestId('bill-form-page')).toBeVisible();
      await expect(page.getByTestId('bill-form-heading')).toHaveText('Edit Bill');

      await takeScreenshot(page, 'bills-edit-from-list');
    });
  });

  // =============================================================================
  // Bill Detail Page Tests
  // =============================================================================

  test.describe('Bill Detail Page', () => {
    test('displays bill header info correctly', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Verify header info
      await expect(page.getByTestId('bill-detail-page')).toBeVisible();
      // Bill number is in the heading
      await expect(page.getByTestId('bill-detail-heading')).toContainText('BILL-2026-001');
      // Vendor and dates are in bill-info-card
      await expect(page.getByTestId('bill-info-card')).toContainText('Acme Corp');
      await expect(page.getByTestId('bill-info-card')).toContainText('2026-01-15');
      await expect(page.getByTestId('bill-info-card')).toContainText('2026-02-14');
      await expect(page.getByTestId('bill-detail-status')).toHaveText('PENDING');

      await takeScreenshot(page, 'bills-detail-header');
    });

    test('displays line items table', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Verify line items table (uses bill-items-table, not bill-detail-items-table)
      await expect(page.getByTestId('bill-items-table')).toBeVisible();
      // Items don't have individual test-ids, check content within the table
      await expect(page.getByTestId('bill-items-table')).toContainText('Office Supplies');

      await takeScreenshot(page, 'bills-detail-items');
    });

    test('displays payment history', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[2]); // bill-003 has payments
      await mockBillPaymentsApi(page, 'bill-003', mockBillPayments);

      await page.goto('/bills/bill-003');

      // Verify payment history section (uses bill-payments-card)
      await expect(page.getByTestId('bill-payments-card')).toBeVisible();
      // Payments don't have individual row test-ids, check content within the table
      await expect(page.getByTestId('bill-payments-table')).toBeVisible();
      await expect(page.getByTestId('bill-payments-table')).toContainText('500');

      await takeScreenshot(page, 'bills-detail-payments');
    });

    test('shows record payment button', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Verify record payment button is visible for unpaid bill (uses record-payment-button)
      await expect(page.getByTestId('record-payment-button')).toBeVisible();

      await takeScreenshot(page, 'bills-detail-record-payment-button');
    });

    test('shows edit button', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);
      await mockVendorsApi(page);

      await page.goto('/bills/bill-001');

      // Verify edit button (uses bill-edit-button)
      await expect(page.getByTestId('bill-edit-button')).toBeVisible();

      // Click edit button
      await page.getByTestId('bill-edit-button').click();

      // Should navigate to edit form
      await expect(page).toHaveURL(/\/bills\/bill-001\/edit/);
    });

    test('can delete bill with browser confirmation', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[3]); // Draft bill
      await mockBillPaymentsApi(page, 'bill-004', []);
      await mockDeleteBillApi(page, 'bill-004', true);
      await mockBillsApi(page);

      await page.goto('/bills/bill-004');

      // Set up dialog handler to accept confirmation (component uses window.confirm)
      page.on('dialog', (dialog) => dialog.accept());

      // Click delete button (uses bill-delete-button)
      await page.getByTestId('bill-delete-button').click();

      // Should redirect to bills list after confirmation
      await expect(page).toHaveURL(/\/bills$/);

      await takeScreenshot(page, 'bills-after-delete');
    });

    test('displays amount due correctly', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Verify amounts are displayed in the bill-amount-card
      const amountCard = page.getByTestId('bill-amount-card');
      await expect(amountCard).toContainText('900');  // subtotal
      await expect(amountCard).toContainText('90');   // tax
      await expect(amountCard).toContainText('990');  // total
      // Amount paid shows $0.00 (formatted)
      await expect(amountCard).toContainText('0');

      await takeScreenshot(page, 'bills-detail-amounts');
    });
  });

  // =============================================================================
  // Bill Payments Tests
  // =============================================================================

  test.describe('Bill Payments', () => {
    test('record payment button navigates to payment form', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Click record payment button (navigates to /payments/new?billId=bill-001)
      await page.getByTestId('record-payment-button').click();

      // Should navigate to payment form with bill ID in query
      await expect(page).toHaveURL(/\/payments\/new\?billId=bill-001/);

      await takeScreenshot(page, 'bills-payment-navigate');
    });

    test('payment history displays recorded payments', async ({ page }) => {
      const billWithPayment = { ...mockBills[0], amountPaid: 500, amountDue: 490, status: 'PARTIAL' };
      await mockBillDetailApi(page, billWithPayment);

      // Mock updated payment history
      if (!isLxcMode()) {
        await mockTokenValidationApi(page, true);
        await page.route(`**/rest/billPayment/index.json*`, (route: any) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'payment-new-001',
                bill: { id: 'bill-001' },
                amount: 500.0,
                paymentDate: '2026-01-20',
                paymentMethod: 'BANK_TRANSFER',
                reference: 'TRF-001',
              },
            ]),
          });
        });
      }

      await page.goto('/bills/bill-001');

      // Verify payment appears in history (uses bill-payments-card and bill-payments-table)
      await expect(page.getByTestId('bill-payments-card')).toBeVisible();
      await expect(page.getByTestId('bill-payments-table')).toBeVisible();
      await expect(page.getByTestId('bill-payments-table')).toContainText('500');

      await takeScreenshot(page, 'bills-payment-history-updated');
    });

    test('shows empty payments state when no payments', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Should show empty payments state (uses bill-payments-empty)
      await expect(page.getByTestId('bill-payments-empty')).toBeVisible();
      await expect(page.getByTestId('bill-payments-empty')).toContainText('No payments recorded');

      await takeScreenshot(page, 'bills-payment-empty');
    });

    test('record payment button hidden for fully paid bills', async ({ page }) => {
      // bill-002 is PAID with amountDue = 0
      await mockBillDetailApi(page, mockBills[1]);
      await mockBillPaymentsApi(page, 'bill-002', []);

      await page.goto('/bills/bill-002');

      // Record payment button should not be visible when bill is fully paid
      await expect(page.getByTestId('record-payment-button')).not.toBeVisible();

      await takeScreenshot(page, 'bills-paid-no-payment-button');
    });
  });

  // =============================================================================
  // Bill API Error Handling Tests
  // =============================================================================

  test.describe('Bill API Error Handling', () => {
    test('handles API error gracefully on list page', async ({ page }) => {
      // Skip in LXC mode - error states are hard to reproduce with real backend
      if (isLxcMode()) {
        test.skip();
        return;
      }

      // Mock token validation to keep user authenticated
      await mockTokenValidationApi(page, true);

      // Mock API error
      await page.route('**/rest/bill/index.json*', (route: any) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await page.goto('/bills');

      // Page should still render with error state
      await expect(page.getByTestId('bill-list-page')).toBeVisible();
      await expect(page.getByTestId('bill-list-error')).toBeVisible();

      await takeScreenshot(page, 'bills-api-error');
    });

    test('handles network timeout gracefully', async ({ page }) => {
      // Skip in LXC mode
      if (isLxcMode()) {
        test.skip();
        return;
      }

      // Mock token validation to keep user authenticated
      await mockTokenValidationApi(page, true);

      // Mock slow API that will timeout
      await page.route('**/rest/bill/index.json*', async (route: any) => {
        await new Promise((resolve) => setTimeout(resolve, 35000));
        route.abort();
      });

      await page.goto('/bills');

      // Page should render with loading state initially
      await expect(page.getByTestId('bill-list-page')).toBeVisible();
    });

    test('handles 404 for non-existent bill', async ({ page }) => {
      // Skip in LXC mode
      if (isLxcMode()) {
        test.skip();
        return;
      }

      // Mock token validation to keep user authenticated
      await mockTokenValidationApi(page, true);

      // Mock 404 response for non-existent bill
      await page.route('**/rest/bill/show/non-existent.json*', (route: any) => {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Bill not found' }),
        });
      });

      // Also mock bill payments endpoint (it will be called by the detail page)
      await page.route('**/rest/billPayment/index.json*', (route: any) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/bills/non-existent');

      // Should show error message (uses bill-detail-error, not bill-not-found)
      await expect(page.getByTestId('bill-detail-error')).toBeVisible();

      await takeScreenshot(page, 'bills-not-found');
    });
  });

  // =============================================================================
  // Bill Page Responsiveness Tests
  // =============================================================================

  test.describe('Bill Page Responsiveness', () => {
    test('bill list is usable on mobile', async ({ page }) => {
      await mockBillsApi(page);

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/bills');
      await takeScreenshot(page, 'bills-mobile-viewport');

      // Page should still be functional
      await expect(page.getByTestId('bill-list-page')).toBeVisible();
      await expect(page.getByTestId('bill-new-button')).toBeVisible();
    });

    test('bill table scrolls horizontally on small screens', async ({ page }) => {
      await mockBillsApi(page, mockBills);

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/bills');

      // Wait for table
      await expect(page.getByTestId('bill-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Table container should be present (may use bill-list-table for container)
      await expect(page.getByTestId('bill-list-table')).toBeVisible();

      await takeScreenshot(page, 'bills-mobile-table');
    });

    test('bill form is usable on mobile', async ({ page }) => {
      await mockVendorsApi(page);

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/bills/new');
      await takeScreenshot(page, 'bills-mobile-form');

      // Form should be functional
      await expect(page.getByTestId('bill-form-page')).toBeVisible();
      await expect(page.getByTestId('bill-vendor-select')).toBeVisible();
    });

    test('bill detail page is usable on mobile', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/bills/bill-001');
      await takeScreenshot(page, 'bills-mobile-detail');

      // Page should be functional (uses record-payment-button, not bill-record-payment-button)
      await expect(page.getByTestId('bill-detail-page')).toBeVisible();
      await expect(page.getByTestId('record-payment-button')).toBeVisible();
    });
  });

  // =============================================================================
  // Navigation Tests
  // =============================================================================

  test.describe('Navigation from Bills', () => {
    test('can navigate to dashboard from bills', async ({ page }) => {
      await mockBillsApi(page);
      await mockDashboardApi(page);

      await page.goto('/bills');
      await expect(page.getByTestId('bill-list-page')).toBeVisible();

      // Navigate to dashboard
      await page.goto('/dashboard');

      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('protected route requires authentication', async ({ page }) => {
      // Skip in LXC mode - authentication is handled differently
      if (isLxcMode()) {
        test.skip();
        return;
      }

      // Clear auth state
      await page.addInitScript(() => {
        localStorage.clear();
      });

      await page.goto('/bills');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test('back link from detail returns to list', async ({ page }) => {
      await mockBillsApi(page, mockBills);
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Click back link (it's a regular link with text "Back", not a test-id button)
      await page.getByRole('link', { name: 'Back' }).click();

      // Should return to list
      await expect(page).toHaveURL(/\/bills$/);
      await expect(page.getByTestId('bill-list-page')).toBeVisible();
    });
  });
});
