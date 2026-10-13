/**
 * SOUPFIN-181: the module gate is machine-readable, and the menu follows it.
 *
 * soupmarkets-web now answers a module-gated 403 with
 *   headers  X-Module-Status: disabled, X-Module: FINANCE
 *   body     { error: "<sentence>", code: "MODULE_DISABLED", module: "FINANCE", message: "<sentence>" }
 * and lists the tenant's modules at GET /account/modules.json.
 *
 * The app reads the list after sign-in and the SideNav hides pages for modules the
 * tenant lacks, so a FINANCE-less tenant no longer opens Payments, Ledger or Accounting
 * into guaranteed 403s. A role denial (Spring Security, no module headers) still reads
 * as "no permission".
 *
 * Mock-only: the bodies and headers are the backend's real shapes (ModuleGate.groovy),
 * but the LXC backend cannot switch a tenant's modules on demand. Navigation is by
 * sidebar click, never page.goto on the target route.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-181';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

/** Screenshots go to a git-tracked directory, not the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

const FINANCE_DISABLED_BODY = {
  error: 'Finance module is not enabled for this tenant',
  code: 'MODULE_DISABLED',
  module: 'FINANCE',
  message: 'Finance module is not enabled for this tenant',
};
const MODULE_HEADERS = { 'X-Module-Status': 'disabled', 'X-Module': 'FINANCE' };

/** Requests to controllers FinanceModuleInterceptor gates and the menu used to reach. */
const GATED_LIST = /\/rest\/(invoicePayment|billPayment|ledgerAccount|ledgerTransaction|voucher)\/index\.json/;

async function signIn(page: Page, modules: { status: number; body: unknown }) {
  await installGuideMocks(page);
  // Registered after the guide mocks so it wins (Playwright routes are LIFO).
  await page.route('**/account/modules.json*', (route) =>
    route.fulfill({ status: modules.status, contentType: 'application/json', body: JSON.stringify(modules.body) })
  );
  await seedAuthenticatedSession(page);
  const modulesLoaded = page.waitForResponse((r) => r.url().includes('/account/modules.json'));
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  await modulesLoaded;
}

function navLink(page: Page, href: string) {
  return page.locator('aside').locator(`a[href="${href}"]`);
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-181: the menu follows the tenant modules, and a gated 403 says so', () => {
  test.skip(isLxcMode(), 'Mock-only spec: controls the module list and the 403 response');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('a tenant without FINANCE sees no Payments, Ledger or Accounting, and is told why', async ({ page }) => {
    const gatedRequests: string[] = [];
    page.on('request', (r: Request) => {
      if (GATED_LIST.test(r.url())) gatedRequests.push(r.url());
    });

    await signIn(page, { status: 200, body: { tenantId: 'tenant-guide', modules: ['CLIENT'] } });

    const aside = page.locator('aside');
    for (const href of ['/payments', '/ledger/accounts', '/accounting/transactions', '/invoices', '/bills']) {
      await expect(navLink(page, href)).toHaveCount(0);
    }
    await expect(navLink(page, '/clients')).toBeVisible();
    await expect(navLink(page, '/dashboard')).toBeVisible();
    await expect(aside.getByTestId('nav-modules-hidden-note')).toHaveText(
      'Some pages are hidden because their module is turned off for your organisation. Ask your administrator to turn it on.'
    );
    await shot(page, '01-finance-off-menu-hidden');

    // The menu still works for what is left: open Clients by clicking it.
    await navLink(page, '/clients').first().click();
    await expect(page).toHaveURL(/\/clients$/);
    await expect(page.getByTestId('client-list-page')).toBeVisible({ timeout: 15_000 });
    await shot(page, '02-finance-off-clients-still-open');

    expect(gatedRequests, 'no request to a FINANCE-gated list controller').toEqual([]);
  });

  test('a tenant with FINANCE sees the full menu and no note', async ({ page }) => {
    await signIn(page, { status: 200, body: { tenantId: 'tenant-guide', modules: ['CLIENT', 'FINANCE'] } });

    for (const href of ['/payments', '/ledger/accounts', '/accounting/transactions', '/invoices', '/bills', '/vendors']) {
      await expect(navLink(page, href)).toBeVisible();
    }
    await expect(page.getByTestId('nav-modules-hidden-note')).toHaveCount(0);
    await shot(page, '03-finance-on-full-menu');
  });

  test('a backend without the modules endpoint (404) keeps the full menu; the header names the gate', async ({ page }) => {
    await signIn(page, { status: 404, body: { error: 'Not Found' } });
    // After signIn, so it wins over the guide mocks (Playwright routes are LIFO).
    await page.route('**/rest/invoicePayment/index.json*', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers: MODULE_HEADERS,
        body: JSON.stringify(FINANCE_DISABLED_BODY),
      })
    );

    await expect(navLink(page, '/payments')).toBeVisible();
    await expect(page.getByTestId('nav-modules-hidden-note')).toHaveCount(0);

    const answered = page.waitForResponse(
      (r) => r.url().includes('/rest/invoicePayment/index.json') && r.status() === 403
    );
    await navLink(page, '/payments').first().click();
    await expect(page).toHaveURL(/\/payments$/);
    const response = await answered;
    expect(response.headers()['x-module-status']).toBe('disabled');

    const card = page.locator('[data-testid="payment-list-error"][data-error-kind="module_disabled"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId('payment-list-error-title')).toHaveText('Finance module is not available');
    await expect(card).not.toContainText('MODULE_DISABLED');
    await shot(page, '04-header-module-disabled-on-payments');
  });

  test('a role denial (no module headers, Spring body) still reads as "no permission"', async ({ page }) => {
    await signIn(page, { status: 200, body: { tenantId: 'tenant-guide', modules: ['CLIENT', 'FINANCE'] } });
    // After signIn, so it wins over the guide mocks (Playwright routes are LIFO).
    await page.route('**/rest/invoicePayment/index.json*', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          timestamp: 1791900000000,
          status: 403,
          error: 'Forbidden',
          path: '/rest/invoicePayment/index.json',
        }),
      })
    );

    await navLink(page, '/payments').first().click();
    await expect(page).toHaveURL(/\/payments$/);

    const card = page.locator('[data-testid="payment-list-error"][data-error-kind="forbidden"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId('payment-list-error-title')).toHaveText('You do not have permission');
    await expect(page.locator('[data-error-kind="module_disabled"]')).toHaveCount(0);
    await shot(page, '05-role-denied-stays-permission');
  });
});
