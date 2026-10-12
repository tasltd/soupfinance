/**
 * SOUPFIN-152 — a brand-new tenant gets a seeded, grouped, postable chart of accounts.
 * Runs against the REAL LXC backend. No mocks.
 *
 * For a fresh TRADING tenant and a fresh SERVICES tenant:
 *  1. register through /register (reached from the sign-in page link);
 *  2. confirm the email with the token the backend really mailed (or one minted under
 *     REGISTRATION_TOKEN_SECRET; see helpers/confirmation-token.ts);
 *  3. sign in through the UI;
 *  4. GET /rest/ledgerAccount/index.json answers 200 with a non-empty chart that holds
 *     Accounts Receivable and Accounts Payable, shaped by the business type
 *     (TRADING has Cost of Goods Sold, SERVICES does not);
 *  5. the Chart of Accounts page, opened from the sidebar, shows exactly those accounts
 *     in the statement groups, with nothing under Uncategorised;
 *  6. an invoice created through the invoice form is saved, and its line posts to the
 *     ledger: a LedgerTransaction for the line debits the receivable account.
 *
 * All requests go through the Vite proxy (relative /rest and /account paths), which adds
 * the Api-Authorization header the backend's ApiAuthenticatorInterceptor expects.
 * Only the sign-in page and the emailed confirmation link are visited directly; the link
 * is how a person arrives there.
 *
 * Run: npx playwright test --config=playwright.lxc.config.ts e2e/integration/coa-seeding.integration.spec.ts
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { confirmationTokenFor } from './helpers/confirmation-token';

const PASSWORD = 'Soupfin152!Pass';
const SHOT_DIRS = ['e2e/playwright/screenshots/soupfin-152', 'test-results/soupfin-152'];
for (const dir of SHOT_DIRS) mkdirSync(dir, { recursive: true });

type BusinessType = 'TRADING' | 'SERVICES';

interface RawLedgerAccount {
  id: string;
  name: string;
  number?: string;
  ledgerAccountCategory?: { id?: string; serialised?: string } | null;
}

interface RawLedgerTransaction {
  id: string;
  amount?: number | string;
  relatedToClass?: string;
  relatedToId?: string;
  debitLedgerAccount?: { id?: string; serialised?: string } | null;
  creditLedgerAccount?: { id?: string; serialised?: string } | null;
}

async function shot(page: Page, name: string, fullPage = false) {
  for (const dir of SHOT_DIRS) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage });
  }
}

async function authToken(page: Page): Promise<string> {
  return page.evaluate(
    () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}

/** The auth gate renders before content; never wait for networkidle on this backend. */
async function waitForAuthSettled(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForFunction(() => !document.body.textContent?.includes('Verifying authentication'), {
      timeout: 30_000,
    })
    .catch(() => {});
}

async function getJson<T>(request: APIRequestContext, token: string, url: string): Promise<{ status: number; body: T }> {
  const response = await request.get(url, {
    headers: { 'X-Auth-Token': token, Accept: 'application/json' },
    maxRedirects: 0,
    timeout: 120_000,
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status(), body: body as T };
}

/** "Current Assets < ASSET" → "ASSET" */
function groupOf(account: RawLedgerAccount): string | undefined {
  return account.ledgerAccountCategory?.serialised?.split('<').pop()?.trim().toUpperCase();
}

function dueDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

for (const businessType of ['TRADING', 'SERVICES'] as BusinessType[]) {
  // One serial block per tenant: the invoice test signs in as the tenant the first test made.
  // A TRADING failure does not stop the SERVICES block.
  test.describe(`SOUPFIN-152: a new ${businessType} tenant gets a seeded, postable chart of accounts`, () => {
    test.describe.configure({ mode: 'serial' });

    const tag = businessType.toLowerCase();
    const stamp = Date.now();
    const email = `soupfin152.${tag}.${stamp}@example.com`;
    const companyName = `SOUPFIN-152 ${businessType} ${stamp}`;
    let receivableId = '';

    test(`${businessType}: register, confirm, sign in, and the seeded chart has A/R and A/P, grouped`, async ({
      page,
    }) => {
      test.setTimeout(10 * 60_000);

      // ---- 1. Register, starting from the sign-in page ---------------------------------
      await page.goto('/login');
      await page.getByTestId('login-register-link').click();
      await expect(page.getByTestId('registration-page')).toBeVisible({ timeout: 20_000 });

      await page.getByTestId('registration-company-name-input').fill(companyName);
      await page.getByTestId(`registration-business-type-${tag}`).click();
      await page.getByTestId('registration-admin-first-name').fill('Coa');
      await page.getByTestId('registration-admin-last-name').fill(`Seeding ${tag}`);
      await page.getByTestId('registration-email-input').fill(email);
      await page.getByTestId('registration-country-select').selectOption('GH');
      await page.getByTestId('registration-password-input').fill(PASSWORD);
      await page.getByTestId('registration-confirm-password-input').fill(PASSWORD);
      await shot(page, `${tag}-01-registration-filled`);

      const registered = page.waitForResponse(
        (r) => r.url().includes('/account/register.json') && r.request().method() === 'POST',
        { timeout: 120_000 }
      );
      await page.getByTestId('registration-submit-button').click();
      const registerResponse = await registered;
      expect(registerResponse.status(), 'registration must succeed').toBeLessThan(300);
      const registration = (await registerResponse.json()) as {
        success: boolean;
        agentId?: string;
        account?: { id: string };
        accountId?: string;
        requiresConfirmation?: boolean;
      };
      expect(registration.success).toBe(true);
      const accountId = registration.account?.id ?? registration.accountId;
      expect(accountId, 'the new tenant (Account) id').toBeTruthy();
      await expect(page.getByTestId('registration-success')).toBeVisible({ timeout: 30_000 });
      await shot(page, `${tag}-02-check-your-email`);

      // ---- 2. Confirm the email with the token the backend sent ------------------------
      const confirmationToken = confirmationTokenFor(email, registration.agentId);
      expect(confirmationToken).toMatch(/^[A-Za-z0-9_\-=%]+$/);
      await page.goto(`/confirm-email?token=${encodeURIComponent(confirmationToken)}`);
      await expect(page.getByTestId('confirm-email-form')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('confirm-email-password-input').fill(PASSWORD);
      await page.getByTestId('confirm-email-confirm-password-input').fill(PASSWORD);
      await page.getByTestId('confirm-email-submit-button').click();
      await expect(page.getByTestId('confirm-email-success')).toBeVisible({ timeout: 60_000 });
      await shot(page, `${tag}-03-email-confirmed`);

      // ---- 3. Sign in through the UI ------------------------------------------------------
      await page.getByTestId('confirm-email-login-button').click();
      await expect(page.getByTestId('login-email-input')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('login-email-input').fill(email);
      await page.getByTestId('login-password-input').fill(PASSWORD);
      await page.getByTestId('login-submit-button').click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
      await waitForAuthSettled(page);
      const token = await authToken(page);
      expect(token, 'auth token after sign-in').toBeTruthy();

      const current = await getJson<{ tenantId?: string }>(page.request, token, '/rest/user/current.json');
      expect(current.status).toBe(200);
      expect(current.body.tenantId, 'the signed-in user belongs to the new tenant').toBe(accountId);
      await shot(page, `${tag}-04-dashboard`);

      // ---- 4. The seeded chart, read off the API --------------------------------------------
      const chart = await getJson<RawLedgerAccount[]>(
        page.request,
        token,
        '/rest/ledgerAccount/index.json?max=1000&offset=0&sort=number&order=asc'
      );
      expect(chart.status, `ledgerAccount/index must not be refused: ${JSON.stringify(chart.body)}`).toBe(200);
      expect(Array.isArray(chart.body)).toBe(true);
      const accounts = chart.body;
      expect(accounts.length, 'the new tenant has a seeded chart').toBeGreaterThan(0);

      const receivable = accounts.find((a) => /accounts? receivable/i.test(a.name));
      const payable = accounts.find((a) => /accounts? payable/i.test(a.name));
      expect(receivable, 'Accounts Receivable is seeded').toBeTruthy();
      expect(payable, 'Accounts Payable is seeded').toBeTruthy();
      expect(groupOf(receivable!)).toBe('ASSET');
      expect(groupOf(payable!)).toBe('LIABILITY');

      // Every seeded account carries a statement group, so nothing lands in Uncategorised
      const groups = new Set(accounts.map(groupOf));
      for (const group of ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']) {
        expect(groups.has(group), `the chart has ${group} accounts`).toBe(true);
      }
      expect(accounts.filter((a) => !groupOf(a)), 'accounts without a group').toHaveLength(0);

      // The template follows the business type chosen at registration
      const cogs = accounts.find((a) => /cost of (goods sold|sales)/i.test(a.name));
      if (businessType === 'TRADING') {
        expect(cogs, 'a TRADING chart carries Cost of Goods Sold').toBeTruthy();
      } else {
        expect(cogs, 'a SERVICES chart has no Cost of Goods Sold').toBeUndefined();
      }

      // ---- 5. The Chart of Accounts page shows the same chart, grouped ------------------------
      await page.locator('aside a[href="/ledger/accounts"]').first().click();
      await expect(page).toHaveURL(/\/ledger\/accounts$/);
      await expect(page.getByTestId('chart-of-accounts-page')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-testid^="coa-account-"]')).toHaveCount(accounts.length, { timeout: 60_000 });
      await expect(page.getByTestId('coa-empty')).toHaveCount(0);
      await expect(page.getByTestId('coa-group-uncategorised')).toHaveCount(0);
      await expect(page.getByTestId('coa-group-asset').getByTestId(`coa-account-${receivable!.id}`)).toBeVisible();
      await expect(page.getByTestId('coa-group-liability').getByTestId(`coa-account-${payable!.id}`)).toBeVisible();
      await shot(page, `${tag}-05-chart-of-accounts`);
      await shot(page, `${tag}-06-chart-of-accounts-full`, true);
      receivableId = receivable!.id;
    });

    // Red until SOUPFIN-241: no invoice line has posted on the LXC since 2025-11-27.
    test(`${businessType}: an invoice saved through the form posts to the ledger`, async ({ page }) => {
      test.setTimeout(10 * 60_000);
      expect(receivableId, 'the seeding test above ran and found Accounts Receivable').toBeTruthy();

      await page.goto('/login');
      await page.getByTestId('login-email-input').fill(email);
      await page.getByTestId('login-password-input').fill(PASSWORD);
      await page.getByTestId('login-submit-button').click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
      await waitForAuthSettled(page);
      const token = await authToken(page);
      expect(token).toBeTruthy();

      // ---- 6. Create an invoice through the form and check it posts --------------------------
      const before = await getJson<RawLedgerTransaction[]>(
        page.request,
        token,
        '/rest/ledgerTransaction/index.json?max=200&sort=dateCreated&order=desc'
      );
      expect(before.status, `ledgerTransaction/index: ${JSON.stringify(before.body)}`).toBe(200);
      const beforeIds = new Set((before.body ?? []).map((t) => t.id));

      await page.locator('aside a[href="/invoices"]').first().click();
      await waitForAuthSettled(page);
      await expect(page).toHaveURL(/\/invoices$/, { timeout: 30_000 });
      await page.getByTestId('invoice-new-button').click();
      await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 30_000 });

      // A fresh tenant has no clients: create one from the form, as a person would
      await page.getByTestId('invoice-new-client-button').click();
      await page.getByTestId('new-client-type-individual').click();
      await page.getByTestId('new-client-first-name').fill('First');
      await page.getByTestId('new-client-last-name').fill(`Customer ${stamp}`);
      await page.getByTestId('new-client-email').fill(`soupfin152.client.${tag}.${stamp}@example.com`);
      await page.getByTestId('new-client-create-button').click();
      const clientSelect = page.getByTestId('invoice-client-select');
      await expect.poll(() => clientSelect.inputValue(), { timeout: 120_000 }).not.toBe('');

      await page.getByTestId('invoice-due-date-input').fill(dueDateIso());
      const QUANTITY = 2;
      const UNIT_PRICE = 750;
      const serviceSelect = page.getByTestId('invoice-item-service-0');
      await expect.poll(async () => serviceSelect.locator('option').count(), { timeout: 60_000 }).toBeGreaterThan(1);
      await serviceSelect.selectOption({ index: 1 });
      await page.getByTestId('invoice-item-description-0').fill(`SOUPFIN-152 ${tag} consulting`);
      await page.getByTestId('invoice-item-quantity-0').fill(String(QUANTITY));
      await page.getByTestId('invoice-item-unitPrice-0').fill(String(UNIT_PRICE));
      await shot(page, `${tag}-07-invoice-filled`);

      const savedItem = page.waitForResponse(
        (r) => r.url().includes('/invoiceItem/save.json') && r.request().method() === 'POST',
        { timeout: 180_000 }
      );
      await page.getByTestId('invoice-form-save-draft-button').click();
      const itemResponse = await savedItem;
      expect(itemResponse.status(), 'the line item is saved').toBeLessThan(300);
      const item = (await itemResponse.json()) as { id: string; invoice?: { id: string } };
      expect(item.id).toBeTruthy();
      await page.waitForURL(/\/invoices$/, { timeout: 120_000 });
      await waitForAuthSettled(page);
      await expect(page.getByTestId('invoice-list-page')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(`First Customer ${stamp}`).first()).toBeVisible({ timeout: 60_000 });
      await shot(page, `${tag}-08-invoice-saved`);

      const invoiceId = item.invoice?.id;
      expect(invoiceId, 'the line item belongs to the saved invoice').toBeTruthy();
      const invoice = await getJson<{ id: string; accountServices?: { id: string } }>(
        page.request,
        token,
        `/rest/invoice/show/${invoiceId}.json`
      );
      expect(invoice.status).toBe(200);
      expect(invoice.body.id).toBe(invoiceId);

      // Posting is asynchronous (the syncInvoiceItem queue), so poll for the line's transaction
      let posted: RawLedgerTransaction | undefined;
      await expect
        .poll(
          async () => {
            const after = await getJson<RawLedgerTransaction[]>(
              page.request,
              token,
              '/rest/ledgerTransaction/index.json?max=200&sort=dateCreated&order=desc'
            );
            posted = (after.body ?? []).find((t) => !beforeIds.has(t.id) && t.relatedToId === item.id);
            return Boolean(posted);
          },
          { timeout: 180_000, intervals: [5_000], message: 'a LedgerTransaction posts for the invoice line (SOUPFIN-241)' }
        )
        .toBe(true);

      expect(Number(posted!.amount)).toBeCloseTo(QUANTITY * UNIT_PRICE, 2);
      expect(posted!.relatedToClass).toMatch(/InvoiceItem$/);
      expect(posted!.debitLedgerAccount?.serialised ?? '', 'the invoice debits a receivable account').toMatch(
        /receivable/i
      );
      expect(posted!.creditLedgerAccount?.id, 'the invoice credits an income account').toBeTruthy();
    });
  });
}
