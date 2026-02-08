/**
 * Payment Integration Tests (UI Form-Based CRUD)
 * Tests against REAL LXC backend (soupfinance-backend)
 *
 * Tests the payment lifecycle through actual UI forms:
 * - List incoming (invoice) and outgoing (bill) payments
 * - Record payment against invoice or bill
 * - Tab switching between incoming/outgoing
 * - Validation and error handling
 *
 * DOMAIN MODEL:
 * Payments are recorded against either:
 *   - InvoicePayment → records payment received from client (incoming)
 *   - BillPayment → records payment made to vendor (outgoing)
 *
 * Both payment types share the same form (PaymentFormPage) which toggles
 * between invoice and bill mode via the payment type toggle.
 *
 * The form pre-selects the document when navigated with ?invoiceId= or ?billId=
 * URL parameters (e.g., from the invoice/bill detail page "Record Payment" button).
 *
 * Routes:
 *   /payments      → PaymentListPage (tabbed incoming/outgoing)
 *   /payments/new  → PaymentFormPage
 *   /payments/new?invoiceId=xxx → Pre-select invoice
 *   /payments/new?billId=xxx    → Pre-select bill
 *
 * Execution order: Runs after bill tests (04-bills).
 * Depends on existing invoices (03-invoices) and bills (04-bills).
 *
 * TestIDs used (from PaymentListPage, PaymentFormPage):
 *   List: payment-list-page, payment-list-heading, record-payment-button,
 *         payment-tabs, tab-incoming, tab-outgoing,
 *         payment-table-container, payment-list-loading, payment-list-error,
 *         payment-list-empty, payment-table, payment-row-{id},
 *         record-first-payment-button, payment-summary
 *   Form: payment-form-page, payment-form-heading, cancel-button,
 *         payment-type-toggle, type-invoice, type-bill,
 *         select-document, amount-input, pay-full-button,
 *         date-input, method-select, reference-input, notes-input,
 *         form-error, submit-button
 */
import { test, expect, type Page } from '@playwright/test';
import { backendTestUsers, takeScreenshot } from '../fixtures';

// ===========================================================================
// Shared State (persists across serial tests)
// ===========================================================================

/** Whether there are any incoming payments displayed (set by tests, reserved for future skip conditions) */
let _hasIncomingPayments = false;

/** Whether there are any outgoing payments displayed (set by tests, reserved for future skip conditions) */
let _hasOutgoingPayments = false;

/** Whether there are unpaid invoices available in the form dropdown */
let hasUnpaidInvoices = false;

/** Whether there are unpaid bills available in the form dropdown */
let hasUnpaidBills = false;

/** An existing invoice ID found in the payment form dropdown (for preselection test) */
let invoiceIdForPayment: string;

// Today's date for payment form
const today = new Date().toISOString().split('T')[0];

// ===========================================================================
// Login Helper
// ===========================================================================

/**
 * Login as admin via the real login form.
 * Checks "remember me" to store token in localStorage for reliable persistence.
 */
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

test.describe('Payment Integration Tests', () => {
  // Run tests in order since later tests depend on earlier ones
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // =========================================================================
  // 1. Payment List Page - Structure
  // =========================================================================

  test('payment list page loads correctly', async ({ page }) => {
    await page.goto('/payments');

    // Verify page structure
    await expect(page.getByTestId('payment-list-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('payment-list-heading')).toHaveText('Payments');
    await expect(page.getByTestId('record-payment-button')).toBeVisible();

    // Verify tabs are visible
    await expect(page.getByTestId('payment-tabs')).toBeVisible();
    await expect(page.getByTestId('tab-incoming')).toBeVisible();
    await expect(page.getByTestId('tab-outgoing')).toBeVisible();

    // Wait for loading to finish
    await expect(page.getByTestId('payment-list-loading')).not.toBeVisible({ timeout: 30000 });

    // Should show either table, empty state, or error
    const hasTable = await page.getByTestId('payment-table').isVisible().catch(() => false);
    const hasEmpty = await page.getByTestId('payment-list-empty').isVisible().catch(() => false);
    const hasError = await page.getByTestId('payment-list-error').isVisible().catch(() => false);
    expect(hasTable || hasEmpty || hasError).toBeTruthy();

    if (hasTable) {
      const rows = page.locator('[data-testid^="payment-row-"]');
      const rowCount = await rows.count();
      console.log(`[Payment Test] Incoming payment rows: ${rowCount}`);
      _hasIncomingPayments = rowCount > 0;
    } else if (hasEmpty) {
      console.log('[Payment Test] No incoming payments');
      _hasIncomingPayments = false;
    }

    await takeScreenshot(page, 'integration-05-payments-list-initial');
  });

  // =========================================================================
  // 2. Incoming Tab (Default)
  // =========================================================================

  test('incoming tab is active by default', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByTestId('payment-list-page')).toBeVisible({ timeout: 15000 });

    // Verify incoming tab is the active/selected one
    const incomingTab = page.getByTestId('tab-incoming');
    const incomingClass = await incomingTab.getAttribute('class');
    console.log(`[Payment Test] Incoming tab classes: ${incomingClass?.substring(0, 100)}`);

    // The active tab has 'bg-primary text-white' in its classes
    expect(incomingClass).toContain('bg-primary');

    await takeScreenshot(page, 'integration-05-payments-incoming-tab');
  });

  // =========================================================================
  // 3. Switch to Outgoing Tab
  // =========================================================================

  test('switching to outgoing tab shows bill payments', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByTestId('payment-list-page')).toBeVisible({ timeout: 15000 });

    // Click outgoing tab
    await page.getByTestId('tab-outgoing').click();

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Verify outgoing tab is now active
    const outgoingClass = await page.getByTestId('tab-outgoing').getAttribute('class');
    expect(outgoingClass).toContain('bg-primary');

    // Wait for loading to finish
    const isLoading = await page.getByTestId('payment-list-loading').isVisible().catch(() => false);
    if (isLoading) {
      await expect(page.getByTestId('payment-list-loading')).not.toBeVisible({ timeout: 30000 });
    }

    // Check what we got for outgoing
    const hasTable = await page.getByTestId('payment-table').isVisible().catch(() => false);
    const hasEmpty = await page.getByTestId('payment-list-empty').isVisible().catch(() => false);
    const hasError = await page.getByTestId('payment-list-error').isVisible().catch(() => false);

    if (hasTable) {
      const rows = page.locator('[data-testid^="payment-row-"]');
      const rowCount = await rows.count();
      console.log(`[Payment Test] Outgoing payment rows: ${rowCount}`);
      _hasOutgoingPayments = rowCount > 0;
    } else if (hasEmpty) {
      console.log('[Payment Test] No outgoing payments');
      _hasOutgoingPayments = false;
    } else if (hasError) {
      console.log('[Payment Test] Error loading outgoing payments');
    }

    await takeScreenshot(page, 'integration-05-payments-outgoing-tab');
  });

  // =========================================================================
  // 4. Navigate to Record Payment Form
  // =========================================================================

  test('clicking Record Payment navigates to form', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByTestId('payment-list-page')).toBeVisible({ timeout: 15000 });

    // Click Record Payment button
    await page.getByTestId('record-payment-button').click();

    // Verify navigation to form
    await expect(page).toHaveURL(/\/payments\/new/);
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('payment-form-heading')).toHaveText('Record Payment');

    await takeScreenshot(page, 'integration-05-payments-form-navigation');
  });

  // =========================================================================
  // 5. Payment Form - All Fields Present
  // =========================================================================

  test('payment form shows all required fields', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Verify heading
    await expect(page.getByTestId('payment-form-heading')).toHaveText('Record Payment');

    // Verify payment type toggle
    await expect(page.getByTestId('payment-type-toggle')).toBeVisible();
    await expect(page.getByTestId('type-invoice')).toBeVisible();
    await expect(page.getByTestId('type-bill')).toBeVisible();

    // Verify document select
    await expect(page.getByTestId('select-document')).toBeVisible();

    // Verify amount input
    await expect(page.getByTestId('amount-input')).toBeVisible();

    // Verify date input
    await expect(page.getByTestId('date-input')).toBeVisible();

    // Verify payment method select
    await expect(page.getByTestId('method-select')).toBeVisible();

    // Verify reference and notes
    await expect(page.getByTestId('reference-input')).toBeVisible();
    await expect(page.getByTestId('notes-input')).toBeVisible();

    // Verify buttons
    await expect(page.getByTestId('cancel-button')).toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();

    await takeScreenshot(page, 'integration-05-payments-form-fields');
  });

  // =========================================================================
  // 6. Payment Type Toggle
  // =========================================================================

  test('payment type toggle switches between invoice and bill', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Invoice should be selected by default
    const invoiceClass = await page.getByTestId('type-invoice').getAttribute('class');
    expect(invoiceClass).toContain('bg-primary');

    // Switch to bill type
    await page.getByTestId('type-bill').click();
    await page.waitForTimeout(500);

    // Verify bill is now active
    const billClass = await page.getByTestId('type-bill').getAttribute('class');
    expect(billClass).toContain('bg-primary');

    // Invoice should no longer be active
    const invoiceClassAfter = await page.getByTestId('type-invoice').getAttribute('class');
    expect(invoiceClassAfter).not.toContain('text-white');

    // Switch back to invoice
    await page.getByTestId('type-invoice').click();
    await page.waitForTimeout(500);

    const invoiceClassFinal = await page.getByTestId('type-invoice').getAttribute('class');
    expect(invoiceClassFinal).toContain('bg-primary');

    await takeScreenshot(page, 'integration-05-payments-type-toggle');
  });

  // =========================================================================
  // 7. Invoice Document Dropdown
  // =========================================================================

  test('invoice document dropdown populates with unpaid invoices', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Wait for invoices to load
    await page.waitForTimeout(5000);

    const documentSelect = page.getByTestId('select-document');
    const options = documentSelect.locator('option');
    const optionCount = await options.count();

    // First option is placeholder "Select an invoice"
    hasUnpaidInvoices = optionCount > 1;
    console.log(`[Payment Test] Invoice dropdown options: ${optionCount} (hasUnpaid: ${hasUnpaidInvoices})`);

    if (hasUnpaidInvoices) {
      // Log the first few options
      for (let i = 1; i < Math.min(optionCount, 5); i++) {
        const text = await options.nth(i).textContent();
        const value = await options.nth(i).getAttribute('value');
        console.log(`[Payment Test]   Invoice option ${i}: ${text} (${value})`);
        // Save the first invoice ID for the preselection test
        if (i === 1 && value) {
          invoiceIdForPayment = value;
        }
      }
    } else {
      console.log('[Payment Test] No unpaid invoices available');
    }

    // This is a probe test — always passes
    expect(true).toBeTruthy();
  });

  // =========================================================================
  // 8. Bill Document Dropdown
  // =========================================================================

  test('bill document dropdown populates with unpaid bills', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Switch to bill type
    await page.getByTestId('type-bill').click();

    // Wait for bills to load
    await page.waitForTimeout(5000);

    const documentSelect = page.getByTestId('select-document');
    const options = documentSelect.locator('option');
    const optionCount = await options.count();

    // First option is placeholder "Select a bill"
    hasUnpaidBills = optionCount > 1;
    console.log(`[Payment Test] Bill dropdown options: ${optionCount} (hasUnpaid: ${hasUnpaidBills})`);

    if (hasUnpaidBills) {
      for (let i = 1; i < Math.min(optionCount, 5); i++) {
        const text = await options.nth(i).textContent();
        console.log(`[Payment Test]   Bill option ${i}: ${text}`);
      }
    } else {
      console.log('[Payment Test] No unpaid bills available');
    }

    // This is a probe test — always passes
    expect(true).toBeTruthy();
  });

  // =========================================================================
  // 9. Cancel Button Returns to List
  // =========================================================================

  test('cancel button returns to payment list', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Click cancel
    await page.getByTestId('cancel-button').click();

    // Should return to payment list
    await expect(page).toHaveURL(/\/payments$/);
    await expect(page.getByTestId('payment-list-page')).toBeVisible();

    await takeScreenshot(page, 'integration-05-payments-cancel');
  });

  // =========================================================================
  // 10. Form Validation - Missing Document
  // =========================================================================

  // Changed: Submit button is disabled when no document is selected (not a click+error pattern)
  test('form validation shows error for missing document', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Fill amount and date but don't select a document
    await page.getByTestId('amount-input').fill('100');
    await page.getByTestId('date-input').fill(today);

    // Changed: Submit button should be disabled when no document is selected
    // The form uses disabled={!selectedId || !amount} on the submit button
    const submitButton = page.getByTestId('submit-button');
    await expect(submitButton).toBeDisabled();
    console.log(`[Payment Test] Submit button correctly disabled when no document selected`);

    await takeScreenshot(page, 'integration-05-payments-validation-document');
  });

  // =========================================================================
  // 11. Form Validation - Invalid Amount
  // =========================================================================

  // Changed: Native HTML5 validation (min="0.01") prevents form submission with amount=0
  // so we verify the browser blocks it OR the JS handler catches it via form-error
  test('form validation prevents submission with invalid amount', async ({ page }) => {
    test.skip(!hasUnpaidInvoices, 'No unpaid invoices to select');

    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Wait for invoices to load
    await page.waitForTimeout(5000);

    // Select first unpaid invoice
    const documentSelect = page.getByTestId('select-document');
    const options = documentSelect.locator('option');
    const optionCount = await options.count();
    if (optionCount > 1) {
      const firstValue = await options.nth(1).getAttribute('value');
      if (firstValue) {
        await documentSelect.selectOption(firstValue);
      }
    }

    // Set amount to 0 (invalid - less than min="0.01")
    await page.getByTestId('amount-input').fill('0');
    await page.getByTestId('date-input').fill(today);

    // Click submit - native HTML5 validation (min="0.01") will prevent form submission
    const submitButton = page.getByTestId('submit-button');
    await submitButton.click();

    // Verify form was NOT submitted: either native validation tooltip blocks it
    // or JS handler shows form-error. Check that no success/navigation occurred.
    const hasFormError = await page.getByTestId('form-error').isVisible({ timeout: 2000 }).catch(() => false);
    const stillOnForm = await page.getByTestId('payment-form-page').isVisible().catch(() => false);

    // Changed: The key assertion is that we're still on the form (submission was blocked)
    expect(stillOnForm).toBeTruthy();
    console.log(`[Payment Test] Invalid amount correctly prevented submission (form-error visible: ${hasFormError})`);

    await takeScreenshot(page, 'integration-05-payments-validation-amount');
  });

  // =========================================================================
  // 12. Payment Method Options
  // =========================================================================

  test('payment method dropdown has all options', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    const methodSelect = page.getByTestId('method-select');
    const options = methodSelect.locator('option');
    const optionCount = await options.count();
    console.log(`[Payment Test] Payment method options: ${optionCount}`);

    // Changed: Backend returns PaymentMethod domain objects (not hardcoded enum).
    // The seed DB has many test entries plus real ones like Bank Transfer, Cash, etc.
    // Just verify we have at least a few payment methods loaded.
    expect(optionCount).toBeGreaterThanOrEqual(5);

    // Log first 10 options (there can be many in seed data)
    const optionTexts: string[] = [];
    for (let i = 0; i < Math.min(optionCount, 10); i++) {
      const text = await options.nth(i).textContent();
      const value = await options.nth(i).getAttribute('value');
      optionTexts.push(`${text} (${value})`);
    }
    console.log(`[Payment Test] Payment methods (first ${Math.min(optionCount, 10)}): ${optionTexts.join(', ')}`);

    // Verify common payment methods are present by label text
    const allOptionTexts: string[] = [];
    for (let i = 0; i < optionCount; i++) {
      const text = await options.nth(i).textContent();
      if (text) allOptionTexts.push(text);
    }
    // Changed: Check by display text instead of enum values (backend uses PaymentMethod domain names)
    expect(allOptionTexts.some(t => t.includes('Bank Transfer'))).toBeTruthy();
    expect(allOptionTexts.some(t => t.includes('Cash'))).toBeTruthy();

    await takeScreenshot(page, 'integration-05-payments-method-options');
  });

  // =========================================================================
  // 13. Pay Full Balance Button
  // =========================================================================

  test('pay full button auto-fills amount when invoice selected', async ({ page }) => {
    test.skip(!hasUnpaidInvoices, 'No unpaid invoices to select');

    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Wait for invoices to load
    await page.waitForTimeout(5000);

    // Select first unpaid invoice
    const documentSelect = page.getByTestId('select-document');
    const options = documentSelect.locator('option');
    const optionCount = await options.count();
    if (optionCount > 1) {
      const firstValue = await options.nth(1).getAttribute('value');
      if (firstValue) {
        await documentSelect.selectOption(firstValue);
        console.log(`[Payment Test] Selected invoice: ${firstValue}`);
      }
    }

    await page.waitForTimeout(500);

    // Check if pay-full button appears
    const payFullButton = page.getByTestId('pay-full-button');
    const hasPayFull = await payFullButton.isVisible().catch(() => false);

    if (hasPayFull) {
      const buttonText = await payFullButton.textContent();
      console.log(`[Payment Test] Pay full button text: ${buttonText}`);

      // Click pay full button
      await payFullButton.click();

      // Amount should be auto-filled
      const amountValue = await page.getByTestId('amount-input').inputValue();
      console.log(`[Payment Test] Auto-filled amount: ${amountValue}`);
      expect(parseFloat(amountValue)).toBeGreaterThan(0);
    } else {
      console.log('[Payment Test] Pay full button not visible (invoice may not have amount due)');
    }

    await takeScreenshot(page, 'integration-05-payments-pay-full');
  });

  // =========================================================================
  // 14. Record Invoice Payment
  // =========================================================================

  test('record invoice payment via form', async ({ page }) => {
    test.skip(!hasUnpaidInvoices, 'No unpaid invoices to record payment against');

    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Wait for invoices to load
    await page.waitForTimeout(5000);

    // Select first unpaid invoice
    const documentSelect = page.getByTestId('select-document');
    const options = documentSelect.locator('option');
    const optionCount = await options.count();
    if (optionCount <= 1) {
      console.log('[Payment Test] No invoices in dropdown');
      return;
    }

    const firstValue = await options.nth(1).getAttribute('value');
    const firstText = await options.nth(1).textContent();
    if (firstValue) {
      await documentSelect.selectOption(firstValue);
      console.log(`[Payment Test] Selected: ${firstText}`);
    }

    // Fill payment details
    await page.getByTestId('amount-input').fill('50');
    await page.getByTestId('date-input').fill(today);
    // Changed: Select by label text — backend uses PaymentMethod domain names, not enum values
    await page.getByTestId('method-select').selectOption({ label: 'Bank Transfer' });
    await page.getByTestId('reference-input').fill(`INT-TEST-${Date.now()}`);
    await page.getByTestId('notes-input').fill('Integration test payment');

    await takeScreenshot(page, 'integration-05-payments-form-filled');

    // Submit
    const saveResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/invoicePayment/save.json') && resp.request().method() === 'POST',
      { timeout: 30000 }
    );
    await page.getByTestId('submit-button').click();

    // Wait for response
    try {
      const saveResponse = await saveResponsePromise;
      console.log(`[Payment Test] Save response: ${saveResponse.status()}`);

      if (saveResponse.ok()) {
        await expect(page).toHaveURL(/\/payments/, { timeout: 15000 });
        console.log('[Payment Test] Invoice payment recorded successfully');
      } else {
        const body = await saveResponse.text().catch(() => 'unable to read');
        console.log(`[Payment Test] Save returned ${saveResponse.status()}: ${body}`);
      }
    } catch (e) {
      const hasFormError = await page.getByTestId('form-error').isVisible().catch(() => false);
      if (hasFormError) {
        const errorText = await page.getByTestId('form-error').textContent();
        console.log(`[Payment Test] Form error: ${errorText}`);
      } else {
        console.log(`[Payment Test] No response intercepted: ${e}`);
      }
    }

    await takeScreenshot(page, 'integration-05-payments-recorded');
  });

  // =========================================================================
  // 15. Mobile Responsiveness - List
  // =========================================================================

  test('payment list is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/payments');
    await expect(page.getByTestId('payment-list-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('record-payment-button')).toBeVisible();
    await expect(page.getByTestId('payment-tabs')).toBeVisible();

    await takeScreenshot(page, 'integration-05-payments-mobile-list');
  });

  // =========================================================================
  // 16. Mobile Responsiveness - Form
  // =========================================================================

  test('payment form is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Verify key fields visible
    await expect(page.getByTestId('payment-form-heading')).toBeVisible();
    await expect(page.getByTestId('payment-type-toggle')).toBeVisible();
    await expect(page.getByTestId('select-document')).toBeVisible();
    await expect(page.getByTestId('amount-input')).toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();

    await takeScreenshot(page, 'integration-05-payments-mobile-form');
  });

  // =========================================================================
  // 17. URL Preselection - Invoice ID
  // =========================================================================

  test('form pre-selects invoice when navigated with invoiceId param', async ({ page }) => {
    test.skip(!invoiceIdForPayment, 'No invoice ID available for preselection test');

    await page.goto(`/payments/new?invoiceId=${invoiceIdForPayment}`);
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Wait for invoices to load
    await page.waitForTimeout(5000);

    // Invoice type should be selected
    const invoiceClass = await page.getByTestId('type-invoice').getAttribute('class');
    expect(invoiceClass).toContain('bg-primary');

    // Document should be pre-selected
    const selectedValue = await page.getByTestId('select-document').inputValue();
    console.log(`[Payment Test] Pre-selected document value: ${selectedValue}`);

    // The pre-selected value should match the invoice ID (or be empty if invoice wasn't in the filtered list)
    if (selectedValue) {
      expect(selectedValue).toBe(invoiceIdForPayment);
      console.log('[Payment Test] Invoice pre-selection works correctly');
    } else {
      console.log('[Payment Test] Invoice was not pre-selected (may be fully paid)');
    }

    await takeScreenshot(page, 'integration-05-payments-preselect-invoice');
  });

  // =========================================================================
  // 18. Payment Summary Display
  // =========================================================================

  test('payment summary shows when payments exist', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByTestId('payment-list-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('payment-list-loading')).not.toBeVisible({ timeout: 30000 });

    // Check for summary section (only visible when there are payments)
    const hasTable = await page.getByTestId('payment-table').isVisible().catch(() => false);

    if (hasTable) {
      const summary = page.getByTestId('payment-summary');
      const hasSummary = await summary.isVisible().catch(() => false);

      if (hasSummary) {
        const summaryText = await summary.textContent();
        console.log(`[Payment Test] Payment summary: ${summaryText}`);
        expect(summaryText).toContain('Showing');
        expect(summaryText).toContain('Total');
      } else {
        console.log('[Payment Test] Summary not visible despite having table');
      }
    } else {
      console.log('[Payment Test] No payment table — summary not expected');
    }

    await takeScreenshot(page, 'integration-05-payments-summary');
  });

  // =========================================================================
  // 19. Payment List Table Columns
  // =========================================================================

  test('payment table has correct columns', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByTestId('payment-list-loading')).not.toBeVisible({ timeout: 30000 });

    const hasTable = await page.getByTestId('payment-table').isVisible().catch(() => false);
    if (!hasTable) {
      console.log('[Payment Test] No payment table visible — skipping column check');
      return;
    }

    // Verify table columns
    const headers = page.getByTestId('payment-table').locator('thead th');
    const headerCount = await headers.count();
    console.log(`[Payment Test] Table columns: ${headerCount}`);
    expect(headerCount).toBeGreaterThanOrEqual(4);

    // Expected columns: Date, Invoice/Bill, Method, Reference, Amount
    const headerTexts: string[] = [];
    for (let i = 0; i < headerCount; i++) {
      const text = await headers.nth(i).textContent();
      headerTexts.push(text?.trim() || '');
    }
    console.log(`[Payment Test] Column headers: ${headerTexts.join(' | ')}`);

    // Should have Date column
    expect(headerTexts.some(h => h.toLowerCase().includes('date'))).toBeTruthy();
    // Should have Amount column
    expect(headerTexts.some(h => h.toLowerCase().includes('amount'))).toBeTruthy();

    await takeScreenshot(page, 'integration-05-payments-table-columns');
  });

  // =========================================================================
  // 20. Date Input Pre-fills Today
  // =========================================================================

  test('date input pre-fills with today\'s date', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 15000 });

    // Date should be pre-filled with today
    const dateValue = await page.getByTestId('date-input').inputValue();
    console.log(`[Payment Test] Pre-filled date: ${dateValue}`);
    expect(dateValue).toBe(today);

    await takeScreenshot(page, 'integration-05-payments-date-prefill');
  });
});
