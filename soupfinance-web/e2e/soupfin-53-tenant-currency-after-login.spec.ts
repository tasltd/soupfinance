/**
 * SOUPFIN-53 — the tenant currency was not applied until the page was reloaded
 * after sign-in.
 *
 * Reported: sign in and land on the dashboard. Every amount renders with the
 * default USD symbol instead of the tenant currency (for example GHS). Refresh
 * the page and the correct currency appears. The figures were right; only the
 * symbol was wrong — still misleading on a finance product.
 *
 * Root cause: `login()` in src/api/auth.ts builds the user from the login
 * response alone (`{ username, email, roles }`). `POST /rest/api/login` carries
 * no `tenantId`, so `authStore.login` stored a user without one. `App.tsx` only
 * fetches account settings when `tenantId` is present:
 *
 *     if (isAuthenticated && authInitialized && tenantId && !accountInitialized)
 *
 * so straight after login the fetch never fired and `accountStore` kept its USD
 * default. On a reload, `initialize()` ran `validateToken()`, which calls
 * `GET /rest/user/current.json` and enriches `tenantId` — and the currency
 * corrected itself.
 *
 * Fix: `authStore.login` now follows a successful login with that same
 * `GET /rest/user/current.json` call and merges `tenantId` into the stored user.
 *
 * These tests prove, through the real UI:
 *   #1 the dashboard shows the tenant currency on the FIRST render after
 *      sign-in — no reload — and never the USD default
 *   #2 the reload path still works (the fix did not break it), and the symbol
 *      does not change between the first render and the reloaded one
 *   #3 the invoice list, a second surface named in the report, is also correct
 *      immediately after sign-in
 *   #4 a failing /user/current.json enrichment leaves the user signed in on the
 *      dashboard rather than bouncing them back to /login
 *
 * Only `/login` is entered by URL — it is the app's public entry point. Every
 * internal page is reached by clicking, so the tests also prove those surfaces
 * are reachable. Screenshots land in e2e/playwright/screenshots/soupfin-53/ and
 * are committed.
 */
import { test, expect, type Page } from '@playwright/test';
import { isLxcMode, mockTaxEntriesApi } from './fixtures';

test.skip(isLxcMode(), 'Mock-only spec: pins the exact /rest/api/login response shape (no tenantId)');

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-53/${name}.png`,
    fullPage: true,
  });
}

const TENANT_ID = 'account-ghs-001';

/** The Ghana Cedi symbol accountStore maps GHS to. */
const GHS = 'GH₵';

/**
 * One PAID invoice and one SENT invoice, so the dashboard KPI cards render real
 * figures rather than 0.00 — a card reading "GH\u20B50.00" would prove the symbol
 * but say nothing about the amounts beside it.
 *
 * `status` (not `invoiceStatus`) is the field `transformInvoice()` reads.
 */
const INVOICES = [
  {
    id: 'inv-001',
    number: 1001,
    status: 'PAID',
    invoiceDate: '2026-09-01',
    paymentDate: '2026-09-30',
    accountServices: {
      id: 'as-001',
      class: 'soupbroker.kyc.AccountServices',
      serialised: 'Direct Account : Corporate(Kwame Holdings)',
    },
    invoiceItemList: [{ id: 'ii-1', quantity: 1, unitPrice: 4200.0 }],
    invoicePaymentList: [{ id: 'ip-1', amount: 4200.0 }],
  },
  {
    id: 'inv-002',
    number: 1002,
    status: 'SENT',
    invoiceDate: '2026-09-05',
    paymentDate: '2026-10-05',
    accountServices: {
      id: 'as-002',
      class: 'soupbroker.kyc.AccountServices',
      serialised: 'Direct Account : Corporate(Adjoa Trading)',
    },
    invoiceItemList: [{ id: 'ii-2', quantity: 2, unitPrice: 1375.0 }],
    invoicePaymentList: [],
  },
];

/**
 * Mocks the sign-in round trip for a tenant whose currency is GHS.
 *
 * Critically, `POST /rest/api/login` responds WITHOUT `tenantId` — that is the
 * real backend contract and the precondition for the bug. The only route that
 * carries `tenantId` is `GET /rest/user/current.json`, so a test that passes
 * here can only have passed because login went and fetched it.
 *
 * `currentUserCalls` counts that request so a test can assert the enrichment
 * happened during the login transition rather than on a later reload.
 */
async function mockGhsTenant(
  page: Page,
  options: { currentUserOk?: boolean } = {}
): Promise<{ currentUserCalls: () => number }> {
  const { currentUserOk = true } = options;
  let calls = 0;

  await page.route('**/rest/api/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // No tenantId — mirrors the real POST /rest/api/login response.
      body: JSON.stringify({
        access_token: 'mock-jwt-token',
        token_type: 'Bearer',
        username: 'admin',
        roles: ['ROLE_ADMIN', 'ROLE_USER'],
      }),
    })
  );

  await page.route('**/rest/user/current.json*', (route) => {
    calls += 1;
    if (!currentUserOk) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        username: 'admin',
        email: 'admin@soupfinance.com',
        roles: ['ROLE_ADMIN', 'ROLE_USER'],
        tenantId: TENANT_ID,
        agentId: 'agent-001',
      }),
    });
  });

  // The tenant's currency lives here. accountStore only reaches this route once
  // App.tsx sees a tenantId, so an untouched route means the bug is present.
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: TENANT_ID,
        name: 'Kwame Holdings',
        currency: 'GHS',
        dateCreated: '2024-01-01T00:00:00Z',
      }),
    })
  );

  await page.route('**/rest/invoice/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(INVOICES) })
  );
  await page.route('**/rest/bill/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await mockTaxEntriesApi(page);

  return { currentUserCalls: () => calls };
}

/** Drives the real login form — no direct navigation to an internal route. */
async function signIn(page: Page) {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('login-email-input').fill('admin@soupfinance.com');
  await page.getByTestId('login-password-input').fill('secret');
  await page.getByTestId('login-submit-button').click();
}

/** The four dashboard KPI cards the report names. */
const KPI_TEST_IDS = [
  'stat-total-revenue-value',
  'stat-outstanding-invoices-value',
  'stat-expenses-value',
  'stat-net-profit-value',
];

async function readKpiValues(page: Page): Promise<string[]> {
  return Promise.all(
    KPI_TEST_IDS.map((id) => page.getByTestId(id).innerText().then((t) => t.trim()))
  );
}

test.describe('SOUPFIN-53: tenant currency applies on the first render after sign-in', () => {
  test('dashboard KPI cards show the tenant currency without a reload', async ({ page }) => {
    const { currentUserCalls } = await mockGhsTenant(page);

    await signIn(page);
    await shot(page, 'login-form-submitted');

    // Land on the dashboard. No reload anywhere in this test.
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('stat-total-revenue-value')).toBeVisible({ timeout: 20000 });

    // The enrichment call must have happened as part of the login transition.
    expect(currentUserCalls()).toBeGreaterThan(0);

    // Every KPI card carries the tenant symbol and none carries the USD default.
    // toPass() absorbs the one render between accountStore resolving and React
    // repainting; it does NOT absorb a reload, which never happens here.
    await expect(async () => {
      const values = await readKpiValues(page);
      for (const value of values) {
        expect(value).toContain(GHS);
        expect(value).not.toContain('$');
      }
      // The amounts beside the symbol must be the real ones. Asserting only the
      // symbol would still pass on an all-zero dashboard, where the currency is
      // trivially "right" because there is nothing to get wrong.
      const [totalRevenue, outstanding] = values;
      expect(totalRevenue).toBe(`${GHS}4,200.00`);
      expect(outstanding).toBe(`${GHS}2,750.00`);
    }).toPass({ timeout: 15000 });

    await shot(page, 'dashboard-currency-after-login-no-reload');
  });

  test('the reloaded dashboard shows the same currency as the first render', async ({ page }) => {
    // Guards the path that used to be the only working one: the fix must not
    // have broken initialize() -> validateToken() enrichment on reload.
    await mockGhsTenant(page);

    await signIn(page);
    await expect(page.getByTestId('stat-total-revenue-value')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('stat-total-revenue-value')).toContainText(GHS, { timeout: 15000 });
    const beforeReload = await readKpiValues(page);
    await shot(page, 'dashboard-before-reload');

    await page.reload();
    await expect(page.getByTestId('stat-total-revenue-value')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('stat-total-revenue-value')).toContainText(GHS, { timeout: 15000 });
    const afterReload = await readKpiValues(page);
    await shot(page, 'dashboard-after-reload');

    // The whole point of the ticket: these two must be identical.
    expect(afterReload).toEqual(beforeReload);
  });

  test('the invoice list also shows the tenant currency immediately after sign-in', async ({ page }) => {
    await mockGhsTenant(page);

    await signIn(page);
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20000 });

    // Reached by clicking the sidebar, not by goto.
    await page.getByRole('link', { name: /invoices/i }).first().click();
    await expect(page).toHaveURL(/\/invoices/, { timeout: 15000 });

    const amounts = page.locator('table').getByText(new RegExp(`${GHS}|\\$`));
    await expect(amounts.first()).toBeVisible({ timeout: 20000 });
    await expect(async () => {
      const texts = await amounts.allInnerTexts();
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) {
        expect(text).toContain(GHS);
        expect(text).not.toContain('$');
      }
    }).toPass({ timeout: 15000 });

    await shot(page, 'invoice-list-currency-after-login');
  });

  test('a failed enrichment leaves the user signed in on the dashboard', async ({ page }) => {
    // The token from login is valid, so a broken /user/current.json must not
    // invalidate the session — it may only cost the currency.
    await mockGhsTenant(page, { currentUserOk: false });

    await signIn(page);

    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId('stat-total-revenue-value')).toBeVisible({ timeout: 20000 });

    await shot(page, 'dashboard-enrichment-failed-still-signed-in');
  });
});
