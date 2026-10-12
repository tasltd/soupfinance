/**
 * SOUPFIN-142 — Chart of Accounts looks empty for every tenant
 *
 * What the investigation found (see plans/soupfin-142-coa-seeding-backend.md):
 *   - The backend DOES seed a starter chart at /account/register.json: 32 accounts
 *     for a SERVICES tenant (AccountRegistrationService.createServicesChartOfAccounts).
 *   - The page asked for /rest/ledgerAccount/index.json with no `max`, so the
 *     backend returned its default 10 rows, newest first: ten expense accounts.
 *     Assets, liabilities, equity and income never showed.
 *   - An account whose category FK arrives without a group was dropped; when that
 *     was every account the page rendered nothing at all (SOUPFIN-148).
 *   - A role denial on the ledger was labelled "Ledger module is not available"
 *     (SOUPFIN-150).
 *
 * The ledger endpoint mock below behaves like LedgerAccountController.index:
 * max defaults to 10 and is clamped to 1000, offset pages, the default sort is
 * dateCreated desc. The page is reached by clicking the sidebar, never page.goto.
 *
 * Run: npx playwright test e2e/soupfin-142-chart-of-accounts.spec.ts --project=firefox
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-142';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage });
}

// The SERVICES template the backend seeds at registration, in creation order.
const SERVICES_TEMPLATE: Array<[string, string, string, string]> = [
  ['1000', 'Cash and Cash Equivalents', 'ASSET', 'Current Assets'],
  ['1100', 'Accounts Receivable', 'ASSET', 'Current Assets'],
  ['1200', 'Prepaid Expenses', 'ASSET', 'Current Assets'],
  ['1300', 'Fixed Assets', 'ASSET', 'Non-Current Assets'],
  ['1310', 'Equipment', 'ASSET', 'Non-Current Assets'],
  ['1320', 'Furniture & Fixtures', 'ASSET', 'Non-Current Assets'],
  ['1350', 'Accumulated Depreciation', 'ASSET', 'Non-Current Assets'],
  ['1400', 'Other Assets', 'ASSET', 'Other Assets'],
  ['2000', 'Accounts Payable', 'LIABILITY', 'Current Liabilities'],
  ['2100', 'Accrued Expenses', 'LIABILITY', 'Current Liabilities'],
  ['2200', 'Unearned Revenue', 'LIABILITY', 'Current Liabilities'],
  ['2300', 'Taxes Payable', 'LIABILITY', 'Current Liabilities'],
  ['2310', 'VAT/Sales Tax Payable', 'LIABILITY', 'Current Liabilities'],
  ['2320', 'Income Tax Payable', 'LIABILITY', 'Current Liabilities'],
  ['2400', 'Long-term Debt', 'LIABILITY', 'Non-Current Liabilities'],
  ['3000', "Owner's Capital", 'EQUITY', 'Equity'],
  ['3100', 'Retained Earnings', 'EQUITY', 'Equity'],
  ['3200', 'Current Year Earnings', 'EQUITY', 'Equity'],
  ['4000', 'Service Revenue', 'INCOME', 'Revenue'],
  ['4100', 'Consulting Revenue', 'INCOME', 'Revenue'],
  ['4200', 'Professional Fees', 'INCOME', 'Revenue'],
  ['4900', 'Other Income', 'INCOME', 'Other Income'],
  ['5000', 'Salaries & Wages', 'EXPENSE', 'Operating Expenses'],
  ['5100', 'Professional Development', 'EXPENSE', 'Operating Expenses'],
  ['5200', 'Rent Expense', 'EXPENSE', 'Operating Expenses'],
  ['5300', 'Utilities', 'EXPENSE', 'Operating Expenses'],
  ['5400', 'Marketing & Advertising', 'EXPENSE', 'Operating Expenses'],
  ['5500', 'Travel & Entertainment', 'EXPENSE', 'Operating Expenses'],
  ['5600', 'Insurance', 'EXPENSE', 'Operating Expenses'],
  ['5700', 'Depreciation Expense', 'EXPENSE', 'Operating Expenses'],
  ['5800', 'Office Supplies', 'EXPENSE', 'Operating Expenses'],
  ['5900', 'Other Operating Expenses', 'EXPENSE', 'Operating Expenses'],
];

type RawAccount = Record<string, unknown> & { id: string; number: string; dateCreated: string };

/** Backend-shaped LedgerAccount rows: no code/ledgerGroup, group lives in the category's serialised. */
function templateRows(): RawAccount[] {
  return SERVICES_TEMPLATE.map(([number, name, group, category], i) => ({
    id: `la-${number}`,
    name,
    number,
    ledgerAccountCategory: { id: `cat-${category}`, class: 'soupbroker.finance.LedgerAccountCategory', serialised: `${category} < ${group}` },
    systemAccount: false,
    editable: true,
    deletable: true,
    dateCreated: new Date(Date.UTC(2026, 9, 10, 9, 0, i)).toISOString(),
  }));
}

/**
 * Serve /rest/ledgerAccount/index.json the way the Grails controller does and
 * record every request, so the test can assert what the page actually asked for.
 */
async function serveLedgerAccounts(page: Page, rowsForCall: (call: number) => RawAccount[]) {
  const requests: URL[] = [];
  await page.route('**/rest/ledgerAccount/index.json*', (route: Route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const rows = [...rowsForCall(requests.length)];
    const max = Math.min(Number(url.searchParams.get('max')) || 10, 1000);
    const offset = Number(url.searchParams.get('offset')) || 0;
    const sort = url.searchParams.get('sort') || 'dateCreated';
    const order = url.searchParams.get('order') || 'desc';
    rows.sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')) * (order === 'desc' ? -1 : 1));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows.slice(offset, offset + max)) });
  });
  return requests;
}

async function openChartOfAccountsFromMenu(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  await page.locator('aside').locator('a[href="/ledger/accounts"]').first().click();
  await expect(page).toHaveURL(/\/ledger\/accounts$/);
  await expect(page.getByTestId('chart-of-accounts-page')).toBeVisible({ timeout: 15_000 });
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-142: Chart of Accounts shows the seeded chart', () => {
  test.skip(isLxcMode(), 'Mock-only spec: the LXC tenants are covered by the backend plan');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock below takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
    await installGuideMocks(page);
    await seedAuthenticatedSession(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('a new SERVICES tenant sees all 32 seeded accounts, grouped', async ({ page }) => {
    const requests = await serveLedgerAccounts(page, () => templateRows());
    await openChartOfAccountsFromMenu(page);
    await expect(page.getByTestId('coa-groups')).toBeVisible();

    // API state: the page asked for a full page, not the 10-row default
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get('max')).toBe('1000');
    expect(requests[0].searchParams.get('offset')).toBe('0');

    await expect(page.locator('[data-testid^="coa-account-"]')).toHaveCount(32);
    await expect(page.getByTestId('coa-group-asset')).toContainText('8 accounts');
    await expect(page.getByTestId('coa-group-liability')).toContainText('7 accounts');
    await expect(page.getByTestId('coa-group-equity')).toContainText('3 accounts');
    await expect(page.getByTestId('coa-group-income')).toContainText('4 accounts');
    await expect(page.getByTestId('coa-group-expense')).toContainText('10 accounts');
    await expect(page.getByTestId('coa-group-uncategorised')).toHaveCount(0);

    // The accounts the old 10-row default never reached: A/R, A/P, tax, equity
    for (const id of ['la-1100', 'la-2000', 'la-2310', 'la-3100', 'la-4000']) {
      await expect(page.getByTestId(`coa-account-${id}`)).toBeVisible();
    }
    // Sorted by code inside each group
    const assetCodes = await page.getByTestId('coa-table-asset').locator('tbody tr td:first-child').allTextContents();
    expect(assetCodes).toEqual(['1000', '1100', '1200', '1300', '1310', '1320', '1350', '1400']);

    await shot(page, 'coa-services-template-top');
    await shot(page, 'coa-services-template-full', true);
  });

  test('a tenant past the 1000-row cap gets every page (2500 accounts)', async ({ page }) => {
    const big: RawAccount[] = Array.from({ length: 2500 }, (_, i) => ({
      id: `big-${i}`,
      name: `Client sub-account ${i}`,
      number: String(100000 + i),
      ledgerAccountCategory: { id: 'cat-ca', serialised: 'Current Assets < ASSET' },
      dateCreated: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    }));
    const requests = await serveLedgerAccounts(page, () => big);
    await openChartOfAccountsFromMenu(page);

    await expect(page.getByTestId('coa-group-asset')).toContainText('2500 accounts', { timeout: 30_000 });
    expect(requests.map((u) => u.searchParams.get('offset'))).toEqual(['0', '1000', '2000']);
    await expect(page.getByTestId('coa-account-big-2499')).toBeAttached();
    await shot(page, 'coa-2500-accounts');
  });

  test('accounts with no derivable group land in Uncategorised instead of a blank page', async ({ page }) => {
    // Shallow category refs (id only) are what the backend sends when the
    // category is not rendered: no serialised, so no group can be derived.
    const shallow = templateRows().slice(0, 4).map((r) => ({ ...r, ledgerAccountCategory: { id: 'cat-x' } }));
    await serveLedgerAccounts(page, () => shallow);
    await openChartOfAccountsFromMenu(page);

    const group = page.getByTestId('coa-group-uncategorised');
    await expect(group).toBeVisible();
    await expect(group).toContainText('Uncategorised');
    await expect(group).toContainText('4 accounts');
    await expect(page.getByTestId('coa-group-note-uncategorised')).toHaveText(
      'Give these accounts a category to include them in reports.'
    );
    await expect(page.getByTestId('coa-empty')).toHaveCount(0);
    await shot(page, 'coa-uncategorised-fallback');
  });

  test('an empty chart explains the starter chart and Refresh reloads it', async ({ page }) => {
    const requests = await serveLedgerAccounts(page, (call) => (call === 1 ? [] : templateRows()));
    await openChartOfAccountsFromMenu(page);

    await expect(page.getByTestId('coa-empty')).toContainText('No accounts found');
    await expect(page.getByTestId('coa-empty-hint')).toHaveText(
      'A starter chart is normally added when your company signs up. Refresh to check again, or ask your administrator to set one up.'
    );
    await shot(page, 'coa-empty-state');

    await page.getByRole('button', { name: 'Refresh accounts' }).click();
    await expect(page.locator('[data-testid^="coa-account-"]')).toHaveCount(32);
    expect(requests).toHaveLength(2);
    await shot(page, 'coa-after-refresh');
  });

  test('a role denial reads "access restricted", the module 403 still reads "not available"', async ({ page }) => {
    let body: unknown = { error: 'Forbidden' };
    await page.route('**/rest/ledgerAccount/index.json*', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify(body) })
    );
    await openChartOfAccountsFromMenu(page);

    const card = page.getByTestId('coa-error');
    await expect(card).toHaveAttribute('data-error-kind', 'forbidden');
    await expect(page.getByTestId('coa-error-title')).toHaveText('Ledger access restricted');
    await expect(card).toContainText('Your role does not include access to the Ledger.');
    await expect(card).toContainText('Ask an administrator to add Ledger access to your role.');
    await shot(page, 'coa-403-missing-role');

    // The interceptor's own wording is still a module problem
    body = { error: 'Finance module is not enabled for this tenant' };
    await page.locator('aside').locator('a[href="/ledger/transactions"]').first().click();
    await page.locator('aside').locator('a[href="/ledger/accounts"]').first().click();
    await expect(page.getByTestId('coa-error')).toHaveAttribute('data-error-kind', 'module_disabled', { timeout: 15_000 });
    await expect(page.getByTestId('coa-error-title')).toHaveText('Ledger module is not available');
    await shot(page, 'coa-403-module-disabled');
  });
});
