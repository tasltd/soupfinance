/**
 * SOUPFIN-168 — several taxes on one invoice line.
 *
 * Ghana invoices stack NHIL 2.5% + GETFund 2.5% + VAT 15% on the same line, and
 * the backend stores one TaxEntryInvoiceItem row per tax. The form held a single
 * tax per line, so a line saved with three came back with one.
 *
 * Proved here through the UI, with the outbound payloads captured:
 *   #1 a new line takes three taxes, previews 1,245 on 6,000 (VAT charged on top of
 *      the levies, as the backend computes it) and sends all three ids
 *   #2 editing a saved three-tax line shows all three; dropping one sends the rest
 *      on the invoice update as `invoiceItemList[0].taxEntries`, and never goes
 *      through /invoiceItem/update (which cannot bind taxEntries, SOUPFIN-40)
 *   #3 an untouched saved line sends no tax key, so its taxes are left alone
 *   #4 a saved tax the form cannot identify is flagged, and its stored amount kept
 *
 * Navigation is by sidebar and link clicks only; the dashboard is the one direct URL.
 * Screenshots land in e2e/playwright/screenshots/soupfin-168/ and are committed.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, isLxcMode } from './fixtures';

test.skip(isLxcMode(), 'Mock-only spec: asserts exact request payloads');

/** Tracked directory: the shared takeScreenshot helper writes to the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-168/${name}.png`,
    fullPage: true,
  });
}

const NHIL = 'ff80818173ca7d260173ca8249e70001';
const GETFL = 'ff80818173ca7d260173ca82dcc00002';
const VAT = 'ff80818186941f2701869cb315b11dda';
const WHT = 'ff80818184426bb30184427c12500019';

/** Verbatim subset of /rest/taxEntry/index.json on the LXC backend, 13 Oct 2026. */
const TAX_ENTRIES = [
  { id: VAT, name: 'VAT- STANDARD', abbreviation: 'VAT-S', taxRate: 15.0, isCompoundTax: true, serialised: 'VAT-S-15.0%' },
  { id: GETFL, name: 'GETFund Levy', abbreviation: 'GETFL', taxRate: 2.5, isTaxable: true, serialised: 'GETFL-2.5%' },
  { id: NHIL, name: 'National Health Insurance Levy', abbreviation: 'NHIL', taxRate: 2.5, isTaxable: true, serialised: 'NHIL-2.5%' },
  { id: WHT, name: 'WHT', abbreviation: 'WHT', taxRate: 3.0, isWithholdingTax: true, serialised: 'WHT-3.0%' },
];

const CLIENTS = [
  {
    id: 'client-1',
    name: 'Acme Corporation',
    clientType: 'CORPORATE',
    portfolioList: [{ id: 'portfolio-1', class: 'soupbroker.kyc.ClientPortfolio' }],
  },
];
const ACCOUNT_SERVICES = { id: 'as-1', serialised: 'Direct Account : Corporate(Acme Corporation)' };

/** A bare join row exactly as /rest/invoiceItem/index.json renders it on LXC. */
function bareRow(label: string, taxAmount: number) {
  return {
    id: `row-${label}`,
    class: 'soupbroker.finance.TaxEntryInvoiceItem',
    serialised: `TaxEntryInvoiceItem(InvoiceItem(quantity:2.0, unitPrice:3000.00, invoice:Invoice(number:2025028, total:0.00)), ${label}, ${taxAmount}, ${6000 + taxAmount})`,
  };
}

/** The three rows LXC stored for 2 × 3,000 with NHIL + GETFund + VAT-S. */
const STACKED_ROWS = [bareRow('NHIL-2.5%', 150), bareRow('GETFL-2.5%', 150), bareRow('VAT-S-15.0%', 945)];

function savedInvoice(rows: ReturnType<typeof bareRow>[]) {
  return {
    id: 'inv-1',
    number: 2025028,
    accountServices: { ...ACCOUNT_SERVICES, class: 'soupbroker.kyc.AccountServices' },
    invoiceDate: '2026-10-13T00:00:00Z',
    paymentDate: '2026-11-12T00:00:00Z',
    notes: 'SOUPFIN-168',
    invoicePaymentList: [],
    invoiceItemList: [
      {
        id: 'item-1',
        description: 'Advisory',
        quantity: 2,
        unitPrice: 3000,
        invoice: { id: 'inv-1' },
        taxEntryInvoiceItemList: rows,
      },
    ],
  };
}

interface Captured {
  invoiceSaves: Record<string, unknown>[];
  invoiceUpdates: Record<string, unknown>[];
  itemSaves: Record<string, unknown>[];
  itemUpdates: number;
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
      JSON.stringify({ state: { user: mockUser, isAuthenticated: true, isInitialized: true }, version: 0 })
    );
  });
}

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** Mocks + land on the dashboard. `invoice` is the saved invoice the list and edit pages serve. */
async function signInAndLand(page: Page, invoice = savedInvoice(STACKED_ROWS)): Promise<Captured> {
  const captured: Captured = { invoiceSaves: [], invoiceUpdates: [], itemSaves: [], itemUpdates: 0 };
  await setupMockAuth(page);

  // Catch-all first: Playwright matches the most recently registered route first.
  await page.route('**/rest/**', (route) => route.fulfill(json([])));
  await mockTokenValidationApi(page, true);
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill(json({ id: 'account-001', name: 'Test Company', currency: 'GHS' }))
  );
  await page.route('**/rest/taxEntry/index.json*', (route) => route.fulfill(json(TAX_ENTRIES)));
  await page.route('**/rest/clientPortfolio/show/*', (route) =>
    route.fulfill(json({ id: 'portfolio-1', accountServices: ACCOUNT_SERVICES }))
  );
  // The edit page finds the invoice's client by matching this FK through portfolioList.
  await page.route('**/rest/client/index.json*', (route) =>
    route.fulfill(
      json([{ ...CLIENTS[0], portfolioList: [{ id: 'portfolio-1', accountServices: ACCOUNT_SERVICES }] }])
    )
  );

  await page.route('**/rest/invoice/index.json*', (route) => route.fulfill(json([invoice])));
  await page.route('**/rest/invoice/show/*', (route) => route.fulfill(json(invoice)));
  await page.route('**/rest/invoiceItem/index.json*', (route) => route.fulfill(json(invoice.invoiceItemList)));

  await page.route('**/rest/*/create.json*', (route) =>
    route.fulfill(json({ SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/uri' }))
  );
  await page.route('**/rest/invoice/save.json*', async (route) => {
    captured.invoiceSaves.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill(json({ id: 'inv-new', number: 5 }, 201));
  });
  await page.route('**/rest/invoice/update/*', async (route) => {
    captured.invoiceUpdates.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill(json(invoice));
  });
  await page.route('**/rest/invoiceItem/save.json*', async (route) => {
    captured.itemSaves.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill(json({ id: `item-new-${captured.itemSaves.length}` }, 201));
  });
  await page.route('**/rest/invoiceItem/update/*', async (route) => {
    captured.itemUpdates += 1;
    await route.fulfill(json({}));
  });

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
  return captured;
}

async function openInvoices(page: Page) {
  await page.locator('nav > div > a', { hasText: 'Invoices' }).first().click();
  await expect(page.getByTestId('invoice-list-page')).toBeVisible({ timeout: 15000 });
}

async function openNewInvoiceForm(page: Page) {
  await openInvoices(page);
  await page.getByTestId('invoice-new-button').click();
  await expect(page.getByTestId('invoice-item-description-0')).toBeVisible({ timeout: 15000 });
}

async function openEditForm(page: Page) {
  await openInvoices(page);
  await page.getByTestId('invoice-edit-inv-1').click();
  await expect(page.getByTestId('invoice-item-description-0')).toHaveValue('Advisory', { timeout: 15000 });
}

/** Tick `ids` on line 0 in the given order. Leaves the menu open for the screenshot. */
async function tickTaxes(page: Page, ids: string[]) {
  await page.getByTestId('invoice-item-tax-0-toggle').click();
  for (const id of ids) {
    await page.getByTestId(`invoice-item-tax-0-option-${id}`).check();
  }
}

test.describe('SOUPFIN-168 — several taxes on one invoice line', () => {
  test('#1 a new line takes NHIL + GETFund + VAT, previews 1,245 and sends all three', async ({ page }) => {
    const captured = await signInAndLand(page);
    await openNewInvoiceForm(page);
    await shot(page, 'new-form-no-tax');

    await page.getByTestId('invoice-client-select').selectOption('client-1');
    await page.getByTestId('invoice-due-date-input').fill('2026-11-12');
    await page.getByTestId('invoice-item-description-0').fill('Advisory');
    await page.getByTestId('invoice-item-quantity-0').fill('2');
    await page.getByTestId('invoice-item-unitPrice-0').fill('3000');
    await expect(page.getByTestId('invoice-item-tax-0-empty')).toHaveText('No Tax');

    await tickTaxes(page, [NHIL, GETFL, VAT]);
    // Withholding is never offered: the payer deducts it, it is not charged.
    await expect(page.getByTestId(`invoice-item-tax-0-option-${WHT}`)).toHaveCount(0);
    await shot(page, 'menu-three-taxes-ticked');
    await page.getByTestId('invoice-item-tax-0-done').click();
    await expect(page.getByTestId('invoice-item-tax-0-menu')).toHaveCount(0);

    for (const id of [NHIL, GETFL, VAT]) {
      await expect(page.getByTestId(`invoice-item-tax-0-chip-${id}`)).toBeVisible();
    }
    // 6,000 → NHIL 150 + GETFund 150 + VAT 15% of 6,300 = 945
    await expect(page.getByTestId('invoice-subtotal')).toContainText('6,000.00');
    await expect(page.getByTestId('invoice-tax')).toContainText('1,245.00');
    await expect(page.getByTestId('invoice-total')).toContainText('7,245.00');
    await shot(page, 'chips-and-stacked-preview');

    await page.getByTestId('invoice-form-save-draft-button').click();
    await expect.poll(() => captured.itemSaves.length, { timeout: 15000 }).toBe(1);

    expect(captured.itemSaves[0]).toMatchObject({
      invoice: { id: 'inv-new' },
      description: 'Advisory',
      quantity: 2,
      unitPrice: 3000,
      taxEntries: `${NHIL},${GETFL},${VAT}`,
    });
    await expect(page).toHaveURL(/\/invoices$/);
    await shot(page, 'after-save-three-taxes');
  });

  test('#2 editing a saved three-tax line keeps all three; dropping one updates it in place', async ({ page }) => {
    const captured = await signInAndLand(page);
    await openEditForm(page);

    for (const id of [NHIL, GETFL, VAT]) {
      await expect(page.getByTestId(`invoice-item-tax-0-chip-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('invoice-tax')).toContainText('1,245.00');
    await shot(page, 'edit-hydrated-three-taxes');

    await page.getByTestId(`invoice-item-tax-0-remove-${GETFL}`).click();
    await expect(page.getByTestId(`invoice-item-tax-0-chip-${GETFL}`)).toHaveCount(0);
    // 6,000 → NHIL 150 + VAT 15% of 6,150 = 922.50
    await expect(page.getByTestId('invoice-tax')).toContainText('1,072.50');
    await shot(page, 'edit-getfund-removed');

    await page.getByTestId('invoice-form-save-draft-button').click();
    await expect.poll(() => captured.invoiceUpdates.length, { timeout: 15000 }).toBe(1);

    const update = captured.invoiceUpdates[0];
    expect(update['invoiceItemList[0].id']).toBe('item-1');
    expect(update['invoiceItemList[0].taxEntries']).toBe(`${NHIL},${VAT}`);
    // Never re-created, and never through the PUT that cannot bind taxEntries.
    expect(captured.itemSaves).toHaveLength(0);
    expect(captured.itemUpdates).toBe(0);
    await shot(page, 'edit-after-save');
  });

  test('#3 an untouched saved line sends no tax key, so its taxes are left alone', async ({ page }) => {
    const captured = await signInAndLand(page);
    await openEditForm(page);
    await expect(page.getByTestId(`invoice-item-tax-0-chip-${VAT}`)).toBeVisible();

    await page.getByTestId('invoice-notes-textarea').fill('Only the notes changed');
    await page.getByTestId('invoice-form-save-draft-button').click();
    await expect.poll(() => captured.invoiceUpdates.length, { timeout: 15000 }).toBe(1);

    const update = captured.invoiceUpdates[0];
    expect(update.notes).toBe('Only the notes changed');
    expect(Object.keys(update)).not.toContain('invoiceItemList[0].taxEntries');
    expect(captured.itemSaves).toHaveLength(0);
  });

  test('#4 a saved tax the form cannot show is flagged and its stored amount kept', async ({ page }) => {
    const captured = await signInAndLand(page, savedInvoice([bareRow('NHIL-2.5%', 150), bareRow('WHT-3.0%', 180)]));
    await openEditForm(page);

    await expect(page.getByTestId('invoice-item-tax-unresolved-0')).toHaveText(
      'This line has 1 more tax that cannot be shown here. Changing the taxes removes it.'
    );
    await expect(page.getByTestId(`invoice-item-tax-0-chip-${NHIL}`)).toBeVisible();
    // The stored rows sum to 330, so the preview does not claim 150.
    await expect(page.getByTestId('invoice-tax')).toContainText('330.00');
    await shot(page, 'edit-unresolved-tax-warning');

    await page.getByTestId('invoice-form-save-draft-button').click();
    await expect.poll(() => captured.invoiceUpdates.length, { timeout: 15000 }).toBe(1);
    expect(Object.keys(captured.invoiceUpdates[0])).not.toContain('invoiceItemList[0].taxEntries');
  });
});
