/**
 * SOUPFIN-160: Bills and Vendors say WHY a request failed.
 *
 * The backend answers 403 for two reasons (see SOUPFIN-150):
 *  - a module interceptor: { error: "<Finance|Trading> module is not enabled for this tenant" }
 *  - Spring Security, a missing role: { timestamp, status: 403, error: "Forbidden", path }
 * and 500 for a server fault. Before this fix the bills and vendors pages
 * showed one generic message for all three, the vendor form printed
 * "Request failed with status code 403", and the bill form stayed editable
 * until a submit failed with "Please select a vendor".
 *
 * Mock-only: the LXC backend cannot be made to return these bodies on demand.
 * Navigation is by sidebar and page clicks, never page.goto on the target route.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { bills, installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-160';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

const MODULE_FINANCE = { error: 'Finance module is not enabled for this tenant' };
const MODULE_TRADING = { error: 'Trading module is not enabled for this tenant' };
const ROLE_DENIED = (path: string) => ({ timestamp: 1791812465647, status: 403, error: 'Forbidden', path });

/** Screenshots go to a git-tracked directory, not the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

function reply(status: number, body: unknown) {
  return (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Sign in on the dashboard. Extra routes registered by `override` win (LIFO). */
async function openApp(page: Page, override: (page: Page) => Promise<void> = async () => {}) {
  await installGuideMocks(page);
  await override(page);
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
}

async function clickSidebar(page: Page, path: '/bills' | '/vendors') {
  await page.locator('aside').locator(`a[href="${path}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

async function expectNoHttpJargon(page: Page) {
  await expect(page.getByText(/status code/i)).toHaveCount(0);
  await expect(page.getByText(/^Forbidden$/)).toHaveCount(0);
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-160: bills and vendors explain failed requests', () => {
  test.skip(isLxcMode(), 'Mock-only spec: controls the error response bodies');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test.describe('Bills list', () => {
    test('a disabled Finance module names the module and offers no retry', async ({ page }) => {
      await openApp(page, (p) => p.route('**/rest/bill/index.json*', reply(403, MODULE_FINANCE)));
      await clickSidebar(page, '/bills');

      const card = page.getByTestId('bill-list-error');
      await expect(card).toHaveAttribute('data-error-kind', 'module_disabled', { timeout: 15_000 });
      await expect(page.getByTestId('bill-list-error-title')).toHaveText('Finance module is not available');
      await expect(page.getByTestId('bill-list-error-hint')).toContainText('enable this module');
      await expect(page.getByTestId('bill-list-error-retry')).toHaveCount(0);
      await expectNoHttpJargon(page);
      await shot(page, '01-bills-list-module-disabled');
    });

    test('a missing role says "no permission"', async ({ page }) => {
      await openApp(page, (p) =>
        p.route('**/rest/bill/index.json*', reply(403, ROLE_DENIED('/rest/bill/index.json')))
      );
      await clickSidebar(page, '/bills');

      await expect(page.getByTestId('bill-list-error')).toHaveAttribute('data-error-kind', 'forbidden', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('bill-list-error-title')).toHaveText('You do not have permission');
      await expectNoHttpJargon(page);
      await shot(page, '02-bills-list-role-denied');
    });

    test('a server fault offers Retry, and Retry loads the bills', async ({ page }) => {
      await openApp(page);
      // Registered after the dashboard has loaded: the dashboard fetches bills
      // too, and must not consume the failures meant for the Bills page. Two
      // failures, because the app's QueryClient retries every query once.
      let failuresLeft = 2;
      await page.route('**/rest/bill/index.json*', (route) => {
        if (failuresLeft > 0) {
          failuresLeft -= 1;
          return reply(500, {})(route);
        }
        return route.fallback();
      });
      await clickSidebar(page, '/bills');

      await expect(page.getByTestId('bill-list-error')).toHaveAttribute('data-error-kind', 'server_error', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('bill-list-error-title')).toHaveText('Server error');
      await expectNoHttpJargon(page);
      await shot(page, '03-bills-list-server-error');

      await page.getByTestId('bill-list-error-retry').click();
      await expect(page.getByTestId('bill-list-table')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('bill-list-error')).toHaveCount(0);
      await shot(page, '04-bills-list-after-retry');
    });
  });

  test('Bill detail: a missing role on the bill load is explained', async ({ page }) => {
    await openApp(page, async (p) => {
      // Workaround for SOUPFIN-249: the list reads `billNumber` but the backend
      // (and these mocks) send `number`, which leaves the only link to the
      // detail page empty and unclickable. Remove once SOUPFIN-249 lands.
      await p.route('**/rest/bill/index.json*', reply(200, bills.map((b) => ({ ...b, billNumber: b.number }))));
      await p.route('**/rest/bill/show/*.json*', reply(403, ROLE_DENIED('/rest/bill/show/bill-001.json')));
    });
    await clickSidebar(page, '/bills');
    await page.getByTestId('bill-link-bill-001').click();
    await expect(page).toHaveURL(/\/bills\/bill-001$/);

    await expect(page.getByTestId('bill-detail-error')).toHaveAttribute('data-error-kind', 'forbidden', {
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Back to Bills' })).toBeVisible();
    await expectNoHttpJargon(page);
    await shot(page, '05-bill-detail-role-denied');
  });

  test('Bill form: a module-gated vendor lookup shows the banner and blocks saving', async ({ page }) => {
    let saveCalls = 0;
    await openApp(page, async (p) => {
      // Registered before the vendor override so the bill list still loads.
      await p.route('**/rest/bill/save.json*', (route) => {
        saveCalls += 1;
        return reply(500, {})(route);
      });
      await p.route('**/vendor/index.json*', reply(403, MODULE_TRADING));
    });
    await clickSidebar(page, '/bills');
    await page.getByTestId('bill-new-button').click();
    await expect(page).toHaveURL(/\/bills\/new$/);

    const banner = page.getByTestId('bill-form-module-disabled');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('Trading module is not available');
    await expect(banner).toContainText('Bills cannot be saved until the module is enabled.');
    await expect(page.getByTestId('bill-form-save-button')).toBeDisabled();
    await expect(page.getByTestId('bill-details-card')).toBeVisible();

    // Enter in a field submits the form element; it must not reach the API.
    await page.getByTestId('bill-item-description-0').fill('Rent');
    await page.getByTestId('bill-item-description-0').press('Enter');
    await expect(page.getByText('Please select a vendor')).toHaveCount(0);
    expect(saveCalls).toBe(0);
    await expectNoHttpJargon(page);
    // Show the disabled Save button alongside the banner.
    await page.getByTestId('bill-form-heading').scrollIntoViewIfNeeded();
    await shot(page, '06-bill-form-module-disabled');
  });

  test.describe('Vendors', () => {
    test('list: a disabled Trading module names the module', async ({ page }) => {
      await openApp(page, (p) => p.route('**/vendor/index.json*', reply(403, MODULE_TRADING)));
      await clickSidebar(page, '/vendors');

      await expect(page.getByTestId('vendor-list-error')).toHaveAttribute('data-error-kind', 'module_disabled', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('vendor-list-error-title')).toHaveText('Trading module is not available');
      await expect(page.getByTestId('vendor-list-error-retry')).toHaveCount(0);
      await expectNoHttpJargon(page);
      await shot(page, '07-vendors-list-module-disabled');
    });

    test('detail: a server fault on the vendor load is explained', async ({ page }) => {
      await openApp(page, (p) => p.route('**/vendor/show/*.json*', reply(500, {})));
      await clickSidebar(page, '/vendors');
      await page.getByTestId('vendor-link-vendor-001').click();
      await expect(page).toHaveURL(/\/vendors\/vendor-001$/);

      await expect(page.getByTestId('vendor-detail-error')).toHaveAttribute('data-error-kind', 'server_error', {
        timeout: 15_000,
      });
      await expect(page.getByRole('link', { name: 'Back to Vendors' })).toBeVisible();
      await expectNoHttpJargon(page);
      await shot(page, '08-vendor-detail-server-error');
    });

    test('form: a 403 on save reads as the module message, not "status code 403"', async ({ page }) => {
      let saveBody: Record<string, unknown> | null = null;
      await openApp(page, (p) =>
        p.route('**/vendor/save.json*', (route) => {
          saveBody = route.request().postDataJSON();
          return reply(403, MODULE_TRADING)(route);
        })
      );
      await clickSidebar(page, '/vendors');
      await page.getByTestId('vendor-new-button').click();
      await expect(page).toHaveURL(/\/vendors\/new$/);

      await page.getByTestId('vendor-form-name').fill('Kumasi Paper Co');
      await shot(page, '09-vendor-form-filled');
      await page.getByTestId('vendor-form-save').click();

      const banner = page.getByTestId('vendor-form-error');
      await expect(banner).toBeVisible({ timeout: 15_000 });
      await expect(banner).toContainText('Failed to save vendor');
      await expect(banner).toContainText('Trading module');
      expect(saveBody).toMatchObject({ name: 'Kumasi Paper Co' });
      await expect(page).toHaveURL(/\/vendors\/new$/);
      await expectNoHttpJargon(page);
      await shot(page, '10-vendor-form-save-module-disabled');
    });
  });
});
