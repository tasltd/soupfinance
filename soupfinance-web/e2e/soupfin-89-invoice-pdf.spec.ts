/**
 * SOUPFIN-89 — the PDF downloaded from the invoice detail page is empty
 *
 * html2pdf.js renders a CLONE of the element it is given. generatePdfFromHtml()
 * hid its wrapper off-screen with inline `position:absolute; left:-9999px`, and
 * the clone kept those inline styles. Inside html2pdf's own capture container
 * the clone therefore sat 9999px to the left, out of the frame html2canvas
 * photographs, so every page of the PDF came out blank.
 *
 * html2pdf draws the page as a JPEG, so the PDF has no text to search. This
 * spec pulls that JPEG out of the downloaded file and measures it in the
 * browser: a blank page is pure white, a real invoice has ink on it. It also
 * saves the extracted page image next to the screenshots as evidence.
 *
 * Every page is reached by clicking: dashboard -> sidebar Invoices -> invoice
 * row -> Download PDF.
 *
 * Run: E2E_PORT=5189 npx playwright test e2e/soupfin-89-invoice-pdf.spec.ts --project=firefox
 */
import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { installGuideMocks, seedAuthenticatedSession, invoices } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-89';

test.use({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
test.setTimeout(90_000);

/** Screenshots live in a git-tracked dir; test-results/ is wiped every run. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

interface PdfPageImage {
  width: number;
  height: number;
  jpeg: Buffer;
}

/**
 * Read the page count and the embedded JPEG page images from a jsPDF file.
 * jsPDF writes each image as an uncompressed XObject: a dictionary carrying
 * /Width, /Height, /Filter /DCTDecode and /Length, then `stream`, then exactly
 * /Length bytes of JPEG.
 */
function parsePdf(bytes: Buffer): {
  pageCount: number;
  mediaBoxes: number[][];
  images: PdfPageImage[];
} {
  const text = bytes.toString('latin1');
  const pageCount = (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  const mediaBoxes = [...text.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((m) =>
    m[1].trim().split(/\s+/).map(Number)
  );

  const images: PdfPageImage[] = [];
  const dict = /<<([^>]*\/Subtype\s*\/Image[^>]*)>>\s*stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = dict.exec(text)) !== null) {
    const body = match[1];
    if (!/\/DCTDecode/.test(body)) continue;
    const length = Number(body.match(/\/Length\s+(\d+)/)?.[1]);
    const width = Number(body.match(/\/Width\s+(\d+)/)?.[1]);
    const height = Number(body.match(/\/Height\s+(\d+)/)?.[1]);
    const start = match.index + match[0].length;
    images.push({ width, height, jpeg: bytes.subarray(start, start + length) });
  }
  return { pageCount, mediaBoxes, images };
}

/**
 * Share of pixels in a JPEG that are not near-white, measured with the
 * browser's own decoder. Also reports where the lowest inked row sits, so the
 * spec can tell a real invoice from a stray line.
 */
async function inkCoverage(page: Page, jpeg: Buffer) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let inked = 0;
    let lastInkedRow = -1;
    for (let i = 0; i < data.length; i += 4) {
      // JPEG noise keeps "white" slightly under 255; 200 is safely below it.
      if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) {
        inked++;
        lastInkedRow = Math.floor(i / 4 / canvas.width);
      }
    }
    return {
      ratio: inked / (data.length / 4),
      lastInkedRow,
      height: canvas.height,
    };
  }, jpeg.toString('base64'));
}

/** An invoice line in the shape computeInvoiceTotals() reads. */
const line = (id: string, description: string, quantity: number, unitPrice: number) => ({
  id,
  description,
  quantity,
  unitPrice,
  amount: quantity * unitPrice,
  taxEntryInvoiceItemList: [],
});

// Zero edge: a draft with no lines yet.
const emptyInvoice = {
  ...invoices[1],
  id: 'inv-089-empty',
  number: 1089,
  status: 'DRAFT',
  notes: '',
  subTotal: 0,
  totalTaxAmount: 0,
  total: 0,
  paidAmount: 0,
  amountDue: 0,
  invoicePaymentList: [],
  invoiceItemList: [] as ReturnType<typeof line>[],
};

// Overflow edge: 80 lines with 7-figure amounts and one description ten times
// the usual length, so the PDF has to run over several pages.
const longInvoice = {
  ...invoices[1],
  id: 'inv-089-long',
  number: 1090,
  status: 'SENT',
  notes: 'Annual retainer, itemised by month and workstream.',
  invoicePaymentList: [],
  invoiceItemList: Array.from({ length: 80 }, (_, i) =>
    line(
      `ii-long-${i}`,
      i === 0
        ? 'Programme management and stakeholder reporting across all regional offices, '.repeat(10).trim()
        : `Workstream ${i + 1} — monthly delivery`,
      i + 1,
      1_250_000 + i
    )
  ),
};

/** Serve the edge invoices beside the curated three. Registered last, so they win. */
async function addEdgeInvoices(page: Page) {
  const all = [...invoices, emptyInvoice, longInvoice];
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
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
 * Dashboard -> sidebar Invoices -> invoice row -> Download PDF, all by clicking.
 * Returns the parsed PDF.
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
  await shot(page, `${prefix}-detail-before-download`);

  const button = page.getByTestId('invoice-download-pdf-button');
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toBe(`Invoice-${invoice.number}.pdf`);

  // The button returns to its resting label once the file is handed over.
  await expect(button).toHaveText(/Download PDF/, { timeout: 30_000 });
  // The render container is removed again, so nothing leaks into the page.
  await expect(page.locator('.html2pdf__overlay')).toHaveCount(0);
  await shot(page, `${prefix}-detail-after-download`);

  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

  const pdf = parsePdf(bytes);
  expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  // One page image per page — the empty render added none at all.
  expect(pdf.images).toHaveLength(pdf.pageCount);
  for (const [n, image] of pdf.images.entries()) {
    await writeFile(`${SHOT_DIR}/${prefix}-pdf-page-${n + 1}.jpg`, image.jpeg);
  }

  // Every page is A4 portrait: 595.28 x 841.89 pt.
  expect(pdf.mediaBoxes.length).toBeGreaterThanOrEqual(1);
  for (const [, , w, h] of pdf.mediaBoxes) {
    expect(w).toBeCloseTo(595.28, 1);
    expect(h).toBeCloseTo(841.89, 1);
  }
  // The page image spans the printable width at scale 2. html2pdf trims the
  // last image to the content, so its height depends on the invoice.
  for (const image of pdf.images) expect(image.width).toBeGreaterThan(1000);

  // The footer's last line is whole: clear rows remain under the lowest ink.
  // html2canvas draws text a little low, and with no room below the last line
  // it was cut through the middle.
  const last = await inkCoverage(page, pdf.images[pdf.images.length - 1].jpeg);
  expect(last.ratio).toBeGreaterThan(0);
  expect(last.height - 1 - last.lastInkedRow).toBeGreaterThan(8);
  return pdf;
}

test.describe('SOUPFIN-89: invoice PDF download', () => {
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

  test.afterEach(() => apiGuard.assertNone('SOUPFIN-89 invoice PDF spec'));

  test('Download PDF on the invoice detail page produces a page with the invoice drawn on it', async ({
    page,
  }) => {
    // inv-003 has two line items, a part payment and notes: the fullest layout.
    const invoice = invoices.find((i) => i.id === 'inv-003')!;
    const { images } = await downloadInvoicePdf(page, invoice, 'invoice');

    const ink = await inkCoverage(page, images[0].jpeg);
    // A blank page is 0%. The header rule, table and text put several percent
    // of the page in ink.
    expect(ink.ratio).toBeGreaterThan(0.01);
    // Content reaches past the top quarter: header, parties, table and totals,
    // not only a first line.
    expect(ink.lastInkedRow).toBeGreaterThan(ink.height * 0.25);
  });

  test('an invoice with no lines still downloads a drawn page (zero edge)', async ({ page }) => {
    const { pageCount, images } = await downloadInvoicePdf(page, emptyInvoice, 'empty-invoice');

    expect(pageCount).toBe(1);
    const ink = await inkCoverage(page, images[0].jpeg);
    // Header, parties, empty table head, totals and footer are still drawn.
    expect(ink.ratio).toBeGreaterThan(0.005);
    expect(ink.lastInkedRow).toBeGreaterThan(ink.height * 0.25);
  });

  test('an 80-line invoice runs over several pages, each one drawn (overflow edge)', async ({ page }) => {
    const { pageCount, images } = await downloadInvoicePdf(page, longInvoice, 'long-invoice');

    expect(pageCount).toBeGreaterThanOrEqual(3);
    for (const image of images) {
      const ink = await inkCoverage(page, image.jpeg);
      expect(ink.ratio).toBeGreaterThan(0.005);
    }
  });
});
