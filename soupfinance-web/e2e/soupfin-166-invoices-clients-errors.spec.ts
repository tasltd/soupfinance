/**
 * SOUPFIN-166: Invoices and Clients say WHY a request failed.
 *
 * Before this fix the invoice and client pages showed one generic "Failed to
 * load" card for every failure, and Retry called window.location.reload().
 * A disabled module (403) looked the same as a server fault (500), and a
 * missing invoice looked the same as both.
 *
 * Now the pages render ApiErrorState: a module-disabled 403 names the module
 * and offers no Retry, a 500 offers a Retry that refetches in place, and a 404
 * on a detail page reads "not found". The invoice form shows
 * ModuleDisabledBanner when a lookup it depends on is module-gated.
 *
 * Mock-only: the LXC backend cannot be made to return these bodies on demand.
 * Navigation is by sidebar and page clicks, never page.goto on the target route.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-166';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

const MODULE_FINANCE = { error: 'Finance module is not enabled for this tenant' };
const MODULE_KYC = { error: 'Kyc module is not enabled for this tenant' };

/** Screenshots go to a git-tracked directory, not the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

function reply(status: number, body: unknown) {
  return (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * Fail the first `times` matching requests, then fall through to the guide
 * mocks. Two by default, because the app's QueryClient retries every query once.
 */
async function failThenRecover(page: Page, pattern: string, status: number, body: unknown, times = 2) {
  let left = times;
  await page.route(pattern, (route) => {
    if (left > 0) {
      left -= 1;
      return reply(status, body)(route);
    }
    return route.fallback();
  });
}

/** Sign in on the dashboard. */
async function openApp(page: Page) {
  await installGuideMocks(page);
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
}

async function clickSidebar(page: Page, path: '/invoices' | '/clients') {
  await page.locator('aside').locator(`a[href="${path}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

async function expectNoHttpJargon(page: Page) {
  await expect(page.getByText(/status code/i)).toHaveCount(0);
  await expect(page.getByText(/^Forbidden$/)).toHaveCount(0);
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-166: invoices and clients explain failed requests', () => {
  test.skip(isLxcMode(), 'Mock-only spec: controls the error response bodies');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test.describe('Invoice list', () => {
    test('a disabled Finance module names the module and offers no retry', async ({ page }) => {
      await openApp(page);
      // Registered after the dashboard, which fetches invoices too.
      await page.route('**/rest/invoice/index.json*', reply(403, MODULE_FINANCE));
      await clickSidebar(page, '/invoices');

      const card = page.getByTestId('invoice-list-error');
      await expect(card).toHaveAttribute('data-error-kind', 'module_disabled', { timeout: 15_000 });
      await expect(page.getByTestId('invoice-list-error-title')).toHaveText('Finance module is not available');
      await expect(page.getByTestId('invoice-list-error-retry')).toHaveCount(0);
      await expectNoHttpJargon(page);
      await shot(page, '01-invoice-list-module-disabled');
    });

    test('a server fault offers Retry, and Retry loads the invoices without a reload', async ({ page }) => {
      await openApp(page);
      await failThenRecover(page, '**/rest/invoice/index.json*', 500, {});
      await clickSidebar(page, '/invoices');

      await expect(page.getByTestId('invoice-list-error')).toHaveAttribute('data-error-kind', 'server_error', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('invoice-list-error-title')).toHaveText('Server error');
      await expectNoHttpJargon(page);
      await shot(page, '02-invoice-list-server-error');

      // A full reload would clear this marker; an in-place refetch keeps it.
      await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
      await page.getByTestId('invoice-list-error-retry').click();
      await expect(page.getByTestId('invoice-row-inv-001')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('invoice-list-error')).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
      await shot(page, '03-invoice-list-after-retry');
    });
  });

  test('Invoice detail: a 404 id reads "Invoice not found" with no Retry', async ({ page }) => {
    await openApp(page);
    await page.route('**/rest/invoice/show/*.json*', reply(404, { error: 'Not Found' }));
    await clickSidebar(page, '/invoices');
    await page.getByTestId('invoice-link-inv-001').click();
    await expect(page).toHaveURL(/\/invoices\/inv-001$/);

    const card = page.getByTestId('invoice-detail-error');
    await expect(card).toHaveAttribute('data-error-kind', 'not_found', { timeout: 15_000 });
    await expect(card).toContainText('Invoice not found');
    await expect(page.getByRole('button', { name: /retry/i })).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Back to Invoices' })).toBeVisible();
    await expectNoHttpJargon(page);
    await shot(page, '04-invoice-detail-not-found');
  });

  test('Invoice form: a module-gated tax lookup shows the banner and keeps the form', async ({ page }) => {
    await openApp(page);
    await page.route('**/rest/taxEntry/index.json*', reply(403, MODULE_FINANCE));
    await clickSidebar(page, '/invoices');
    await page.getByTestId('invoice-new-button').click();
    await expect(page).toHaveURL(/\/invoices\/new$/);

    const banner = page.getByTestId('invoice-form-module-disabled');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('Finance module is not available');
    await expect(banner).toContainText('lists may be empty until the module is enabled');
    await expect(page.getByTestId('invoice-details-card')).toBeVisible();
    await expectNoHttpJargon(page);
    await shot(page, '05-invoice-form-module-disabled');
  });

  test.describe('Clients', () => {
    test('list: a disabled KYC module names the module and offers no retry', async ({ page }) => {
      await openApp(page);
      await page.route('**/rest/client/index.json*', reply(403, MODULE_KYC));
      await clickSidebar(page, '/clients');

      await expect(page.getByTestId('client-list-error')).toHaveAttribute('data-error-kind', 'module_disabled', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('client-list-error-title')).toHaveText('Kyc module is not available');
      await expect(page.getByTestId('client-list-error-retry')).toHaveCount(0);
      await expectNoHttpJargon(page);
      await shot(page, '06-client-list-module-disabled');
    });

    test('list: a server fault offers Retry, and Retry loads the clients', async ({ page }) => {
      await openApp(page);
      await failThenRecover(page, '**/rest/client/index.json*', 500, {});
      await clickSidebar(page, '/clients');

      await expect(page.getByTestId('client-list-error')).toHaveAttribute('data-error-kind', 'server_error', {
        timeout: 15_000,
      });
      await shot(page, '07-client-list-server-error');

      await page.getByTestId('client-list-error-retry').click();
      await expect(page.getByTestId('client-row-client-001')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('client-list-error')).toHaveCount(0);
      await shot(page, '08-client-list-after-retry');
    });

    test('detail: a 404 id reads "Client not found"', async ({ page }) => {
      await openApp(page);
      await page.route('**/rest/client/show/*.json*', reply(404, { error: 'Not Found' }));
      await clickSidebar(page, '/clients');
      await page.getByTestId('client-link-client-001').click();
      await expect(page).toHaveURL(/\/clients\/client-001$/);

      const card = page.getByTestId('client-detail-error');
      await expect(card).toHaveAttribute('data-error-kind', 'not_found', { timeout: 15_000 });
      await expect(card).toContainText('Client not found');
      await expect(page.getByRole('button', { name: /retry/i })).toHaveCount(0);
      await expectNoHttpJargon(page);
      await shot(page, '09-client-detail-not-found');
    });

    test('detail: a server fault says so and offers Retry', async ({ page }) => {
      await openApp(page);
      await page.route('**/rest/client/show/*.json*', reply(500, {}));
      await clickSidebar(page, '/clients');
      await page.getByTestId('client-link-client-001').click();
      await expect(page).toHaveURL(/\/clients\/client-001$/);

      await expect(page.getByTestId('client-detail-error')).toHaveAttribute('data-error-kind', 'server_error', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('client-detail-error-retry')).toBeVisible();
      await expectNoHttpJargon(page);
      await shot(page, '10-client-detail-server-error');
    });
  });
});
