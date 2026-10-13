/**
 * SOUPFIN-175 — a taxed bill's whole life against the REAL LXC backend. No mocks.
 *
 * Bills had mock specs (e2e/bills.spec.ts, soupfin-43, soupfin-44) and unit tests, but the
 * SOUPFIN-38 tax fix was only ever checked by hand against a real backend. This spec walks one
 * bill through every write the app makes and reads each result back off the API:
 *
 *   1. create a vendor        POST /rest/trading/vendor/save.json
 *   2. create a bill          the form: one VAT-S 15% line, one untaxed line
 *   3. edit the bill          the form: change qty, change the tax, remove line 2
 *   4. record a part payment  Record Payment -> POST /rest/billPayment/save.json
 *   5. download the PDF       the Tax column of the line, read from the HTML html2pdf draws
 *   6. delete the bill        the detail page's Delete button, then an admin cleanup
 *
 * Every figure the UI shows is compared with what the backend stored, because a form preview
 * that is right while the saved row is wrong is exactly what SOUPFIN-38 was.
 *
 * Two defects this spec found were fixed in the app with it:
 *   - removing a line in the edit form left the line on the backend (the total kept it);
 *     the form now deletes removed lines after the update succeeds;
 *   - a refused delete (200 + relatedList) took the user back to the list as if deleted;
 *     the detail page now says the bill was not deleted.
 *
 * Two open defects are SOFT assertions, so a failure there still lets the cleanup run:
 *   - SOUPFIN-47: the bill PDF prints 0% in the Tax column of a taxed line;
 *   - SOUPFIN-262: the backend refuses to delete any bill with a line, because its own
 *     lines and tax rows count as related records.
 * The test stays red until both land; that failure is the open bug, not this spec.
 * The SOUPFIN-48 mock bills.spec failures belong to Testing and are not duplicated here.
 *
 * Integration rules followed: no `networkidle`, `maxRedirects: 0` on every direct API call,
 * direct reads go through `safeApiGet`, and pages are reached by clicking (only /login is
 * visited by URL).
 *
 * Run (the LXC backend reads soupbroker_dev, where soup.support has no seed password):
 *   E2E_ADMIN_USERNAME=david.tetteh E2E_ADMIN_PASSWORD=david.tetteh \
 *     npx playwright test --config=playwright.lxc.config.ts \
 *     e2e/integration/soupfin-175-bill-lifecycle.integration.spec.ts --project=firefox
 */
import { test, expect, type Page, type APIResponse } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { backendTestUsers } from '../fixtures';

const API_BASE = 'http://10.115.213.183:9090';

// test-results/ is wiped on each run and git-ignored; the committed copy is the evidence.
const SHOT_DIRS = [
  'test-results/screenshots/soupfin-175',
  'e2e/playwright/screenshots/soupfin-175',
];
for (const dir of SHOT_DIRS) mkdirSync(dir, { recursive: true });

// The two TaxEntries the ticket names, as seeded on the dev data.
const VAT_S = { label: 'VAT-S-15.0%', rate: 15 };
const CST = { label: 'CST-5.0%', rate: 5 };

// Created bill: 2 x 1500 at 15% plus an untaxed 1 x 400.
const LINE_1 = { description: 'SOUPFIN-175 consulting (VAT-S)', qty: 2, price: 1500 };
const LINE_2 = { description: 'SOUPFIN-175 courier (untaxed)', qty: 1, price: 400 };
const CREATED = { subTotal: 3400, tax: 450, total: 3850 };
// Edited bill: line 1 becomes 3 x 1500 at 5%; line 2 is removed.
const EDITED_QTY = 3;
const EDITED = { subTotal: 4500, tax: 225, total: 4725 };
const PAYMENT = 1000;

async function shot(page: Page, name: string) {
  for (const dir of SHOT_DIRS) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').waitFor({ state: 'visible', timeout: 20000 });
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
  const remember = page.getByTestId('login-remember-checkbox');
  if (await remember.isVisible().catch(() => false)) await remember.check();
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
}

/** Dual storage: remember-me writes localStorage, otherwise sessionStorage. */
async function authToken(page: Page): Promise<string> {
  return page.evaluate(
    () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
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

/** Direct API read that survives a slow or crashed backend instead of hanging the test. */
async function safeApiGet(page: Page, path: string, token: string, timeout = 45000) {
  try {
    return await page.request.get(`${API_BASE}${path}`, {
      headers: { 'X-Auth-Token': token, Accept: 'application/json' },
      timeout,
      maxRedirects: 0,
    });
  } catch (e) {
    console.log(`[SOUPFIN-175] GET ${path} failed: ${(e as Error).message.slice(0, 200)}`);
    return null;
  }
}

async function readJson<T>(res: APIResponse | null, what: string): Promise<T> {
  expect(res, `${what}: no response from the backend`).not.toBeNull();
  expect(res!.status(), `${what}: HTTP ${res!.status()}`).toBe(200);
  return (await res!.json()) as T;
}

interface BillHeader {
  id: string;
  subTotal: number;
  totalTaxAmount: number;
  total: number;
  paidAmount: number;
  amountDue: number;
  status: string | null;
  archived?: boolean;
}

interface JoinRow {
  taxAmount?: number;
  serialised?: string;
}

interface BillItemRow {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxEntryBillItemList?: JoinRow[] | null;
}

/**
 * Tax on one join row. Grails often sends the row as a bare FK reference, where the amount is
 * the last number of `TaxEntryBillItem(BillItem(...), CST-5.0%, 225.0)`.
 */
function joinTax(row: JoinRow): number {
  if (typeof row.taxAmount === 'number') return row.taxAmount;
  const m = row.serialised?.match(/,\s*(-?[\d.]+)\s*\)\s*$/);
  return m ? parseFloat(m[1]) : NaN;
}

function joinLabel(row: JoinRow): string {
  return row.serialised?.match(/,\s*([^,()]+?),\s*-?[\d.]+\s*\)\s*$/)?.[1]?.trim() ?? '';
}

async function getBillHeader(page: Page, token: string, id: string) {
  return readJson<BillHeader>(
    await safeApiGet(page, `/rest/bill/show/${id}.json`, token),
    `bill/show/${id}`
  );
}

async function getBillItems(page: Page, token: string, id: string) {
  return readJson<BillItemRow[]>(
    await safeApiGet(page, `/rest/billItem/index.json?bill.id=${id}&max=100`, token),
    `billItem/index for ${id}`
  );
}

/** "3,400.00" for 3400 — the amount part every currency format in the app shares. */
function money(n: number): RegExp {
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return new RegExp(s.replace(/[.,]/g, (c) => `\\${c}`));
}

/** POST a vendor the way the app does: CSRF from create.json, sent as query params. */
async function createVendorViaApi(page: Page, token: string, name: string): Promise<string> {
  const headers = { 'X-Auth-Token': token, Accept: 'application/json' };
  const create = await page.request.get(`${API_BASE}/rest/trading/vendor/create.json`, {
    headers,
    maxRedirects: 0,
    timeout: 60000,
  });
  expect(create.status(), 'vendor/create.json must hand out a CSRF token').toBe(200);
  const csrf = await create.json();
  const qs = new URLSearchParams({
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  const save = await page.request.post(`${API_BASE}/rest/trading/vendor/save.json?${qs}`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: { name, email: `soupfin175+${Date.now()}@example.com` },
    maxRedirects: 0,
    timeout: 60000,
  });
  // A 302 here means the CSRF token or the JSON binding was refused.
  expect(save.status(), `vendor save: ${(await save.text()).slice(0, 300)}`).toBe(201);
  const vendor = await save.json();
  expect(vendor.id).toBeTruthy();
  expect(vendor.name).toBe(name);
  return vendor.id as string;
}

/** The TaxEntry id whose serialised label is exactly `label`, e.g. "VAT-S-15.0%". */
async function taxEntryId(page: Page, token: string, label: string): Promise<string> {
  const entries = await readJson<Array<{ id: string; serialised?: string }>>(
    await safeApiGet(page, '/rest/taxEntry/index.json?max=100', token),
    'taxEntry/index'
  );
  const hit = entries.find((e) => e.serialised?.trim() === label);
  expect(hit, `no TaxEntry ${label} on this backend`).toBeTruthy();
  return hit!.id;
}

/** Pick a line's tax by TaxEntry id, once the dropdown has loaded it. */
async function selectTax(page: Page, index: number, id: string) {
  const select = page.getByTestId(`bill-item-taxRate-${index}`);
  await expect(select.locator(`option[value="${id}"]`)).toHaveCount(1, { timeout: 30000 });
  await select.selectOption(id);
}

/** Record the HTML of each PDF render container: html2pdf pages are JPEGs with no text. */
async function capturePdfHtml(page: Page) {
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
    // `document`, not documentElement: in Firefox init scripts run before <html> exists.
    observer.observe(document, { childList: true, subtree: true });
  });
}

async function openBillFromList(page: Page, billId: string) {
  await page.locator('aside a[href="/bills"]').first().click();
  await waitForAuthSettled(page);
  await expect(page.getByTestId('bill-list-page')).toBeVisible({ timeout: 30000 });
  await page.getByTestId(`bill-link-${billId}`).click();
  await waitForAuthSettled(page);
  await expect(page.getByTestId('bill-detail-heading')).toBeVisible({ timeout: 30000 });
}

/** Today + n days, local calendar. */
function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test.use({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });

test.describe('SOUPFIN-175 bill lifecycle on the LXC backend', () => {
  test('create, edit, pay, print and delete a taxed bill', async ({ page }) => {
    test.setTimeout(600_000);
    await capturePdfHtml(page);

    let token = '';
    let vendorId = '';
    let billId = '';
    let vatSId = '';
    let cstId = '';
    // Fixed-width stamp so the vendor sorts first: the form only lists the first 100
    // vendors by name, and the dev data has hundreds.
    const vendorName = `0000 SOUPFIN-175 Vendor ${Date.now()}`;

    await test.step('sign in', async () => {
      await login(page);
      token = await authToken(page);
      expect(token, 'auth token after login').toBeTruthy();
      await shot(page, '01-dashboard');
    });

    await test.step('1. create a vendor via /rest/trading/vendor/save.json', async () => {
      vendorId = await createVendorViaApi(page, token, vendorName);
      const vendor = await readJson<{ id: string; name: string }>(
        await safeApiGet(page, `/rest/trading/vendor/show/${vendorId}.json`, token),
        'vendor/show'
      );
      expect(vendor.name).toBe(vendorName);
      vatSId = await taxEntryId(page, token, VAT_S.label);
      cstId = await taxEntryId(page, token, CST.label);
    });

    await test.step('2. create a bill with a VAT-S 15% line and an untaxed line', async () => {
      await page.locator('aside a[href="/bills"]').first().click();
      await waitForAuthSettled(page);
      await expect(page.getByTestId('bill-list-page')).toBeVisible({ timeout: 30000 });
      await page.getByTestId('bill-new-button').click();
      await waitForAuthSettled(page);
      await expect(page.getByTestId('bill-form-heading')).toBeVisible({ timeout: 30000 });

      const vendorSelect = page.getByTestId('bill-vendor-select');
      await expect(vendorSelect.locator(`option[value="${vendorId}"]`)).toHaveCount(1, {
        timeout: 30000,
      });
      await vendorSelect.selectOption(vendorId);
      await page.getByTestId('bill-due-date-input').fill(isoDate(30));

      await page.getByTestId('bill-item-description-0').fill(LINE_1.description);
      await page.getByTestId('bill-item-quantity-0').fill(String(LINE_1.qty));
      await page.getByTestId('bill-item-unitPrice-0').fill(String(LINE_1.price));
      await selectTax(page, 0, vatSId);

      await page.getByTestId('bill-add-item-button').click();
      await page.getByTestId('bill-item-description-1').fill(LINE_2.description);
      await page.getByTestId('bill-item-quantity-1').fill(String(LINE_2.qty));
      await page.getByTestId('bill-item-unitPrice-1').fill(String(LINE_2.price));
      // Line 2 keeps the default "No Tax".
      await expect(page.getByTestId('bill-item-taxRate-1')).toHaveValue('');

      // The preview must already add the tax.
      await expect(page.getByTestId('bill-subtotal')).toHaveText(money(CREATED.subTotal));
      await expect(page.getByTestId('bill-tax')).toHaveText(money(CREATED.tax));
      await expect(page.getByTestId('bill-total')).toHaveText(money(CREATED.total));
      await shot(page, '02-new-bill-form-filled');

      const saved = page.waitForResponse(
        (r) => r.url().includes('/rest/bill/save.json') && r.request().method() === 'POST',
        { timeout: 120000 }
      );
      await page.getByTestId('bill-form-save-button').click();
      const saveResponse = await saved;
      expect(saveResponse.status(), 'bill save').toBe(201);
      billId = (await saveResponse.json()).id;
      expect(billId, 'saved bill id').toBeTruthy();
      await expect(page).toHaveURL(/\/bills$/, { timeout: 60000 });
      await waitForAuthSettled(page);
      await shot(page, '03-bill-list-after-create');

      // ---- What the backend stored ------------------------------------------------
      const header = await getBillHeader(page, token, billId);
      console.log('[SOUPFIN-175] created header:', JSON.stringify(header));
      expect(header.subTotal).toBeCloseTo(CREATED.subTotal, 2);
      expect(header.totalTaxAmount).toBeCloseTo(CREATED.tax, 2);
      expect(header.total).toBeCloseTo(CREATED.total, 2);
      expect(header.paidAmount ?? 0).toBeCloseTo(0, 2);
      expect(header.amountDue).toBeCloseTo(CREATED.total, 2);

      const items = await getBillItems(page, token, billId);
      expect(items, 'two lines saved').toHaveLength(2);
      const taxed = items.find((i) => i.description === LINE_1.description)!;
      const untaxed = items.find((i) => i.description === LINE_2.description)!;
      expect(taxed, 'taxed line saved').toBeTruthy();
      expect(untaxed, 'untaxed line saved').toBeTruthy();
      expect(taxed.taxEntryBillItemList ?? [], 'taxed line has one tax row').toHaveLength(1);
      expect(joinLabel(taxed.taxEntryBillItemList![0])).toBe(VAT_S.label);
      expect(joinTax(taxed.taxEntryBillItemList![0])).toBeCloseTo(CREATED.tax, 2);
      expect(untaxed.taxEntryBillItemList ?? [], 'untaxed line has no tax rows').toHaveLength(0);

      // ---- The detail page shows the same figures ---------------------------------
      await page.getByTestId(`bill-link-${billId}`).click();
      await waitForAuthSettled(page);
      await expect(page.getByTestId('bill-detail-subtotal')).toHaveText(money(CREATED.subTotal), {
        timeout: 30000,
      });
      await expect(page.getByTestId('bill-detail-tax')).toHaveText(money(CREATED.tax));
      await expect(page.getByTestId('bill-detail-total')).toHaveText(money(CREATED.total));
      await expect(page.getByTestId('bill-detail-balance-due')).toHaveText(money(CREATED.total));
      const rows = page.getByTestId('bill-items-table').locator('tbody tr');
      await expect(rows).toHaveCount(2);
      await expect(rows.filter({ hasText: LINE_1.description })).toContainText(`${VAT_S.rate}%`);
      await expect(rows.filter({ hasText: LINE_2.description })).toContainText('0%');
      await shot(page, '04-bill-detail-after-create');
    });

    await test.step('3. edit: change qty, change the tax, remove line 2', async () => {
      await page.getByTestId('bill-edit-button').click();
      await waitForAuthSettled(page);
      await expect(page.getByTestId('bill-form-heading')).toBeVisible({ timeout: 30000 });
      // Wait for the saved lines and their tax to populate the form. The backend does not
      // return lines in creation order, so find each one by its description.
      const descriptions = async () =>
        Promise.all([0, 1].map((i) => page.getByTestId(`bill-item-description-${i}`).inputValue().catch(() => '')));
      await expect
        .poll(async () => (await descriptions()).slice().sort(), { timeout: 30000 })
        .toEqual([LINE_1.description, LINE_2.description].sort());
      await expect(page.getByTestId('bill-tax')).toHaveText(money(CREATED.tax), { timeout: 30000 });
      await shot(page, '05-edit-form-loaded');

      const line1Index = (await descriptions()).indexOf(LINE_1.description);
      const line2Index = 1 - line1Index;
      await page.getByTestId(`bill-item-quantity-${line1Index}`).fill(String(EDITED_QTY));
      await selectTax(page, line1Index, cstId);
      await page.getByTestId(`bill-item-remove-${line2Index}`).click();
      await expect(page.getByTestId('bill-item-description-1')).toHaveCount(0);

      await expect(page.getByTestId('bill-subtotal')).toHaveText(money(EDITED.subTotal));
      await expect(page.getByTestId('bill-tax')).toHaveText(money(EDITED.tax));
      await expect(page.getByTestId('bill-total')).toHaveText(money(EDITED.total));
      await shot(page, '06-edit-form-changed');

      const updateRequest = page.waitForRequest(
        (r) => r.url().includes(`/rest/bill/update/${billId}`) && r.method() === 'PUT',
        { timeout: 120000 }
      );
      const updateResponse = page.waitForResponse(
        (r) => r.url().includes(`/rest/bill/update/${billId}`) && r.request().method() === 'PUT',
        { timeout: 120000 }
      );
      await page.getByTestId('bill-form-save-button').click();
      const body = (await updateRequest).postDataJSON() as Record<string, unknown>;
      const response = await updateResponse;
      expect(response.status(), `bill update: ${(await response.text()).slice(0, 300)}`).toBe(200);

      // updateBill sends billItemList[n].id only for the kept line.
      const itemKeys = Object.keys(body).filter((k) => k.startsWith('billItemList['));
      expect(itemKeys.some((k) => k.startsWith('billItemList[1]')), 'no second line sent').toBe(false);
      expect(body['billItemList[0].id'], 'kept line carries its id').toBeTruthy();
      expect(body['billItemList[0].quantity']).toBe(EDITED_QTY);

      await expect(page).toHaveURL(new RegExp(`/bills/${billId}$`), { timeout: 60000 });
      await waitForAuthSettled(page);

      // ---- What the backend stored ------------------------------------------------
      const header = await getBillHeader(page, token, billId);
      console.log('[SOUPFIN-175] edited header:', JSON.stringify(header));
      expect(header.subTotal).toBeCloseTo(EDITED.subTotal, 2);
      expect(header.totalTaxAmount).toBeCloseTo(EDITED.tax, 2);
      expect(header.total).toBeCloseTo(EDITED.total, 2);
      expect(header.amountDue).toBeCloseTo(EDITED.total, 2);

      const items = await getBillItems(page, token, billId);
      console.log('[SOUPFIN-175] edited items:', JSON.stringify(items.map((i) => i.description)));
      expect(items, 'the removed line is gone from the backend').toHaveLength(1);
      expect(items[0].id).toBe(body['billItemList[0].id']);
      expect(items[0].description).toBe(LINE_1.description);
      expect(Number(items[0].quantity)).toBe(EDITED_QTY);
      // The old VAT-S row must be replaced, not kept beside the new CST row.
      expect(items[0].taxEntryBillItemList ?? [], 'one tax row after the change').toHaveLength(1);
      expect(joinLabel(items[0].taxEntryBillItemList![0])).toBe(CST.label);
      expect(joinTax(items[0].taxEntryBillItemList![0])).toBeCloseTo(EDITED.tax, 2);

      // ---- The detail page agrees -------------------------------------------------
      await expect(page.getByTestId('bill-detail-subtotal')).toHaveText(money(EDITED.subTotal), {
        timeout: 30000,
      });
      await expect(page.getByTestId('bill-detail-tax')).toHaveText(money(EDITED.tax));
      await expect(page.getByTestId('bill-detail-total')).toHaveText(money(EDITED.total));
      const rows = page.getByTestId('bill-items-table').locator('tbody tr');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText(LINE_1.description);
      await expect(rows.first()).toContainText(`${CST.rate}%`);
      await shot(page, '07-bill-detail-after-edit');
    });

    await test.step('4. record a partial payment', async () => {
      await page.getByTestId('record-payment-button').click();
      await waitForAuthSettled(page);
      await expect(page.getByTestId('payment-form-heading')).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId('select-document')).toHaveValue(billId, { timeout: 30000 });
      await page.getByTestId('amount-input').fill(String(PAYMENT));

      // A payment method is optional; use the first real one when the tenant has any.
      const method = page.getByTestId('method-select');
      if (await method.isVisible().catch(() => false)) {
        const firstMethod = await method
          .locator('option')
          .evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value).find((v) => !!v));
        if (firstMethod) await method.selectOption(firstMethod);
      }
      // The backend requires the account the payment comes from (BillPayment.payOutAccount).
      const account = page.getByTestId('bank-account-select');
      await expect
        .poll(async () => account.locator('option').count(), { timeout: 60000 })
        .toBeGreaterThan(1);
      const firstAccount = await account
        .locator('option')
        .evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value).find((v) => !!v));
      await account.selectOption(firstAccount!);
      await page.getByTestId('reference-input').fill('SOUPFIN-175 part payment');
      await shot(page, '08-payment-form-filled');

      const saved = page.waitForResponse(
        (r) => r.url().includes('/rest/billPayment/save.json') && r.request().method() === 'POST',
        { timeout: 120000 }
      );
      await page.getByTestId('submit-button').click();
      const response = await saved;
      expect(response.status(), `billPayment save: ${(await response.text()).slice(0, 300)}`).toBe(201);
      await expect(page).toHaveURL(/\/payments$/, { timeout: 60000 });
      await waitForAuthSettled(page);
      await shot(page, '09-payments-after-save');

      const payments = await readJson<
        Array<{ amount: number; bill?: { id: string }; payOutAccount?: { id: string } }>
      >(
        await safeApiGet(page, `/rest/billPayment/index.json?bill.id=${billId}`, token),
        'billPayment/index'
      );
      const ours = payments.filter((p) => !p.bill || p.bill.id === billId);
      expect(ours, 'exactly one payment on the bill').toHaveLength(1);
      expect(Number(ours[0].amount)).toBeCloseTo(PAYMENT, 2);
      expect(ours[0].payOutAccount?.id, 'the chosen account was saved').toBe(firstAccount);

      const header = await getBillHeader(page, token, billId);
      console.log('[SOUPFIN-175] paid header:', JSON.stringify(header));
      expect(header.paidAmount).toBeCloseTo(PAYMENT, 2);
      expect(header.amountDue).toBeCloseTo(EDITED.total - PAYMENT, 2);
      expect(header.total).toBeCloseTo(EDITED.total, 2);
      // Part-paid is still open: never PAID while a balance is due.
      expect(header.status).not.toBe('PAID');

      await openBillFromList(page, billId);
      await expect(page.getByTestId('bill-detail-amount-paid')).toHaveText(money(PAYMENT), {
        timeout: 30000,
      });
      await expect(page.getByTestId('bill-detail-balance-due')).toHaveText(
        money(EDITED.total - PAYMENT)
      );
      await expect(page.getByTestId('bill-payments-table').locator('tbody tr')).toHaveCount(1);
      await expect(page.getByTestId('record-payment-button')).toBeVisible();
      await shot(page, '10-bill-detail-part-paid');
    });

    await test.step('5. download the PDF and read the line Tax column', async () => {
      const download = page.waitForEvent('download', { timeout: 120000 });
      await page.getByTestId('bill-download-pdf-button').click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^Bill-.*\.pdf$/);

      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __pdfHtml: string[] }).__pdfHtml.length), {
          timeout: 30000,
        })
        .toBeGreaterThan(0);
      const html = await page.evaluate(
        () => (window as unknown as { __pdfHtml: string[] }).__pdfHtml[0]
      );

      const pdf = await page.evaluate((markup) => {
        const doc = new DOMParser().parseFromString(markup, 'text/html');
        const table = Array.from(doc.querySelectorAll('table')).find((t) =>
          t.querySelector('th')?.textContent?.includes('Description')
        );
        const heads = Array.from(table?.querySelectorAll('thead th') ?? []).map(
          (th) => th.textContent?.trim() ?? ''
        );
        const rows = Array.from(table?.querySelectorAll('tbody tr') ?? []).map((tr) =>
          Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? '')
        );
        return { heads, rows, text: doc.body.textContent ?? '' };
      }, html);
      console.log('[SOUPFIN-175] PDF lines:', JSON.stringify(pdf));

      // Render the exact HTML the PDF is drawn from, as visual evidence.
      const preview = await page.context().newPage();
      await preview.setContent(html);
      await preview.screenshot({ path: `${SHOT_DIRS[1]}/11-pdf-source.png`, fullPage: true });
      await preview.screenshot({ path: `${SHOT_DIRS[0]}/11-pdf-source.png`, fullPage: true });
      await preview.close();

      expect(pdf.rows, 'one line in the PDF, the removed one is gone').toHaveLength(1);
      const taxCol = pdf.heads.indexOf('Tax');
      expect(taxCol, 'PDF has a Tax column').toBeGreaterThan(-1);
      expect(pdf.rows[0][0]).toBe(LINE_1.description);
      // The totals block is right on main.
      expect(pdf.text).toMatch(money(EDITED.subTotal));
      expect(pdf.text).toMatch(money(EDITED.tax));
      expect(pdf.text).toMatch(money(EDITED.total));
      // SOUPFIN-47: the line's Tax cell prints 0% for a taxed line. Soft, so the later steps
      // still run; the test stays red until SOUPFIN-47 lands.
      expect
        .soft(pdf.rows[0][taxCol], 'SOUPFIN-47: the PDF must print the line tax rate, not 0%')
        .toBe(`${CST.rate}%`);
    });

    await test.step('6. delete the bill', async () => {
      page.once('dialog', (dialog) => dialog.accept());
      const deleted = page.waitForResponse(
        (r) => r.url().includes(`/rest/bill/delete/${billId}`) && r.request().method() === 'DELETE',
        { timeout: 120000 }
      );
      await page.getByTestId('bill-delete-button').click();
      const response = await deleted;
      const bodyText = await response.text();
      console.log('[SOUPFIN-175] delete response:', response.status(), bodyText.slice(0, 300));
      expect([200, 204], `bill delete: ${bodyText.slice(0, 300)}`).toContain(response.status());

      // A 200 that lists related records is the delete gate refusing, not a delete.
      const refused = /"relatedList"\s*:\s*\[\s*\{/.test(bodyText);
      if (refused) {
        // The app must say so and stay on the bill, never return to the list as if deleted.
        await expect(page.getByTestId('bill-delete-error')).toContainText('This bill was not deleted', {
          timeout: 30000,
        });
        await expect(page).toHaveURL(new RegExp(`/bills/${billId}$`));
        await shot(page, '12-bill-delete-refused');
        const still = await getBillHeader(page, token, billId);
        expect(still.archived ?? false, 'a refused delete leaves the bill in place').toBe(false);
      } else {
        await expect(page).toHaveURL(/\/bills$/, { timeout: 60000 });
        await waitForAuthSettled(page);
        await expect(page.getByTestId(`bill-link-${billId}`)).toHaveCount(0);
        await shot(page, '12-bill-list-after-delete');
      }

      // SOUPFIN-262: the backend counts the bill's own lines and tax rows as related, so it
      // refuses to delete any bill with a line. Soft, so the cleanup below still runs.
      expect
        .soft(refused, 'SOUPFIN-262: the backend must delete a bill whose only links are its own lines')
        .toBe(false);
    });

    await test.step('clean up the test bill and vendor', async () => {
      // A bill delete is a HARD delete: with `relationChecked=true` ("delete target only") it
      // fails 500 on the foreign keys, so remove the children first. Admin test cleanup only;
      // relationChecked is never a frontend workaround, because it also skips approval.
      const headers = { 'X-Auth-Token': token, Accept: 'application/json' };
      const del = async (path: string) => {
        const res = await page.request
          .delete(`${API_BASE}${path}`, { headers, maxRedirects: 0, timeout: 60000 })
          .catch(() => null);
        return { status: res?.status() ?? 0, body: res ? await res.text() : '' };
      };
      for (const child of ['billPayment', 'billItem']) {
        const res = await safeApiGet(page, `/rest/${child}/index.json?bill.id=${billId}&max=100`, token);
        const rows = res?.ok() ? ((await res.json()) as Array<{ id: string }>) : [];
        for (const row of rows) await del(`/rest/${child}/delete/${row.id}.json?relationChecked=true`);
      }
      // Whatever the gate still lists (the bill's tax rows), remove, then retry the bill.
      for (let attempt = 0; attempt < 4; attempt++) {
        const { status, body } = await del(`/rest/bill/delete/${billId}.json`);
        let related: Array<{ relatedToClassSimpleName: string; relatedToId: string }> = [];
        try {
          related = JSON.parse(body || '{}').relatedList ?? [];
        } catch {
          related = [];
        }
        console.log(`[SOUPFIN-175] cleanup bill delete: ${status}, ${related.length} related`);
        if (related.length === 0) break;
        for (const r of related) {
          await del(`/rest/${r.relatedToClassSimpleName}/delete/${r.relatedToId}.json?relationChecked=true`);
        }
      }
      const vendor = await del(`/rest/trading/vendor/delete/${vendorId}.json`);
      console.log(`[SOUPFIN-175] cleanup vendor delete: ${vendor.status}`);

      // Whichever way step 6 went, the bill must now be gone from the list.
      const show = await safeApiGet(page, `/rest/bill/show/${billId}.json`, token);
      expect(show, 'bill/show after cleanup').not.toBeNull();
      if (show!.status() === 200) {
        expect((await show!.json()).archived, 'the bill is archived').toBe(true);
      } else {
        expect(show!.status()).toBe(404);
      }
      const list = await readJson<Array<{ id: string }>>(
        await safeApiGet(page, '/rest/bill/index.json?max=50&sort=dateCreated&order=desc', token),
        'bill/index after cleanup'
      );
      expect(list.map((b) => b.id), 'deleted bill gone from the list').not.toContain(billId);
    });
  });
});
