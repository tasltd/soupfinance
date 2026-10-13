/**
 * Added (SOUPFIN-178): receive one payment against two invoices, against the real LXC backend.
 * No mocks.
 *
 * The spec raises two fresh invoices (300 and 200) for one client, then records a single
 * 400 receipt through Payments > Receive payment: 300 to the first, 100 to the second. It then
 * reads the backend to check what the ticket asks for:
 *  - the save returns 201 with a POSTED PaymentAllocationGroup holding two lines and a voucher;
 *  - the first invoice is fully paid and the second has 100 left (each invoice's amountDue moved);
 *  - the receipt is ONE balanced journal entry: the group's voucher carries 400, and the two
 *    allocation-managed InvoicePayments post no voucher of their own.
 *
 * Needs soupmarkets-web SOUP-4099 deployed to the soupfinance-backend LXC. Before it, the
 * save is refused 422 ("cashAccount cannot be null"), because the controller binds the bare
 * domain instead of calling PaymentAllocationService.createAllocation.
 *
 * Run (the dev DB has no seed password for soup.support; any ROLE_ADMIN works):
 *   E2E_ADMIN_USERNAME=<admin> E2E_ADMIN_PASSWORD=<password> \
 *   npx playwright test --config=playwright.lxc.config.ts \
 *     e2e/integration/soupfin-178-payment-allocation.integration.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { backendTestUsers } from '../fixtures';
import { selectInvoiceableClient } from './invoice-client-helper';

const API_BASE = 'http://10.115.213.183:9090';
const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-178-lxc';
mkdirSync(SHOT_DIR, { recursive: true });

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

async function apiGet<T>(page: Page, authToken: string, path: string): Promise<T> {
  const res = await page.request.get(`${API_BASE}/rest/${path}`, {
    headers: { 'X-Auth-Token': authToken, Accept: 'application/json' },
    maxRedirects: 0,
    timeout: 60000,
  });
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Raise one single-line invoice through the UI and return its id. */
async function raiseInvoice(page: Page, authToken: string, clientId: string, amount: number, dueInDays: number, label: string) {
  await page.locator('aside a[href="/invoices"]').first().click();
  await waitForAuthSettled(page);
  await page.getByTestId('invoice-new-button').click();
  await waitForAuthSettled(page);
  await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 20000 });

  const clientSelect = page.getByTestId('invoice-client-select');
  if (clientId) {
    await expect.poll(async () => clientSelect.locator('option').count(), { timeout: 30000 }).toBeGreaterThan(1);
    await clientSelect.selectOption(clientId);
  } else {
    clientId = await selectInvoiceableClient(page, clientSelect, API_BASE, authToken, 'Soupfin178');
  }
  await page.getByTestId('invoice-due-date-input').fill(isoInDays(dueInDays));
  await page.getByTestId('invoice-item-description-0').fill(label);
  await page.getByTestId('invoice-item-quantity-0').fill('1');
  await page.getByTestId('invoice-item-unitPrice-0').fill(String(amount));

  const saved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/rest\/invoice\/save\.json/.test(r.url()),
    { timeout: 120000 }
  );
  await page.getByTestId('invoice-form-save-draft-button').click();
  const response = await saved;
  expect(response.status(), `invoice save: ${(await response.text()).slice(0, 300)}`).toBeLessThan(300);
  const body = await response.json();
  const id = (body.invoice ?? body).id as string;
  expect(id).toBeTruthy();
  await expect(page).toHaveURL(/\/invoices$/, { timeout: 120000 });
  return { id, clientId };
}

interface InvoiceShow {
  invoicePaymentList?: Array<{ id: string }>;
}
interface InvoicePaymentShow {
  amount: number;
  paymentAllocation?: { id: string } | null;
  invoicePaymentLedgerTransaction?: { id: string } | null;
}
interface GroupShow {
  status?: string;
  totalAmount?: number;
  allocatedAmount?: number;
  voucher?: { id: string } | null;
  paymentAllocationList?: Array<{ id: string }>;
}

test.describe('SOUPFIN-178 payment allocation against the LXC backend', () => {
  test('one 400 receipt pays one invoice in full and another in part, as one journal entry', async ({ page }) => {
    test.setTimeout(900000);
    await login(page);
    const authToken = await token(page);

    const stamp = Date.now();
    const first = await raiseInvoice(page, authToken, '', 300, 10, `SOUPFIN-178 first ${stamp}`);
    const second = await raiseInvoice(page, authToken, first.clientId, 200, 20, `SOUPFIN-178 second ${stamp}`);
    const clientId = first.clientId;
    await shot(page, '01-invoices-raised');

    // Menu clicks to the allocation screen
    await page.locator('aside a[href="/payments"]').first().click();
    await waitForAuthSettled(page);
    await page.getByTestId('receive-payment-button').click();
    await expect(page).toHaveURL(/\/payments\/receive$/);
    const party = page.getByTestId('allocation-party-select');
    await expect.poll(async () => party.locator('option').count(), { timeout: 30000 }).toBeGreaterThan(1);
    await party.selectOption(clientId);
    await expect(page.getByTestId(`allocation-row-${first.id}`)).toBeVisible({ timeout: 120000 });
    await expect(page.getByTestId(`allocation-row-${second.id}`)).toBeVisible();
    await expect(page.getByTestId(`allocation-balance-${first.id}`)).toContainText('300.00');

    await page.getByTestId('allocation-amount-input').fill('400');
    // The client may owe older invoices from earlier runs; apply this receipt to ours only.
    for (const input of await page.locator('[data-testid^="allocation-input-"]').all()) {
      const id = (await input.getAttribute('data-testid'))!.replace('allocation-input-', '');
      await input.fill(id === first.id ? '300' : id === second.id ? '100' : '0');
    }
    await expect(page.getByTestId('allocation-summary-allocated')).toContainText('400.00');
    await expect(page.getByTestId('allocation-summary-unapplied')).toContainText('0.00');

    const bank = page.getByTestId('allocation-bank-select');
    await expect.poll(async () => bank.locator('option').count(), { timeout: 60000 }).toBeGreaterThan(1);
    const bankId = await bank.locator('option').nth(1).getAttribute('value');
    await bank.selectOption(bankId!);
    await page.getByTestId('allocation-reference-input').fill(`SOUPFIN-178 ${stamp}`);
    await shot(page, '02-allocation-filled');

    const saveResponse = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/rest\/paymentAllocationGroup\/save\.json/.test(r.url()),
      { timeout: 120000 }
    );
    await page.getByTestId('allocation-submit').click();
    const response = await saveResponse;
    const bodyText = await response.text();
    await shot(page, '03-after-save');
    expect(response.status(), `allocation save returned ${response.status()}: ${bodyText.slice(0, 400)}`).toBe(201);
    await expect(page).toHaveURL(/\/payments$/, { timeout: 60000 });

    const group = JSON.parse(bodyText) as GroupShow & { id: string };
    const persisted = await apiGet<GroupShow>(page, authToken, `paymentAllocationGroup/show/${group.id}.json`);
    expect(persisted.status).toBe('POSTED');
    expect(Number(persisted.totalAmount)).toBe(400);
    expect(Number(persisted.allocatedAmount)).toBe(400);
    expect(persisted.paymentAllocationList).toHaveLength(2);
    expect(persisted.voucher?.id, 'the receipt must post one voucher').toBeTruthy();

    // One balanced entry: the group's voucher carries the whole receipt.
    const voucher = await apiGet<{ amount: number }>(page, authToken, `voucher/show/${persisted.voucher!.id}.json`);
    expect(Number(voucher.amount)).toBe(400);

    // Each invoice got its payment, linked to the allocation and posting nothing of its own.
    // The per-payment ledger sync runs on a queue a few seconds after insert, so wait it out.
    await page.waitForTimeout(15000);
    const paid: Record<string, number> = {};
    for (const inv of [first, second]) {
      const show = await apiGet<InvoiceShow>(page, authToken, `invoice/show/${inv.id}.json`);
      expect(show.invoicePaymentList ?? [], `invoice ${inv.id} payments`).toHaveLength(1);
      const payment = await apiGet<InvoicePaymentShow>(
        page,
        authToken,
        `invoicePayment/show/${show.invoicePaymentList![0].id}.json`
      );
      expect(payment.paymentAllocation?.id, 'payment linked to its allocation').toBeTruthy();
      expect(payment.invoicePaymentLedgerTransaction ?? null, 'no second voucher per payment').toBeNull();
      paid[inv.id] = Number(payment.amount);
    }
    expect(paid).toEqual({ [first.id]: 300, [second.id]: 100 });

    // And the screen agrees: the first invoice is gone, the second shows 100 left.
    await page.getByTestId('receive-payment-button').click();
    await party.selectOption(clientId);
    await expect(page.getByTestId(`allocation-row-${second.id}`)).toBeVisible({ timeout: 120000 });
    await expect(page.getByTestId(`allocation-balance-${second.id}`)).toContainText('100.00');
    await expect(page.getByTestId(`allocation-row-${first.id}`)).toHaveCount(0);
    await shot(page, '04-balances-after-save');
  });
});
