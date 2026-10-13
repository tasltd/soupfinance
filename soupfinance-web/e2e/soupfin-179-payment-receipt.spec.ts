/**
 * SOUPFIN-179: attach a payment receipt (BillPayment.paymentReceipt) on the payment form,
 * then see and download it on the payment detail page.
 *
 * Mock mode. Navigation is by sidebar and page clicks only. The save mock does what the
 * backend file utility does: it decodes the base64 data URI into a stored file and answers
 * with a SoupBrokerFile reference, and soupBrokerFile/link serves those stored bytes. So the
 * spec checks the bytes the user picked are the bytes the detail page downloads, not just
 * that a request went out. The real round trip is
 * e2e/integration/soupfin-179-payment-receipt.integration.spec.ts.
 */
import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-179';

test.use({ viewport: { width: 1440, height: 1100 } });
test.setTimeout(120_000);

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

const json = (body: unknown, status = 200) => (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const RECEIPT_BYTES = Buffer.from('%PDF-1.4\n%SOUPFIN-179 proof of payment\n%%EOF\n');

interface Backend {
  saved: Array<Record<string, unknown>>;
  files: Map<string, { bytes: Buffer; contentType: string }>;
}

/** Sign in on the dashboard with the guide data and a billPayment backend that stores receipts. */
async function openApp(page: Page): Promise<Backend> {
  const backend: Backend = { saved: [], files: new Map() };
  const payments: Array<Record<string, unknown>> = [];

  await installGuideMocks(page);
  await page.route('**/rest/billPayment/index.json*', (route) => json(payments)(route));
  await page.route('**/rest/billPayment/create.json*', json({ SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/billPayment/save' }));
  await page.route('**/rest/billPayment/save.json*', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    backend.saved.push(body);
    const payment: Record<string, unknown> = {
      id: 'bp-179',
      quickReference: '179RECEIPT',
      bill: { id: 'bill-001', class: 'soupbroker.finance.Bill', serialised: 'Bill((Accra Office Supplies Ltd)[PROVIDER], BILL-2026-014)' },
      payOutAccount: { id: 'acc-1000', class: 'soupbroker.finance.LedgerAccount', serialised: 'Cash at Bank' },
      amount: body.amount,
      paymentDate: `${body.paymentDate}T00:00:00Z`,
      notes: body.notes,
      dateCreated: '2026-10-13T12:00:00Z',
      totalCount: 1,
    };
    const receipt = typeof body.paymentReceipt === 'string' ? body.paymentReceipt : '';
    const match = /^data:([^;]+);base64,(.+)$/.exec(receipt);
    if (match) {
      backend.files.set('file-179', { contentType: match[1], bytes: Buffer.from(match[2], 'base64') });
      payment.paymentReceipt = { id: 'file-179', class: 'soupbroker.tools.SoupBrokerFile' };
    }
    payments.unshift(payment);
    await json(payment, 201)(route);
  });
  await page.route('**/rest/billPayment/show/*.json*', (route) => {
    const id = route.request().url().match(/show\/([^.]+)\.json/)?.[1];
    const payment = payments.find((p) => p.id === id);
    return payment ? json(payment)(route) : json({}, 404)(route);
  });
  await page.route('**/rest/soupBrokerFile/link/*', (route) => {
    const id = route.request().url().split('/').pop()!.split('?')[0];
    const file = backend.files.get(id);
    return file
      ? route.fulfill({ status: 200, contentType: file.contentType, body: file.bytes })
      : route.fulfill({ status: 404, body: 'file not found' });
  });
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  return backend;
}

/** Payments > Record Payment > Outgoing (Bill), through the sidebar. */
async function openOutgoingPaymentForm(page: Page) {
  await page.locator('aside').locator('a[href="/payments"]').first().click();
  await expect(page).toHaveURL(/\/payments$/);
  await page.getByTestId('record-payment-button').click();
  await expect(page.getByTestId('payment-form-page')).toBeVisible();
  await page.getByTestId('type-bill').click();
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-179: payment receipt upload', () => {
  test.skip(isLxcMode(), 'Mock spec: the LXC round trip lives in e2e/integration/');

  test.beforeEach(async ({ page }) => {
    apiGuard = await installUnmockedApiGuard(page); // FIRST, so every explicit mock wins
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('attach a receipt to a bill payment, then download it from the payment detail page', async ({ page }) => {
    const backend = await openApp(page);
    await openOutgoingPaymentForm(page);

    await page.getByTestId('select-document').selectOption('bill-001');
    await page.getByTestId('amount-input').fill('1200');
    await page.getByTestId('bank-account-select').selectOption('acc-1000');
    await expect(page.getByTestId('receipt-dropzone')).toBeVisible();
    await expect(page.getByTestId('receipt-dropzone')).toContainText('PDF, PNG or JPG (max. 5 MB)');
    await shot(page, 'soupfin-179-form-empty-dropzone');

    // Refused: wrong type
    await page.getByTestId('receipt-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
    await expect(page.getByTestId('receipt-error')).toHaveText('notes.txt is not a PDF, PNG or JPG file.');
    await expect(page.getByTestId('receipt-selected')).toHaveCount(0);
    await shot(page, 'soupfin-179-rejected-type');

    // Refused: one byte over 5 MB
    await page.getByTestId('receipt-input').setInputFiles({
      name: 'scan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await expect(page.getByTestId('receipt-error')).toHaveText('scan.pdf is 5.0 MB. Receipts must be 5 MB or smaller.');
    await shot(page, 'soupfin-179-rejected-size');

    // Accepted
    await page.getByTestId('receipt-input').setInputFiles({ name: 'proof-of-payment.pdf', mimeType: 'application/pdf', buffer: RECEIPT_BYTES });
    await expect(page.getByTestId('receipt-error')).toHaveCount(0);
    await expect(page.getByTestId('receipt-file-name')).toHaveText('proof-of-payment.pdf');
    await shot(page, 'soupfin-179-receipt-attached');

    await page.getByTestId('submit-button').click();
    await expect(page).toHaveURL(/\/payments$/);

    // The request carried the picked bytes as a data URI
    expect(backend.saved).toHaveLength(1);
    const sent = String(backend.saved[0].paymentReceipt);
    expect(sent.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(Buffer.from(sent.split(',')[1], 'base64').equals(RECEIPT_BYTES)).toBe(true);

    // Payments > Outgoing > the new payment
    await page.getByTestId('tab-outgoing').click();
    await page.getByTestId('payment-view-bp-179').click();
    await expect(page).toHaveURL(/\/payments\/bill\/bp-179$/);
    const download = page.getByTestId('payment-detail-receipt-download');
    await expect(download).toBeVisible();
    await shot(page, 'soupfin-179-detail-with-receipt');

    const downloaded = page.waitForEvent('download');
    await download.click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe('payment-receipt-179RECEIPT.pdf');
    expect(readFileSync((await file.path())!).equals(RECEIPT_BYTES)).toBe(true);
  });

  test('a bill payment saved without a receipt says so on its detail page', async ({ page }) => {
    const backend = await openApp(page);
    await openOutgoingPaymentForm(page);

    await page.getByTestId('select-document').selectOption('bill-001');
    await page.getByTestId('amount-input').fill('50');
    await page.getByTestId('submit-button').click();
    await expect(page).toHaveURL(/\/payments$/);
    expect(backend.saved[0]).not.toHaveProperty('paymentReceipt');

    await page.getByTestId('tab-outgoing').click();
    await page.getByTestId('payment-view-bp-179').click();
    await expect(page.getByTestId('payment-detail-receipt')).toHaveText('None attached');
    await shot(page, 'soupfin-179-detail-no-receipt');
  });

  test('incoming (invoice) payments offer no receipt upload', async ({ page }) => {
    await openApp(page);
    await openOutgoingPaymentForm(page);
    await expect(page.getByTestId('receipt-field')).toBeVisible();

    await page.getByTestId('type-invoice').click();
    await expect(page.getByTestId('receipt-field')).toHaveCount(0);
    await shot(page, 'soupfin-179-incoming-no-dropzone');
  });
});
