/**
 * SOUPFIN-46 — Invoice EDIT form previewed 0 tax for a line whose TaxEntry resolved.
 *
 * Reported: on the edit form the tax dropdown correctly re-selected the saved tax
 * (e.g. "VAT- STANDARD (15%)") while the previewed Tax, Total and per-line Amount all
 * computed zero tax — the form contradicting itself on one screen, and previewing a
 * total the saved invoice does not have.
 *
 * Root cause: hydration read `item.taxRate`. That field is UI-only
 * (`types/index.ts` marks it "Computed/UI-only, not from backend") and
 * `transformInvoice()` never sets it, so on edit it was ALWAYS 0 while
 * `taxEntryId` resolved correctly through `resolveItemTaxEntryId`. The SAVE path
 * was never affected — it sends `taxEntryId` — so this was preview-only, which is
 * why the unit suite and every save assertion stayed green.
 *
 * Fix: mirror `BillFormPage` and look the rate up in the catalogue by the SAME id
 * the dropdown binds to, so the two cannot drift.
 *
 * These tests prove, through the real UI:
 *   #1 an EXPANDED TaxEntry join row previews its tax (dropdown and totals agree)
 *   #2 a BARE-FK join row — the shape the backend usually returns — does too
 *   #3 an untaxed line still previews zero (no over-correction)
 *   #4 changing the dropdown after hydration still moves the totals
 *
 * Navigation is by sidebar menu click and then the list's own Edit link — never a
 * direct `goto` for an internal route — so the tests also prove the edit form is
 * reachable the way a user reaches it.
 *
 * Screenshots land in e2e/playwright/screenshots/soupfin-46/ and are committed.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, isLxcMode } from './fixtures';

test.skip(isLxcMode(), 'Mock-only spec: pins exact backend response shapes');

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-46/${name}.png`,
    fullPage: true,
  });
}

/** Verbatim subset of /rest/taxEntry/index.json from the LXC backend. */
const TAX_ENTRIES = [
  {
    id: 'ff8081817fe4ae93017fe5c9cf10017b',
    name: 'CST',
    abbreviation: 'CST',
    taxRate: 5.0,
    isTaxable: true,
    serialised: 'CST-5.0%',
  },
  {
    id: 'ff80818186941f2701869cb315b11dda',
    name: 'VAT- STANDARD',
    abbreviation: 'VAT-S',
    taxRate: 15.0,
    serialised: 'VAT-S-15.0%',
  },
  {
    id: 'ff80818173ca7d260173ca8249e70001',
    name: 'National Health Insurance Levy',
    abbreviation: 'NHIL',
    taxRate: 2.5,
    serialised: 'NHIL-2.5%',
  },
];

const VAT_ID = 'ff80818186941f2701869cb315b11dda';
const NHIL_ID = 'ff80818173ca7d260173ca8249e70001';

const INVOICE_ID = 'inv-46';

const CLIENTS = [
  {
    id: 'client-1',
    name: 'Acme Corporation',
    clientType: 'CORPORATE',
    portfolioList: [{ id: 'portfolio-1', class: 'soupbroker.kyc.ClientPortfolio' }],
  },
];

/** The invoice header, as /rest/invoice/show/{id}.json returns it. */
const INVOICE_HEADER = {
  id: INVOICE_ID,
  number: 46,
  accountServices: { id: 'as-1', serialised: 'Direct Account : Corporate(Acme Corporation)' },
  invoiceDate: '2026-08-01T00:00:00Z',
  paymentDate: '2026-09-01T00:00:00Z',
  currency: 'GHS',
  invoicePaymentList: [],
};

/** One line of 2 x 1500 = 3000, carrying whatever tax join rows a test supplies. */
function itemsWithJoinRows(rows: unknown[]) {
  return [
    {
      id: 'item-1',
      invoice: { id: INVOICE_ID },
      description: 'Advisory',
      quantity: 2,
      unitPrice: 1500,
      taxEntryInvoiceItemList: rows,
    },
  ];
}

/** An expanded join row — the backend has rendered the nested TaxEntry. */
const EXPANDED_VAT_ROW = {
  id: 'join-1',
  taxAmount: 450.0,
  taxEntry: { id: VAT_ID, name: 'VAT- STANDARD', serialised: 'VAT-S-15.0%' },
};

/** A bare FK reference — no nested taxEntry, only the serialised label. */
const BARE_FK_VAT_ROW = {
  id: 'join-1',
  class: 'soupbroker.finance.TaxEntryInvoiceItem',
  serialised:
    'TaxEntryInvoiceItem(InvoiceItem(Advisory, 2.0, 1500.00), VAT-S-15.0%, 450.0, 3450.0)',
};

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
 * Common mocks + landing on the dashboard, which is the only direct URL these
 * tests use. Everything after this happens through UI clicks.
 */
async function signInAndLand(page: Page, joinRows: unknown[]) {
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

  // The list row the user clicks Edit on. Items are FK references here, exactly
  // as the list endpoint renders them.
  await page.route('**/rest/invoice/index.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          ...INVOICE_HEADER,
          invoiceItemList: [
            {
              id: 'item-1',
              class: 'soupbroker.finance.InvoiceItem',
              serialised: 'InvoiceItem(Advisory, quantity:2.0, unitPrice:1500.00)',
            },
          ],
        },
      ]),
    })
  );

  await page.route(`**/rest/invoice/show/${INVOICE_ID}.json*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(INVOICE_HEADER),
    })
  );

  // getInvoice() ALWAYS fetches full line items separately — this is the response
  // that carries the tax join rows the edit form hydrates from.
  await page.route('**/rest/invoiceItem/index.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(itemsWithJoinRows(joinRows)),
    })
  );

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
}

/** Click a top-level sidebar entry by its visible label. */
async function clickNav(page: Page, label: string) {
  await page.locator('nav > div > a', { hasText: label }).first().click();
  await page.waitForLoadState('domcontentloaded');
}

/** Reach the edit form the way a user does: sidebar → Invoices → row's Edit link. */
async function openEditForm(page: Page) {
  await clickNav(page, 'Invoices');
  await expect(page.getByTestId('invoice-list-page')).toBeVisible({ timeout: 15000 });
  await page.getByTestId(`invoice-edit-${INVOICE_ID}`).click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('invoice-item-description-0')).toBeVisible({ timeout: 15000 });
}

/** The line's Amount cell — the last cell before the remove-button cell. */
function lineAmountCell(page: Page, index: number) {
  return page
    .getByTestId(`invoice-item-taxRate-${index}`)
    .locator('xpath=ancestor::tr[1]')
    .locator('td')
    .nth(-2);
}

test.describe('SOUPFIN-46 — invoice edit tax preview', () => {
  test('#1 an expanded TaxEntry join row previews its tax', async ({ page }) => {
    await signInAndLand(page, [EXPANDED_VAT_ROW]);
    await openEditForm(page);
    await shot(page, 'edit-form-expanded-row-loaded');

    // The dropdown re-selects the saved tax...
    await expect(page.getByTestId('invoice-item-taxRate-0')).toHaveValue(VAT_ID);

    // ...and every previewed figure AGREES with it: 3000 + 15% = 3450.
    await expect(page.getByTestId('invoice-subtotal')).toContainText('3,000.00');
    await expect(page.getByTestId('invoice-tax')).toContainText('450.00');
    await expect(page.getByTestId('invoice-total')).toContainText('3,450.00');
    await expect(lineAmountCell(page, 0)).toContainText('3,450.00');

    await shot(page, 'expanded-row-totals-include-tax');
  });

  test('#2 a bare-FK join row previews its tax', async ({ page }) => {
    // The shape the backend returns most of the time: no nested taxEntry, only a
    // serialised label matched against the catalogue.
    await signInAndLand(page, [BARE_FK_VAT_ROW]);
    await openEditForm(page);

    await expect(page.getByTestId('invoice-item-taxRate-0')).toHaveValue(VAT_ID);
    await expect(page.getByTestId('invoice-tax')).toContainText('450.00');
    await expect(page.getByTestId('invoice-total')).toContainText('3,450.00');
    await expect(lineAmountCell(page, 0)).toContainText('3,450.00');

    await shot(page, 'bare-fk-row-totals-include-tax');
  });

  test('#3 an untaxed line still previews zero tax', async ({ page }) => {
    await signInAndLand(page, []);
    await openEditForm(page);

    await expect(page.getByTestId('invoice-item-taxRate-0')).toHaveValue('');
    await expect(page.getByTestId('invoice-subtotal')).toContainText('3,000.00');
    await expect(page.getByTestId('invoice-tax')).toContainText('0.00');
    await expect(page.getByTestId('invoice-total')).toContainText('3,000.00');
    await expect(lineAmountCell(page, 0)).toContainText('3,000.00');

    await shot(page, 'untaxed-line-previews-zero');
  });

  test('#4 changing the tax after hydration still moves the totals', async ({ page }) => {
    await signInAndLand(page, [EXPANDED_VAT_ROW]);
    await openEditForm(page);

    await expect(page.getByTestId('invoice-tax')).toContainText('450.00');

    await page.getByTestId('invoice-item-taxRate-0').selectOption(NHIL_ID);

    // 3000 x 2.5% = 75.
    await expect(page.getByTestId('invoice-tax')).toContainText('75.00');
    await expect(page.getByTestId('invoice-total')).toContainText('3,075.00');

    await shot(page, 'tax-changed-after-hydration');
  });
});
