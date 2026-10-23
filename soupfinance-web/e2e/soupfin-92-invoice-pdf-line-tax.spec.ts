/**
 * SOUPFIN-92 — the invoice PDF prints a dash in the Tax column on every line
 *
 * generateInvoiceHtml() wrote a hard-coded `-` in each line's Tax cell, while
 * the Tax total under the table was right (GH₵3,600.00 on invoice 1043). On
 * paper the lines never added up to the total.
 *
 * html2pdf draws each page as a JPEG, so the PDF has no text to search. This
 * spec captures the exact HTML the app hands to html2pdf (a MutationObserver
 * sees the temporary container the moment it is attached) and reads the Tax
 * cells from it. It then renders that same HTML in a second tab and saves a
 * screenshot, which is the page the PDF is drawn from.
 *
 * Every page is reached by clicking: dashboard -> sidebar Invoices -> invoice
 * row -> Download PDF.
 *
 * Run: E2E_PORT=5192 npx playwright test e2e/soupfin-92-invoice-pdf-line-tax.spec.ts --project=firefox
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { installGuideMocks, seedAuthenticatedSession, invoices } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-92';

test.use({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
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
  serialised: `TaxEntryInvoiceItem(InvoiceItem(quantity:1.0, unitPrice:1000.00, invoice:Invoice(number:1092)), ${label}, ${taxAmount}, ${lineTotal})`,
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
  id: 'inv-092-backend',
  number: 1092,
  status: 'SENT',
  notes: 'Tax shapes as the backend returns them.',
  invoicePaymentList: [],
  invoiceItemList: [
    line('ii-092-1', 'Advisory — NHIL and GETFund', 2, 1500, [
      joinRow('NHIL-2.5%', 75.0, 3075.0, 'tei-092-1a'),
      joinRow('GETFL-2.5%', 75.0, 3075.0, 'tei-092-1b'),
    ]),
    line('ii-092-2', 'Exempt training day', 1, 800, []),
    line('ii-092-3', 'Consulting with withholding', 1, 1000, [
      { id: 'tei-092-3a', taxAmount: 150, taxEntry: { id: 'vat', isWithholdingTax: false } },
      { id: 'tei-092-3b', taxAmount: -75, taxEntry: { id: 'wht', isWithholdingTax: true } },
    ]),
  ],
};

// Zero edge: a draft with no lines yet.
const emptyInvoice = {
  ...invoices[1],
  id: 'inv-092-empty',
  number: 1093,
  status: 'DRAFT',
  notes: '',
  invoicePaymentList: [],
  invoiceItemList: [] as ReturnType<typeof line>[],
};

// Overflow edge: 80 lines with 7-figure amounts, every third one untaxed.
const longTax = (i: number) => (i % 3 === 0 ? 0 : Math.round((1_250_000 + i) * 0.15 * 100) / 100);
const longInvoice = {
  ...invoices[1],
  id: 'inv-092-long',
  number: 1094,
  status: 'SENT',
  notes: 'Annual retainer, itemised by workstream.',
  invoicePaymentList: [],
  invoiceItemList: Array.from({ length: 80 }, (_, i) =>
    line(`ii-092-long-${i}`, `Workstream ${i + 1} — delivery`, 1, 1_250_000 + i,
      longTax(i) ? [joinRow('VAT-15.0%', longTax(i), 1_250_000 + i + longTax(i), `tei-092-long-${i}`)] : [])
  ),
};

/** Serve the edge invoices beside the curated three. Registered last, so they win. */
async function addEdgeInvoices(page: Page) {
  const all = [...invoices, backendShapeInvoice, emptyInvoice, longInvoice];
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

/**
 * Record the HTML of every PDF render container. generatePdfFromHtml() appends
 * a <div> holding the template to <body> and removes it when html2pdf is done,
 * so it has to be caught as it is added.
 */
async function captureRenderedInvoiceHtml(page: Page) {
  await page.addInitScript(() => {
    const captures: string[] = [];
    (window as unknown as { __pdfHtml: string[] }).__pdfHtml = captures;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLElement && node.querySelector('.document-title')) {
            captures.push(node.innerHTML);
          }
        }
      }
    });
    // `document`, not documentElement: init scripts run before <html> exists.
    observer.observe(document, { childList: true, subtree: true });
  });
}

interface RenderedInvoice {
  html: string;
  headers: string[];
  descriptions: string[];
  taxCells: string[];
  taxTotal: string;
}

/** Parse the captured template HTML in the page, the way a reader sees it. */
async function readRenderedInvoice(page: Page): Promise<RenderedInvoice> {
  // The first capture is the app's own container; html2pdf may add a clone of
  // it to its overlay afterwards.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __pdfHtml: string[] }).__pdfHtml.length))
    .toBeGreaterThanOrEqual(1);
  return page.evaluate(() => {
    const html = (window as unknown as { __pdfHtml: string[] }).__pdfHtml[0];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headers = [...doc.querySelectorAll('table thead th')].map((th) => th.textContent?.trim() ?? '');
    const taxColumn = headers.indexOf('Tax');
    const rows = [...doc.querySelectorAll('table tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim() ?? '')
    );
    const taxRow = [...doc.querySelectorAll('.totals .total-row')].find(
      (row) => row.querySelector('.total-label')?.textContent?.trim() === 'Tax'
    );
    return {
      html,
      headers,
      descriptions: rows.map((cells) => cells[0]),
      taxCells: rows.map((cells) => cells[taxColumn]),
      taxTotal: taxRow?.querySelector('.total-value')?.textContent?.trim() ?? '',
    };
  });
}

/** "GH₵3,600.00" -> 3600 */
const money = (text: string) => Number(text.replace(/[^\d.-]/g, ''));
const sum = (cells: string[]) => Math.round(cells.map(money).reduce((a, b) => a + b, 0) * 100) / 100;

/**
 * Dashboard -> sidebar Invoices -> invoice row -> Download PDF, all by clicking.
 * Returns the HTML the PDF was drawn from, parsed.
 */
async function downloadInvoicePdf(page: Page, invoice: { id: string; number: number }, prefix: string) {
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
  await shot(page, `${prefix}-01-detail`);
  const detailTax = (await page.getByTestId('invoice-tax').textContent())?.trim() ?? '';

  const button = page.getByTestId('invoice-download-pdf-button');
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toBe(`Invoice-${invoice.number}.pdf`);
  await expect(button).toHaveText(/Download PDF/, { timeout: 60_000 });

  const rendered = await readRenderedInvoice(page);
  expect(rendered.headers).toEqual(['Description', 'Qty', 'Unit Price', 'Tax', 'Amount']);
  // The PDF's Tax total is the same figure the detail page shows.
  expect(rendered.taxTotal).toBe(detailTax);

  // Evidence: the page the PDF is drawn from, rendered on its own.
  const evidence = await page.context().newPage();
  await evidence.setViewportSize({ width: 900, height: 1200 });
  await evidence.setContent(rendered.html);
  await shot(evidence, `${prefix}-02-pdf-page`);
  await evidence.close();

  return rendered;
}

test.describe('SOUPFIN-92: invoice PDF Tax column', () => {
  test.skip(isLxcMode(), 'Mock-only spec: drives the curated guide data set');

  let apiGuard: UnmockedApiGuard;

  test.beforeEach(async ({ page }) => {
    // Guard FIRST: routes match in reverse order, so it only sees what the
    // curated mocks below do not claim.
    apiGuard = await installUnmockedApiGuard(page);
    await installGuideMocks(page);
    await addEdgeInvoices(page);
    await seedAuthenticatedSession(page);
    await captureRenderedInvoiceHtml(page);
  });

  test.afterEach(() => apiGuard.assertNone('SOUPFIN-92 invoice PDF spec'));

  test('invoice 1043 prints each line tax and the lines add up to GH₵3,600.00', async ({ page }) => {
    const invoice = invoices.find((i) => i.id === 'inv-003')!;
    const pdf = await downloadInvoicePdf(page, invoice, '1043');

    expect(pdf.descriptions).toEqual(['Process review — phase one', 'On-site workshops']);
    expect(pdf.taxCells).toEqual(['GH₵2,700.00', 'GH₵900.00']);
    expect(pdf.taxTotal).toBe('GH₵3,600.00');
    expect(sum(pdf.taxCells)).toBe(money(pdf.taxTotal));
  });

  test('backend-shaped tax rows: two taxes, an untaxed line and withholding', async ({ page }) => {
    const pdf = await downloadInvoicePdf(page, backendShapeInvoice, 'backend-shape');

    // 75 + 75 from bare FK rows; 0 for the exempt line; 150 VAT with the
    // withholding row left out, as it is left out of the Tax total.
    expect(pdf.taxCells).toEqual(['GH₵150.00', 'GH₵0.00', 'GH₵150.00']);
    expect(pdf.taxTotal).toBe('GH₵300.00');
    expect(sum(pdf.taxCells)).toBe(money(pdf.taxTotal));
  });

  test('an invoice with no lines prints no line rows and a zero Tax total (zero edge)', async ({ page }) => {
    const pdf = await downloadInvoicePdf(page, emptyInvoice, 'empty');

    expect(pdf.taxCells).toEqual([]);
    expect(pdf.taxTotal).toBe('GH₵0.00');
  });

  test('80 seven-figure lines each print their tax and still add up (overflow edge)', async ({ page }) => {
    const pdf = await downloadInvoicePdf(page, longInvoice, 'long');

    expect(pdf.taxCells).toHaveLength(80);
    expect(pdf.taxCells).not.toContain('-');
    expect(pdf.taxCells[0]).toBe('GH₵0.00');
    expect(pdf.taxCells[1]).toBe('GH₵187,500.15');
    expect(sum(pdf.taxCells)).toBe(money(pdf.taxTotal));
    const expectedTax = Array.from({ length: 80 }, (_, i) => longTax(i)).reduce((a, b) => a + b, 0);
    expect(money(pdf.taxTotal)).toBe(Math.round(expectedTax * 100) / 100);
  });
});
