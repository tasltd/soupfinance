/**
 * Added (SOUPFIN-176): a payment recorded through the form must persist its foreign keys.
 * Runs against the real LXC backend. No mocks.
 *
 * The defect: PaymentFormPage sent dotted keys ('invoice.id', 'paymentMethod.id',
 * 'payInAccount.id'). Grails JSON binding ignores them, so every save answered
 * 422 "invoice cannot be null" and the payment method and bank account were never bound.
 * The form now sends nested objects ({ invoice: { id } }).
 *
 * Each test seeds one document with a balance due (no bill on the LXC dev DB has one),
 * records one payment against it through the UI, reads it back through
 * GET /rest/{invoicePayment|billPayment}/show/{id}.json and asserts that the document,
 * payment method and bank/cash account ids are the ones the user picked. A 201 is not
 * evidence on its own: see the invoice test below.
 *
 * Run (the dev DB has no seed password for soup.support; any ROLE_ADMIN works):
 *   E2E_ADMIN_USERNAME=<admin> E2E_ADMIN_PASSWORD=<password> \
 *   npx playwright test --config=playwright.lxc.config.ts \
 *     e2e/integration/soupfin-176-payment-fks.integration.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { backendTestUsers } from '../fixtures';

// test-results/ is wiped on each run; the committed copy is the evidence.
const SHOT_DIRS = [
  'test-results/screenshots/soupfin-176',
  'e2e/playwright/screenshots/soupfin-176',
];
for (const dir of SHOT_DIRS) mkdirSync(dir, { recursive: true });

async function shot(page: Page, name: string) {
  for (const dir of SHOT_DIRS) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }
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
  return page.evaluate(
    () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}

/** Authenticated JSON call through the Vite proxy, which injects Api-Authorization. */
async function api(page: Page, method: 'GET' | 'POST', url: string, data?: unknown) {
  const response = await page.request.fetch(url, {
    method,
    headers: {
      'X-Auth-Token': await token(page),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    data,
    maxRedirects: 0,
    timeout: 60000,
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status(), body };
}

/** POST /rest/{controller}/save.json with the CSRF params from create.json, as the app does. */
async function save(page: Page, controller: string, data: unknown) {
  const csrf = (await api(page, 'GET', `/rest/${controller}/create.json`)).body ?? {};
  const params = new URLSearchParams();
  if (csrf.SYNCHRONIZER_TOKEN) params.set('SYNCHRONIZER_TOKEN', String(csrf.SYNCHRONIZER_TOKEN));
  if (csrf.SYNCHRONIZER_URI) params.set('SYNCHRONIZER_URI', String(csrf.SYNCHRONIZER_URI));
  const saved = await api(page, 'POST', `/rest/${controller}/save.json?${params}`, data);
  expect(saved.status, `${controller}/save.json ${JSON.stringify(saved.body)}`).toBe(201);
  return String(saved.body?.id ?? '');
}

function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Seed a document with a 250.00 balance, using the same body shapes as BillFormPage and
 * InvoiceFormPage (nested FK, indexed bill lines, invoice lines via invoiceItem/save).
 */
async function seedDocument(page: Page, kind: Kind, marker: string): Promise<string> {
  if (kind === 'bill') {
    const vendors = (await api(page, 'GET', '/rest/vendor/index.json?max=1')).body as unknown as
      Array<{ id: string }>;
    return save(page, 'bill', {
      vendor: { id: vendors[0].id },
      billDate: isoDay(),
      paymentDate: isoDay(30),
      notes: marker,
      'billItemList[0].description': marker,
      'billItemList[0].quantity': 1,
      'billItemList[0].unitPrice': 250,
    });
  }
  const invoices = (await api(page, 'GET', '/rest/invoice/index.json?max=20')).body as unknown as
    Array<{ accountServices?: { id?: string } }>;
  const accountServicesId = invoices.find((inv) => inv.accountServices?.id)?.accountServices?.id;
  expect(accountServicesId, 'an existing invoice to borrow a client account from').toBeTruthy();
  const invoiceId = await save(page, 'invoice', {
    accountServices: { id: accountServicesId },
    invoiceDate: isoDay(),
    paymentDate: isoDay(30),
    notes: marker,
  });
  await save(page, 'invoiceItem', {
    invoice: { id: invoiceId },
    description: marker,
    quantity: 1,
    unitPrice: 250,
  });
  return invoiceId;
}

/** First real option of a <select> (skips the "Select ..." placeholder). */
async function firstOptionValue(page: Page, testId: string): Promise<string> {
  const select = page.getByTestId(testId);
  await expect
    .poll(async () => select.locator('option:not([value=""])').count(), { timeout: 45000 })
    .toBeGreaterThan(0);
  return (await select.locator('option:not([value=""])').first().getAttribute('value')) ?? '';
}

type Kind = 'invoice' | 'bill';

const KINDS: Record<Kind, { controller: string; document: string; account: string }> = {
  invoice: { controller: 'invoicePayment', document: 'invoice', account: 'payInAccount' },
  bill: { controller: 'billPayment', document: 'bill', account: 'payOutAccount' },
};

/**
 * Record one payment through the form, reached from the sidebar menu, and return the
 * ids the user picked plus the save response.
 */
async function recordPayment(page: Page, kind: Kind) {
  const { controller } = KINDS[kind];
  const marker = `SOUPFIN-176 ${kind} ${Date.now()}`;
  const documentId = await seedDocument(page, kind, marker);

  // Reach the form the way a user pays a specific document: open it from its list,
  // then "Record Payment". The form's own document dropdown is filled from
  // bill/index.json, whose amountDue is 0 for every bill on the LXC backend, so it
  // cannot offer the seeded bill (separate backend defect, see the PM comment).
  const listPage = kind === 'bill' ? 'Bills' : 'Invoices';
  await page.getByRole('navigation').getByRole('link', { name: listPage, exact: true }).click();
  await page.getByTestId(`${kind}-link-${documentId}`).click({ timeout: 45000 });
  await expect(page.getByTestId(`${kind}-detail-page`)).toBeVisible({ timeout: 45000 });
  await shot(page, `${kind}-detail-seeded`);
  await page.getByTestId('record-payment-button').click({ timeout: 45000 });
  await expect(page.getByTestId('payment-form-page')).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(new RegExp(`/payments/new\\?${kind}Id=${documentId}$`));
  await expect(page.getByTestId(`type-${kind}`)).toHaveClass(/bg-primary/);
  await shot(page, `${kind}-form-loaded`);

  const methodId = await firstOptionValue(page, 'method-select');
  await page.getByTestId('method-select').selectOption(methodId);
  const accountId = await firstOptionValue(page, 'bank-account-select');
  await page.getByTestId('bank-account-select').selectOption(accountId);

  await page.getByTestId('amount-input').fill('100.00');
  await page.getByTestId('notes-input').fill(marker);
  await shot(page, `${kind}-form-filled`);

  const saveResponse = page.waitForResponse(
    (r) => r.url().includes(`/rest/${controller}/save.json`) && r.request().method() === 'POST',
    { timeout: 60000 }
  );
  await page.getByTestId('submit-button').click();
  const response = await saveResponse;
  const requestBody = response.request().postDataJSON() as Record<string, unknown>;
  const savedBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  return { documentId, methodId, accountId, marker, response, requestBody, savedBody };
}

/** Read a payment back the way the app does: through the proxy, with the user's token. */
async function readBack(page: Page, kind: Kind, id: string) {
  const response = await page.request.get(`/rest/${KINDS[kind].controller}/show/${id}.json`, {
    headers: { 'X-Auth-Token': await token(page), Accept: 'application/json' },
    maxRedirects: 0,
    timeout: 45000,
  });
  const body = response.ok()
    ? ((await response.json().catch(() => null)) as Record<string, { id?: string } | string> | null)
    : null;
  return { status: response.status(), body };
}

async function assertRoundTrip(page: Page, kind: Kind) {
  const { document, account } = KINDS[kind];
  const recorded = await recordPayment(page, kind);

  // The body on the wire carries nested FK objects and no dotted keys.
  expect(recorded.requestBody[document]).toEqual({ id: recorded.documentId });
  expect(recorded.requestBody.paymentMethod).toEqual({ id: recorded.methodId });
  expect(recorded.requestBody[account]).toEqual({ id: recorded.accountId });
  expect(Object.keys(recorded.requestBody).filter((key) => key.includes('.'))).toEqual([]);

  expect(recorded.response.status(), JSON.stringify(recorded.savedBody)).toBe(201);
  const paymentId = String(recorded.savedBody.id ?? '');
  expect(paymentId).not.toBe('');

  // The form returns to the list after a successful save.
  await expect(page).toHaveURL(/\/payments$/, { timeout: 30000 });
  await shot(page, `${kind}-saved-list`);

  // The stored row, not the save response, is the evidence.
  const stored = await readBack(page, kind, paymentId);
  await test.info().attach(`${kind}-payment-show.json`, {
    body: JSON.stringify(stored, null, 2),
    contentType: 'application/json',
  });
  expect(stored.status, `GET show/${paymentId}.json`).toBe(200);
  expect((stored.body?.[document] as { id?: string })?.id).toBe(recorded.documentId);
  expect((stored.body?.paymentMethod as { id?: string })?.id).toBe(recorded.methodId);
  expect((stored.body?.[account] as { id?: string })?.id).toBe(recorded.accountId);
  expect(stored.body?.notes).toBe(recorded.marker);
}

test.describe('SOUPFIN-176 payment foreign keys persist', () => {
  // Seeding plus the form's ledger-account list take well over the config's 60 s on LXC.
  test.describe.configure({ mode: 'serial', timeout: 240000 });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('bill payment stores bill, paymentMethod and payOutAccount', async ({ page }) => {
    await assertRoundTrip(page, 'bill');
  });

  // On the LXC backend of 2026-10-13 this answers 201 but stores nothing: soupmarkets-web
  // InvoicePaymentService is class-level @ReadOnly and save() does not override it, so the
  // insert never flushes. Backend fix: plans/soupfin-176-invoice-payment-save-readonly.md.
  test('invoice payment stores invoice, paymentMethod and payInAccount', async ({ page }) => {
    await assertRoundTrip(page, 'invoice');
  });
});
