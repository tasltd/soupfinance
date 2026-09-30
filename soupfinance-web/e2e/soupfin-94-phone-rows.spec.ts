/**
 * SOUPFIN-94 — rows and the notifications panel still clipped on small phones.
 *
 * SOUPFIN-91 stopped any signed-in page from being scrolled sideways: the
 * content column is `min-w-0` and <main> is `overflow-x-hidden`. The side effect
 * is that a row too wide for the phone no longer widens the page. It is cut off
 * at <main>'s right edge, with no way to scroll to it. The document is still
 * exactly as wide as the screen, so SOUPFIN-91's page-level check cannot see it.
 *
 * Measured in Firefox before this fix (overflow past <main>'s right edge):
 *
 * | Where                                    | 320px | 360px |
 * |------------------------------------------|-------|-------|
 * | Balance Sheet: As Of Date + Refresh row  | 69px  | 29px  |
 * | Aging: As of + Today row                 | 40px  | 0     |
 * | Scheduled: New Schedule button           | 15px  | 0     |
 * | Scheduled: status filter chips           | 17px  | 0     |
 * | Scheduled: a schedule in the list        | 254px | 214px |
 * | Cash Flow: PDF / Excel / CSV row         | 1px   | 0     |
 * | Balance Sheet, P&L: PDF / Excel / CSV    | into the right margin, 1px from the edge |
 * | New Invoice: New Client button           | 10px  | 0     |
 * | Notifications panel, off the LEFT edge   | 68px  | 28px  |
 * | Transaction Register, the whole page     | 554px | 514px |
 *
 * The ticket named five of these. The schedule list row was not visible to it
 * because it was measured with no schedules; with one schedule it is the worst
 * row on the list. Cash Flow's export row is the same no-wrap pattern, and so
 * are Balance Sheet's and P&L's, which stop 1px short of clipping. The
 * Transaction Register turned up when SOUPFIN-91's page sweep got the same
 * <main> check: its content column is a flex item without `min-w-0`, so its
 * table stretched it to 858px (370px cut off at 768px; at 1280px the filters
 * panel lost 179px).
 *
 * Every row now wraps; the notifications panel is positioned against the header
 * below `sm` and spans it with a 1rem margin each side; the register's column
 * may shrink and its table scrolls inside its card.
 *
 * Two checks per page, because each misses what the other sees:
 * - `<main>`'s scrollWidth fits its clientWidth: nothing is cut off at all.
 * - each named control sits inside the page's padding, not merely on screen.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  installUnmockedApiGuard,
  mockAmbientApi,
  mockTokenValidationApi,
  mockDashboardApi,
  mockInvoicesApi,
  isLxcMode,
  type UnmockedApiGuard,
} from './fixtures';

/** Viewport captures, git-tracked: `test-results/` is wiped on every run. */
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/playwright/screenshots/soupfin-94/${name}.png` });
}

/** Nothing inside <main> is cut off at its right edge. */
async function expectMainNotClipped(page: Page, where: string) {
  const m = await page.locator('main').evaluate((el) => ({
    content: el.scrollWidth,
    box: el.clientWidth,
  }));
  expect(
    m.content,
    `${where}: <main> holds ${m.content}px of content in ${m.box}px, so ${m.content - m.box}px is cut off`
  ).toBeLessThanOrEqual(m.box);
  // SOUPFIN-91's guard still holds: the page itself cannot be scrolled sideways.
  const doc = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    box: document.documentElement.clientWidth,
  }));
  expect(doc.content, `${where}: the page is wider than the screen`).toBe(doc.box);
}

/**
 * The element sits inside the page content box: <main>'s padded wrapper. On a
 * phone that is 16px in from each screen edge.
 */
async function expectInsidePage(page: Page, locator: Locator, name: string) {
  const edges = await page.locator('main > div').first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      left: r.left + parseFloat(s.paddingLeft),
      right: r.right - parseFloat(s.paddingRight),
    };
  });
  const box = await locator.boundingBox();
  expect(box, `${name} is not rendered`).not.toBeNull();
  expect(box!.x, `${name} starts left of the page margin`).toBeGreaterThanOrEqual(edges.left - 0.5);
  const right = box!.x + box!.width;
  expect(right, `${name} ends at ${Math.round(right)}px, past the page edge at ${edges.right}px`)
    .toBeLessThanOrEqual(edges.right + 0.5);
}

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

/**
 * The notifications panel, found from the bell rather than by test id so the
 * same check measures any version of the top bar.
 */
function notificationsPanel(page: Page) {
  return page.getByRole('button', { name: 'Notifications' }).locator('xpath=following-sibling::div[1]');
}

/** Open the app at its root, the way a user types app.soupfinance.com. */
async function openApp(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
}

const OVERLAY = 'div.fixed.inset-0.bg-black\\/50';

/** The app sidebar, not the Transaction Register's filter <aside>. */
function sidebar(page: Page) {
  return page
    .locator('aside')
    .filter({ has: page.getByRole('link', { name: 'Dashboard', exact: true }) });
}

/** Reach a page from the sidebar. Below 768px the sidebar is a drawer. */
async function navigateTo(page: Page, width: number, link: string) {
  if (width < 768) {
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(sidebar(page)).toBeInViewport({ ratio: 1 });
  }
  await sidebar(page).getByRole('link', { name: link, exact: true }).click();
  if (width < 768) {
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    await expect(sidebar(page)).not.toBeInViewport();
  }
}

/** Sidebar > Reports, then the report's card on the Reports page. */
async function openReport(page: Page, width: number, card: RegExp, url: RegExp) {
  await navigateTo(page, width, 'Reports');
  await expect(page).toHaveURL(/\/reports$/);
  await page.getByTestId('reports-page').getByRole('link', { name: card }).click();
  await expect(page).toHaveURL(url);
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const balanceSheet = {
  ledgerAccountList: [
    { id: 'asset-1', name: 'Cash', currency: 'USD', startingBalance: 0, calculatedBalance: 75000, ledgerGroup: 'ASSET' },
    { id: 'asset-2', name: 'Accounts Receivable', currency: 'USD', startingBalance: 0, calculatedBalance: 25000, ledgerGroup: 'ASSET' },
    { id: 'liab-1', name: 'Accounts Payable', currency: 'USD', startingBalance: 0, calculatedBalance: -20000, ledgerGroup: 'LIABILITY' },
    { id: 'eq-1', name: 'Common Stock', currency: 'USD', startingBalance: 0, calculatedBalance: 50000, ledgerGroup: 'EQUITY' },
    { id: 'eq-2', name: 'Retained Earnings', currency: 'USD', startingBalance: 0, calculatedBalance: 30000, ledgerGroup: 'EQUITY' },
  ],
};

const agedReceivables = {
  agedReceivablesList: [
    { name: 'Acme Corp', notYetOverdue: 5000, thirtyOrLess: 2000, thirtyOneToSixty: 1000, sixtyOneToNinety: 500, ninetyOneOrMore: 200, totalUnpaid: 8700 },
    { name: 'TechStart Inc', notYetOverdue: 3000, thirtyOrLess: 1500, thirtyOneToSixty: 0, sixtyOneToNinety: 0, ninetyOneOrMore: 0, totalUnpaid: 4500 },
  ],
};

const agedPayables = {
  agedPayablesList: [
    { name: 'Office Supplies Co', notYetOverdue: 1500, thirtyOrLess: 500, thirtyOneToSixty: 0, sixtyOneToNinety: 0, ninetyOneOrMore: 0, totalUnpaid: 2000 },
  ],
};

const incomeStatement = {
  ledgerAccountList: [
    { id: 'rev-1', name: 'Service Revenue', currency: 'USD', calculatedBalance: -45000, ledgerGroup: 'REVENUE' },
    { id: 'exp-1', name: 'Salaries and Wages', currency: 'USD', calculatedBalance: 25000, ledgerGroup: 'EXPENSE' },
  ],
};

const accountTransactions = [
  { id: 'tx-1', transactionDate: '2026-09-15', description: 'Customer Payment', debitAmount: 5000, creditAmount: 0, balance: 5000, ledgerAccountId: 'acc-1', ledgerAccountName: 'Cash', reference: 'INV-001' },
  { id: 'tx-2', transactionDate: '2026-09-16', description: 'Vendor Payment', debitAmount: 0, creditAmount: 2000, balance: 3000, ledgerAccountId: 'acc-1', ledgerAccountName: 'Cash', reference: 'BILL-001' },
];

function schedule(overrides: Record<string, unknown>) {
  return {
    reportType: 'BALANCE_SHEET',
    frequency: 'MONTHLY',
    recipients: 'cfo@example.com',
    dateRangeType: 'LAST_MONTH',
    exportFormat: 'PDF',
    status: 'ACTIVE',
    dateCreated: '2026-08-01T00:00:00Z',
    lastUpdated: '2026-08-01T00:00:00Z',
    archived: false,
    ...overrides,
  };
}

const SCHEDULES = [
  schedule({
    id: 'sched-1',
    name: 'Monthly balance sheet',
    lastExecutionStatus: 'SUCCESS',
    nextExecutionAt: '2026-10-01T06:00:00Z',
    lastExecutedAt: '2026-09-01T06:00:00Z',
  }),
  // The long end: a name several lines long, every badge, and both run dates.
  schedule({
    id: 'sched-2',
    name: 'Quarterly consolidated income statement and cash flow pack for the board of directors and the audit committee',
    reportType: 'INCOME_STATEMENT',
    frequency: 'WEEKLY',
    dateRangeType: 'LAST_QUARTER',
    exportFormat: 'XLSX',
    status: 'PAUSED',
    lastExecutionStatus: 'FAILED',
    nextExecutionAt: '2026-10-05T06:00:00Z',
    lastExecutedAt: '2026-09-28T06:00:00Z',
  }),
];

test.describe('SOUPFIN-94: rows and the notifications panel fit small phones', () => {
  test.skip(isLxcMode(), 'Mock-only spec: measures layout, not backend data');

  let guard: UnmockedApiGuard;
  /** Every backend call the page made, as `path?query`. */
  let calls: string[];

  test.beforeEach(async ({ page }) => {
    // Guard FIRST: routes are LIFO, so it only sees what no mock below claims.
    guard = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockInvoicesApi(page);
    await page.route('**/rest/financeReports/balanceSheet*', (r) => r.fulfill(json(balanceSheet)));
    await page.route('**/rest/financeReports/agedReceivables*', (r) => r.fulfill(json(agedReceivables)));
    await page.route('**/rest/financeReports/agedPayables*', (r) => r.fulfill(json(agedPayables)));
    await page.route('**/rest/financeReports/incomeStatement*', (r) => r.fulfill(json(incomeStatement)));
    await page.route('**/rest/financeReports/accountTransactions*', (r) =>
      r.fulfill(json(accountTransactions))
    );
    await page.route('**/rest/reportSchedule/index.json*', (r) => {
      // Honour the status filter, so tapping a chip visibly changes the list.
      const status = new URL(r.request().url()).searchParams.get('status');
      r.fulfill(json(status ? SCHEDULES.filter((s) => s.status === status) : SCHEDULES));
    });
    await page.route('**/rest/invoiceItem/index.json*', (r) => r.fulfill(json([])));
    // The Transaction Register's two lists. Empty is enough: its table header
    // alone is 808px wide.
    for (const list of ['**/rest/ledgerTransactionGroup/index.json*', '**/rest/voucher/index.json*']) {
      await page.route(list, (r) => r.fulfill(json([])));
    }

    calls = [];
    page.on('request', (req) => {
      const { pathname, search } = new URL(req.url());
      if (pathname.startsWith('/rest/')) calls.push(pathname + search);
    });
  });

  test.afterEach(() => guard.assertNone('SOUPFIN-94'));

  const count = (fragment: string) => calls.filter((c) => c.includes(fragment)).length;

  for (const width of [320, 360]) {
    test(`report rows fit a ${width}px screen, reached from the menu`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await signIn(page);
      await openApp(page);

      await test.step('Balance Sheet', async () => {
        await openReport(page, width, /Balance Sheet/, /\/reports\/balance-sheet$/);
        await expect(page.getByTestId('balance-sheet-total-assets')).toBeVisible({ timeout: 15000 });

        await expectMainNotClipped(page, `${width}px balance sheet`);
        await expectInsidePage(page, page.getByTestId('balance-sheet-date-row'), 'As Of Date row');
        await expectInsidePage(page, page.getByTestId('balance-sheet-date-picker'), 'date field');
        await expectInsidePage(page, page.getByTestId('balance-sheet-refresh'), 'Refresh');
        await expectInsidePage(page, page.getByTestId('balance-sheet-export-row'), 'export row');
        await expectInsidePage(page, page.getByTestId('balance-sheet-export-csv'), 'CSV');
        await shot(page, `${width}-balance-sheet`);

        // The wrapped Refresh button still reloads the report.
        const before = count('/financeReports/balanceSheet');
        await page.getByTestId('balance-sheet-refresh').click();
        await expect.poll(() => count('/financeReports/balanceSheet')).toBeGreaterThan(before);
      });

      await test.step('Profit & Loss', async () => {
        await openReport(page, width, /Profit & Loss/, /\/reports\/pnl$/);
        await expect(page.getByTestId('profit-loss-total-income')).toBeVisible({ timeout: 15000 });

        await expectMainNotClipped(page, `${width}px profit and loss`);
        await expectInsidePage(page, page.getByTestId('profit-loss-export-row'), 'export row');
        await expectInsidePage(page, page.getByTestId('profit-loss-export-csv'), 'CSV');
        await shot(page, `${width}-profit-loss`);
      });

      await test.step('Aging Reports', async () => {
        await openReport(page, width, /Aging Reports/, /\/reports\/aging$/);
        await expect(page.getByTestId('ar-aging-row-0')).toBeVisible({ timeout: 15000 });

        await expectMainNotClipped(page, `${width}px aging`);
        await expectInsidePage(page, page.getByTestId('aging-reports-date-row'), 'As of row');
        await expectInsidePage(page, page.getByTestId('aging-reports-reset-date'), 'Today');
        await shot(page, `${width}-aging`);

        // The date is already today, so Today refetches both reports.
        const before = count('/financeReports/agedReceivables');
        await page.getByTestId('aging-reports-reset-date').click();
        await expect.poll(() => count('/financeReports/agedReceivables')).toBeGreaterThan(before);
      });

      await test.step('Cash Flow', async () => {
        await openReport(page, width, /Cash Flow/, /\/reports\/cash-flow$/);
        await expect(page.getByTestId('cash-flow-sections')).toBeVisible({ timeout: 15000 });

        await expectMainNotClipped(page, `${width}px cash flow`);
        await expectInsidePage(page, page.getByTestId('cash-flow-export-row'), 'export row');
        await expectInsidePage(page, page.getByTestId('cash-flow-export-csv'), 'CSV');
        await shot(page, `${width}-cash-flow`);
      });

      await test.step('Scheduled Reports', async () => {
        await openReport(page, width, /Scheduled Reports/, /\/reports\/scheduled$/);
        const longRow = page.getByTestId('scheduled-report-row-sched-2');
        await expect(longRow).toBeVisible({ timeout: 15000 });

        await expectMainNotClipped(page, `${width}px scheduled reports`);
        await expectInsidePage(page, page.getByTestId('scheduled-reports-new-button'), 'New Schedule');
        const chips = page.getByTestId('scheduled-reports-status-filter').getByRole('button');
        await expect(chips).toHaveCount(4);
        for (const label of ['All', 'ACTIVE', 'PAUSED', 'CANCELLED']) {
          await expectInsidePage(page, chips.filter({ hasText: new RegExp(`^${label}$`) }), `${label} chip`);
        }
        for (const id of ['sched-1', 'sched-2']) {
          await expectInsidePage(page, page.getByTestId(`scheduled-report-row-${id}`), `schedule ${id}`);
          await expectInsidePage(page, page.getByTestId(`scheduled-report-actions-${id}`), `${id} actions`);
        }
        await shot(page, `${width}-scheduled-reports`);

        // The wrapped PAUSED chip still filters the list.
        await chips.filter({ hasText: /^PAUSED$/ }).click();
        await expect.poll(() => count('status=PAUSED')).toBeGreaterThan(0);
        await expect(page.getByTestId('scheduled-report-row-sched-1')).toHaveCount(0);
        await expect(longRow).toBeVisible();
        await expectMainNotClipped(page, `${width}px scheduled reports, PAUSED`);
      });
    });

    test(`New Client fits a ${width}px screen on New Invoice`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await signIn(page);
      await openApp(page);

      await navigateTo(page, width, 'Invoices');
      await expect(page).toHaveURL(/\/invoices$/);
      await page.getByTestId('invoice-new-button').click();
      await expect(page).toHaveURL(/\/invoices\/new$/);
      const button = page.getByTestId('invoice-new-client-button');
      await expect(button).toBeVisible({ timeout: 15000 });

      await expectMainNotClipped(page, `${width}px new invoice`);
      await expectInsidePage(page, page.getByTestId('invoice-client-row'), 'client row');
      await expectInsidePage(page, page.getByTestId('invoice-client-select'), 'client select');
      await expectInsidePage(page, button, 'New Client');
      await shot(page, `${width}-new-invoice-client`);

      // The wrapped button still opens the quick-add form.
      await button.click();
      await expect(page.getByTestId('invoice-new-client-form')).toBeVisible();
      await expectMainNotClipped(page, `${width}px new invoice, quick-add open`);
      await expectInsidePage(page, button, 'Cancel');
    });

    test(`the notifications panel stays on a ${width}px screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await signIn(page);
      await openApp(page);

      const bell = page.getByRole('button', { name: 'Notifications' });
      await bell.click();
      await expect(bell).toHaveAttribute('aria-expanded', 'true');
      const panel = notificationsPanel(page);
      await expect(panel).toBeVisible();

      const box = (await panel.boundingBox())!;
      expect(box.x, 'the panel starts off the left edge').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'the panel ends past the right edge').toBeLessThanOrEqual(width);
      // A 1rem margin each side, like the page content.
      expect(box.x).toBeCloseTo(16, 0);
      expect(width - (box.x + box.width)).toBeCloseTo(16, 0);
      // It opens under the bell, not over it.
      const bellBox = (await bell.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(bellBox.y + bellBox.height);
      // Its text fits inside it.
      const fits = await panel.evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(fits, 'the panel text is wider than the panel').toBe(true);
      // The unread dot is still on the bell.
      const dot = (await bell.locator('span').last().boundingBox())!;
      expect(dot.x).toBeGreaterThanOrEqual(bellBox.x);
      expect(dot.x + dot.width).toBeLessThanOrEqual(bellBox.x + bellBox.width);
      expect(dot.y).toBeGreaterThanOrEqual(bellBox.y);
      await shot(page, `${width}-notifications-open`);

      await bell.click();
      await expect(panel).toHaveCount(0);
    });
  }

  for (const width of [320, 360]) {
    test(`the Transaction Register fits a ${width}px screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await signIn(page);
      await openApp(page);

      await navigateTo(page, width, 'Accounting');
      await expect(page).toHaveURL(/\/accounting\/transactions$/);
      const table = page.getByTestId('transaction-table');
      await expect(table).toBeVisible({ timeout: 15000 });

      await expectMainNotClipped(page, `${width}px transaction register`);
      for (const id of [
        'transaction-register-heading',
        'new-journal-entry-button',
        'new-payment-button',
        'new-receipt-button',
        'export-button',
        'transaction-table-scroller',
      ]) {
        await expectInsidePage(page, page.getByTestId(id), id);
      }
      await expectInsidePage(page, page.getByPlaceholder(/Search by Transaction ID/), 'search');
      await shot(page, `${width}-transaction-register`);

      // The table is wider than the phone. It scrolls inside its card, and
      // scrolling the card brings its last column into the page.
      const scroller = page.getByTestId('transaction-table-scroller');
      await scroller.scrollIntoViewIfNeeded();
      const scroll = await scroller.evaluate((el) => ({ content: el.scrollWidth, box: el.clientWidth }));
      expect(scroll.content, 'the table fits its card, so nothing proves it scrolls')
        .toBeGreaterThan(scroll.box);
      await shot(page, `${width}-transaction-register-table-before-scroll`);
      await scroller.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      await expectInsidePage(page, table.getByRole('columnheader').last(), 'last column after scrolling');
      await expectMainNotClipped(page, `${width}px transaction register after scrolling the table`);
      await shot(page, `${width}-transaction-register-table-after-scroll`);
    });
  }

  test('on a 1280px desktop the register\'s filters panel is not cut off', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await openApp(page);

    await navigateTo(page, 1280, 'Accounting');
    await expect(page).toHaveURL(/\/accounting\/transactions$/);
    const panel = page.getByTestId('advanced-filters-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    await expectMainNotClipped(page, '1280px transaction register');
    await expectInsidePage(page, panel, 'Advanced Filters panel');
    // Full w-96, not squeezed by the table (it was 297px).
    expect((await panel.boundingBox())!.width).toBeCloseTo(384, 0);
    await expectInsidePage(page, page.getByTestId('transaction-table-scroller'), 'table card');
    await shot(page, '1280-transaction-register');
  });

  test('on a desktop the notifications panel still drops from the bell', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await openApp(page);

    const bell = page.getByRole('button', { name: 'Notifications' });
    await bell.click();
    const panel = notificationsPanel(page);
    await expect(panel).toBeVisible();

    const box = (await panel.boundingBox())!;
    const bellBox = (await bell.boundingBox())!;
    // 320px wide (w-80), right-aligned with the bell, as before this fix.
    expect(box.width).toBeCloseTo(320, 0);
    expect(box.x + box.width).toBeCloseTo(bellBox.x + bellBox.width, 0);
    expect(box.y).toBeGreaterThanOrEqual(bellBox.y + bellBox.height);
    // The top-right corner: the bell and the whole panel under it.
    await page.screenshot({
      path: 'e2e/playwright/screenshots/soupfin-94/1280-notifications-open.png',
      clip: { x: 640, y: 0, width: 640, height: 240 },
    });
  });

  /**
   * The long end of the client row. Chromium sizes a <select> flex item to its
   * widest option unless it has `min-width: 0`: measured 2026-09-30 in Chromium
   * without `min-w-0`, this name made <main> 1029px in a 320px screen. Firefox
   * does not, so in this Firefox-only suite the geometry passes either way. The
   * computed min-width check is what fails here if `min-w-0` is removed.
   */
  test('a very long client name cannot widen the client row at 320px', async ({ page }) => {
    const longName =
      'The International Federation of Chartered Accountants and Allied Financial Professionals of West Africa (Ghana Chapter) Limited';
    await page.setViewportSize({ width: 320, height: 780 });
    await signIn(page);
    // Registered after mockAmbientApi's empty list, so it wins.
    await page.route('**/rest/client/index.json*', (r) =>
      r.fulfill(json([{ id: 'client-long', name: longName, clientType: 'CORPORATE' }]))
    );
    await openApp(page);

    await navigateTo(page, 320, 'Invoices');
    await page.getByTestId('invoice-new-button').click();
    await expect(page).toHaveURL(/\/invoices\/new$/);
    const select = page.getByTestId('invoice-client-select');
    await expect(select.locator('option', { hasText: longName })).toHaveCount(1, { timeout: 15000 });

    await expect(select).toHaveCSS('min-width', '0px');
    await expectMainNotClipped(page, '320px new invoice, long client name');
    await expectInsidePage(page, select, 'client select');
    await expectInsidePage(page, page.getByTestId('invoice-new-client-button'), 'New Client');
    await shot(page, '320-new-invoice-long-client-name');
  });
});
