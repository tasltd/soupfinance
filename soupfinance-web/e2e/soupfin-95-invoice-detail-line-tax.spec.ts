/**
 * SOUPFIN-95 — the invoice detail page's Line Items table has no Tax column
 *
 * The Amount Summary card shows the invoice's Tax (GH₵3,600.00 on invoice
 * 1043), but the Line Items table only had Description, Qty, Unit Price and
 * Amount, so no line showed its share and the screen could not be reconciled.
 * SOUPFIN-92 closed the same gap in the PDF.
 *
 * Each line now shows computeInvoiceItemTax(item), the helper
 * computeInvoiceTotals() sums, so the column adds up to data-testid=invoice-tax.
 * A taxed line whose amount cannot be read shows a dash, never 0.00.
 *
 * Every page is reached by clicking: dashboard -> sidebar Invoices -> invoice row.
 *
 * Run: E2E_PORT=5195 npx playwright test e2e/soupfin-95-invoice-detail-line-tax.spec.ts --project=firefox
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { installGuideMocks, seedAuthenticatedSession, invoices } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-95';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

/** Screenshots live in a git-tracked dir; test-results/ is wiped every run. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

/** A TaxEntryInvoiceItem row exactly as the LXC backend sends it: a bare FK reference. */
const joinRow = (label: string, taxAmount: number, lineTotal: number, id: string) => ({
  class: 'soupbroker.finance.TaxEntryInvoiceItem',
  id,
  serialised: `TaxEntryInvoiceItem(InvoiceItem(quantity:1.0, unitPrice:1000.00, invoice:Invoice(number:1095)), ${label}, ${taxAmount}, ${lineTotal})`,
});

const line = (id: string, description: string, quantity: number, unitPrice: number, rows: unknown[]) => ({
  id,
  description,
  quantity,
  unitPrice,
  amount: quantity * unitPrice,
  taxEntryInvoiceItemList: rows,
});

// The backend's own shape: bare FK join rows, two taxes on one line, an untaxed
// line, and a withholding row the payer deducts (left out of the Tax total).
const backendShapeInvoice = {
  ...invoices[1],
  id: 'inv-095-backend',
  number: 1095,
  status: 'SENT',
  notes: 'Tax shapes as the backend returns them.',
  invoicePaymentList: [],
  invoiceItemList: [
    line('ii-095-1', 'Advisory — NHIL and GETFund', 2, 1500, [
      joinRow('NHIL-2.5%', 75.0, 3075.0, 'tei-095-1a'),
      joinRow('GETFL-2.5%', 75.0, 3075.0, 'tei-095-1b'),
    ]),
    line('ii-095-2', 'Exempt training day', 1, 800, []),
    line('ii-095-3', 'Consulting with withholding', 1, 1000, [
      { id: 'tei-095-3a', taxAmount: 150, taxEntry: { id: 'vat', isWithholdingTax: false } },
      { id: 'tei-095-3b', taxAmount: -75, taxEntry: { id: 'wht', isWithholdingTax: true } },
    ]),
  ],
};

// A taxed line whose join row carries no readable amount.
const unreadableInvoice = {
  ...invoices[1],
  id: 'inv-095-unreadable',
  number: 1096,
  status: 'SENT',
  notes: '',
  invoicePaymentList: [],
  invoiceItemList: [
    line('ii-096-1', 'Retainer — VAT', 1, 1000, [joinRow('VAT-15.0%', 150, 1150, 'tei-096-1')]),
    line('ii-096-2', 'Travel — tax amount missing', 1, 400, [
      { class: 'soupbroker.finance.TaxEntryInvoiceItem', id: 'tei-096-2', serialised: 'TaxEntryInvoiceItem(pending)' },
    ]),
  ],
};

// Zero edge: a draft with no lines yet.
const emptyInvoice = {
  ...invoices[1],
  id: 'inv-095-empty',
  number: 1097,
  status: 'DRAFT',
  notes: '',
  invoicePaymentList: [],
  invoiceItemList: [] as ReturnType<typeof line>[],
};

// Overflow edge: 80 lines with 7-figure amounts, every third one untaxed.
const longTax = (i: number) => (i % 3 === 0 ? 0 : Math.round((1_250_000 + i) * 0.15 * 100) / 100);
const longInvoice = {
  ...invoices[1],
  id: 'inv-095-long',
  number: 1098,
  status: 'SENT',
  notes: 'Annual retainer, itemised by workstream.',
  invoicePaymentList: [],
  invoiceItemList: Array.from({ length: 80 }, (_, i) =>
    line(`ii-095-long-${i}`, `Workstream ${i + 1} — delivery`, 1, 1_250_000 + i,
      longTax(i) ? [joinRow('VAT-15.0%', longTax(i), 1_250_000 + i + longTax(i), `tei-095-long-${i}`)] : [])
  ),
};

/** Serve the edge invoices beside the curated three. Registered last, so they win. */
async function addEdgeInvoices(page: Page) {
  const all = [...invoices, backendShapeInvoice, unreadableInvoice, emptyInvoice, longInvoice];
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/rest/invoice/index.json*', (route) => route.fulfill(json(all)));
  await page.route('**/rest/invoice/show/*.json*', (route) => {
    const id = route.request().url().match(/invoice\/show\/([^.]+)\.json/)?.[1];
    route.fulfill(json(all.find((i) => i.id === id) ?? all[0]));
  });
  await page.route('**/rest/invoiceItem/index.json*', (route) => {
    const invoiceId = new URL(route.request().url()).searchParams.get('invoice.id');
    route.fulfill(json(all.find((i) => i.id === invoiceId)?.invoiceItemList ?? []));
  });
  await page.route('**/rest/invoicePayment/index.json*', (route) => {
    const invoiceId = new URL(route.request().url()).searchParams.get('invoice.id');
    route.fulfill(json(all.find((i) => i.id === invoiceId)?.invoicePaymentList ?? []));
  });
}

/** "GH₵3,600.00" -> 3600 */
const money = (text: string) => Number(text.replace(/[^\d.-]/g, ''));
const sum = (cells: string[]) => Math.round(cells.map(money).reduce((a, b) => a + b, 0) * 100) / 100;

interface DetailLines {
  headers: string[];
  descriptions: string[];
  taxCells: string[];
  taxTotal: string;
}

/** Dashboard -> sidebar Invoices -> invoice row, all by clicking; then read the table. */
async function openInvoiceDetail(page: Page, invoice: { id: string; number: number }, prefix: string): Promise<DetailLines> {
  await mkdir(SHOT_DIR, { recursive: true });

  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });

  await page.locator('aside').locator('a[href="/invoices"]').first().click();
  await expect(page).toHaveURL(/\/invoices$/);
  await expect(page.getByTestId(`invoice-link-${invoice.id}`)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId(`invoice-link-${invoice.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${invoice.id}$`));
  await expect(page.getByTestId('invoice-detail-heading')).toHaveText(`Invoice ${invoice.number}`, {
    timeout: 15_000,
  });
  await expect(page.getByTestId('invoice-items-card')).toBeVisible();

  const taxTotal = ((await page.getByTestId('invoice-tax').textContent()) ?? '').trim();
  const table = page.getByTestId('invoice-items-table');
  if (await table.count() === 0) {
    await shot(page, `${prefix}-01-detail`);
    return { headers: [], descriptions: [], taxCells: [], taxTotal };
  }

  await page.getByTestId('invoice-items-card').scrollIntoViewIfNeeded();
  await shot(page, `${prefix}-01-detail`);

  const headers = (await table.locator('thead th').allTextContents()).map((t) => t.trim());
  const descriptions = (await table.locator('tbody tr td:first-child').allTextContents()).map((t) => t.trim());
  const taxCells = (await table.getByTestId('invoice-item-tax').allTextContents()).map((t) => t.trim());
  return { headers, descriptions, taxCells, taxTotal };
}

test.describe('SOUPFIN-95: invoice detail Line Items Tax column', () => {
  test.skip(isLxcMode(), 'Mock-only spec: drives the curated guide data set');

  let apiGuard: UnmockedApiGuard;

  test.beforeEach(async ({ page }) => {
    // Guard FIRST: routes match in reverse order, so it only sees what the
    // curated mocks below do not claim.
    apiGuard = await installUnmockedApiGuard(page);
    await installGuideMocks(page);
    await addEdgeInvoices(page);
    await seedAuthenticatedSession(page);
  });

  test.afterEach(() => apiGuard.assertNone('SOUPFIN-95 invoice detail spec'));

  test('invoice 1043 shows each line tax and the lines add up to GH₵3,600.00', async ({ page }) => {
    const invoice = invoices.find((i) => i.id === 'inv-003')!;
    const detail = await openInvoiceDetail(page, invoice, '1043');

    expect(detail.headers).toEqual(['Description', 'Qty', 'Unit Price', 'Tax', 'Amount']);
    expect(detail.descriptions).toEqual(['Process review — phase one', 'On-site workshops']);
    expect(detail.taxCells).toEqual(['GH₵2,700.00', 'GH₵900.00']);
    expect(detail.taxTotal).toBe('GH₵3,600.00');
    expect(sum(detail.taxCells)).toBe(money(detail.taxTotal));
  });

  test('backend-shaped tax rows: two taxes, an untaxed line and withholding', async ({ page }) => {
    const detail = await openInvoiceDetail(page, backendShapeInvoice, 'backend-shape');

    // 75 + 75 from bare FK rows; 0 for the exempt line; 150 VAT with the
    // withholding row left out, as it is left out of the Tax total.
    expect(detail.taxCells).toEqual(['GH₵150.00', 'GH₵0.00', 'GH₵150.00']);
    expect(detail.taxTotal).toBe('GH₵300.00');
    expect(sum(detail.taxCells)).toBe(money(detail.taxTotal));
  });

  test('a taxed line with no readable amount shows a dash, not 0.00', async ({ page }) => {
    const detail = await openInvoiceDetail(page, unreadableInvoice, 'unreadable');

    expect(detail.taxCells).toEqual(['GH₵150.00', '-']);
    // The readable line still reconciles with the Tax figure.
    expect(detail.taxTotal).toBe('GH₵150.00');
  });

  test('an invoice with no lines shows no tax cells and a zero Tax figure (zero edge)', async ({ page }) => {
    const detail = await openInvoiceDetail(page, emptyInvoice, 'empty');

    await expect(page.getByTestId('invoice-items-empty')).toBeVisible();
    expect(detail.taxCells).toEqual([]);
    expect(detail.taxTotal).toBe('GH₵0.00');
  });

  test('80 seven-figure lines each show their tax and still add up (overflow edge)', async ({ page }) => {
    const detail = await openInvoiceDetail(page, longInvoice, 'long');

    expect(detail.taxCells).toHaveLength(80);
    expect(detail.taxCells).not.toContain('-');
    expect(detail.taxCells[0]).toBe('GH₵0.00');
    expect(detail.taxCells[1]).toBe('GH₵187,500.15');
    expect(sum(detail.taxCells)).toBe(money(detail.taxTotal));
    const expectedTax = Array.from({ length: 80 }, (_, i) => longTax(i)).reduce((a, b) => a + b, 0);
    expect(money(detail.taxTotal)).toBe(Math.round(expectedTax * 100) / 100);
  });
});
