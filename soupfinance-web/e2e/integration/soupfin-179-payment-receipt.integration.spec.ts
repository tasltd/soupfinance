/**
 * Added (SOUPFIN-179): a payment receipt round-trips through the real LXC backend. No mocks.
 *
 * It raises a fresh 10.00 bill through Bills > New Bill, then records a 0.01 BillPayment that
 * carries a PDF as a `data:application/pdf;base64,` URI in `paymentReceipt` — the exact shape
 * PaymentFormPage sends (PaymentFormPage.receipt.test.tsx proves the form builds it). It checks:
 *  - the save returns 201 and BillPayment.paymentReceipt is a SoupBrokerFile reference;
 *  - show/{id}.json returns the same reference;
 *  - /rest/soupBrokerFile/link/{id} returns the exact bytes that were attached;
 *  - Payments > Outgoing > the payment's detail page offers the receipt, and the browser
 *    download carries the same bytes.
 *
 * The save goes through the API, not the form, because two other defects block the form on
 * this backend today: SOUPFIN-176 (the form sends dotted `'bill.id'` keys that JSON binding
 * ignores) and bill index rows reporting amountDue 0, which empties the bill dropdown.
 *
 * Needs the soupmarkets-web fix SOUPFIN-266 (plans/soupfin-179-payment-receipt-backend.md). Before it
 * (verified 2026-10-13) the save is refused 422 "Property paymentReceipt is type-mismatched":
 * CachedRequestUtilityFilterInterceptor reads the controller name from the first path segment,
 * which is "rest" for every /rest/* URL, so the base64 value is never turned into a file.
 *
 * Run (the dev DB has no seed password for soup.support; any ROLE_ADMIN works):
 *   E2E_ADMIN_USERNAME=<admin> E2E_ADMIN_PASSWORD=<password> \
 *   npx playwright test --config=playwright.lxc.config.ts \
 *     e2e/integration/soupfin-179-payment-receipt.integration.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { backendTestUsers } from '../fixtures';

const API_BASE = 'http://10.115.213.183:9090';
const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-179-lxc';
mkdirSync(SHOT_DIR, { recursive: true });

// A small but real PDF so the stored bytes can be compared one for one.
const RECEIPT_BYTES = Buffer.from(
  `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n` +
    `trailer<</Root 1 0 R>>\n%SOUPFIN-179 receipt ${Date.now()}\n%%EOF\n`
);

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
  const remember = page.getByTestId('login-remember-checkbox');
  if (await remember.isVisible().catch(() => false)) await remember.check();
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
}

async function token(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '');
}

/** The auth gate renders before content; never use networkidle on this backend. */
async function waitForAuthSettled(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForFunction(() => !document.body.textContent?.includes('Verifying authentication'), { timeout: 20000 })
    .catch(() => {});
}

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Raise a one-line bill through Bills > New Bill so there is a balance to pay. */
async function raiseBill(page: Page): Promise<string> {
  await page.locator('aside a[href="/bills"]').first().click();
  await waitForAuthSettled(page);
  await page.getByTestId('bill-new-button').click();
  await waitForAuthSettled(page);
  await expect(page.getByTestId('bill-form-page')).toBeVisible({ timeout: 20000 });

  const vendorSelect = page.getByTestId('bill-vendor-select');
  await expect.poll(async () => vendorSelect.locator('option').count(), { timeout: 60000 }).toBeGreaterThan(1);
  await vendorSelect.selectOption({ index: 1 });
  await page.getByTestId('bill-due-date-input').fill(isoInDays(30));
  await page.getByTestId('bill-item-description-0').fill('SOUPFIN-179 receipt test');
  await page.getByTestId('bill-item-quantity-0').fill('1');
  await page.getByTestId('bill-item-unitPrice-0').fill('10');

  const saved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/rest\/bill\/save\.json/.test(r.url()),
    { timeout: 120000 }
  );
  await page.getByTestId('bill-form-save-button').click();
  const response = await saved;
  expect(response.status(), `bill save: ${(await response.text()).slice(0, 300)}`).toBeLessThan(300);
  const body = await response.json();
  const id = (body.bill ?? body).id as string;
  expect(id).toBeTruthy();
  return id;
}

interface BillPaymentShow {
  id: string;
  quickReference?: string;
  paymentReceipt?: { id: string; class?: string } | null;
}

test.describe('SOUPFIN-179 payment receipt round trip (LXC)', () => {
  test.setTimeout(240000);

  test('a data-URI receipt saved on a bill payment is stored and downloads unchanged', async ({ page }, testInfo) => {
    await login(page);
    const authToken = await token(page);
    expect(authToken).toBeTruthy();

    const billId = await raiseBill(page);
    await shot(page, 'soupfin-179-lxc-bill-raised');

    // A pay-from account the backend already accepts: the newest bill payment's payOutAccount.
    const recent = await page.request.get(`${API_BASE}/rest/billPayment/index.json?max=1`, {
      headers: { 'X-Auth-Token': authToken, Accept: 'application/json' },
      maxRedirects: 0,
      timeout: 60000,
    });
    expect(recent.ok(), `billPayment index -> ${recent.status()}`).toBeTruthy();
    const payOutAccountId = ((await recent.json()) as Array<{ payOutAccount?: { id: string } }>)[0]?.payOutAccount?.id;
    expect(payOutAccountId, 'the LXC tenant needs one existing bill payment to copy a pay-from account').toBeTruthy();

    const csrf = await page.request.get(`${API_BASE}/rest/billPayment/create.json`, {
      headers: { 'X-Auth-Token': authToken, Accept: 'application/json' },
      maxRedirects: 0,
      timeout: 60000,
    });
    const csrfBody = (await csrf.json()) as { SYNCHRONIZER_TOKEN?: string; SYNCHRONIZER_URI?: string };
    const query = new URLSearchParams({
      SYNCHRONIZER_TOKEN: csrfBody.SYNCHRONIZER_TOKEN ?? '',
      SYNCHRONIZER_URI: csrfBody.SYNCHRONIZER_URI ?? '',
    });

    const save = await page.request.post(`${API_BASE}/rest/billPayment/save.json?${query}`, {
      headers: { 'X-Auth-Token': authToken, Accept: 'application/json', 'Content-Type': 'application/json' },
      data: {
        bill: { id: billId },
        amount: 0.01,
        paymentDate: new Date().toISOString().slice(0, 10),
        payOutAccount: { id: payOutAccountId },
        notes: 'SOUPFIN-179 receipt round trip',
        paymentReceipt: `data:application/pdf;base64,${RECEIPT_BYTES.toString('base64')}`,
      },
      maxRedirects: 0,
      timeout: 120000,
    });
    const bodyText = await save.text();
    await testInfo.attach('save-response', { body: bodyText, contentType: 'application/json' });
    expect(save.status(), `billPayment save: ${bodyText.slice(0, 400)}`).toBe(201);

    const created = JSON.parse(bodyText) as BillPaymentShow;
    const fileId = created.paymentReceipt?.id;
    expect(fileId, 'save response has no paymentReceipt reference').toBeTruthy();

    // show/{id}.json returns the same file reference
    const show = await page.request.get(`${API_BASE}/rest/billPayment/show/${created.id}.json`, {
      headers: { 'X-Auth-Token': authToken, Accept: 'application/json' },
      maxRedirects: 0,
      timeout: 60000,
    });
    expect(show.ok(), `show -> ${show.status()}`).toBeTruthy();
    expect(((await show.json()) as BillPaymentShow).paymentReceipt?.id).toBe(fileId);

    // The stored file holds the exact bytes that were attached
    const link = await page.request.get(`${API_BASE}/rest/soupBrokerFile/link/${fileId}`, {
      headers: { 'X-Auth-Token': authToken },
      maxRedirects: 0,
      timeout: 60000,
    });
    expect(link.ok(), `soupBrokerFile/link -> ${link.status()}`).toBeTruthy();
    expect((await link.body()).equals(RECEIPT_BYTES)).toBe(true);

    // Detail page: Payments > Outgoing > the new row > Download receipt
    await page.locator('aside a[href="/payments"]').first().click();
    await waitForAuthSettled(page);
    await page.getByTestId('tab-outgoing').click();
    const viewLink = page.getByTestId(`payment-view-${created.id}`);
    await expect(viewLink).toBeVisible({ timeout: 60000 });
    await viewLink.click();
    await waitForAuthSettled(page);
    const downloadButton = page.getByTestId('payment-detail-receipt-download');
    await expect(downloadButton).toBeVisible({ timeout: 30000 });
    await shot(page, 'soupfin-179-lxc-detail-receipt');

    const downloadEvent = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadEvent;
    expect(readFileSync((await download.path())!).equals(RECEIPT_BYTES)).toBe(true);
  });
});
