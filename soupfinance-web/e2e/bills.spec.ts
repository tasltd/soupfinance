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
import { takeScreenshot } from './fixtures';

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
    issueDate: '2026-01-15',
    dueDate: '2026-02-14',
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
    issueDate: '2026-01-10',
    dueDate: '2026-02-10',
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
    issueDate: '2025-12-01',
    dueDate: '2025-12-31',
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
    issueDate: '2026-01-18',
    dueDate: '2026-02-17',
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
    issueDate: '2026-01-05',
    dueDate: '2026-02-05',
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
  await page.route(`**/rest/bill/show/${bill.id}.json*`, (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bill),
    });
  });
}

async function mockVendorsApi(page: any, vendors = mockVendors) {
  await page.route('**/rest/vendor/index.json*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(vendors),
    });
  });
}

async function mockBillPaymentsApi(page: any, billId: string, payments: typeof mockBillPayments = []) {
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
            issueDate: '2026-01-20',
            dueDate: '2026-02-19',
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

async function mockRecordPaymentApi(page: any, success = true) {
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
      // Set up delayed API response
      await page.route('**/rest/bill/index.json*', async (route: any) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockBills),
        });
      });

      await page.goto('/bills');

      // Should show loading state
      await expect(page.getByTestId('bill-list-loading')).toBeVisible();
      await takeScreenshot(page, 'bills-list-loading');

      // Wait for table to appear
      await expect(page.getByTestId('bill-list-table')).toBeVisible({ timeout: 5000 });
    });

    test('shows empty state when no bills exist', async ({ page }) => {
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

      // Check vendor names are displayed
      await expect(page.getByTestId('bill-vendor-bill-001')).toHaveText('Acme Corp');
      await expect(page.getByTestId('bill-vendor-bill-002')).toHaveText('Tech Supplies Inc');
      await expect(page.getByTestId('bill-vendor-bill-003')).toHaveText('Office Solutions');
    });

    test('bills table shows amounts correctly', async ({ page }) => {
      await mockBillsApi(page, mockBills);

      await page.goto('/bills');

      // Wait for table
      await expect(page.getByTestId('bill-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Check amounts are formatted correctly
      await expect(page.locator('text=$990.00')).toBeVisible();
      await expect(page.locator('text=$2,200.00').or(page.locator('text=$2200.00'))).toBeVisible();
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
      await expect(page.getByTestId('bill-form-vendor-select')).toBeVisible();
      await expect(page.getByTestId('bill-form-issue-date')).toBeVisible();
      await expect(page.getByTestId('bill-form-due-date')).toBeVisible();

      await takeScreenshot(page, 'bills-form-empty');
    });

    test('vendor selection dropdown populates with vendors', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Click vendor dropdown
      await page.getByTestId('bill-form-vendor-select').click();

      // Verify vendor options are visible
      await expect(page.getByTestId('vendor-option-vendor-001')).toBeVisible();
      await expect(page.getByTestId('vendor-option-vendor-002')).toBeVisible();
      await expect(page.getByTestId('vendor-option-vendor-003')).toBeVisible();

      await takeScreenshot(page, 'bills-form-vendor-dropdown');
    });

    test('can add line items to bill', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Click add line item button
      await page.getByTestId('bill-form-add-item-button').click();

      // Verify line item row appears
      await expect(page.getByTestId('bill-item-row-0')).toBeVisible();

      // Fill in line item details
      await page.getByTestId('bill-item-description-0').fill('Test Service');
      await page.getByTestId('bill-item-quantity-0').fill('5');
      await page.getByTestId('bill-item-unit-price-0').fill('100');
      await page.getByTestId('bill-item-tax-rate-0').fill('10');

      await takeScreenshot(page, 'bills-form-with-line-item');
    });

    test('can remove line items from bill', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Add two line items
      await page.getByTestId('bill-form-add-item-button').click();
      await page.getByTestId('bill-form-add-item-button').click();

      // Verify both rows exist
      await expect(page.getByTestId('bill-item-row-0')).toBeVisible();
      await expect(page.getByTestId('bill-item-row-1')).toBeVisible();

      // Remove first item
      await page.getByTestId('bill-item-remove-0').click();

      // Should only have one row now
      await expect(page.getByTestId('bill-item-row-0')).toBeVisible();
      await expect(page.getByTestId('bill-item-row-1')).not.toBeVisible();

      await takeScreenshot(page, 'bills-form-item-removed');
    });

    test('calculates subtotal, tax, and total automatically', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Add line item
      await page.getByTestId('bill-form-add-item-button').click();

      // Fill in line item (Qty: 10 × Price: $50 = $500, Tax 10% = $50, Total = $550)
      await page.getByTestId('bill-item-quantity-0').fill('10');
      await page.getByTestId('bill-item-unit-price-0').fill('50');
      await page.getByTestId('bill-item-tax-rate-0').fill('10');

      // Trigger calculation (blur event)
      await page.getByTestId('bill-item-tax-rate-0').blur();

      // Verify totals are calculated
      await expect(page.getByTestId('bill-form-subtotal')).toContainText('500');
      await expect(page.getByTestId('bill-form-tax-total')).toContainText('50');
      await expect(page.getByTestId('bill-form-grand-total')).toContainText('550');

      await takeScreenshot(page, 'bills-form-calculated-totals');
    });

    test('save as draft creates bill with DRAFT status', async ({ page }) => {
      await mockVendorsApi(page);
      await mockCreateBillApi(page, true, {
        ...mockBills[0],
        id: 'bill-draft-001',
        status: 'DRAFT',
      });
      await mockBillsApi(page);

      await page.goto('/bills/new');

      // Select vendor
      await page.getByTestId('bill-form-vendor-select').click();
      await page.getByTestId('vendor-option-vendor-001').click();

      // Add line item
      await page.getByTestId('bill-form-add-item-button').click();
      await page.getByTestId('bill-item-description-0').fill('Draft Item');
      await page.getByTestId('bill-item-quantity-0').fill('1');
      await page.getByTestId('bill-item-unit-price-0').fill('100');

      // Click save draft
      await page.getByTestId('bill-form-save-draft-button').click();

      // Should redirect to bills list or show success
      await expect(page).toHaveURL(/\/bills/);

      await takeScreenshot(page, 'bills-form-saved-draft');
    });

    test('shows validation errors for empty vendor', async ({ page }) => {
      await mockVendorsApi(page);
      await mockCreateBillApi(page, false);

      await page.goto('/bills/new');

      // Try to save without selecting vendor
      await page.getByTestId('bill-form-save-button').click();

      // Should show validation error
      await expect(page.getByTestId('bill-form-vendor-error')).toBeVisible();
      await expect(page.getByTestId('bill-form-vendor-error')).toContainText('Vendor is required');

      await takeScreenshot(page, 'bills-form-validation-error-vendor');
    });

    test('shows validation errors for empty line items', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/bills/new');

      // Select vendor
      await page.getByTestId('bill-form-vendor-select').click();
      await page.getByTestId('vendor-option-vendor-001').click();

      // Try to save without line items
      await page.getByTestId('bill-form-save-button').click();

      // Should show validation error
      await expect(page.getByTestId('bill-form-items-error')).toBeVisible();
      await expect(page.getByTestId('bill-form-items-error')).toContainText('At least one line item is required');

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
      await page.route('**/rest/bill/index.json*', (route: any) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });
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
      await expect(page.getByTestId('bill-form-vendor-select')).toContainText('Acme Corp');
      await expect(page.getByTestId('bill-form-issue-date')).toHaveValue('2026-01-15');
      await expect(page.getByTestId('bill-form-due-date')).toHaveValue('2026-02-14');

      await takeScreenshot(page, 'bills-edit-form-loaded');
    });

    test('edit form shows existing line items', async ({ page }) => {
      await mockBillsApi(page, mockBills);
      await mockBillDetailApi(page, mockBills[0]);
      await mockVendorsApi(page);

      await page.goto('/bills/bill-001/edit');

      // Verify line items are loaded
      await expect(page.getByTestId('bill-item-row-0')).toBeVisible();
      await expect(page.getByTestId('bill-item-description-0')).toHaveValue('Office Supplies');
      await expect(page.getByTestId('bill-item-quantity-0')).toHaveValue('10');
      await expect(page.getByTestId('bill-item-unit-price-0')).toHaveValue('50');

      await takeScreenshot(page, 'bills-edit-form-line-items');
    });

    test('can modify fields and save', async ({ page }) => {
      await mockBillsApi(page, mockBills);
      await mockBillDetailApi(page, mockBills[0]);
      await mockVendorsApi(page);
      await mockUpdateBillApi(page, 'bill-001', true);

      await page.goto('/bills/bill-001/edit');

      // Modify due date
      await page.getByTestId('bill-form-due-date').fill('2026-03-01');

      // Modify notes
      await page.getByTestId('bill-form-notes').fill('Updated notes for this bill');

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
      await expect(page.getByTestId('bill-detail-number')).toHaveText('BILL-2026-001');
      await expect(page.getByTestId('bill-detail-vendor')).toContainText('Acme Corp');
      await expect(page.getByTestId('bill-detail-issue-date')).toContainText('2026-01-15');
      await expect(page.getByTestId('bill-detail-due-date')).toContainText('2026-02-14');
      await expect(page.getByTestId('bill-detail-status')).toHaveText('PENDING');

      await takeScreenshot(page, 'bills-detail-header');
    });

    test('displays line items table', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Verify line items table
      await expect(page.getByTestId('bill-detail-items-table')).toBeVisible();
      await expect(page.getByTestId('bill-detail-item-0')).toBeVisible();
      await expect(page.getByTestId('bill-detail-item-0')).toContainText('Office Supplies');

      await takeScreenshot(page, 'bills-detail-items');
    });

    test('displays payment history', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[2]); // bill-003 has payments
      await mockBillPaymentsApi(page, 'bill-003', mockBillPayments);

      await page.goto('/bills/bill-003');

      // Verify payment history section
      await expect(page.getByTestId('bill-detail-payments-section')).toBeVisible();
      await expect(page.getByTestId('bill-payment-row-payment-001')).toBeVisible();
      await expect(page.getByTestId('bill-payment-amount-payment-001')).toContainText('500');

      await takeScreenshot(page, 'bills-detail-payments');
    });

    test('shows record payment button', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Verify record payment button is visible for unpaid bill
      await expect(page.getByTestId('bill-record-payment-button')).toBeVisible();

      await takeScreenshot(page, 'bills-detail-record-payment-button');
    });

    test('shows edit button', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);
      await mockVendorsApi(page);

      await page.goto('/bills/bill-001');

      // Verify edit button
      await expect(page.getByTestId('bill-detail-edit-button')).toBeVisible();

      // Click edit button
      await page.getByTestId('bill-detail-edit-button').click();

      // Should navigate to edit form
      await expect(page).toHaveURL(/\/bills\/bill-001\/edit/);
    });

    test('shows delete confirmation dialog', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[3]); // Draft bill
      await mockBillPaymentsApi(page, 'bill-004', []);

      await page.goto('/bills/bill-004');

      // Click delete button
      await page.getByTestId('bill-detail-delete-button').click();

      // Should show confirmation dialog
      await expect(page.getByTestId('bill-delete-confirm-dialog')).toBeVisible();
      await expect(page.getByTestId('bill-delete-confirm-message')).toContainText('Are you sure');

      await takeScreenshot(page, 'bills-detail-delete-confirm');
    });

    test('can delete bill after confirmation', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[3]); // Draft bill
      await mockBillPaymentsApi(page, 'bill-004', []);
      await mockDeleteBillApi(page, 'bill-004', true);
      await mockBillsApi(page);

      await page.goto('/bills/bill-004');

      // Click delete button
      await page.getByTestId('bill-detail-delete-button').click();

      // Confirm deletion
      await page.getByTestId('bill-delete-confirm-button').click();

      // Should redirect to bills list
      await expect(page).toHaveURL(/\/bills$/);

      await takeScreenshot(page, 'bills-after-delete');
    });

    test('displays amount due correctly', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Verify amounts
      await expect(page.getByTestId('bill-detail-subtotal')).toContainText('900');
      await expect(page.getByTestId('bill-detail-tax')).toContainText('90');
      await expect(page.getByTestId('bill-detail-total')).toContainText('990');
      await expect(page.getByTestId('bill-detail-amount-paid')).toContainText('0');
      await expect(page.getByTestId('bill-detail-amount-due')).toContainText('990');

      await takeScreenshot(page, 'bills-detail-amounts');
    });
  });

  // =============================================================================
  // Bill Payments Tests
  // =============================================================================

  test.describe('Bill Payments', () => {
    test('record payment modal opens', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Click record payment button
      await page.getByTestId('bill-record-payment-button').click();

      // Modal should open
      await expect(page.getByTestId('bill-payment-modal')).toBeVisible();
      await expect(page.getByTestId('bill-payment-amount-input')).toBeVisible();
      await expect(page.getByTestId('bill-payment-date-input')).toBeVisible();
      await expect(page.getByTestId('bill-payment-method-select')).toBeVisible();

      await takeScreenshot(page, 'bills-payment-modal-open');
    });

    test('can record partial payment', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);
      await mockRecordPaymentApi(page, true);

      await page.goto('/bills/bill-001');

      // Open payment modal
      await page.getByTestId('bill-record-payment-button').click();

      // Fill payment form
      await page.getByTestId('bill-payment-amount-input').fill('500');
      await page.getByTestId('bill-payment-date-input').fill('2026-01-20');
      await page.getByTestId('bill-payment-method-select').selectOption('BANK_TRANSFER');
      await page.getByTestId('bill-payment-reference-input').fill('TRF-001');

      await takeScreenshot(page, 'bills-payment-form-filled');

      // Submit payment
      await page.getByTestId('bill-payment-submit-button').click();

      // Modal should close or show success
      await expect(page.getByTestId('bill-payment-modal')).not.toBeVisible({ timeout: 5000 });

      await takeScreenshot(page, 'bills-payment-recorded');
    });

    test('can record full payment', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);
      await mockRecordPaymentApi(page, true);

      await page.goto('/bills/bill-001');

      // Open payment modal
      await page.getByTestId('bill-record-payment-button').click();

      // Fill payment form with full amount
      await page.getByTestId('bill-payment-amount-input').fill('990');
      await page.getByTestId('bill-payment-date-input').fill('2026-01-20');
      await page.getByTestId('bill-payment-method-select').selectOption('CHEQUE');
      await page.getByTestId('bill-payment-reference-input').fill('CHQ-001');

      // Submit payment
      await page.getByTestId('bill-payment-submit-button').click();

      // Modal should close
      await expect(page.getByTestId('bill-payment-modal')).not.toBeVisible({ timeout: 5000 });

      await takeScreenshot(page, 'bills-full-payment-recorded');
    });

    test('payment history updates after recording payment', async ({ page }) => {
      const billWithPayment = { ...mockBills[0], amountPaid: 500, amountDue: 490, status: 'PARTIAL' };
      await mockBillDetailApi(page, billWithPayment);

      // Mock updated payment history
      await page.route(`**/rest/billPayment/index.json*bill.id=bill-001*`, (route: any) => {
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

      await page.goto('/bills/bill-001');

      // Verify payment appears in history
      await expect(page.getByTestId('bill-detail-payments-section')).toBeVisible();
      await expect(page.getByTestId('bill-payment-row-payment-new-001')).toBeVisible();

      await takeScreenshot(page, 'bills-payment-history-updated');
    });

    test('shows error for payment exceeding balance', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);
      await mockRecordPaymentApi(page, false);

      await page.goto('/bills/bill-001');

      // Open payment modal
      await page.getByTestId('bill-record-payment-button').click();

      // Fill payment form with amount exceeding balance
      await page.getByTestId('bill-payment-amount-input').fill('5000');
      await page.getByTestId('bill-payment-date-input').fill('2026-01-20');

      // Submit payment
      await page.getByTestId('bill-payment-submit-button').click();

      // Should show error
      await expect(page.getByTestId('bill-payment-error')).toBeVisible();
      await expect(page.getByTestId('bill-payment-error')).toContainText('exceeds');

      await takeScreenshot(page, 'bills-payment-error');
    });

    test('cancel payment modal closes without saving', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Open payment modal
      await page.getByTestId('bill-record-payment-button').click();
      await expect(page.getByTestId('bill-payment-modal')).toBeVisible();

      // Fill some data
      await page.getByTestId('bill-payment-amount-input').fill('500');

      // Click cancel
      await page.getByTestId('bill-payment-cancel-button').click();

      // Modal should close
      await expect(page.getByTestId('bill-payment-modal')).not.toBeVisible();

      await takeScreenshot(page, 'bills-payment-modal-cancelled');
    });
  });

  // =============================================================================
  // Bill API Error Handling Tests
  // =============================================================================

  test.describe('Bill API Error Handling', () => {
    test('handles API error gracefully on list page', async ({ page }) => {
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
      await page.route('**/rest/bill/show/non-existent.json*', (route: any) => {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Bill not found' }),
        });
      });

      await page.goto('/bills/non-existent');

      // Should show not found message
      await expect(page.getByTestId('bill-not-found')).toBeVisible();

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

      // Table container should be present and scrollable
      await expect(page.getByTestId('bill-table-container')).toBeVisible();

      await takeScreenshot(page, 'bills-mobile-table');
    });

    test('bill form is usable on mobile', async ({ page }) => {
      await mockVendorsApi(page);

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/bills/new');
      await takeScreenshot(page, 'bills-mobile-form');

      // Form should be functional
      await expect(page.getByTestId('bill-form-page')).toBeVisible();
      await expect(page.getByTestId('bill-form-vendor-select')).toBeVisible();
    });

    test('bill detail page is usable on mobile', async ({ page }) => {
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/bills/bill-001');
      await takeScreenshot(page, 'bills-mobile-detail');

      // Page should be functional
      await expect(page.getByTestId('bill-detail-page')).toBeVisible();
      await expect(page.getByTestId('bill-record-payment-button')).toBeVisible();
    });
  });

  // =============================================================================
  // Navigation Tests
  // =============================================================================

  test.describe('Navigation from Bills', () => {
    test('can navigate to dashboard from bills', async ({ page }) => {
      await mockBillsApi(page);

      await page.goto('/bills');
      await expect(page.getByTestId('bill-list-page')).toBeVisible();

      // Navigate to dashboard
      await page.goto('/dashboard');

      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('protected route requires authentication', async ({ page }) => {
      // Clear auth state
      await page.addInitScript(() => {
        localStorage.clear();
      });

      await page.goto('/bills');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test('back button from detail returns to list', async ({ page }) => {
      await mockBillsApi(page, mockBills);
      await mockBillDetailApi(page, mockBills[0]);
      await mockBillPaymentsApi(page, 'bill-001', []);

      await page.goto('/bills/bill-001');

      // Click back button
      await page.getByTestId('bill-detail-back-button').click();

      // Should return to list
      await expect(page).toHaveURL(/\/bills$/);
      await expect(page.getByTestId('bill-list-page')).toBeVisible();
    });
  });
});
