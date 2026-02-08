/**
 * Invoice CRUD E2E Tests
 * Tests invoice listing, creation, editing, and viewing flows
 *
 * Fixed: Added mockTokenValidationApi to mock /rest/user/current.json
 * This is required because the app validates the auth token on page load
 */
import { test, expect } from '@playwright/test';
import { mockInvoicesApi, mockInvoices, mockDashboardApi, takeScreenshot, mockTokenValidationApi } from './fixtures';

// Helper to set up authenticated state
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
  // Mock token validation API - required for authenticated pages
  await mockTokenValidationApi(page, true);
}

// Added: Mock additional APIs needed by the invoice form page
// InvoiceFormPage calls listClients, listInvoiceServices, and getInvoice (edit mode)
async function mockInvoiceFormDeps(page: any) {
  // Mock client list for dropdown
  await page.route('**/rest/client/index.json*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'client-1', name: 'Acme Corp', accountServices: { id: 'as-001' } },
      ]),
    });
  });

  // Mock service descriptions for autocomplete
  await page.route('**/rest/serviceDescription/index.json*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Mock invoice items for edit mode
  await page.route('**/rest/invoiceItem/index.json*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test.describe('Invoice Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test.describe('Invoice List Page', () => {
    test('invoice list page loads correctly', async ({ page }) => {
      await mockInvoicesApi(page);

      await page.goto('/invoices');
      await takeScreenshot(page, 'invoices-list-initial');

      // Verify page elements
      await expect(page.getByTestId('invoice-list-page')).toBeVisible();
      await expect(page.getByTestId('invoice-list-heading')).toHaveText('Invoices');
      await expect(page.getByTestId('invoice-new-button')).toBeVisible();
    });

    test('displays invoice data in table', async ({ page }) => {
      await mockInvoicesApi(page, mockInvoices);

      await page.goto('/invoices');

      // Wait for loading to complete
      await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Verify table is visible
      await expect(page.getByTestId('invoice-list-table')).toBeVisible();

      // Verify invoice rows
      await expect(page.getByTestId('invoice-row-inv-001')).toBeVisible();
      await expect(page.getByTestId('invoice-row-inv-002')).toBeVisible();
      await expect(page.getByTestId('invoice-row-inv-003')).toBeVisible();

      await takeScreenshot(page, 'invoices-list-with-data');
    });

    test('shows loading state while fetching invoices', async ({ page }) => {
      // Must mock token validation FIRST before setting up delayed invoice route
      await mockTokenValidationApi(page, true);

      // Set up delayed API response for invoice list only - use longer delay to ensure we catch loading state
      await page.route('**/rest/invoice/index.json*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockInvoices),
        });
      });

      // Start navigation but don't wait for full load
      await page.goto('/invoices', { waitUntil: 'commit' });

      // Should show loading state - use short timeout since it should be visible immediately
      await expect(page.getByTestId('invoice-list-loading')).toBeVisible({ timeout: 3000 });
      await takeScreenshot(page, 'invoices-list-loading');

      // Wait for table to appear after delay resolves
      await expect(page.getByTestId('invoice-list-table')).toBeVisible({ timeout: 5000 });
    });

    test('shows empty state when no invoices exist', async ({ page }) => {
      // Mock invoice list endpoint specifically
      await page.route('**/rest/invoice/index.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/invoices');

      // Wait for loading to complete
      await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Should show empty state
      await expect(page.getByTestId('invoice-list-empty')).toBeVisible();
      await expect(page.getByTestId('invoice-list-empty')).toContainText('No invoices yet');
      await expect(page.getByTestId('invoice-create-first-button')).toBeVisible();

      await takeScreenshot(page, 'invoices-empty-state');
    });

    test('displays correct invoice status badges', async ({ page }) => {
      await mockInvoicesApi(page, mockInvoices);

      await page.goto('/invoices');

      // Wait for table to load
      await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Check status badges
      await expect(page.getByTestId('invoice-status-inv-001')).toHaveText('SENT');
      await expect(page.getByTestId('invoice-status-inv-002')).toHaveText('PAID');
      await expect(page.getByTestId('invoice-status-inv-003')).toHaveText('OVERDUE');

      await takeScreenshot(page, 'invoices-status-badges');
    });
  });

  test.describe('Create New Invoice', () => {
    test('clicking New Invoice navigates to form', async ({ page }) => {
      await mockInvoicesApi(page);

      await page.goto('/invoices');
      await takeScreenshot(page, 'invoices-before-new');

      // Click New Invoice button
      await page.getByTestId('invoice-new-button').click();

      // Should navigate to new invoice form
      await expect(page).toHaveURL(/\/invoices\/new/);
      await expect(page.getByTestId('invoice-form-page')).toBeVisible();
      await expect(page.getByTestId('invoice-form-heading')).toHaveText('New Invoice');

      await takeScreenshot(page, 'invoices-new-form');
    });

    test('new invoice form has correct buttons', async ({ page }) => {
      // Added: Mock form dependencies so page doesn't hang on unmocked API calls
      await mockInvoiceFormDeps(page);

      await page.goto('/invoices/new');

      // Verify form buttons
      await expect(page.getByTestId('invoice-form-cancel-button')).toBeVisible();
      await expect(page.getByTestId('invoice-form-save-draft-button')).toBeVisible();
      await expect(page.getByTestId('invoice-form-save-send-button')).toBeVisible();

      await takeScreenshot(page, 'invoices-new-form-buttons');
    });

    test('cancel button returns to invoice list', async ({ page }) => {
      await mockInvoicesApi(page);
      // Added: Mock form dependencies so page doesn't hang on unmocked API calls
      await mockInvoiceFormDeps(page);

      await page.goto('/invoices/new');
      await takeScreenshot(page, 'invoices-new-before-cancel');

      // Click cancel
      await page.getByTestId('invoice-form-cancel-button').click();

      // Should return to invoice list
      await expect(page).toHaveURL(/\/invoices$/);
      await expect(page.getByTestId('invoice-list-page')).toBeVisible();

      await takeScreenshot(page, 'invoices-after-cancel');
    });

    test('empty state create button opens new invoice form', async ({ page }) => {
      // Mock empty invoice list
      await page.route('**/rest/invoice/index.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // Mock clients list for the form
      await page.route('**/rest/invoiceClient/index.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'client-1', name: 'Test Client' }]),
        });
      });

      await page.goto('/invoices');

      // Wait for empty state
      await expect(page.getByTestId('invoice-list-empty')).toBeVisible({ timeout: 5000 });

      // Click create button from empty state
      await page.getByTestId('invoice-create-first-button').click();

      // Should navigate to new invoice form
      await expect(page).toHaveURL(/\/invoices\/new/);
      await expect(page.getByTestId('invoice-form-page')).toBeVisible();
    });
  });

  test.describe('Edit Invoice', () => {
    test('clicking edit navigates to edit form', async ({ page }) => {
      await mockInvoicesApi(page, mockInvoices);
      // Added: Mock form dependencies for edit page
      await mockInvoiceFormDeps(page);

      await page.goto('/invoices');

      // Wait for table to load
      await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Click edit on first invoice
      await page.getByTestId('invoice-edit-inv-001').click();

      // Should navigate to edit form
      await expect(page).toHaveURL(/\/invoices\/inv-001\/edit/);
      await expect(page.getByTestId('invoice-form-page')).toBeVisible();
      await expect(page.getByTestId('invoice-form-heading')).toHaveText('Edit Invoice');

      await takeScreenshot(page, 'invoices-edit-form');
    });

    test('edit form shows correct heading', async ({ page }) => {
      // Mock single invoice for edit page
      await page.route('**/rest/invoice/show/inv-001*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockInvoices[0]),
        });
      });

      // Added: Mock form dependencies (clients, service descriptions, invoice items)
      await mockInvoiceFormDeps(page);

      await page.goto('/invoices/inv-001/edit');

      await expect(page.getByTestId('invoice-form-heading')).toHaveText('Edit Invoice');
    });
  });

  test.describe('Invoice Detail Page', () => {
    test('clicking invoice link navigates to detail page', async ({ page }) => {
      await mockInvoicesApi(page, mockInvoices);

      // Mock single invoice detail endpoint
      await page.route('**/rest/invoice/inv-001*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockInvoices[0]),
        });
      });

      await page.goto('/invoices');

      // Wait for table to load
      await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Click invoice link
      await page.getByTestId('invoice-link-inv-001').click();

      // Should navigate to detail page
      await expect(page).toHaveURL(/\/invoices\/inv-001$/);

      await takeScreenshot(page, 'invoices-detail-page');
    });
  });

  test.describe('Invoice Table Interactions', () => {
    test('invoice rows are clickable', async ({ page }) => {
      await mockInvoicesApi(page, mockInvoices);

      await page.goto('/invoices');

      // Wait for table
      await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Changed: Invoice number is now Grails `number` field (int), displayed as string
      const invoiceLink = page.getByTestId('invoice-link-inv-001');
      await expect(invoiceLink).toBeVisible();
      await expect(invoiceLink).toHaveText('1');
    });

    test('invoice amounts are properly formatted', async ({ page }) => {
      await mockInvoicesApi(page, mockInvoices);

      await page.goto('/invoices');

      // Wait for table
      await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Check amount formatting (should have $ and 2 decimal places with thousands separator)
      await expect(page.locator('text=$2,500.00')).toBeVisible();
      await expect(page.locator('text=$4,750.50')).toBeVisible();
      await expect(page.locator('text=$1,200.00')).toBeVisible();
    });
  });

  test.describe('Invoice Page Responsiveness', () => {
    test('invoice list is usable on mobile', async ({ page }) => {
      await mockInvoicesApi(page);

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/invoices');
      await takeScreenshot(page, 'invoices-mobile-viewport');

      // Page should still be functional
      await expect(page.getByTestId('invoice-list-page')).toBeVisible();
      await expect(page.getByTestId('invoice-new-button')).toBeVisible();
    });

    test('invoice table scrolls horizontally on small screens', async ({ page }) => {
      await mockInvoicesApi(page, mockInvoices);

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/invoices');

      // Wait for table
      await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 5000 });

      // Table container should be present
      await expect(page.getByTestId('invoice-table-container')).toBeVisible();

      await takeScreenshot(page, 'invoices-mobile-table');
    });
  });

  test.describe('Navigation from Invoices', () => {
    test('can navigate to dashboard from invoices', async ({ page }) => {
      // Added: Mock both invoice and dashboard APIs for cross-page navigation
      await mockDashboardApi(page);

      await page.goto('/invoices');
      await expect(page.getByTestId('invoice-list-page')).toBeVisible();

      // Navigate to dashboard
      await page.goto('/dashboard');

      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('protected route requires authentication', async ({ page }) => {
      // Clear auth state
      await page.addInitScript(() => {
        localStorage.clear();
      });

      await page.goto('/invoices');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Invoice API Error Handling', () => {
    test('handles API error gracefully', async ({ page }) => {
      // Mock API error for invoice list only
      await page.route('**/rest/invoice/index.json*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await page.goto('/invoices');

      // Page should still render (may show error state)
      await expect(page.getByTestId('invoice-list-page')).toBeVisible();

      await takeScreenshot(page, 'invoices-api-error');
    });

    test('handles network timeout gracefully', async ({ page }) => {
      // Mock slow API that will timeout (invoice list only)
      await page.route('**/rest/invoice/index.json*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 35000)); // Longer than test timeout
        route.abort();
      });

      await page.goto('/invoices');

      // Page should render with loading state
      await expect(page.getByTestId('invoice-list-page')).toBeVisible();
    });
  });
});
