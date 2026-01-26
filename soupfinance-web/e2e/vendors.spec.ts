/**
 * Vendor Management E2E Tests
 * Tests vendor listing, creation, editing, and deletion flows
 */
import { test, expect } from '@playwright/test';
import { mockTokenValidationApi, takeScreenshot } from './fixtures';

// ===========================================================================
// Mock Data
// ===========================================================================

const mockVendors = [
  {
    id: 'vendor-001',
    name: 'Office Supplies Co',
    email: 'contact@officesupplies.com',
    phoneNumber: '+1-555-0101',
    address: '123 Supply Street, Commerce City',
    taxId: 'TAX-123456',
    paymentTerms: 30,
    status: 'ACTIVE',
    dateCreated: '2024-01-15T10:00:00Z',
  },
  {
    id: 'vendor-002',
    name: 'Tech Hardware Inc',
    email: 'sales@techhardware.com',
    phoneNumber: '+1-555-0202',
    address: '456 Tech Boulevard, Silicon Valley',
    taxId: 'TAX-789012',
    paymentTerms: 45,
    status: 'ACTIVE',
    dateCreated: '2024-01-20T14:30:00Z',
  },
  {
    id: 'vendor-003',
    name: 'Cleaning Services LLC',
    email: 'info@cleaningservices.com',
    phoneNumber: '+1-555-0303',
    address: '789 Clean Avenue, Sanitary City',
    taxId: 'TAX-345678',
    paymentTerms: 15,
    status: 'ACTIVE',
    dateCreated: '2024-02-01T09:15:00Z',
  },
];

// ===========================================================================
// Test Setup
// ===========================================================================

test.describe('Vendor Management', () => {
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

  // Helper to mock vendors API
  async function mockVendorsApi(
    page: ReturnType<typeof test.page> extends Promise<infer T> ? T : never,
    vendors = mockVendors
  ) {
    await mockTokenValidationApi(page, true);

    // Mock vendor list endpoint
    await page.route('**/rest/vendor/index.json*', (route) => {
      const url = new URL(route.request().url());
      const search = url.searchParams.get('search') || '';

      const filtered = search
        ? vendors.filter(
            (v) =>
              v.name.toLowerCase().includes(search.toLowerCase()) ||
              v.email.toLowerCase().includes(search.toLowerCase())
          )
        : vendors;

      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered),
      });
    });

    // Mock single vendor endpoint
    await page.route('**/rest/vendor/show/*.json*', (route) => {
      const url = route.request().url();
      const idMatch = url.match(/\/show\/([^/.]+)/);
      const vendorId = idMatch ? idMatch[1] : null;
      const vendor = vendors.find((v) => v.id === vendorId);

      if (vendor) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(vendor),
        });
      } else {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Vendor not found' }),
        });
      }
    });

    // Mock vendor save endpoint
    await page.route('**/rest/vendor/save*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'vendor-new',
          name: 'New Vendor',
          email: 'new@vendor.com',
          status: 'ACTIVE',
          dateCreated: new Date().toISOString(),
        }),
      });
    });

    // Mock vendor update endpoint
    await page.route('**/rest/vendor/update/*', (route) => {
      const url = route.request().url();
      const idMatch = url.match(/\/update\/([^/.]+)/);
      const vendorId = idMatch ? idMatch[1] : 'vendor-001';
      const vendor = vendors.find((v) => v.id === vendorId) || vendors[0];

      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...vendor,
          name: 'Updated Vendor Name',
        }),
      });
    });

    // Mock vendor delete endpoint
    await page.route('**/rest/vendor/delete/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });
  }

  // ===========================================================================
  // Vendor List Tests
  // ===========================================================================

  test.describe('Vendor List Page', () => {
    test('displays list of vendors', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors');
      await expect(page.getByTestId('vendor-list-page')).toBeVisible();
      await expect(page.getByTestId('vendor-list-heading')).toHaveText('Vendors');

      // Verify vendors are displayed
      await expect(page.getByTestId('vendor-list-table')).toBeVisible();
      await expect(page.locator('text=Office Supplies Co')).toBeVisible();
      await expect(page.locator('text=Tech Hardware Inc')).toBeVisible();
      await expect(page.locator('text=Cleaning Services LLC')).toBeVisible();

      await takeScreenshot(page, 'vendor-list-page');
    });

    test('shows loading state while fetching', async ({ page }) => {
      await mockTokenValidationApi(page, true);

      // Delay vendor response
      await page.route('**/rest/vendor/index.json*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockVendors),
        });
      });

      await page.goto('/vendors', { waitUntil: 'commit' });
      await page.waitForSelector('[data-testid="vendor-list-page"]', { timeout: 5000 });

      // Should show loading state
      await expect(page.getByTestId('vendor-list-loading')).toBeVisible({ timeout: 2000 });
      await takeScreenshot(page, 'vendor-list-loading');

      // Wait for data to load
      await expect(page.getByTestId('vendor-list-table')).toBeVisible({ timeout: 10000 });
    });

    test('shows empty state when no vendors', async ({ page }) => {
      await mockTokenValidationApi(page, true);

      // Mock empty vendor list
      await page.route('**/rest/vendor/index.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/vendors');

      // Should show empty state
      await expect(page.getByTestId('vendor-list-empty')).toBeVisible();
      await expect(page.locator('text=No vendors yet')).toBeVisible();

      await takeScreenshot(page, 'vendor-list-empty');
    });

    test('shows error state on API failure', async ({ page }) => {
      await mockTokenValidationApi(page, true);

      // Mock API error
      await page.route('**/rest/vendor/index.json*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto('/vendors');

      // Should show error state
      await expect(page.getByTestId('vendor-list-error')).toBeVisible();
      await expect(page.locator('text=Failed to load vendors')).toBeVisible();

      await takeScreenshot(page, 'vendor-list-error');
    });

    test('search filters vendors by name', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors');
      await expect(page.getByTestId('vendor-list-table')).toBeVisible();

      // Type in search
      await page.getByTestId('vendor-search-input').fill('Office');

      // Wait for filtered results
      await page.waitForTimeout(500); // Debounce

      // Should show only matching vendor
      await expect(page.locator('text=Office Supplies Co')).toBeVisible();

      await takeScreenshot(page, 'vendor-search-filtered');
    });

    test('can navigate to create vendor', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors');
      await page.getByTestId('vendor-new-button').click();

      await expect(page).toHaveURL(/\/vendors\/new/);
    });

    test('can navigate to vendor detail', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors');
      await expect(page.getByTestId('vendor-list-table')).toBeVisible();

      // Click on vendor name link
      await page.getByTestId('vendor-link-vendor-001').click();

      await expect(page).toHaveURL(/\/vendors\/vendor-001/);
    });

    test('can navigate to edit vendor', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors');
      await expect(page.getByTestId('vendor-list-table')).toBeVisible();

      // Click edit button
      await page.getByTestId('vendor-edit-vendor-001').click();

      await expect(page).toHaveURL(/\/vendors\/vendor-001\/edit/);
    });
  });

  // ===========================================================================
  // Create Vendor Tests
  // ===========================================================================

  test.describe('Create Vendor', () => {
    test('form displays required fields', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors/new');

      // Verify form fields are present
      await expect(page.getByTestId('vendor-form-page')).toBeVisible();
      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="phoneNumber"]')).toBeVisible();

      await takeScreenshot(page, 'vendor-form-new');
    });

    test('form validation shows errors for empty required fields', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors/new');

      // Try to submit empty form
      await page.getByTestId('vendor-form-save').click();

      // Should show validation errors
      await expect(page.locator('text=Name is required')).toBeVisible();

      await takeScreenshot(page, 'vendor-form-validation-errors');
    });

    test('can create vendor with valid data', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors/new');

      // Fill in form
      await page.locator('input[name="name"]').fill('New Test Vendor');
      await page.locator('input[name="email"]').fill('test@newvendor.com');
      await page.locator('input[name="phoneNumber"]').fill('+1-555-9999');

      await takeScreenshot(page, 'vendor-form-filled');

      // Submit
      await page.getByTestId('vendor-form-save').click();

      // Should navigate to vendors list or show success
      await expect(page).toHaveURL(/\/vendors/);
    });

    test('cancel button returns to vendor list', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors/new');

      // Click cancel
      await page.getByTestId('vendor-form-cancel').click();

      // Should navigate back to list
      await expect(page).toHaveURL('/vendors');
    });
  });

  // ===========================================================================
  // Edit Vendor Tests
  // ===========================================================================

  test.describe('Edit Vendor', () => {
    test('loads existing vendor data', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors/vendor-001/edit');

      // Wait for form to load with data
      await expect(page.getByTestId('vendor-form-page')).toBeVisible();

      // Verify vendor data is populated
      await expect(page.locator('input[name="name"]')).toHaveValue('Office Supplies Co');
      await expect(page.locator('input[name="email"]')).toHaveValue('contact@officesupplies.com');

      await takeScreenshot(page, 'vendor-form-edit');
    });

    test('can update vendor details', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors/vendor-001/edit');
      await expect(page.getByTestId('vendor-form-page')).toBeVisible();

      // Update name
      await page.locator('input[name="name"]').clear();
      await page.locator('input[name="name"]').fill('Updated Vendor Name');

      // Submit
      await page.getByTestId('vendor-form-save').click();

      // Should navigate to vendor list
      await expect(page).toHaveURL(/\/vendors/);
    });
  });

  // ===========================================================================
  // Delete Vendor Tests
  // ===========================================================================

  test.describe('Delete Vendor', () => {
    test('shows confirmation modal when clicking delete', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors');
      await expect(page.getByTestId('vendor-list-table')).toBeVisible();

      // Click delete button
      await page.getByTestId('vendor-delete-vendor-001').click();

      // Should show confirmation modal
      await expect(page.getByTestId('delete-confirmation-modal')).toBeVisible();
      // Changed: Use scoped locator to check vendor name within modal (avoids strict mode violation)
      await expect(page.getByTestId('delete-confirmation-modal').locator('text=Office Supplies Co')).toBeVisible();

      await takeScreenshot(page, 'vendor-delete-confirmation');
    });

    test('can cancel deletion', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors');
      await expect(page.getByTestId('vendor-list-table')).toBeVisible();

      // Click delete button
      await page.getByTestId('vendor-delete-vendor-001').click();

      // Cancel deletion
      await page.getByTestId('delete-cancel-button').click();

      // Modal should close
      await expect(page.getByTestId('delete-confirmation-modal')).not.toBeVisible();

      // Vendor should still be in list
      await expect(page.locator('text=Office Supplies Co')).toBeVisible();
    });

    test('can confirm deletion', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors');
      await expect(page.getByTestId('vendor-list-table')).toBeVisible();

      // Click delete button
      await page.getByTestId('vendor-delete-vendor-001').click();

      // Confirm deletion
      await page.getByTestId('delete-confirm-button').click();

      // Modal should close
      await expect(page.getByTestId('delete-confirmation-modal')).not.toBeVisible();
    });
  });

  // ===========================================================================
  // Vendor Detail Tests
  // ===========================================================================

  test.describe('Vendor Detail', () => {
    test('displays vendor information', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors/vendor-001');

      // Verify vendor details are shown
      // Changed: Use heading role to avoid strict mode violation (name appears in heading + field)
      await expect(page.getByRole('heading', { name: 'Office Supplies Co' })).toBeVisible();
      await expect(page.locator('text=contact@officesupplies.com')).toBeVisible();

      await takeScreenshot(page, 'vendor-detail-page');
    });

    test('can navigate to edit from detail page', async ({ page }) => {
      await mockVendorsApi(page);

      await page.goto('/vendors/vendor-001');

      // Click edit button
      await page.getByTestId('vendor-detail-edit').click();

      await expect(page).toHaveURL(/\/vendors\/vendor-001\/edit/);
    });
  });

  // ===========================================================================
  // Responsiveness Tests
  // ===========================================================================

  test.describe('Responsiveness', () => {
    test('vendor list is usable on mobile viewport', async ({ page }) => {
      await mockVendorsApi(page);

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/vendors');

      // Page should still be functional
      await expect(page.getByTestId('vendor-list-page')).toBeVisible();
      await expect(page.getByTestId('vendor-new-button')).toBeVisible();

      await takeScreenshot(page, 'vendor-list-mobile');
    });
  });
});
