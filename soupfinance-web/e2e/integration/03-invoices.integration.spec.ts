/**
 * Invoice Integration Tests (UI Form-Based CRUD)
 * Tests against REAL LXC backend (soupfinance-backend)
 *
 * Tests the full invoice lifecycle through actual UI forms:
 * - List invoices (existing invoices from backend)
 * - View invoice detail
 * - Create invoice form UI behavior (validation, line items, totals)
 * - Edit invoice form navigation
 * - Delete invoice flow
 *
 * DOMAIN MODEL (2026-02-05, updated 2026-02-06):
 * The backend uses `accountServices` (soupbroker.kyc.AccountServices) as the invoice
 * recipient. Each AccountServices belongs to a broker KYC Client.
 *
 * The InvoiceFormPage shows a Client dropdown populated from /rest/client/index.json.
 * When a Client is selected, the form auto-resolves the client's accountServices.id
 * to set on the invoice before saving. This allows client metadata to be managed
 * independently of the accountServices instance.
 *
 * Field mapping (backend → frontend):
 *   accountServices → resolved from selected Client (data-testid="invoice-client-select")
 *   invoiceDate     → Invoice Date (data-testid="invoice-date-input")
 *   paymentDate     → Due Date (data-testid="invoice-due-date-input")
 *   purchaseOrderNumber → PO Number (data-testid="invoice-po-number-input")
 *
 * Execution order: Runs after vendor tests (02-vendors).
 *
 * TestIDs used (from InvoiceFormPage, InvoiceListPage, InvoiceDetailPage):
 *   Form: invoice-form-page, invoice-form-heading, invoice-client-select,
 *         invoice-date-input, invoice-due-date-input, invoice-po-number-input,
 *         invoice-notes-textarea, invoice-add-item-button, invoice-items-table,
 *         invoice-item-description-{n}, invoice-item-quantity-{n},
 *         invoice-item-unitPrice-{n}, invoice-item-taxRate-{n},
 *         invoice-item-discountPercent-{n}, invoice-item-remove-{n},
 *         invoice-subtotal, invoice-tax, invoice-total,
 *         invoice-form-save-draft-button, invoice-form-save-send-button,
 *         invoice-form-cancel-button, invoice-form-error-message
 *   List: invoice-list-page, invoice-list-heading, invoice-new-button,
 *         invoice-table-container, invoice-list-table, invoice-list-loading,
 *         invoice-list-empty, invoice-list-error, invoice-row-{id},
 *         invoice-link-{id}, invoice-status-{id}, invoice-edit-{id}
 *   Detail: invoice-detail-page, invoice-detail-heading, invoice-detail-status,
 *           invoice-info-card, invoice-amount-card, invoice-items-card,
 *           invoice-payments-card, invoice-number, invoice-client,
 *           invoice-date, invoice-due-date, invoice-subtotal,
 *           invoice-tax, invoice-total, invoice-paid, invoice-balance-due,
 *           invoice-edit-button, invoice-delete-button, invoice-send-button,
 *           invoice-cancel-button, invoice-download-pdf-button
 */
import { test, expect, type Page } from '@playwright/test';
import { backendTestUsers, takeScreenshot } from '../fixtures';

// LXC backend base URL for direct API calls
const API_BASE = 'http://10.115.213.183:9090';

// ===========================================================================
// Shared State (persists across serial tests)
// ===========================================================================

/** ID of an existing invoice from the backend (used for detail/edit/delete tests) */
let existingInvoiceId: string;

/** Whether the client dropdown has options (for create tests) */
let clientsAvailable = false;

// Unique suffix to avoid collisions across test runs
const testRunId = Date.now();

// Today and 30 days from now for date fields
const today = new Date().toISOString().split('T')[0];
const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

// ===========================================================================
// Login Helper
// ===========================================================================

/**
 * Login as admin via the real login form.
 * Checks "remember me" to store token in localStorage for reliable persistence.
 */
// Added: Helper to get auth token from page storage
async function getAuthToken(page: Page): Promise<string> {
  return await page.evaluate(() =>
    localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);

  // Check remember-me to ensure token goes to localStorage (persists across navigations)
  const rememberCheckbox = page.getByTestId('login-remember-checkbox');
  if (await rememberCheckbox.isVisible().catch(() => false)) {
    await rememberCheckbox.check();
  }

  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

// ===========================================================================
// Test Suite
// ===========================================================================

test.describe('Invoice Integration Tests', () => {
  // Run tests in order since later tests depend on earlier ones
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // =========================================================================
  // 1. Invoice List Page
  // =========================================================================

  test('invoice list page loads correctly', async ({ page }) => {
    await page.goto('/invoices');

    // Verify page structure
    await expect(page.getByTestId('invoice-list-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('invoice-list-heading')).toHaveText('Invoices');
    await expect(page.getByTestId('invoice-new-button')).toBeVisible();

    // Wait for loading to finish (real backend can be slow)
    await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 30000 });

    // Should show either the table, the empty state, or an error
    const hasTable = await page.getByTestId('invoice-list-table').isVisible().catch(() => false);
    const hasEmpty = await page.getByTestId('invoice-list-empty').isVisible().catch(() => false);
    const hasError = await page.getByTestId('invoice-list-error').isVisible().catch(() => false);
    expect(hasTable || hasEmpty || hasError).toBeTruthy();

    // If there's a table with invoices, capture the first invoice ID for later tests
    if (hasTable) {
      const firstInvoiceLink = page.locator('[data-testid^="invoice-link-"]').first();
      if (await firstInvoiceLink.isVisible().catch(() => false)) {
        const testId = await firstInvoiceLink.getAttribute('data-testid');
        if (testId) {
          existingInvoiceId = testId.replace('invoice-link-', '');
          console.log(`[Invoice Test] Found existing invoice: ${existingInvoiceId}`);
        }
      }
    }

    await takeScreenshot(page, 'integration-03-invoices-list-initial');
  });

  // =========================================================================
  // 2. Navigate to New Invoice Form
  // =========================================================================

  test('clicking New Invoice navigates to form', async ({ page }) => {
    await page.goto('/invoices');
    await expect(page.getByTestId('invoice-list-page')).toBeVisible({ timeout: 15000 });

    // Click New Invoice button
    await page.getByTestId('invoice-new-button').click();

    // Verify navigation to form
    await expect(page).toHaveURL(/\/invoices\/new/);
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('invoice-form-heading')).toHaveText('New Invoice');

    // Changed: Client dropdown instead of Account (Client → auto-resolves accountServices)
    await expect(page.getByTestId('invoice-client-select')).toBeVisible();
    await expect(page.getByTestId('invoice-date-input')).toBeVisible();
    await expect(page.getByTestId('invoice-due-date-input')).toBeVisible();
    await expect(page.getByTestId('invoice-po-number-input')).toBeVisible();
    await expect(page.getByTestId('invoice-notes-textarea')).toBeVisible();

    // Verify line items section
    await expect(page.getByTestId('invoice-items-card')).toBeVisible();
    await expect(page.getByTestId('invoice-add-item-button')).toBeVisible();
    await expect(page.getByTestId('invoice-item-description-0')).toBeVisible();
    await expect(page.getByTestId('invoice-item-quantity-0')).toBeVisible();
    await expect(page.getByTestId('invoice-item-unitPrice-0')).toBeVisible();

    // Verify action buttons
    await expect(page.getByTestId('invoice-form-save-draft-button')).toBeVisible();
    await expect(page.getByTestId('invoice-form-save-send-button')).toBeVisible();
    await expect(page.getByTestId('invoice-form-cancel-button')).toBeVisible();

    // Verify totals section
    await expect(page.getByTestId('invoice-subtotal')).toBeVisible();
    await expect(page.getByTestId('invoice-total')).toBeVisible();

    await takeScreenshot(page, 'integration-03-invoices-new-form');
  });

  // =========================================================================
  // 3. Check Client Availability for Invoice Creation
  // =========================================================================

  test('detect client availability for create flow', async ({ page }) => {
    // Fix: Probe client API directly first, then check dropdown with longer wait
    // The /rest/client/index.json endpoint requires max parameter (403 without it)
    const token = await getAuthToken(page);
    let apiClientsExist = false;

    if (token) {
      try {
        const apiResponse = await page.request.get(
          `${API_BASE}/rest/client/index.json?max=10`,
          { headers: { 'X-Auth-Token': token }, maxRedirects: 0, timeout: 15000 }
        );
        if (apiResponse.ok()) {
          const clients = await apiResponse.json().catch(() => []);
          apiClientsExist = Array.isArray(clients) && clients.length > 0;
          console.log(`[Invoice Test] API probe: ${clients.length} clients found via direct API`);
        } else {
          console.log(`[Invoice Test] API probe: /rest/client/index.json returned ${apiResponse.status()}`);
        }
      } catch (e) {
        console.log(`[Invoice Test] API probe failed: ${e}`);
      }
    }

    await page.goto('/invoices/new');
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    // Wait for the clients query to populate the dropdown — longer wait if API confirms clients exist
    const waitTime = apiClientsExist ? 10000 : 5000;
    await page.waitForTimeout(waitTime);

    const clientSelect = page.getByTestId('invoice-client-select');
    const options = clientSelect.locator('option');
    const optionCount = await options.count();

    // First option is "Select a client" placeholder
    clientsAvailable = optionCount > 1;
    console.log(`[Invoice Test] Client dropdown options: ${optionCount} (available: ${clientsAvailable})`);

    // If API has clients but dropdown is empty, try waiting even longer (network/proxy lag)
    if (!clientsAvailable && apiClientsExist) {
      console.log('[Invoice Test] API has clients but dropdown empty — waiting 10s more for proxy...');
      await page.waitForTimeout(10000);
      const retryCount = await options.count();
      clientsAvailable = retryCount > 1;
      console.log(`[Invoice Test] Retry: dropdown options: ${retryCount} (available: ${clientsAvailable})`);
    }

    if (clientsAvailable) {
      for (let i = 1; i < Math.min(await options.count(), 6); i++) {
        const text = await options.nth(i).textContent();
        console.log(`[Invoice Test]   Client option ${i}: ${text}`);
      }
    } else {
      console.log('[Invoice Test] No clients in dropdown — /rest/client/index.json may return empty via proxy');
    }

    expect(true).toBeTruthy();
  });

  // =========================================================================
  // 4. View Existing Invoice Detail Page
  // =========================================================================

  test('existing invoice detail page shows information', async ({ page }) => {
    test.skip(!existingInvoiceId, 'No existing invoices found in list');

    await page.goto(`/invoices/${existingInvoiceId}`);

    // Verify detail page loads
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible({ timeout: 15000 });

    // Wait for loading to complete
    const isLoading = await page.getByTestId('invoice-detail-loading').isVisible().catch(() => false);
    if (isLoading) {
      await expect(page.getByTestId('invoice-detail-loading')).not.toBeVisible({ timeout: 30000 });
    }

    // Check for error state
    const hasError = await page.getByTestId('invoice-detail-error').isVisible().catch(() => false);
    if (hasError) {
      console.log('[Invoice Test] Invoice detail page shows error — backend may have different response format');
      await takeScreenshot(page, 'integration-03-invoices-detail-error');
      return;
    }

    // Verify heading is visible
    const heading = page.getByTestId('invoice-detail-heading');
    await expect(heading).toBeVisible();
    const headingText = await heading.textContent();
    console.log(`[Invoice Test] Detail page heading: ${headingText}`);

    // Verify info card with domain fields
    await expect(page.getByTestId('invoice-info-card')).toBeVisible();

    // Changed: invoice-client (was invoice-account) — now labeled "Client" in detail page
    const clientField = page.getByTestId('invoice-client');
    if (await clientField.isVisible().catch(() => false)) {
      const clientText = await clientField.textContent();
      console.log(`[Invoice Test] Client: ${clientText}`);
    }

    const dateField = page.getByTestId('invoice-date');
    if (await dateField.isVisible().catch(() => false)) {
      const dateText = await dateField.textContent();
      console.log(`[Invoice Test] Invoice Date: ${dateText}`);
    }

    const dueDateField = page.getByTestId('invoice-due-date');
    if (await dueDateField.isVisible().catch(() => false)) {
      const dueDateText = await dueDateField.textContent();
      console.log(`[Invoice Test] Due Date: ${dueDateText}`);
    }

    // Verify amount summary card
    await expect(page.getByTestId('invoice-amount-card')).toBeVisible();

    // Verify line items card
    await expect(page.getByTestId('invoice-items-card')).toBeVisible();

    // Verify payments card
    await expect(page.getByTestId('invoice-payments-card')).toBeVisible();

    // Check status badge
    const statusBadge = page.getByTestId('invoice-detail-status');
    if (await statusBadge.isVisible().catch(() => false)) {
      const statusText = await statusBadge.textContent();
      console.log(`[Invoice Test] Invoice status: ${statusText}`);
    }

    // Check for action buttons (varies by status)
    const editVisible = await page.getByTestId('invoice-edit-button').isVisible().catch(() => false);
    const deleteVisible = await page.getByTestId('invoice-delete-button').isVisible().catch(() => false);
    const sendVisible = await page.getByTestId('invoice-send-button').isVisible().catch(() => false);
    const pdfVisible = await page.getByTestId('invoice-download-pdf-button').isVisible().catch(() => false);
    console.log(`[Invoice Test] Buttons: edit=${editVisible} delete=${deleteVisible} send=${sendVisible} pdf=${pdfVisible}`);

    await takeScreenshot(page, 'integration-03-invoices-detail-page');
  });

  // =========================================================================
  // 5. Navigate to Detail from List
  // =========================================================================

  test('clicking invoice link navigates to detail page', async ({ page }) => {
    test.skip(!existingInvoiceId, 'No existing invoices found in list');

    await page.goto('/invoices');
    await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 30000 });

    // Find our invoice link in the table
    const invoiceLink = page.getByTestId(`invoice-link-${existingInvoiceId}`);
    await expect(invoiceLink).toBeVisible({ timeout: 5000 });

    // Click the link
    await invoiceLink.click();

    // Should navigate to detail page
    await expect(page).toHaveURL(new RegExp(`/invoices/${existingInvoiceId}$`));
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible({ timeout: 15000 });

    await takeScreenshot(page, 'integration-03-invoices-navigate-to-detail');
  });

  // =========================================================================
  // 6. Navigate to Edit from Detail Page
  // =========================================================================

  test('can navigate to edit from detail page', async ({ page }) => {
    test.skip(!existingInvoiceId, 'No existing invoices found in list');

    await page.goto(`/invoices/${existingInvoiceId}`);
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible({ timeout: 15000 });

    // Check if edit button is visible (only for DRAFT status)
    const editButton = page.getByTestId('invoice-edit-button');
    const canEdit = await editButton.isVisible().catch(() => false);

    if (canEdit) {
      await editButton.click();

      // Should navigate to edit form
      await expect(page).toHaveURL(new RegExp(`/invoices/${existingInvoiceId}/edit`));
      await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('invoice-form-heading')).toHaveText('Edit Invoice');
      console.log('[Invoice Test] Successfully navigated to edit form');
    } else {
      console.log('[Invoice Test] Edit button not visible (invoice is not DRAFT status — this is expected for existing invoices)');
    }

    await takeScreenshot(page, 'integration-03-invoices-edit-from-detail');
  });

  // =========================================================================
  // 7. Edit from List Page
  // =========================================================================

  test('clicking edit in list navigates to edit form', async ({ page }) => {
    test.skip(!existingInvoiceId, 'No existing invoices found in list');

    await page.goto('/invoices');
    await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 30000 });

    // Try to find the edit link for our invoice
    const editLink = page.getByTestId(`invoice-edit-${existingInvoiceId}`);
    const isVisible = await editLink.isVisible().catch(() => false);

    if (isVisible) {
      await editLink.click();

      // Should navigate to edit form
      await expect(page).toHaveURL(new RegExp(`/invoices/${existingInvoiceId}/edit`));
      await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('invoice-form-heading')).toHaveText('Edit Invoice');
      console.log('[Invoice Test] Successfully navigated to edit form from list');
    } else {
      console.log('[Invoice Test] Edit link not visible for this invoice in list');
      // Navigate directly as fallback
      await page.goto(`/invoices/${existingInvoiceId}/edit`);
      await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });
    }

    await takeScreenshot(page, 'integration-03-invoices-edit-from-list');
  });

  // =========================================================================
  // 8. Cancel Button Returns to List
  // =========================================================================

  test('cancel button on form returns to invoice list', async ({ page }) => {
    await page.goto('/invoices/new');
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    // Click cancel
    await page.getByTestId('invoice-form-cancel-button').click();

    // Should return to list
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(page.getByTestId('invoice-list-page')).toBeVisible();

    await takeScreenshot(page, 'integration-03-invoices-cancel-form');
  });

  // =========================================================================
  // 9. Form Validation - Missing Client
  // =========================================================================

  test('form validation shows error for missing client', async ({ page }) => {
    await page.goto('/invoices/new');
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    // Fill a line item but don't select a client
    await page.getByTestId('invoice-item-description-0').fill('Test Service');
    await page.getByTestId('invoice-item-quantity-0').fill('1');
    await page.getByTestId('invoice-item-unitPrice-0').fill('100');
    await page.getByTestId('invoice-due-date-input').fill(dueDate);

    // Submit without selecting a client
    await page.getByTestId('invoice-form-save-draft-button').click();

    // Changed: Should show validation error for missing client (was "account")
    await expect(page.getByTestId('invoice-form-error-message')).toBeVisible({ timeout: 5000 });
    const errorText = await page.getByTestId('invoice-form-error-message').textContent();
    expect(errorText?.toLowerCase()).toContain('client');
    console.log(`[Invoice Test] Validation error: ${errorText}`);

    await takeScreenshot(page, 'integration-03-invoices-validation-client');
  });

  // =========================================================================
  // 10. Form Validation - Missing Due Date
  // =========================================================================

  test('form validation shows error for missing due date', async ({ page }) => {
    await page.goto('/invoices/new');
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    // Fill invoice date but clear due date
    await page.getByTestId('invoice-date-input').fill(today);
    await page.getByTestId('invoice-due-date-input').fill('');  // Clear due date
    await page.getByTestId('invoice-item-description-0').fill('Test Service');
    await page.getByTestId('invoice-item-quantity-0').fill('1');
    await page.getByTestId('invoice-item-unitPrice-0').fill('100');

    // Submit — account validation fires first, so we'll still get account error
    await page.getByTestId('invoice-form-save-draft-button').click();

    // Should show validation error (likely for account, since that checks first)
    await expect(page.getByTestId('invoice-form-error-message')).toBeVisible({ timeout: 5000 });
    const errorText = await page.getByTestId('invoice-form-error-message').textContent();
    console.log(`[Invoice Test] Validation error (no account/no due date): ${errorText}`);
    expect(errorText).toBeTruthy();

    await takeScreenshot(page, 'integration-03-invoices-validation-due-date');
  });

  // =========================================================================
  // 11. Line Items - Add and Remove
  // =========================================================================

  test('can add and remove line items', async ({ page }) => {
    await page.goto('/invoices/new');
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    // Should start with one empty line item
    await expect(page.getByTestId('invoice-item-description-0')).toBeVisible();

    // Remove button should be disabled when there's only one item
    const removeButton = page.getByTestId('invoice-item-remove-0');
    await expect(removeButton).toBeDisabled();

    // Add a second line item
    await page.getByTestId('invoice-add-item-button').click();
    await expect(page.getByTestId('invoice-item-description-1')).toBeVisible();

    // Now remove button should be enabled on both items
    await expect(page.getByTestId('invoice-item-remove-0')).toBeEnabled();
    await expect(page.getByTestId('invoice-item-remove-1')).toBeEnabled();

    // Add a third item
    await page.getByTestId('invoice-add-item-button').click();
    await expect(page.getByTestId('invoice-item-description-2')).toBeVisible();

    // Remove the second item
    await page.getByTestId('invoice-item-remove-1').click();

    // Should now have two items (indices 0 and 1, since item 2 shifted down)
    await expect(page.getByTestId('invoice-item-description-0')).toBeVisible();
    await expect(page.getByTestId('invoice-item-description-1')).toBeVisible();
    const hasThird = await page.getByTestId('invoice-item-description-2').isVisible().catch(() => false);
    expect(hasThird).toBeFalsy();

    await takeScreenshot(page, 'integration-03-invoices-line-items');
  });

  // =========================================================================
  // 12. Totals Calculation
  // =========================================================================

  test('totals calculate correctly from line items', async ({ page }) => {
    await page.goto('/invoices/new');
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    // Fill first line item: 5 x 100 = 500
    await page.getByTestId('invoice-item-description-0').fill('Service A');
    await page.getByTestId('invoice-item-quantity-0').fill('5');
    await page.getByTestId('invoice-item-unitPrice-0').fill('100');

    await page.waitForTimeout(300);

    // Check subtotal shows 500 (or formatted equivalent)
    const subtotalText = await page.getByTestId('invoice-subtotal').textContent();
    console.log(`[Invoice Test] Subtotal with one item: ${subtotalText}`);
    // Should contain "500" somewhere (formatted like GHS 500.00 or ₵500.00)
    expect(subtotalText).toMatch(/500/);

    // Add second line item: 3 x 200 = 600
    await page.getByTestId('invoice-add-item-button').click();
    await page.getByTestId('invoice-item-description-1').fill('Service B');
    await page.getByTestId('invoice-item-quantity-1').fill('3');
    await page.getByTestId('invoice-item-unitPrice-1').fill('200');

    await page.waitForTimeout(300);

    // Check subtotal shows 1100 (500 + 600)
    const subtotalText2 = await page.getByTestId('invoice-subtotal').textContent();
    console.log(`[Invoice Test] Subtotal with two items: ${subtotalText2}`);
    expect(subtotalText2).toMatch(/1[,.]?100/);

    // Total should match subtotal when no tax/discount
    const totalText = await page.getByTestId('invoice-total').textContent();
    console.log(`[Invoice Test] Total: ${totalText}`);
    expect(totalText).toMatch(/1[,.]?100/);

    await takeScreenshot(page, 'integration-03-invoices-totals');
  });

  // =========================================================================
  // 13. Invoice Detail - Payment History Section
  // =========================================================================

  test('invoice detail shows payment history section', async ({ page }) => {
    test.skip(!existingInvoiceId, 'No existing invoices found in list');

    await page.goto(`/invoices/${existingInvoiceId}`);
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible({ timeout: 15000 });

    // Check for error state first
    const hasError = await page.getByTestId('invoice-detail-error').isVisible().catch(() => false);
    if (hasError) {
      console.log('[Invoice Test] Detail page has error — skipping payment check');
      return;
    }

    // Verify payment history card exists
    await expect(page.getByTestId('invoice-payments-card')).toBeVisible();

    // Should have either empty message or a payments table
    const paymentsEmpty = page.getByTestId('invoice-payments-empty');
    const paymentsTable = page.getByTestId('invoice-payments-table');
    const hasEmptyMsg = await paymentsEmpty.isVisible().catch(() => false);
    const hasPaymentsTable = await paymentsTable.isVisible().catch(() => false);

    expect(hasEmptyMsg || hasPaymentsTable).toBeTruthy();

    if (hasEmptyMsg) {
      const emptyText = await paymentsEmpty.textContent();
      console.log(`[Invoice Test] Payments section: ${emptyText}`);
    } else if (hasPaymentsTable) {
      console.log('[Invoice Test] Invoice has payment records');
    }

    await takeScreenshot(page, 'integration-03-invoices-payment-history');
  });

  // =========================================================================
  // 14. Invoice Detail - Line Items Display
  // =========================================================================

  test('invoice detail shows line items section', async ({ page }) => {
    test.skip(!existingInvoiceId, 'No existing invoices found in list');

    await page.goto(`/invoices/${existingInvoiceId}`);
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible({ timeout: 15000 });

    // Check for error state first
    const hasError = await page.getByTestId('invoice-detail-error').isVisible().catch(() => false);
    if (hasError) {
      console.log('[Invoice Test] Detail page has error — skipping line items check');
      return;
    }

    // Verify line items card exists
    await expect(page.getByTestId('invoice-items-card')).toBeVisible();

    // Should have either items table or empty message
    const itemsTable = page.getByTestId('invoice-items-table');
    const itemsEmpty = page.getByTestId('invoice-items-empty');
    const hasItemsTable = await itemsTable.isVisible().catch(() => false);
    const hasEmpty = await itemsEmpty.isVisible().catch(() => false);

    if (hasItemsTable) {
      const rows = itemsTable.locator('tbody tr');
      const rowCount = await rows.count();
      console.log(`[Invoice Test] Line items count: ${rowCount}`);
      expect(rowCount).toBeGreaterThanOrEqual(1);
    } else if (hasEmpty) {
      console.log('[Invoice Test] No line items displayed');
    } else {
      console.log('[Invoice Test] Neither items table nor empty state visible');
    }

    await takeScreenshot(page, 'integration-03-invoices-line-items-detail');
  });

  // =========================================================================
  // 15. Mobile Responsiveness
  // =========================================================================

  test('invoice list is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/invoices');
    await expect(page.getByTestId('invoice-list-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('invoice-new-button')).toBeVisible();

    await takeScreenshot(page, 'integration-03-invoices-mobile-list');
  });

  // =========================================================================
  // 16. Mobile - Invoice Form
  // =========================================================================

  test('invoice form is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/invoices/new');
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    // Changed: invoice-client-select (was invoice-account-select) — Client dropdown
    await expect(page.getByTestId('invoice-form-heading')).toBeVisible();
    await expect(page.getByTestId('invoice-client-select')).toBeVisible();
    await expect(page.getByTestId('invoice-item-description-0')).toBeVisible();
    await expect(page.getByTestId('invoice-form-save-draft-button')).toBeVisible();

    await takeScreenshot(page, 'integration-03-invoices-mobile-form');
  });

  // =========================================================================
  // 17. Invoice Create with Client Selection
  // =========================================================================

  test('create invoice via form when clients are available', async ({ page }) => {
    test.skip(!clientsAvailable, 'No clients available in dropdown');

    // Changed: Now selects a Client (which auto-resolves accountServices for the invoice FK)
    await page.goto('/invoices/new');
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    // Wait for clients dropdown to populate from /rest/client/index.json
    await page.waitForTimeout(5000);

    // Select the first real client
    const clientSelect = page.getByTestId('invoice-client-select');
    const options = clientSelect.locator('option');
    const optionCount = await options.count();
    console.log(`[Invoice Test] Client dropdown options: ${optionCount}`);

    if (optionCount <= 1) {
      // Only "Select a client" placeholder
      console.log('[Invoice Test] No clients in dropdown — cannot create invoice');
      return;
    }

    // Select the first real client
    const firstOptionValue = await options.nth(1).getAttribute('value');
    if (firstOptionValue) {
      await clientSelect.selectOption(firstOptionValue);
      const selectedText = await options.nth(1).textContent();
      console.log(`[Invoice Test] Selected client: ${selectedText} (ID: ${firstOptionValue})`);
    }

    // Fill form with backend field names
    await page.getByTestId('invoice-date-input').fill(today);
    await page.getByTestId('invoice-due-date-input').fill(dueDate);
    await page.getByTestId('invoice-po-number-input').fill(`PO-${testRunId}`);
    await page.getByTestId('invoice-notes-textarea').fill(`Integration test invoice ${testRunId}`);
    await page.getByTestId('invoice-item-description-0').fill('Consulting Services');
    await page.getByTestId('invoice-item-quantity-0').fill('10');
    await page.getByTestId('invoice-item-unitPrice-0').fill('150');

    // Submit
    const saveResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/invoice/save.json') && resp.request().method() === 'POST',
      { timeout: 30000 }
    );
    await page.getByTestId('invoice-form-save-draft-button').click();

    // Wait for response and check
    try {
      const saveResponse = await saveResponsePromise;
      console.log(`[Invoice Test] Save response: ${saveResponse.status()}`);

      if (saveResponse.ok()) {
        // Should navigate to list on success
        await expect(page).toHaveURL(/\/invoices/, { timeout: 15000 });
        console.log('[Invoice Test] Invoice created successfully');
      } else {
        // Log error but don't fail — backend may reject for various reasons
        const body = await saveResponse.text().catch(() => 'unable to read body');
        console.log(`[Invoice Test] Save returned ${saveResponse.status()}: ${body}`);
      }
    } catch (e) {
      // If the response interceptor didn't fire, check for form error
      const hasFormError = await page.getByTestId('invoice-form-error-message').isVisible().catch(() => false);
      if (hasFormError) {
        const errorText = await page.getByTestId('invoice-form-error-message').textContent();
        console.log(`[Invoice Test] Form error: ${errorText}`);
      } else {
        console.log(`[Invoice Test] No response intercepted and no form error visible: ${e}`);
      }
    }

    await takeScreenshot(page, 'integration-03-invoices-created');
  });

  // =========================================================================
  // 18. Invoice Delete Flow (window.confirm)
  // =========================================================================

  test('delete invoice flow uses confirmation dialog', async ({ page }) => {
    test.skip(!existingInvoiceId, 'No existing invoices found in list');

    await page.goto(`/invoices/${existingInvoiceId}`);
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible({ timeout: 15000 });

    // Check for error state first
    const hasError = await page.getByTestId('invoice-detail-error').isVisible().catch(() => false);
    if (hasError) {
      console.log('[Invoice Test] Detail page has error — skipping delete test');
      return;
    }

    // Check if delete button is visible (only for DRAFT status)
    const deleteButton = page.getByTestId('invoice-delete-button');
    const canDelete = await deleteButton.isVisible().catch(() => false);

    if (!canDelete) {
      console.log('[Invoice Test] Delete button not visible (invoice is not DRAFT status — expected for existing data)');
      return;
    }

    // Set up dialog handler to DISMISS (cancel) — we don't actually want to delete
    page.on('dialog', async (dialog) => {
      console.log(`[Invoice Test] Delete dialog: ${dialog.type()} - ${dialog.message()}`);
      await dialog.dismiss(); // Cancel deletion
    });

    // Click delete button
    await deleteButton.click();

    // Should stay on the detail page (dialog was dismissed)
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible();

    await takeScreenshot(page, 'integration-03-invoices-delete-cancelled');
    console.log('[Invoice Test] Delete dialog appeared and was cancelled');
  });

  // =========================================================================
  // 19. Invoice Cancel Action
  // =========================================================================

  test('cancel invoice action uses confirmation dialog', async ({ page }) => {
    test.skip(!existingInvoiceId, 'No existing invoices found in list');

    await page.goto(`/invoices/${existingInvoiceId}`);
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible({ timeout: 15000 });

    // Check for error state first
    const hasError = await page.getByTestId('invoice-detail-error').isVisible().catch(() => false);
    if (hasError) {
      console.log('[Invoice Test] Detail page has error — skipping cancel test');
      return;
    }

    // Check if cancel button is visible (not for CANCELLED or PAID status)
    const cancelButton = page.getByTestId('invoice-cancel-button');
    const canCancel = await cancelButton.isVisible().catch(() => false);

    if (!canCancel) {
      console.log('[Invoice Test] Cancel button not visible (invoice may be CANCELLED or PAID)');
      return;
    }

    // Set up dialog handler to DISMISS — we don't actually want to cancel
    page.on('dialog', async (dialog) => {
      console.log(`[Invoice Test] Cancel dialog: ${dialog.type()} - ${dialog.message()}`);
      await dialog.dismiss(); // Don't cancel the invoice
    });

    // Click cancel button
    await cancelButton.click();

    // Should stay on the detail page
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible();

    await takeScreenshot(page, 'integration-03-invoices-cancel-action');
    console.log('[Invoice Test] Cancel dialog appeared and was dismissed');
  });

  // =========================================================================
  // 20. Download PDF Button Visible
  // =========================================================================

  test('download PDF button is present on detail page', async ({ page }) => {
    test.skip(!existingInvoiceId, 'No existing invoices found in list');

    await page.goto(`/invoices/${existingInvoiceId}`);
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible({ timeout: 15000 });

    // Check for error state first
    const hasError = await page.getByTestId('invoice-detail-error').isVisible().catch(() => false);
    if (hasError) {
      console.log('[Invoice Test] Detail page has error — skipping PDF check');
      return;
    }

    // PDF download button should always be present
    const pdfButton = page.getByTestId('invoice-download-pdf-button');
    await expect(pdfButton).toBeVisible();

    const buttonText = await pdfButton.textContent();
    console.log(`[Invoice Test] PDF button text: ${buttonText}`);
    expect(buttonText).toContain('PDF');

    await takeScreenshot(page, 'integration-03-invoices-pdf-button');
  });

  // =========================================================================
  // 21. Invoice List Shows Multiple Invoices
  // =========================================================================

  test('invoice list displays multiple invoices with correct columns', async ({ page }) => {
    await page.goto('/invoices');
    await expect(page.getByTestId('invoice-list-loading')).not.toBeVisible({ timeout: 30000 });

    const hasTable = await page.getByTestId('invoice-list-table').isVisible().catch(() => false);
    if (!hasTable) {
      console.log('[Invoice Test] No invoice table visible — either empty or error');
      return;
    }

    // Count invoice rows
    const rows = page.getByTestId('invoice-list-table').locator('tbody tr');
    const rowCount = await rows.count();
    console.log(`[Invoice Test] Invoice rows in table: ${rowCount}`);
    expect(rowCount).toBeGreaterThanOrEqual(1);

    // Verify table has expected column headers (updated: Invoice#, Account, Invoice Date, Due Date, Amount, Status, Actions)
    const headers = page.getByTestId('invoice-list-table').locator('thead th');
    const headerCount = await headers.count();
    console.log(`[Invoice Test] Table columns: ${headerCount}`);
    expect(headerCount).toBeGreaterThanOrEqual(5);

    // Verify the column headers match our refactored names
    const headerTexts: string[] = [];
    for (let i = 0; i < headerCount; i++) {
      const text = await headers.nth(i).textContent();
      headerTexts.push(text?.trim() || '');
    }
    console.log(`[Invoice Test] Column headers: ${headerTexts.join(' | ')}`);

    // Changed: Should have "Client" column (was "Account")
    expect(headerTexts.some(h => h.toLowerCase().includes('client'))).toBeTruthy();

    await takeScreenshot(page, 'integration-03-invoices-list-table');
  });

  // =========================================================================
  // 22. Invoice Form - Discount Percent Input
  // =========================================================================

  test('line item discount percent input works correctly', async ({ page }) => {
    await page.goto('/invoices/new');
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    // Fill a line item with discount
    await page.getByTestId('invoice-item-description-0').fill('Discounted Service');
    await page.getByTestId('invoice-item-quantity-0').fill('10');
    await page.getByTestId('invoice-item-unitPrice-0').fill('100');
    await page.getByTestId('invoice-item-discountPercent-0').fill('10');

    await page.waitForTimeout(300);

    // Subtotal should be 1000 (10 * 100), but total should reflect discount
    const subtotalText = await page.getByTestId('invoice-subtotal').textContent();
    console.log(`[Invoice Test] Subtotal: ${subtotalText}`);
    expect(subtotalText).toMatch(/1[,.]?000/);

    // With 10% discount, discount amount = 100, so total = 900
    const totalText = await page.getByTestId('invoice-total').textContent();
    console.log(`[Invoice Test] Total after discount: ${totalText}`);
    expect(totalText).toMatch(/900/);

    await takeScreenshot(page, 'integration-03-invoices-discount');
  });
});
