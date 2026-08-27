/**
 * SOUPFIN-47 — the bill PDF printed "Tax 0%" on every line item.
 *
 * Reported: `src/utils/pdf/templates.ts` rendered `${item.taxRate}%`. `BillItem`
 * has NO `taxRate` column (SOUPFIN-38), and `getBill()` normalises the absent
 * field to `Number(item.taxRate) || 0`, so the value handed to the template was
 * ALWAYS 0. Every line of every downloaded and emailed bill claimed no tax —
 * on the document the vendor receives — directly above a total block reporting
 * the tax. `generateInvoiceHtml()` made the mirror mistake: a hardcoded `-` that
 * never resolved, so a taxed invoice line never showed its rate at all.
 *
 * These tests capture the HTML the RUNNING APP hands to the PDF renderer, after
 * a real sidebar navigation and a real click on Download PDF. `generatePdfFromHtml`
 * builds an off-screen container, sets its innerHTML and appends it to the body,
 * so patching `document.body.appendChild` yields the genuine artifact — not a
 * re-derivation of it in the test.
 *
 * Proven here:
 *   #1 a resolvable taxed line prints its real rate, and 0% appears nowhere
 *   #2 a genuinely untaxed line still prints a truthful 0%
 *   #3 a line whose TaxEntry cannot be named prints an em dash, never 0%
 *   #4 a catalogue that 403s (the module gate) leaves every taxed line unknown
 *   #5 the invoice PDF resolves its rate instead of the old hardcoded dash
 *   #6 the column holds up on an over-populated bill (12 lines, mixed states,
 *      7-figure amounts, long descriptions)
 *
 * Navigation is by sidebar menu click and then a row link — never a direct route
 * `goto` for an internal page. Screenshots land in
 * e2e/playwright/screenshots/soupfin-47/ and are committed.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, isLxcMode } from './fixtures';

test.skip(isLxcMode(), 'Mock-only spec: pins exact TaxEntry join-row response shapes');

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-47/${name}.png`,
    fullPage: true,
  });
}

/** The tenant's TaxEntry catalogue. VAT-S is deliberately ABSENT — see #3. */
const TAX_ENTRIES = [
  { id: 'tax-cst', name: 'CST', abbreviation: 'CST', taxRate: 5.0, isTaxable: true, serialised: 'CST-5.0%' },
  { id: 'tax-vat-fr', name: 'Value Added Tax -Flat Rate', abbreviation: 'VAT-FR', taxRate: 15.0, serialised: 'VAT-FR-15.0%' },
];

/** Verbatim TaxEntryBillItem.serialised shape — ONE trailing number, not two. */
function billJoinRow(label: string, taxAmount: number) {
  return {
    serialised:
      `TaxEntryBillItem(BillItem(quantity:1.0, unitPrice:1500, taxEntries:[${label}], ` +
      `bill:Bill((805 Restaurant)[PROVIDER], 202206-03, 230)), ${label}, ${taxAmount})`,
  };
}

/** TaxEntryInvoiceItem carries TWO trailing numbers where the bill row carries one. */
function invoiceJoinRow(label: string, taxAmount: number, total: number) {
  return {
    serialised:
      `TaxEntryInvoiceItem(InvoiceItem(quantity:1.0, unitPrice:1500, ` +
      `invoice:Invoice(42)), ${label}, ${taxAmount}, ${total})`,
  };
}

const BILL_ID = 'bill-047';
const INVOICE_ID = 'invoice-047';

const BILL = {
  id: BILL_ID,
  billNumber: 'BILL-2026-0047',
  vendor: { id: 'vendor-1', serialised: '(805 Restaurant)[PROVIDER]' },
  billDate: '2026-08-01T00:00:00Z',
  paymentDate: '2026-08-31T00:00:00Z',
  status: 'PENDING',
  subtotal: 3000,
  taxAmount: 255,
  totalAmount: 3255,
  amountPaid: 0,
  amountDue: 3255,
};

/** One line per state the Tax column has to tell apart. */
const BILL_ITEMS = [
  {
    id: 'item-resolvable',
    bill: { id: BILL_ID },
    description: 'Consultancy',
    quantity: 1,
    unitPrice: 1500,
    taxEntryBillItemList: [billJoinRow('VAT-FR-15.0%', 225.0)],
  },
  {
    id: 'item-untaxed',
    bill: { id: BILL_ID },
    description: 'Printing',
    quantity: 1,
    unitPrice: 900,
    // No join rows at all: genuinely untaxed, so "0%" is a true statement.
    taxEntryBillItemList: [],
  },
  {
    id: 'item-unresolvable',
    bill: { id: BILL_ID },
    description: 'Catering services',
    quantity: 1,
    unitPrice: 600,
    // Bare FK reference whose label is absent from TAX_ENTRIES.
    taxEntryBillItemList: [billJoinRow('VAT-S-15.0%', 30.0)],
  },
];

/** 12 lines, 7-figure unit prices, long descriptions, all three tax states. */
const OVERLOADED_ITEMS = Array.from({ length: 12 }, (_, i) => ({
  id: `item-bulk-${i}`,
  bill: { id: BILL_ID },
  description:
    `Line ${i + 1} — professional services rendered under the master framework ` +
    'agreement including on-site attendance and out-of-hours support',
  quantity: 999,
  unitPrice: 1234567.89,
  taxEntryBillItemList:
    i % 3 === 0
      ? [billJoinRow('VAT-FR-15.0%', 185185183.5)]
      : i % 3 === 1
        ? []
        : [billJoinRow('VAT-S-15.0%', 185185183.5)],
}));

const INVOICE = {
  id: INVOICE_ID,
  number: 47,
  accountServices: {
    id: 'as-1',
    class: 'soupbroker.kyc.AccountServices',
    serialised: 'Direct Account : Corporate(Client Co)',
  },
  invoiceDate: '2026-08-01T00:00:00Z',
  paymentDate: '2026-08-31T00:00:00Z',
  status: 'SENT',
};

const INVOICE_ITEMS = [
  {
    id: 'inv-item-resolvable',
    invoice: { id: INVOICE_ID },
    description: 'Advisory retainer',
    quantity: 1,
    unitPrice: 1500,
    taxEntryInvoiceItemList: [invoiceJoinRow('VAT-FR-15.0%', 225.0, 1725.0)],
  },
  {
    id: 'inv-item-untaxed',
    invoice: { id: INVOICE_ID },
    description: 'Exempt supply',
    quantity: 1,
    unitPrice: 500,
    taxEntryInvoiceItemList: [],
  },
];

/**
 * Capture the HTML the app feeds to html2pdf. `generatePdfFromHtml` sets the
 * container's innerHTML BEFORE appending it, so the patched appendChild sees the
 * finished markup. Capturing here rather than reading the downloaded PDF keeps
 * the assertion on the app's own output and survives html2canvas failing
 * headless — the container is appended before rendering is attempted.
 */
async function capturePdfHtml(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __pdfHtml: string[] }).__pdfHtml = [];

    // Patch the PROTOTYPE, not `document.body.appendChild`: init scripts run
    // before the document is parsed, so `document.body` is still null here.
    const original = Node.prototype.appendChild;
    Node.prototype.appendChild = function <T extends Node>(this: Node, node: T): T {
      const el = node as unknown as HTMLElement;
      // Filter on the off-screen positioning generatePdfFromHtml applies BEFORE
      // it appends. Cheap property reads only — React appends constantly, and
      // serialising innerHTML on every call would dominate the run.
      if (el && el.nodeType === 1 && el.tagName === 'DIV' && el.style && el.style.left === '-9999px') {
        (window as unknown as { __pdfHtml: string[] }).__pdfHtml.push(el.innerHTML);
      }
      return original.call(this, node) as T;
    };
  });
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

interface Options {
  items?: typeof BILL_ITEMS;
  /** Simulate the 403 module gate on the TaxEntry catalogue. */
  taxCatalogueFails?: boolean;
}

/**
 * Common mocks + landing on the dashboard, the only direct URL these tests use.
 * Everything after this happens through menu clicks and row links.
 */
async function signInAndLand(page: Page, options: Options = {}) {
  const items = options.items ?? BILL_ITEMS;

  await capturePdfHtml(page);
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
    options.taxCatalogueFails
      ? route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Module not enabled for this license category' }),
        })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(TAX_ENTRIES),
        })
  );

  await page.route('**/rest/bill/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([BILL]) })
  );
  await page.route('**/rest/bill/show/*.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...BILL, billItemList: null }),
    })
  );
  await page.route('**/rest/billItem/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items) })
  );

  await page.route('**/rest/invoice/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([INVOICE]) })
  );
  await page.route('**/rest/invoice/show/*.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...INVOICE, invoiceItemList: null }),
    })
  );
  await page.route('**/rest/invoiceItem/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(INVOICE_ITEMS) })
  );

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
}

/** Click a top-level sidebar entry by its visible label. */
async function clickNav(page: Page, label: string) {
  await page.locator('nav > div > a', { hasText: label }).first().click();
  await page.waitForLoadState('domcontentloaded');
}

/** Reach the bill detail the way a user does: sidebar → Bills → the row link. */
async function openBillDetail(page: Page) {
  await clickNav(page, 'Bills');
  await expect(page.getByTestId('bill-list-table')).toBeVisible({ timeout: 15000 });
  await page.getByTestId(`bill-link-${BILL_ID}`).click();
  await expect(page.getByTestId('bill-items-table')).toBeVisible({ timeout: 15000 });
}

/**
 * Click Download PDF and return the markup the app produced. The PDF renderer
 * itself may fail in headless Firefox; the container is appended first, so the
 * artifact is captured either way.
 */
async function generateAndCapture(page: Page, testId: string): Promise<string> {
  await page.getByTestId(testId).click();
  await page.waitForFunction(
    () => (window as unknown as { __pdfHtml: string[] }).__pdfHtml.length > 0,
    { timeout: 20000 }
  );
  return page.evaluate(() => (window as unknown as { __pdfHtml: string[] }).__pdfHtml[0]);
}

/**
 * The Tax cell (4th of 5 columns) of the PDF row whose description matches.
 * Rendering the captured markup in the page keeps parsing out of the assertion
 * and gives a screenshot of the artifact the vendor actually receives.
 */
async function renderPdfHtml(page: Page, html: string) {
  await page.setContent(html);
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
}

function pdfTaxCell(page: Page, description: string) {
  return page.locator('tbody tr').filter({ hasText: description }).locator('td').nth(3);
}

test.describe('SOUPFIN-47 — line-item Tax column in the generated PDF', () => {
  test('#1/#2/#3 bill PDF tells apart resolved, untaxed and unknown tax', async ({ page }) => {
    await signInAndLand(page);
    await openBillDetail(page);
    await shot(page, 'bill-detail-before-download');

    const html = await generateAndCapture(page, 'bill-download-pdf-button');

    // THE REGRESSION: every line used to read 0%. Count the Tax cells straight
    // out of the captured markup — three lines, three DIFFERENT states.
    const rawTaxCells = [...html.matchAll(/<td class="text-right">([^<]*)<\/td>\s*<td class="text-right font-medium">/g)]
      .map((m) => m[1]);
    // The em dash arrives DECODED: this is the browser's re-serialisation of the
    // container, not the template's raw `&mdash;` output.
    expect(rawTaxCells).toEqual(['15%', '0%', '\u2014']);

    await renderPdfHtml(page, html);
    await shot(page, 'bill-pdf-tax-column');

    // #1 — resolvable line prints its real rate
    await expect(pdfTaxCell(page, 'Consultancy')).toHaveText('15%');

    // #2 — no join rows at all: 0% is a TRUE statement here
    await expect(pdfTaxCell(page, 'Printing')).toHaveText('0%');

    // #3 — taxed by an entry the catalogue cannot name: unknown, never 0%
    const unknown = pdfTaxCell(page, 'Catering services');
    await expect(unknown).toHaveText('—');
    await expect(unknown).not.toHaveText('0%');

    // The PDF's own total block still reports the tax the unknown line carries,
    // which is exactly what "0%" used to contradict.
    await expect(page.locator('.totals')).toContainText('255.00');
  });

  test('#4 a 403 tax catalogue leaves taxed lines unknown, not 0%', async ({ page }) => {
    await signInAndLand(page, { taxCatalogueFails: true });
    await openBillDetail(page);

    const html = await generateAndCapture(page, 'bill-download-pdf-button');
    await renderPdfHtml(page, html);
    await shot(page, 'bill-pdf-tax-catalogue-unavailable');

    // Both taxed lines are unnameable without the catalogue.
    await expect(pdfTaxCell(page, 'Consultancy')).toHaveText('—');
    await expect(pdfTaxCell(page, 'Catering services')).toHaveText('—');

    // The untaxed line does not need the catalogue to be truthful.
    await expect(pdfTaxCell(page, 'Printing')).toHaveText('0%');
  });

  test('#5 invoice PDF resolves the rate instead of the old hardcoded dash', async ({ page }) => {
    await signInAndLand(page);

    await clickNav(page, 'Invoices');
    await expect(page.getByTestId('invoice-list-table')).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`invoice-link-${INVOICE_ID}`).click();
    await expect(page.getByTestId('invoice-download-pdf-button')).toBeVisible({ timeout: 15000 });
    await shot(page, 'invoice-detail-before-download');

    const html = await generateAndCapture(page, 'invoice-download-pdf-button');
    await renderPdfHtml(page, html);
    await shot(page, 'invoice-pdf-tax-column');

    await expect(pdfTaxCell(page, 'Advisory retainer')).toHaveText('15%');
    await expect(pdfTaxCell(page, 'Exempt supply')).toHaveText('0%');
  });

  test('#6 holds up on an over-populated bill: 12 lines, 7-figure amounts', async ({ page }) => {
    await signInAndLand(page, { items: OVERLOADED_ITEMS });
    await openBillDetail(page);

    const html = await generateAndCapture(page, 'bill-download-pdf-button');
    await renderPdfHtml(page, html);
    await shot(page, 'bill-pdf-tax-column-overloaded');

    const cells = await page.locator('tbody tr').locator('td:nth-child(4)').allInnerTexts();
    expect(cells).toHaveLength(12);
    expect(cells.filter((c) => c.trim() === '15%')).toHaveLength(4);
    expect(cells.filter((c) => c.trim() === '0%')).toHaveLength(4);
    expect(cells.filter((c) => c.trim() === '—')).toHaveLength(4);

    // Every line carries tax rows or none — no line may silently read 0% because
    // the phantom item.taxRate came back as 0.
    expect(cells.filter((c) => c.trim() === '0%')).not.toHaveLength(12);
  });
});
