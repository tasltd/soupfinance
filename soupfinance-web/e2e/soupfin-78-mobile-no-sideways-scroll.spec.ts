/**
 * SOUPFIN-78 — Pages scroll sideways on a phone: main column does not shrink
 *
 * At a 390px viewport /dashboard was 514px wide and /invoices 734px. The main
 * content column in MainLayout is a flex item with the default
 * `min-width: auto`, so it grew to fit its widest child (the invoice table)
 * and dragged the TopNav and the whole page with it. The tables already sat in
 * `overflow-x-auto` wrappers, but those never engaged because the column around
 * them was never narrower than the table.
 *
 * The fix adds `min-w-0` to that column (and to the Transaction Register's own
 * inner column, which had the same flaw). Once the column can shrink, any wide
 * content WITHOUT a scroll wrapper would be clipped instead of scrolled, so the
 * Chart of Accounts and Transaction Register tables got `overflow-x-auto` and
 * the onboarding step row got `flex-wrap`.
 *
 * Each test therefore proves two things, not one:
 *   1. the page itself does not scroll sideways, and
 *   2. the wide table's right-hand columns are still reachable by scrolling
 *      the table's own wrapper — a fix that simply clipped them would pass (1).
 *
 * Every page is reached by tapping the mobile menu, never by `goto`.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  mockAmbientApi,
  mockTokenValidationApi,
  mockDashboardApi,
  mockInvoicesApi,
  mockCorporate,
  installUnmockedApiGuard,
  isLxcMode,
  mockInvoices,
  type UnmockedApiGuard,
} from './fixtures';

const PHONE = { width: 390, height: 844 };

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture, which writes under the wiped `test-results/`.
 */
async function shot(page: Page, name: string, fullPage = true) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-78/${name}.png`,
    fullPage,
  });
}

/**
 * The SideNav drawer. `.first()` because the Transaction Register renders a
 * second <aside> (its filter panel) after the nav.
 */
const drawer = (page: Page) => page.locator('aside').first();

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

/** Ledger accounts across every group, with names long enough to widen the table. */
const ledgerAccounts = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].flatMap((group) =>
  [1, 2].map((i) => ({
    id: `la-${group}-${i}`,
    name: `${group} account number ${i} with a long descriptive name`,
    number: `${group.charCodeAt(0)}0${i}`,
    ledgerGroup: group,
    currency: 'GHS',
    balance: 1234567.89,
    cachedBalance: 1234567.89,
    class: 'soupbroker.finance.LedgerAccount',
  }))
);

const transactionGroups = [
  {
    id: 'group-001',
    groupDate: '2024-10-20',
    reference: 'JE-2024-001',
    description: 'Monthly rent payment for the head office',
    status: 'POSTED',
    ledgerTransactionList: [
      {
        id: 'tx-001-1',
        transactionDate: '2024-10-20',
        description: 'Rent expense',
        ledgerAccount: { id: 'acc-rent', code: '5002', name: 'Rent Expense' },
        amount: 2500,
        transactionState: 'DEBIT',
      },
      {
        id: 'tx-001-2',
        transactionDate: '2024-10-20',
        description: 'Cash payment',
        ledgerAccount: { id: 'acc-cash', code: '1001', name: 'Cash' },
        amount: 2500,
        transactionState: 'CREDIT',
      },
    ],
  },
];

const vouchers = [
  {
    id: 'voucher-001',
    voucherNumber: 'PMT-2024-001',
    voucherDate: '2024-10-21',
    voucherType: 'PAYMENT',
    description: 'Office supplies payment',
    amount: 450,
    status: 'DRAFT',
    cashAccount: { id: 'acc-cash', code: '1001', name: 'Cash' },
    expenseAccount: { id: 'acc-expense', code: '5001', name: 'Office Expenses' },
  },
];

/** 60 invoices with client names 10x a normal length and seven-figure totals. */
const oversizedInvoices = Array.from({ length: 60 }, (_, i) => ({
  ...mockInvoices[i % mockInvoices.length],
  id: `inv-big-${i}`,
  number: 1000000 + i,
  accountServices: {
    id: `as-big-${i}`,
    serialised: `Consolidated Holdings International Limited Group ${i} `.repeat(10).trim(),
    class: 'soupbroker.AccountServices',
  },
  invoiceItemList: [
    { id: `ii-big-${i}`, quantity: 1000, unitPrice: 9999.99, description: 'Annual retainer' },
  ],
  invoicePaymentList: [],
}));

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The page is exactly as wide as the viewport: nothing to scroll sideways. */
async function expectNoSidewaysScroll(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const d = document.documentElement;
        return d.scrollWidth - d.clientWidth;
      })
    )
    .toBeLessThanOrEqual(0);

  // The column and the TopNav inside it — the two widest elements in the
  // report — must both fit the screen.
  const viewportWidth = page.viewportSize()!.width;
  for (const el of [page.locator('main'), page.locator('header').first()]) {
    const box = (await el.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + 0.5);
  }
}

/**
 * The table is wider than the screen, the overflow is contained by its own
 * `overflow-x-auto` wrapper, and scrolling that wrapper brings the last column
 * into view. Proves the right-hand columns are reachable, not clipped.
 */
async function expectTableScrollsInsideItsWrapper(
  page: Page,
  table: Locator,
  name: string,
  fullPage = true
) {
  await expect(table).toBeVisible();
  const wrapperOverflow = await table.evaluate((t) => {
    let el = t.parentElement;
    while (el && getComputedStyle(el).overflowX !== 'auto') el = el.parentElement;
    if (!el) return null;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  // A scroll wrapper exists, and it is the thing that overflows — not the page.
  expect(wrapperOverflow, 'table has no overflow-x-auto wrapper').not.toBeNull();
  expect(wrapperOverflow!.scrollWidth).toBeGreaterThan(wrapperOverflow!.clientWidth);

  const firstHeader = table.locator('thead th').first();
  const lastHeader = table.locator('thead th').last();
  // Bring the table up into view vertically; the wrapper stays scrolled left.
  await firstHeader.scrollIntoViewIfNeeded();
  await expect(firstHeader).toBeInViewport({ ratio: 0.95 });
  // Before scrolling, the last column is off to the right.
  await expect(lastHeader).not.toBeInViewport({ ratio: 0.95 });
  await shot(page, `${name}-table-scrolled-left`, fullPage);

  await table.evaluate((t) => {
    let el = t.parentElement;
    while (el && getComputedStyle(el).overflowX !== 'auto') el = el.parentElement;
    el!.scrollLeft = el!.scrollWidth;
  });
  // 0.95, not 1: the wrapper's 1px border can shave a subpixel off the cell.
  await expect(lastHeader).toBeInViewport({ ratio: 0.95 });
  await expect(firstHeader).not.toBeInViewport({ ratio: 0.95 });
  await shot(page, `${name}-table-scrolled-right`, fullPage);

  // Scrolling the table did not scroll the page.
  await expectNoSidewaysScroll(page);
}

/** Open the mobile drawer and tap a top-level nav link. */
async function tapNav(page: Page, label: string) {
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await expect(drawer(page)).toBeInViewport({ ratio: 1 });
  await page.getByRole('link', { name: label, exact: true }).click();
  // SOUPFIN-76: the drawer closes on navigation; wait for it to slide away so
  // it is not in the measurements or screenshots.
  await expect(drawer(page)).not.toBeInViewport();
}

async function openDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dashboard-kpi-cards')).toBeVisible({ timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('SOUPFIN-78: pages fit a phone screen without sideways scroll', () => {
  test.skip(isLxcMode(), 'Mock-only spec: measures layout against seeded data');

  let guard: UnmockedApiGuard;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
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
    // The guard must go first: later-registered routes win.
    guard = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockInvoicesApi(page);
    await page.route('**/rest/ledgerAccount/index.json*', (r) => r.fulfill(json(ledgerAccounts)));
    await page.route('**/rest/ledgerTransactionGroup/index.json*', (r) =>
      r.fulfill(json(transactionGroups))
    );
    await page.route('**/rest/voucher/index.json*', (r) => r.fulfill(json(vouchers)));
  });

  test.afterEach(() => guard.assertNone());

  test('dashboard fits the screen and its invoice table scrolls on its own', async ({ page }) => {
    await openDashboard(page);
    await expectNoSidewaysScroll(page);
    // The TopNav's right-hand group (theme, language, notifications, avatar)
    // is on screen, not pushed past the edge.
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeInViewport({ ratio: 1 });
    await shot(page, '01-dashboard');

    await expectTableScrollsInsideItsWrapper(
      page,
      page.getByTestId('dashboard-invoices-table'),
      '02-dashboard'
    );
  });

  test('invoice list fits the screen and its table scrolls on its own', async ({ page }) => {
    await openDashboard(page);
    await tapNav(page, 'Invoices');
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(page.getByTestId('invoice-list-table')).toBeVisible({ timeout: 15000 });

    await expectNoSidewaysScroll(page);
    // The "New Invoice" action is on screen, not off to the right.
    await expect(page.getByTestId('invoice-list-heading')).toBeInViewport();
    await shot(page, '03-invoices');

    await expectTableScrollsInsideItsWrapper(page, page.getByTestId('invoice-list-table'), '04-invoices');
  });

  test('chart of accounts fits the screen and its Balance column is reachable', async ({ page }) => {
    await openDashboard(page);
    await tapNav(page, 'Ledger');
    await expect(page).toHaveURL(/\/ledger\/accounts$/);
    const assetTable = page.getByTestId('coa-table-asset');
    await expect(assetTable).toBeVisible({ timeout: 15000 });

    await expectNoSidewaysScroll(page);
    await shot(page, '05-chart-of-accounts');

    // Before the fix this table had no scroll wrapper: with the column now
    // able to shrink, its right-hand columns would have been cut off.
    await expectTableScrollsInsideItsWrapper(page, assetTable, '06-chart-of-accounts');
  });

  test('transaction register fits the screen and its table is reachable', async ({ page }) => {
    await openDashboard(page);
    await tapNav(page, 'Accounting');
    await expect(page).toHaveURL(/\/accounting\/transactions$/);
    const table = page.getByTestId('transaction-table');
    await expect(table).toBeVisible({ timeout: 15000 });

    // This page had its own flex column with the same min-width:auto flaw,
    // and its table sat in `overflow-hidden`, which would clip, not scroll.
    await expectNoSidewaysScroll(page);
    await expect(page.getByTestId('new-journal-entry-button')).toBeInViewport({ ratio: 1 });
    await shot(page, '07-transaction-register');

    await expectTableScrollsInsideItsWrapper(page, table, '08-transaction-register');
  });

  test('onboarding step row wraps instead of running off the screen', async ({ page }) => {
    // Reach step 1 the way a user does: the KYC banner on the dashboard.
    await page.route('**/rest/corporate/index.json*', (r) =>
      r.fulfill(json([{ ...mockCorporate, id: 'corp-001', kycStatus: 'PENDING' }]))
    );
    await page.route('**/rest/corporate/show/*', (r) =>
      r.fulfill(json({ ...mockCorporate, id: 'corp-001', kycStatus: 'PENDING' }))
    );
    await openDashboard(page);
    await page.getByTestId('kyc-onboarding-banner-cta').click();
    await expect(page.getByTestId('company-info-page')).toBeVisible({ timeout: 15000 });

    await expectNoSidewaysScroll(page);
    const steps = page.getByTestId('onboarding-progress-steps');
    // Every step label is fully on screen, including the last one.
    for (const label of ['Registration', 'Company Info', 'Directors', 'Documents']) {
      await expect(steps.getByText(label, { exact: true })).toBeInViewport({ ratio: 1 });
    }
    // It fits because it wrapped onto a second line, not because it shrank text.
    const lastStep = (await steps.getByText('Documents', { exact: true }).boundingBox())!;
    const firstStep = (await steps.getByText('Registration', { exact: true }).boundingBox())!;
    expect(lastStep.y).toBeGreaterThan(firstStep.y);
    await shot(page, '09-onboarding-steps-wrapped');
  });

  test('zero rows: an empty invoice list fits the screen', async ({ page }) => {
    await mockInvoicesApi(page, []);
    await openDashboard(page);
    await tapNav(page, 'Invoices');
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(page.getByTestId('invoice-list-heading')).toBeVisible({ timeout: 15000 });

    await expectNoSidewaysScroll(page);
    await shot(page, '10-invoices-empty');
  });

  test('overflow: 60 invoices with 10x-long names on a 320px screen still fit', async ({ page }) => {
    // 320px is the narrowest phone in common use (iPhone SE 1st gen).
    await page.setViewportSize({ width: 320, height: 640 });
    await mockInvoicesApi(page, oversizedInvoices);
    await openDashboard(page);
    await expectNoSidewaysScroll(page);

    await tapNav(page, 'Invoices');
    await expect(page).toHaveURL(/\/invoices$/);
    const table = page.getByTestId('invoice-list-table');
    await expect(table).toBeVisible({ timeout: 15000 });
    await expect(table.locator('tbody tr')).not.toHaveCount(0);

    await expectNoSidewaysScroll(page);
    // Viewport-only: 60 tall rows exceed the 32767px full-page screenshot limit.
    await shot(page, '11-invoices-oversized-320', false);
    await expectTableScrollsInsideItsWrapper(page, table, '12-invoices-oversized-320', false);
  });
});

test.describe('SOUPFIN-78: desktop layout is unchanged', () => {
  test.skip(isLxcMode(), 'Mock-only spec: measures layout against seeded data');

  test('at 1280px the invoice table fits without any scrolling', async ({ page }) => {
    // Guards against min-w-0 over-shrinking the column: on a desktop there is
    // room for the whole table, so neither the page nor the table may scroll.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      const mockUser = { username: 'admin', email: 'admin@soupfinance.com', roles: ['ROLE_ADMIN'], tenantId: 'account-001' };
      localStorage.setItem('access_token', 'mock-jwt-token');
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { user: mockUser, isAuthenticated: true }, version: 0 })
      );
    });
    const guard = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockInvoicesApi(page);

    await openDashboard(page);
    // The sidebar is always visible at this width; no drawer to open.
    await page.getByRole('link', { name: 'Invoices', exact: true }).click();
    const table = page.getByTestId('invoice-list-table');
    await expect(table).toBeVisible({ timeout: 15000 });

    await expectNoSidewaysScroll(page);
    const wrapper = await table.evaluate((t) => {
      const el = t.parentElement!;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(wrapper.scrollWidth).toBeLessThanOrEqual(wrapper.clientWidth);
    await expect(table.locator('thead th').last()).toBeInViewport({ ratio: 1 });
    await shot(page, '13-invoices-desktop-1280');
    guard.assertNone();
  });
});
