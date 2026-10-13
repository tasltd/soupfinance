/**
 * SOUPFIN-150: a 403 on the Chart of Accounts says WHY it happened.
 *
 * The backend answers 403 on /rest/ledgerAccount for two different reasons:
 *  - FinanceModuleInterceptor: the tenant does not have the Finance module.
 *    Body: { error: "Finance module is not enabled for this tenant" }
 *  - Spring Security: the user lacks a role such as ROLE_LEDGER_ACCOUNT.
 *    Body: Spring Boot's error envelope, { timestamp, status: 403, error: "Forbidden", path }
 *
 * Before the fix both showed "Ledger module is not available". The role case
 * now shows a permission message that sends the user to their admin.
 *
 * Mock-only: the LXC backend cannot be made to return either body on demand.
 * Navigation is by sidebar click, never page.goto on the target route.
 */
import { test, expect, type Page } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-150';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

/** Screenshots go to a git-tracked directory, not the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function openChartOfAccounts(page: Page, body: unknown) {
  await installGuideMocks(page);
  // Registered after the guide mocks so it wins (Playwright routes are LIFO).
  await page.route('**/rest/ledgerAccount/index.json*', (route) =>
    route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify(body) })
  );
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });

  await page.locator('aside').locator('a[href="/ledger/accounts"]').first().click();
  await expect(page).toHaveURL(/\/ledger\/accounts$/);
  await expect(page.getByTestId('chart-of-accounts-page')).toBeVisible({ timeout: 15_000 });
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-150: Chart of Accounts 403 names the real cause', () => {
  test.skip(isLxcMode(), 'Mock-only spec: controls the 403 response body');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('a missing role shows "no permission, ask your admin", not "module not available"', async ({ page }) => {
    await openChartOfAccounts(page, {
      timestamp: 1791812465647,
      status: 403,
      error: 'Forbidden',
      path: '/rest/ledgerAccount/index.json',
    });

    const card = page.locator('[data-error-kind="forbidden"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId('coa-error-title')).toHaveText('You do not have permission');
    await expect(card.getByTestId('coa-error-message')).toHaveText(
      'Your account does not have permission to use Ledger.'
    );
    await expect(card.getByTestId('coa-error-hint')).toHaveText(
      'Ask your administrator to give your account access.'
    );
    await expect(page.locator('[data-error-kind="module_disabled"]')).toHaveCount(0);
    await expect(page.getByText(/module is not available/i)).toHaveCount(0);
    await expect(page.getByText(/^Forbidden$/)).toHaveCount(0);
    await shot(page, '01-role-denied-permission-message');
  });

  test('a disabled module still shows "Ledger module is not available"', async ({ page }) => {
    await openChartOfAccounts(page, { error: 'Finance module is not enabled for this tenant' });

    const card = page.locator('[data-error-kind="module_disabled"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId('coa-error-title')).toHaveText('Ledger module is not available');
    await expect(card.getByTestId('coa-error-hint')).toContainText('enable this module');
    await expect(page.locator('[data-error-kind="forbidden"]')).toHaveCount(0);
    await shot(page, '02-module-disabled-message');
  });
});
