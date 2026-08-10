/**
 * Invoice line-item tax persistence — integration test (SOUPFIN-37)
 * Runs against the REAL LXC backend. No mocks.
 *
 * WHAT THIS PROVES
 * ----------------
 * The reported defect was silent financial data loss: the invoice form
 * previewed a taxed total, but the saved invoice stored the bare subtotal.
 *
 * A UI-only assertion cannot catch that — the form's own preview was never
 * the thing that was broken. So this test performs the interaction through
 * the UI, then reads the persisted state back off the API and asserts the
 * backend actually holds the tax.
 *
 * Root cause, for the next reader: line items used to be sent as
 * `invoiceItemList[N].*` params on /rest/invoice/save.json, and
 * InvoiceService.applyItemFields() copies only description/quantity/
 * unitPrice/serviceDescription off those — tax was dropped on the floor.
 * They are now POSTed to /rest/invoiceItem/save.json, which binds
 * `taxEntries` and computes taxAmount = amount * taxRate/100.
 *
 * Navigation is by menu click throughout, per the E2E rules; only the
 * initial login URL is visited directly.
 */
import { test, expect, type Page } from '@playwright/test';
import { backendTestUsers, takeScreenshot } from '../fixtures';

const API_BASE = 'http://10.115.213.183:9090';

const SHOT = 'invoice-tax';

async function getAuthToken(page: Page): Promise<string> {
  // Dual-storage: remember-me writes to localStorage, otherwise sessionStorage.
  return await page.evaluate(
    () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);

  const rememberCheckbox = page.getByTestId('login-remember-checkbox');
  if (await rememberCheckbox.isVisible().catch(() => false)) {
    await rememberCheckbox.check();
  }

  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

/**
 * Save the invoice, retrying once if the app's own 30s axios timeout fires.
 *
 * Not papering over a defect in this change: GET /rest/invoice/create.json —
 * the CSRF fetch that every invoice save has always begun with — takes a
 * measured 21-24s against the LXC seed database, leaving almost no headroom
 * under the client's 30s timeout. The saves themselves are fast (~0.2s).
 * Filed separately; retried here so this test measures tax persistence rather
 * than backend latency.
 */
async function saveDraftWithRetry(page: Page, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await page.getByTestId('invoice-form-save-draft-button').click();

    const navigated = await page
      .waitForURL(/\/invoices$/, { timeout: 90000 })
      .then(() => true)
      .catch(() => false);
    if (navigated) return;

    const timedOut = await page
      .getByText(/timeout of \d+ms exceeded/i)
      .isVisible()
      .catch(() => false);
    if (!timedOut) {
      // A real validation/server error — surface it rather than retry blindly.
      const banner = await page
        .getByTestId('invoice-form-error-message')
        .textContent()
        .catch(() => null);
      throw new Error(`Invoice save failed without a timeout. Banner: ${banner ?? '(none)'}`);
    }
    console.log(`Save attempt ${attempt} hit the client timeout; retrying.`);
  }
  throw new Error(`Invoice save did not complete after ${attempts} attempts.`);
}

/** The auth gate renders before content; never use networkidle on this backend. */
async function waitForAuthSettled(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForFunction(() => !document.body.textContent?.includes('Verifying authentication'), {
      timeout: 20000,
    })
    .catch(() => {});
}

test.describe('Invoice line-item tax persistence (SOUPFIN-37)', () => {
  test.describe.configure({ mode: 'serial' });

  test('a taxed invoice created through the UI persists its tax on the backend', async ({
    page,
  }) => {
    test.setTimeout(180000);

    // ---- 1. Sign in -----------------------------------------------------
    await loginAsAdmin(page);
    await takeScreenshot(page, `${SHOT}-01-logged-in`);

    const token = await getAuthToken(page);
    expect(token, 'auth token must be present after login').toBeTruthy();

    // ---- 2. Reach the invoice form by clicking the menu ------------------
    // Menu click, not a direct goto. Matched by href because the label sits
    // next to a Material Symbols span whose ligature text pollutes the
    // accessible name ("receipt_longInvoices").
    await page.locator('aside a[href="/invoices"]').first().click();
    await waitForAuthSettled(page);
    await expect(page).toHaveURL(/\/invoices/, { timeout: 20000 });
    await takeScreenshot(page, `${SHOT}-02-invoice-list`);

    await page.getByTestId('invoice-new-button').click();
    await waitForAuthSettled(page);
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 20000 });
    await takeScreenshot(page, `${SHOT}-03-new-invoice-form`);

    // ---- 3. The tax dropdown must offer real TaxEntry ids ----------------
    // Synthetic ids (the old `tax-vat-15` style) are exactly what made the
    // tax unsaveable, so assert they are gone.
    const taxSelect = page.getByTestId('invoice-item-taxRate-0');
    await expect(taxSelect).toBeVisible({ timeout: 20000 });

    await expect
      .poll(async () => (await taxSelect.locator('option').count()), { timeout: 30000 })
      .toBeGreaterThan(1);

    const taxOptions = await taxSelect.locator('option').evaluateAll((opts) =>
      opts.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent || '' }))
    );
    console.log('Tax options:', JSON.stringify(taxOptions));

    expect(
      taxOptions.some((o) => o.value.startsWith('tax-')),
      'synthetic tax ids must be gone — they cannot resolve to a backend TaxEntry'
    ).toBe(false);

    // Pick a real, non-empty tax option and read its percentage off the label.
    const taxable = taxOptions.find((o) => o.value && /\(([\d.]+)%\)/.test(o.label));
    expect(taxable, 'expected at least one real TaxEntry option').toBeTruthy();
    const taxRate = parseFloat(taxable!.label.match(/\(([\d.]+)%\)/)![1]);
    expect(taxRate).toBeGreaterThan(0);

    // ---- 4. The discount input must be gone ------------------------------
    // It reduced the previewed total by an amount the backend cannot store.
    await expect(page.getByTestId('invoice-item-discountPercent-0')).toHaveCount(0);

    // ---- 5. Fill the form ------------------------------------------------
    const clientSelect = page.getByTestId('invoice-client-select');
    await expect
      .poll(async () => (await clientSelect.locator('option').count()), { timeout: 30000 })
      .toBeGreaterThan(1);

    const clientValue = await clientSelect
      .locator('option')
      .nth(1)
      .evaluate((o) => (o as HTMLOptionElement).value);
    await clientSelect.selectOption(clientValue);

    const dueDate = page.getByTestId('invoice-due-date-input');
    await dueDate.fill('2026-09-30');

    const poNumber = `PO-SOUPFIN37-${Date.now()}`;
    const poInput = page.getByTestId('invoice-po-number-input');
    if (await poInput.isVisible().catch(() => false)) {
      await poInput.fill(poNumber);
    }

    const QUANTITY = 2;
    const UNIT_PRICE = 1500;
    const EXPECTED_SUBTOTAL = QUANTITY * UNIT_PRICE; // 3000
    const EXPECTED_TAX = (EXPECTED_SUBTOTAL * taxRate) / 100;

    await page.getByTestId('invoice-item-description-0').fill('Advisory (SOUPFIN-37)');
    await page.getByTestId('invoice-item-quantity-0').fill(String(QUANTITY));
    await page.getByTestId('invoice-item-unitPrice-0').fill(String(UNIT_PRICE));
    await taxSelect.selectOption(taxable!.value);

    await takeScreenshot(page, `${SHOT}-04-form-filled-with-tax`);

    // The preview must already reflect subtotal + tax (and no discount row).
    await expect(page.getByTestId('invoice-tax')).not.toHaveText(/^[^0-9]*0\.00$/, {
      timeout: 10000,
    });
    await expect(page.getByTestId('invoice-discount')).toHaveCount(0);

    // ---- 6. Capture backend state BEFORE, then save ----------------------
    const beforeResp = await page.request.get(`${API_BASE}/rest/invoice/index.json?max=1`, {
      headers: { 'X-Auth-Token': token },
      maxRedirects: 0,
    });
    expect(beforeResp.ok()).toBeTruthy();

    // Save navigates back to the list once the invoice AND its items are in.
    await saveDraftWithRetry(page);
    await waitForAuthSettled(page);
    await takeScreenshot(page, `${SHOT}-05-saved-invoice-list`);

    // ---- 7. Assert the PERSISTED state, not the UI -----------------------
    // This is the assertion the original bug would have failed.
    const listResp = await page.request.get(
      `${API_BASE}/rest/invoice/index.json?max=5&sort=dateCreated&order=desc`,
      { headers: { 'X-Auth-Token': token }, maxRedirects: 0, timeout: 45000 }
    );
    expect(listResp.ok()).toBeTruthy();
    const listBody = await listResp.json();
    const invoices = Array.isArray(listBody) ? listBody : listBody.instanceList || [];
    expect(invoices.length).toBeGreaterThan(0);

    const created = invoices[0];
    console.log('Created invoice:', created.id, created.serialised);

    // Find its line item and read the tax join rows the backend created.
    const itemsResp = await page.request.get(
      `${API_BASE}/rest/invoiceItem/index.json?invoice.id=${created.id}&max=10`,
      { headers: { 'X-Auth-Token': token }, maxRedirects: 0, timeout: 45000 }
    );
    expect(itemsResp.ok()).toBeTruthy();
    const itemsBody = await itemsResp.json();
    const items = Array.isArray(itemsBody) ? itemsBody : itemsBody.instanceList || [];

    expect(items.length, 'the invoice must have persisted its line item').toBeGreaterThan(0);
    const item = items[0];
    console.log('Persisted item:', JSON.stringify(item.serialised));

    const joinRows = item.taxEntryInvoiceItemList || [];
    expect(
      joinRows.length,
      'the line item must be linked to a TaxEntry — this is the SOUPFIN-37 regression'
    ).toBeGreaterThan(0);

    // The tax amount is embedded in the serialised join row as the 3rd field:
    // TaxEntryInvoiceItem(InvoiceItem(...), NHIL-2.5%, 75.0, 3075.0)
    const joinSerialised: string = joinRows[0].serialised || '';
    const amounts = joinSerialised.match(/,\s*([\d.]+),\s*([\d.]+)\)\s*$/);
    expect(amounts, `could not parse tax amounts from: ${joinSerialised}`).toBeTruthy();

    const persistedTaxAmount = parseFloat(amounts![1]);
    console.log(
      `Persisted tax: ${persistedTaxAmount} (expected ~${EXPECTED_TAX} at ${taxRate}%)`
    );

    // The core assertion. Before the fix this was always exactly 0.
    expect(
      persistedTaxAmount,
      'saved tax must be non-zero — zero means the tax was discarded again'
    ).toBeGreaterThan(0);
    expect(persistedTaxAmount).toBeCloseTo(EXPECTED_TAX, 1);

    await takeScreenshot(page, `${SHOT}-06-verified-persisted-tax`);
  });

  test('an untaxed invoice saves cleanly with no tax rows', async ({ page }) => {
    // Edge case: "No Tax" must omit taxEntries entirely rather than sending an
    // empty value, which would trip the controller's iteration over the set.
    test.setTimeout(180000);

    await loginAsAdmin(page);
    const token = await getAuthToken(page);

    // Menu click, not a direct goto. Matched by href because the label sits
    // next to a Material Symbols span whose ligature text pollutes the
    // accessible name ("receipt_longInvoices").
    await page.locator('aside a[href="/invoices"]').first().click();
    await waitForAuthSettled(page);
    await page.getByTestId('invoice-new-button').click();
    await waitForAuthSettled(page);
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 20000 });

    const clientSelect = page.getByTestId('invoice-client-select');
    await expect
      .poll(async () => (await clientSelect.locator('option').count()), { timeout: 30000 })
      .toBeGreaterThan(1);
    const clientValue = await clientSelect
      .locator('option')
      .nth(1)
      .evaluate((o) => (o as HTMLOptionElement).value);
    await clientSelect.selectOption(clientValue);

    await page.getByTestId('invoice-due-date-input').fill('2026-09-30');
    await page.getByTestId('invoice-item-description-0').fill('Untaxed line (SOUPFIN-37)');
    await page.getByTestId('invoice-item-quantity-0').fill('1');
    await page.getByTestId('invoice-item-unitPrice-0').fill('250');
    // Leave the tax select on its default "No Tax" (empty id).

    await takeScreenshot(page, `${SHOT}-07-untaxed-form`);

    await saveDraftWithRetry(page);
    await waitForAuthSettled(page);

    const listResp = await page.request.get(
      `${API_BASE}/rest/invoice/index.json?max=5&sort=dateCreated&order=desc`,
      { headers: { 'X-Auth-Token': token }, maxRedirects: 0, timeout: 45000 }
    );
    expect(listResp.ok()).toBeTruthy();
    const listBody = await listResp.json();
    const invoices = Array.isArray(listBody) ? listBody : listBody.instanceList || [];
    const created = invoices[0];

    const itemsResp = await page.request.get(
      `${API_BASE}/rest/invoiceItem/index.json?invoice.id=${created.id}&max=10`,
      { headers: { 'X-Auth-Token': token }, maxRedirects: 0, timeout: 45000 }
    );
    const itemsBody = await itemsResp.json();
    const items = Array.isArray(itemsBody) ? itemsBody : itemsBody.instanceList || [];

    // The item still persists — an untaxed line is valid, not a failure.
    expect(items.length, 'the untaxed line item must still be saved').toBeGreaterThan(0);
    const joinRows = items[0].taxEntryInvoiceItemList || [];
    expect(joinRows.length, 'an untaxed line must have no tax join rows').toBe(0);

    await takeScreenshot(page, `${SHOT}-08-untaxed-verified`);
  });
});
