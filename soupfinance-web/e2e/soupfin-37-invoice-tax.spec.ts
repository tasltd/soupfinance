/**
 * SOUPFIN-37 — Invoice save omits line-item tax (and offered a discount it could
 * never store).
 *
 * Reported: creating an invoice with discount 5% and VAT 15% on a GH₵3,000 line showed
 * a preview total of GH₵3,277.50 but saved GH₵3,000.00 with Tax GH₵0.00.
 *
 * Root cause (verified against the Grails domains and the live LXC backend):
 *   - `InvoiceItem` has NO taxRate / discountPercent column. Tax lives in
 *     `TaxEntryInvoiceItem` rows referencing a `TaxEntry`; discount does not exist at all.
 *   - `POST /rest/invoice/save.json` binds indexed `invoiceItemList[n].*` params through
 *     `InvoiceService.applyItemFields()`, which copies only description/quantity/
 *     unitPrice/serviceDescription.id — `taxEntries` is silently dropped.
 *   - The tax dropdown was populated from a hardcoded catalogue whose ids
 *     ("tax-vat-15") have no backend counterpart, so nothing selectable was persistable.
 *
 * These tests prove, through the real UI:
 *   #1 the tax dropdown is populated from /rest/taxEntry/index.json (real TaxEntry rows)
 *   #2 the discount column is gone — the form no longer promises an unstorable total
 *   #3 selecting a tax updates the previewed Tax/Total
 *   #4 saving sends the TaxEntry id to /rest/invoiceItem/save.json, and sends NO
 *      `invoiceItemList[n]` params on the invoice header (the path that dropped tax)
 *   #5 a withholding tax does not inflate the previewed total, matching the backend
 *   #6 a saved invoice's detail total includes its tax
 *
 * Navigation is by sidebar menu click (never a direct route `goto` for an internal
 * page), so the tests also prove each surface is reachable through the UI.
 * Screenshots land in e2e/playwright/screenshots/soupfin-37/ and are committed.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, isLxcMode } from './fixtures';

test.skip(isLxcMode(), 'Mock-only spec: asserts exact request payloads');

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which Playwright
 * wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-37/${name}.png`,
    fullPage: true,
  });
}

/** Verbatim subset of /rest/taxEntry/index.json from the LXC backend. */
const TAX_ENTRIES = [
  {
    id: 'ff8081817fe4ae93017fe5c9cf10017b',
    name: 'CST',
    abbreviation: 'CST',
    description: 'Comsys',
    taxRate: 5.0,
    isTaxable: true,
    serialised: 'CST-5.0%',
  },
  {
    id: 'ff8081817f8e0105017f8ea9ba580014',
    name: 'Value Added Tax -Flat Rate',
    abbreviation: 'VAT-FR',
    taxRate: 15.0,
    serialised: 'VAT-FR-15.0%',
  },
  {
    id: 'ff8081817f6b33e7017f6d575b310005',
    name: 'Withholding Tax-Services',
    abbreviation: 'WHT-S',
    taxRate: 7.5,
    isWithholdingTax: true,
    serialised: 'WHT-S-7.5%',
  },
  // Compound taxes are filtered out — the backend computes them on top of other taxes.
  {
    id: 'ff80818186941f2701869cb315b11dda',
    name: 'VAT- STANDARD',
    abbreviation: 'VAT-S',
    taxRate: 15.0,
    isCompoundTax: true,
    serialised: 'VAT-S-15.0%',
  },
];

const VAT_ID = 'ff8081817f8e0105017f8ea9ba580014';
const WHT_ID = 'ff8081817f6b33e7017f6d575b310005';

const CLIENTS = [
  {
    id: 'client-1',
    name: 'Acme Corporation',
    clientType: 'CORPORATE',
    portfolioList: [{ id: 'portfolio-1', class: 'soupbroker.kyc.ClientPortfolio' }],
  },
];

/** Captured outbound writes, so the tests can assert the real payloads. */
interface Captured {
  invoiceSaves: Record<string, unknown>[];
  itemSaves: Record<string, unknown>[];
}

async function setupMockAuth(page: Page) {
  await page.addInitScript(() => {
    const mockUser = {
      username: 'admin',
      email: 'admin@soupfinance.com',
      roles: ['ROLE_ADMIN', 'ROLE_USER'],
      tenantId: 'account-001',
    };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { user: mockUser, isAuthenticated: true, isInitialized: true },
        version: 0,
      })
    );
  });
}

/**
 * Common mocks + landing on the dashboard, which is the only direct URL these tests
 * use. Everything after this happens through sidebar menu clicks.
 */
async function signInAndLand(page: Page): Promise<Captured> {
  const captured: Captured = { invoiceSaves: [], itemSaves: [] };

  await setupMockAuth(page);

  // Catch-all FIRST so it has the lowest precedence (Playwright routes are LIFO).
  await page.route('**/rest/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await mockTokenValidationApi(page, true);

  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'account-001', name: 'Test Company', currency: 'GHS' }),
    })
  );

  // #1 — the real TaxEntry catalogue.
  await page.route('**/rest/taxEntry/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TAX_ENTRIES) })
  );

  await page.route('**/rest/client/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CLIENTS) })
  );
  await page.route('**/rest/clientPortfolio/show/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'portfolio-1',
        accountServices: { id: 'as-1', serialised: 'Direct Account : Corporate(Acme Corporation)' },
      }),
    })
  );

  // CSRF token endpoints.
  await page.route('**/rest/*/create.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/uri' }),
    })
  );

  // #4 — capture the invoice header save.
  await page.route('**/rest/invoice/save.json*', async (route) => {
    captured.invoiceSaves.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'inv-new', number: 5 }),
    });
  });

  // #4 — capture each line-item save. This is the endpoint that persists tax.
  await page.route('**/rest/invoiceItem/save.json*', async (route) => {
    captured.itemSaves.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: `item-${captured.itemSaves.length}` }),
    });
  });

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');

  return captured;
}

/** Click a top-level sidebar entry by its visible label. */
async function clickNav(page: Page, label: string) {
  await page.locator('nav > div > a', { hasText: label }).first().click();
  await page.waitForLoadState('domcontentloaded');
}

/** Reach the New Invoice form the way a user does: sidebar → Invoices → New Invoice. */
async function openNewInvoiceForm(page: Page) {
  await clickNav(page, 'Invoices');
  await expect(page.getByRole('heading', { name: /invoice/i }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('link', { name: /new invoice|create invoice|add invoice/i }).first().click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('invoice-item-description-0')).toBeVisible({ timeout: 15000 });
}

/** Fill the client + dates + the reported line (Advisory, qty 2 @ 1500). */
async function fillReportedInvoice(page: Page) {
  await page.getByTestId('invoice-client-select').selectOption('client-1');

  const due = page.getByTestId('invoice-due-date-input');
  await due.fill('2026-09-04');

  await page.getByTestId('invoice-item-description-0').fill('Advisory');
  await page.getByTestId('invoice-item-quantity-0').fill('2');
  await page.getByTestId('invoice-item-unitPrice-0').fill('1500');
}

test.describe('SOUPFIN-37 — invoice line-item tax', () => {
  test('#1 tax dropdown is populated from the real TaxEntry catalogue', async ({ page }) => {
    await signInAndLand(page);
    await openNewInvoiceForm(page);
    await shot(page, 'new-invoice-form-loaded');

    const taxSelect = page.getByTestId('invoice-item-taxRate-0');
    await expect(taxSelect).toBeVisible();

    const optionValues = await taxSelect.locator('option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value)
    );

    // Real backend UUIDs, never the old synthetic ids.
    expect(optionValues).toContain(VAT_ID);
    expect(optionValues.some((v) => v.startsWith('tax-'))).toBe(false);

    // Compound taxes are excluded; "No Tax" is the empty sentinel.
    expect(optionValues).toContain('');
    expect(optionValues).not.toContain('ff80818186941f2701869cb315b11dda');

    await shot(page, 'tax-dropdown-real-entries');
  });

  test('#2 the discount column the backend cannot store is gone', async ({ page }) => {
    await signInAndLand(page);
    await openNewInvoiceForm(page);

    await expect(page.getByTestId('invoice-item-discountPercent-0')).toHaveCount(0);
    await expect(page.getByTestId('invoice-discount')).toHaveCount(0);

    await shot(page, 'no-discount-column');
  });

  test('#3 selecting a tax updates the previewed Tax and Total', async ({ page }) => {
    await signInAndLand(page);
    await openNewInvoiceForm(page);
    await fillReportedInvoice(page);

    // Before: subtotal only.
    await expect(page.getByTestId('invoice-subtotal')).toContainText('3,000.00');
    await expect(page.getByTestId('invoice-tax')).toContainText('0.00');
    await shot(page, 'preview-before-tax');

    await page.getByTestId('invoice-item-taxRate-0').selectOption(VAT_ID);

    // After: 15% of 3,000 = 450 → total 3,450.
    await expect(page.getByTestId('invoice-tax')).toContainText('450.00');
    await expect(page.getByTestId('invoice-total')).toContainText('3,450.00');
    await shot(page, 'preview-after-tax');
  });

  test('#4 saving sends the TaxEntry id to the item endpoint, not as invoiceItemList params', async ({ page }) => {
    const captured = await signInAndLand(page);
    await openNewInvoiceForm(page);
    await fillReportedInvoice(page);
    await page.getByTestId('invoice-item-taxRate-0').selectOption(VAT_ID);
    await shot(page, 'form-filled-with-tax');

    await page.getByTestId('invoice-form-save-draft-button').click();

    // The invoice header POST must land...
    await expect.poll(() => captured.invoiceSaves.length, { timeout: 15000 }).toBe(1);
    // ...and the line item must be written through the endpoint that persists tax.
    await expect.poll(() => captured.itemSaves.length, { timeout: 15000 }).toBe(1);

    const header = captured.invoiceSaves[0];
    const item = captured.itemSaves[0];

    // Regression guard for the ROOT CAUSE: indexed line-item params on the invoice
    // header are the path that silently discarded tax.
    expect(JSON.stringify(header)).not.toContain('invoiceItemList[0]');
    expect(JSON.stringify(header)).not.toContain('taxEntries');
    expect(header.accountServices).toEqual({ id: 'as-1' });

    // The tax rides on the line item, as a real TaxEntry id.
    expect(item).toMatchObject({
      invoice: { id: 'inv-new' },
      description: 'Advisory',
      quantity: 2,
      unitPrice: 1500,
      taxEntries: VAT_ID,
    });

    await shot(page, 'after-save-with-tax');
  });

  test('#5 withholding tax does not inflate the previewed total', async ({ page }) => {
    await signInAndLand(page);
    await openNewInvoiceForm(page);
    await fillReportedInvoice(page);

    await page.getByTestId('invoice-item-taxRate-0').selectOption(WHT_ID);

    // InvoiceItem.getTaxAmount() filters withholding entries out of the invoice total,
    // so the preview must not add them either.
    await expect(page.getByTestId('invoice-tax')).toContainText('0.00');
    await expect(page.getByTestId('invoice-total')).toContainText('3,000.00');

    await shot(page, 'withholding-excluded-from-total');
  });

  test('#6 a saved invoice shows a total that includes its tax', async ({ page }) => {
    await setupMockAuth(page);
    await page.route('**/rest/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await mockTokenValidationApi(page, true);
    await page.route('**/account/show/*.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'account-001', name: 'Test Company', currency: 'GHS' }),
      })
    );

    // The reported invoice #5: 2 x 1500 with VAT. The backend returns items with the
    // tax rows as bare FK references — the amount lives inside `serialised`.
    await page.route('**/rest/invoice/index.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'inv-5',
            number: 5,
            invoiceDate: '2026-08-04T00:00:00Z',
            paymentDate: '2026-09-04T00:00:00Z',
            accountServices: { id: 'as-1', serialised: 'Direct Account : Corporate(Acme Corporation)' },
            invoiceItemList: [
              {
                id: 'ii-1',
                quantity: 2,
                unitPrice: 1500,
                taxEntryInvoiceItemList: [
                  {
                    id: 'tx-1',
                    serialised:
                      'TaxEntryInvoiceItem(InvoiceItem(quantity:2.0, unitPrice:1500.00, ' +
                      'invoice:Invoice(number:5, total:3000.00)), VAT-FR-15.0%, 450.0, 3450.0)',
                  },
                ],
              },
            ],
            invoicePaymentList: [],
          },
        ]),
      })
    );

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await clickNav(page, 'Invoices');

    await expect(page.getByRole('heading', { name: /invoice/i }).first()).toBeVisible({ timeout: 15000 });

    // Before the fix this row rendered 3,000.00 — the subtotal, ignoring the 450 tax.
    await expect(page.getByText('3,450.00').first()).toBeVisible({ timeout: 15000 });

    await shot(page, 'invoice-list-total-includes-tax');
  });
});
