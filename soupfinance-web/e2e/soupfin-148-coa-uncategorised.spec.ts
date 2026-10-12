/**
 * SOUPFIN-148 — the Chart of Accounts page rendered blank when no account
 * mapped to a known ledger group.
 *
 * The page drew one section per known group and returned nothing for the rest.
 * The backend LedgerGroup enum also has SHARES and DIVIDENDS, and nests INCOME
 * and EXPENSE subgroups under EQUITY, e.g.
 *   "Revenue < INCOME < RETAINED_EARNINGS < EQUITY"
 * (13 such categories in the seed database). SHARES/DIVIDENDS and accounts with
 * no category string fell into no section, and nested income landed in Equity.
 *
 * The mocked rows below are backend-shaped: no code, ledgerGroup, isActive or
 * balance, only a ledgerAccountCategory FK, so the real transform runs.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  installUnmockedApiGuard,
  mockAmbientApi,
  mockTokenValidationApi,
  mockDashboardApi,
  isLxcMode,
  type UnmockedApiGuard,
} from './fixtures';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/playwright/screenshots/soupfin-148/${name}.png`, fullPage: true });
}

function row(id: string, name: string, number: string, serialised?: string) {
  return {
    id,
    name,
    number,
    quickReference: `QR-${id}`,
    archived: false,
    ledgerAccountCategory: serialised === undefined
      ? { id: `cat-${id}`, class: 'soupbroker.finance.LedgerAccountCategory' }
      : { id: `cat-${id}`, class: 'soupbroker.finance.LedgerAccountCategory', serialised },
  };
}

const MIXED_CHART = [
  row('cash', 'Cash at Bank', '1000', 'Cash And Bank < ASSET'),
  row('payables', 'Trade Payables', '2000', 'Short-term Liabilities < LIABILITY'),
  row('retained', 'Retained Earnings', '3000', 'Retained Earnings < RETAINED_EARNINGS < EQUITY'),
  row('shares', 'Ordinary Shares', '3100', 'Share Capital < SHARES'),
  row('dividends', 'Interim Dividend', '3200', 'Dividends Paid < DIVIDENDS'),
  row('interest', 'Interest Earned', '4100', 'Revenue < INCOME < RETAINED_EARNINGS < EQUITY'),
  row('charges', 'Bank Charges', '5100', 'Operating Costs < EXPENSE < RETAINED_EARNINGS < EQUITY'),
  row('suspense', 'Suspense Account', '9000'),
];

async function signIn(page: Page) {
  await page.addInitScript(() => {
    const mockUser = {
      username: 'admin',
      email: 'admin@soupfinance.com',
      roles: ['ROLE_ADMIN', 'ROLE_USER'],
      tenantId: 'account-001',
    };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({ state: { user: mockUser, isAuthenticated: true }, version: 0 })
    );
  });
}

async function mockAccounts(page: Page, accounts: unknown[]) {
  // Registered after mockAmbientApi, so this wins (routes are LIFO).
  await page.route('**/rest/ledgerAccount/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accounts) })
  );
}

/** Dashboard first, then the sidebar's Ledger link, as a user would. */
async function openChartOfAccounts(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
  await page
    .locator('aside')
    .filter({ has: page.getByRole('link', { name: 'Dashboard', exact: true }) })
    .getByRole('link', { name: 'Ledger', exact: true })
    .click();
  await expect(page).toHaveURL(/\/ledger\/accounts$/);
  await expect(page.getByTestId('coa-heading')).toHaveText('Chart of Accounts');
}

test.describe('SOUPFIN-148: Chart of Accounts never renders blank', () => {
  test.skip(isLxcMode(), 'Mock-only spec: feeds backend-shaped category strings the LXC seed may not have');

  let guard: UnmockedApiGuard;
  let warnings: string[];

  test.beforeEach(async ({ page }) => {
    guard = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await signIn(page);
    warnings = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
  });

  test.afterEach(() => guard.assertNone('SOUPFIN-148'));

  test('mixed chart: SHARES/DIVIDENDS in Equity, nested income and expense in their own sections, leftovers Uncategorised', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockAccounts(page, MIXED_CHART);
    await openChartOfAccounts(page);

    const equity = page.getByTestId('coa-group-equity');
    await expect(equity).toBeVisible();
    await expect(equity.getByText('3 accounts')).toBeVisible();
    for (const id of ['retained', 'shares', 'dividends']) {
      await expect(equity.getByTestId(`coa-account-${id}`)).toBeVisible();
    }

    await expect(page.getByTestId('coa-group-income').getByTestId('coa-account-interest')).toBeVisible();
    await expect(page.getByTestId('coa-group-expense').getByTestId('coa-account-charges')).toBeVisible();
    await expect(page.getByTestId('coa-group-asset').getByTestId('coa-account-cash')).toBeVisible();
    await expect(page.getByTestId('coa-group-liability').getByTestId('coa-account-payables')).toBeVisible();

    const uncategorised = page.getByTestId('coa-group-uncategorised');
    await expect(uncategorised.getByRole('heading', { name: 'Uncategorised' })).toBeVisible();
    await expect(uncategorised.getByText('1 account', { exact: true })).toBeVisible();
    await expect(uncategorised.getByTestId('coa-account-suspense')).toContainText('Suspense Account');
    // Uncategorised comes last, after the known groups.
    await expect(page.getByTestId('coa-groups').locator(':scope > div').last()).toHaveAttribute(
      'data-testid',
      'coa-group-uncategorised'
    );
    // Every account the backend returned is on the page.
    await expect(page.locator('[data-testid^="coa-account-"]')).toHaveCount(MIXED_CHART.length);
    await shot(page, 'coa-mixed-chart');

    expect(warnings.some((w) => w.includes('unknown ledger account categories') && w.includes('(no category)'))).toBe(true);
  });

  test('chart where no account maps to a known group still lists every row', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const rows = [
      row('n1', 'Opening Balances', '9100'),
      row('n2', 'Clearing Account', '9200'),
      row('n3', 'Legacy Import', '9300', 'Odd Category < SOMETHING_NEW'),
    ];
    await mockAccounts(page, rows);
    await openChartOfAccounts(page);

    const uncategorised = page.getByTestId('coa-group-uncategorised');
    await expect(uncategorised).toBeVisible();
    await expect(uncategorised.getByText('3 accounts')).toBeVisible();
    await expect(page.getByTestId('coa-table-uncategorised').locator('tbody tr')).toHaveCount(3);
    await expect(page.getByTestId('coa-empty')).toHaveCount(0);
    await shot(page, 'coa-all-uncategorised');

    // Collapsing the section works like any other group.
    await page.getByTestId('coa-group-toggle-uncategorised').click();
    await expect(page.getByTestId('coa-table-uncategorised')).toHaveCount(0);
    await shot(page, 'coa-uncategorised-collapsed');
  });
});
