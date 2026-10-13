/**
 * Added (SOUPFIN-161): Journal Entry, Payment Voucher and Ledger Transactions
 * against the real LXC backend, with the Ledger and Accounting modules ON.
 *
 * The older accounting/ledger integration specs mostly passed through the
 * 403 "module disabled" path. The LXC seed tenant has both modules enabled, so
 * these assert the 200 path instead: each page is reached from the sidebar,
 * its account dropdowns fill from the backend, and no module banner shows.
 *
 * Not covered here, because the app cannot do it yet: saving a journal entry
 * stores an empty group (SOUPFIN-251); the post, reverse and approve actions
 * the app calls do not exist on the backend (SOUPFIN-252); and the seed tenant
 * has no expense or income accounts for a voucher. The create -> post ->
 * reverse flow is SOUPFIN-256. The Ledger Transactions filters are covered by
 * unit tests only: this backend ignores the account and date params and rows
 * carry no status (SOUPFIN-253).
 *
 * Run: npx playwright test --config=playwright.lxc.config.ts e2e/integration/soupfin-161-accounting-pages.integration.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { backendTestUsers } from '../fixtures';

const API_BASE = 'http://10.115.213.183:9090';
// test-results/ is wiped on each run; the committed copy is the evidence.
const SHOT_DIRS = ['test-results/screenshots/soupfin-161', 'e2e/playwright/screenshots/soupfin-161'];
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

// The backend call the page depends on, made directly so the test records
// what the server said and not only what the page shows.
async function apiStatus(page: Page, path: string): Promise<{ status: number; body: unknown }> {
  const response = await page.request.get(`${API_BASE}/rest/${path}`, {
    headers: { 'X-Auth-Token': await token(page), Accept: 'application/json' },
    maxRedirects: 0,
    timeout: 45000,
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function openFromSidebar(page: Page, section: 'Ledger' | 'Accounting', item: string) {
  const nav = page.getByRole('navigation').first();
  await nav.getByRole('link', { name: section, exact: true }).click();
  await nav.getByRole('link', { name: item, exact: true }).click();
}

const realOptions = (page: Page, testId: string) =>
  page.getByTestId(testId).locator('option:not([value=""])');

test.describe('SOUPFIN-161 accounting pages with the modules enabled (LXC)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Journal Entry: accounts load, no module banner, balance indicator tracks the lines', async ({ page }) => {
    const accounts = await apiStatus(page, 'ledgerAccount/index.json?max=5');
    expect(accounts.status).toBe(200);
    expect(Array.isArray(accounts.body) && accounts.body.length).toBeGreaterThan(0);

    await openFromSidebar(page, 'Accounting', 'Journal Entry');
    await expect(page).toHaveURL(/\/accounting\/journal-entry$/);
    await expect(page.getByTestId('journal-entry-heading')).toHaveText('New Journal Entry');
    await expect(realOptions(page, 'journal-entry-line-0-account').first()).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('journal-entry-module-disabled')).toHaveCount(0);
    await shot(page, 'je-loaded');

    const values = await realOptions(page, 'journal-entry-line-0-account').evaluateAll((els) =>
      els.map((el) => (el as HTMLOptionElement).value)
    );
    expect(values.length).toBeGreaterThan(1);

    await page.getByTestId('journal-entry-description-input').fill('SOUPFIN-161 LXC balance check');
    await page.getByTestId('journal-entry-line-0-account').selectOption(values[0]);
    await page.getByTestId('journal-entry-line-0-debit').fill('25');
    await expect(page.getByTestId('journal-entry-balance-indicator')).toContainText('Out of Balance');
    await expect(page.getByTestId('journal-entry-save-post-button')).toBeDisabled();
    await shot(page, 'je-out-of-balance');

    await page.getByTestId('journal-entry-line-1-account').selectOption(values[1]);
    await page.getByTestId('journal-entry-line-1-credit').fill('25');
    await expect(page.getByTestId('journal-entry-balance-indicator')).toContainText('Balanced');
    await expect(page.getByTestId('journal-entry-total-debit')).toContainText('25.00');
    await expect(page.getByTestId('journal-entry-total-credit')).toContainText('25.00');
    await expect(page.getByTestId('journal-entry-save-post-button')).toBeEnabled();
    await shot(page, 'je-balanced');
  });

  test('Payment Voucher: bank/cash accounts load, no module banner, the save endpoint issues a CSRF token', async ({ page }) => {
    const create = await apiStatus(page, 'voucher/create.json');
    expect(create.status).toBe(200);
    expect((create.body as Record<string, unknown>)?.SYNCHRONIZER_TOKEN).toBeTruthy();

    await openFromSidebar(page, 'Accounting', 'Payment Voucher');
    await expect(page).toHaveURL(/\/accounting\/voucher\/payment$/);
    await expect(page.getByTestId('voucher-form-heading')).toHaveText('New Payment Voucher');
    await expect(realOptions(page, 'voucher-cash-account-select').first()).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('voucher-form-module-disabled')).toHaveCount(0);
    await expect(page.getByTestId('voucher-expense-account-select')).toBeVisible();
    await expect(page.getByTestId('voucher-amount-preview')).toContainText('Money Out');
    await shot(page, 'voucher-payment-loaded');

    // Switching type swaps the account field without a reload.
    await page.getByTestId('voucher-type-receipt').click();
    await expect(page.getByTestId('voucher-form-heading')).toHaveText('New Receipt Voucher');
    await expect(page.getByTestId('voucher-income-account-select')).toBeVisible();
    await expect(page.getByTestId('voucher-expense-account-select')).toHaveCount(0);
    await shot(page, 'voucher-switched-to-receipt');
  });

  test('Ledger Transactions: the newest 100 rows load from the backend on the 200 path', async ({ page }) => {
    const list = await apiStatus(page, 'ledgerTransaction/index.json?max=100&sort=transactionDate&order=desc');
    expect(list.status).toBe(200);
    const rows = list.body as Array<{ id: string }>;
    expect(rows.length).toBeGreaterThan(0);

    const pageRequest = page.waitForRequest((r) => r.url().includes('/rest/ledgerTransaction/index.json'));
    await openFromSidebar(page, 'Ledger', 'Transactions');
    await expect(page).toHaveURL(/\/ledger\/transactions$/);
    const sent = new URL((await pageRequest).url());
    expect(sent.searchParams.get('max')).toBe('100');

    await expect(page.getByTestId('ledger-table')).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId('ledger-error')).toHaveCount(0);
    // The newest row the backend returned is on the page.
    await expect(page.getByTestId(`ledger-row-${rows[0].id}`)).toBeVisible();
    await expect(page.getByTestId('ledger-summary')).toContainText(`Showing ${rows.length} transaction`);
    await shot(page, 'ledger-transactions-loaded');
  });
});
