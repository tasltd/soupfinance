/**
 * SOUPFIN-180: Payments pages explain failures per tab, and speak four languages.
 *
 * Before this fix the payments list showed "Finance module not available" only
 * when BOTH the invoice-payment and bill-payment endpoints answered 403. One
 * gated tab got a generic "Failed to load payments" card, and every string was
 * English. The payment form replaced itself with a full-page notice.
 *
 * Now each tab renders its own ApiErrorState (api/errors), the form keeps its
 * layout under ModuleDisabledBanner, and all copy comes from the payments
 * namespace.
 *
 * Mock-only: the LXC backend cannot be made to gate one controller on demand.
 * Navigation is by sidebar and page clicks, never page.goto on the target route.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-180';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

// The real FinanceModuleInterceptor body (see api/errors.ts classifyForbiddenBody)
const FINANCE_GATE = { error: 'Finance module is not enabled for this tenant' };

/** Screenshots go to a git-tracked directory, not the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

function reply(status: number, body: unknown) {
  return (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Sign in on the dashboard, optionally in another language. */
async function openApp(page: Page, language?: 'de' | 'fr' | 'nl') {
  await installGuideMocks(page);
  await seedAuthenticatedSession(page);
  if (language) {
    await page.addInitScript((lang) => localStorage.setItem('soupfinance_language', lang), language);
  }
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
}

async function openPaymentsFromSidebar(page: Page) {
  await page.locator('aside').locator('a[href="/payments"]').first().click();
  await expect(page).toHaveURL(/\/payments$/);
  await expect(page.getByTestId('payment-list-page')).toBeVisible();
}

async function expectNoHttpJargon(page: Page) {
  await expect(page.getByText(/status code/i)).toHaveCount(0);
  await expect(page.getByText(/^Forbidden$/)).toHaveCount(0);
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-180: payments explain failed requests per tab', () => {
  test.skip(isLxcMode(), 'Mock-only spec: controls the error response bodies');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('a gate on the bill side shows on the Outgoing tab only', async ({ page }) => {
    await openApp(page);
    await page.route('**/rest/billPayment/index.json*', reply(403, FINANCE_GATE));
    let billRequests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/rest/billPayment/index.json')) billRequests += 1;
    });

    await openPaymentsFromSidebar(page);

    // Incoming works: the guide data's payments are listed
    await expect(page.getByTestId('payment-table')).toBeVisible();
    await expect(page.getByTestId('payment-list-error')).toHaveCount(0);
    await expect(page.getByTestId('pay-bills-button')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('receive-payment-button')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('record-payment-button')).toHaveAttribute('aria-disabled', 'false');
    await shot(page, 'list-incoming-works-bills-gated');

    await page.getByTestId('tab-outgoing').click();
    const errorState = page.getByTestId('payment-list-error');
    await expect(errorState).toBeVisible();
    await expect(errorState).toHaveAttribute('data-error-kind', 'module_disabled');
    await expect(page.getByTestId('payment-list-error-title')).toHaveText('Finance module is not available');
    await expect(page.getByTestId('payment-list-error-retry')).toHaveCount(0);
    await expect(page.getByTestId('payment-filters')).toHaveCount(0);
    await expectNoHttpJargon(page);
    expect(billRequests).toBeGreaterThan(0);
    await shot(page, 'list-outgoing-module-disabled');

    // Back on Incoming the table is still there
    await page.getByTestId('tab-incoming').click();
    await expect(page.getByTestId('payment-table')).toBeVisible();
  });

  test('a 500 on one tab offers a retry that loads the rows in place', async ({ page }) => {
    await openApp(page);
    // Fail once, then fall back to the guide mocks. The list query sets retry: false,
    // so the single failure reaches the screen and the Retry click gets real rows.
    let failures = 1;
    await page.route('**/rest/invoicePayment/index.json*', (route) => {
      if (failures > 0) {
        failures -= 1;
        return reply(500, { error: 'Something went wrong on our side. Please try again in a moment.' })(route);
      }
      return route.fallback();
    });

    await openPaymentsFromSidebar(page);

    const errorState = page.getByTestId('payment-list-error');
    await expect(errorState).toHaveAttribute('data-error-kind', 'server_error');
    await expect(page.getByTestId('payment-filters')).toBeVisible();
    await expectNoHttpJargon(page);
    await shot(page, 'list-incoming-server-error');

    // Retry refetches without reloading the page
    await page.getByTestId('payment-list-error-retry').click();
    await expect(page.getByTestId('payment-table')).toBeVisible();
    await expect(errorState).toHaveCount(0);
    await expect(page).toHaveURL(/\/payments$/);
    await shot(page, 'list-incoming-after-retry');
  });

  test('the form keeps its layout under the module banner', async ({ page }) => {
    await openApp(page);
    await openPaymentsFromSidebar(page);
    // Registered after the dashboard and list, which fetch invoices too
    await page.route('**/rest/invoice/index.json*', reply(403, FINANCE_GATE));
    let saves = 0;
    page.on('request', (r) => {
      if (r.url().includes('/rest/invoicePayment/save')) saves += 1;
    });

    await page.getByTestId('record-payment-button').click();
    await expect(page).toHaveURL(/\/payments\/new$/);

    const banner = page.getByTestId('payment-form-module-disabled');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Finance module is not available');
    await expect(banner).toContainText('nothing to record a payment against');
    // Layout stays visible; submit cannot reach the gated endpoint
    await expect(page.getByTestId('payment-type-toggle')).toBeVisible();
    await expect(page.getByTestId('select-document')).toBeVisible();
    await page.getByTestId('amount-input').fill('100');
    await expect(page.getByTestId('submit-button')).toBeDisabled();
    await expectNoHttpJargon(page);
    await shot(page, 'form-module-disabled-banner');
    expect(saves).toBe(0);
  });

  test('the list and form read in German', async ({ page }) => {
    await openApp(page, 'de');
    await openPaymentsFromSidebar(page);

    await expect(page.getByTestId('payment-list-heading')).toHaveText('Zahlungen');
    await expect(page.getByTestId('tab-incoming')).toContainText('Eingehend');
    await expect(page.getByTestId('record-payment-button')).toContainText('Zahlung erfassen');
    await expect(page.getByTestId('filter-date-hint')).toContainText('SoupFinance');
    await expect(page.getByTestId('pagination-range')).toContainText('eingehenden Zahlung');
    await shot(page, 'list-german');

    await page.getByTestId('record-payment-button').click();
    await expect(page.getByTestId('payment-form-heading')).toHaveText('Zahlung erfassen');
    await expect(page.getByText('Zahlungsdatum *')).toBeVisible();
    await expect(page.getByTestId('submit-button')).toContainText('Zahlung erfassen');
    await shot(page, 'form-german');
  });
});
