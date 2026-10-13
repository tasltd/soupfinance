/**
 * SOUPFIN-171 — Bills list: pagination, search, status / vendor / date filters,
 * overdue highlighting, and the no-results state.
 *
 * Before: BillListPage asked for `max: 20` with no offset, so bill 21 onwards
 * could not be reached, and there was no way to search or filter.
 *
 * The /rest/bill/index.json mock below behaves like BOTH real backends (checked
 * 2026-10-13 against Grails `Bill.searchList` and the Go gateway's
 * `BillHandler.Index`):
 *   - honours max / offset;
 *   - `search` is an OR over whitespace tokens, each a case-insensitive LIKE on
 *     `id` and on `serialised` = "Bill(<vendor>, <prefix>, <number>)";
 *   - stamps `totalCount` (rows behind the query) on every row;
 *   - IGNORES vendor / status / from / to.
 * So a filter that relied on a param the backend drops would fail here exactly
 * as it would in production.
 *
 * Navigation is by sidebar click only; the dashboard is the one direct URL.
 * Screenshots land in e2e/playwright/screenshots/soupfin-171/ and are committed.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import { mockTokenValidationApi, isLxcMode } from './fixtures';

test.skip(isLxcMode(), 'Mock-only spec: drives the list against a backend-shaped mock');

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-171/${name}.png`,
    fullPage: true,
  });
}

/** Local calendar date shifted by `days`, as YYYY-MM-DD (the page compares local dates). */
function localDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const VENDORS = [
  { id: 'v-acme', name: 'Acme Supplies' },
  { id: 'v-zenith', name: 'Zenith Power' },
  { id: 'v-hub', name: 'Office Hub' },
];

const PAST_DUE = localDate(-10);
const FUTURE_DUE = localDate(30);

/**
 * 45 bills in the exact shape `_bill.gson` / the Go gateway emit.
 *   vendor : Acme for n%3==1, Zenith for n%3==2, Office Hub for n%3==0
 *   status : PAID when n%5==0, PARTIAL when n%5==1, else PENDING
 *   due    : PAST_DUE when n%4==0, else FUTURE_DUE
 *   billDate: 2026-MM-10 with MM = ((n-1) % 9) + 1
 */
const BILLS = Array.from({ length: 45 }, (_, i) => {
  const n = i + 1;
  const vendor = VENDORS[(n - 1) % 3];
  const status = n % 5 === 0 ? 'PAID' : n % 5 === 1 ? 'PARTIAL' : 'PENDING';
  const total = 100 * n;
  const paid = status === 'PAID' ? total : status === 'PARTIAL' ? total / 2 : 0;
  const month = String(((n - 1) % 9) + 1).padStart(2, '0');
  return {
    id: `bill-${String(n).padStart(3, '0')}`,
    class: 'soupbroker.finance.Bill',
    number: n,
    numberPrefix: 'BILL',
    billNumber: `BILL-${n}`,
    serialised: `Bill((${vendor.name}), BILL, ${n})`,
    vendor: { id: vendor.id, class: 'soupbroker.trading.Vendor', serialised: `(${vendor.name})` },
    billDate: `2026-${month}-10T00:00:00Z`,
    paymentDate: `${n % 4 === 0 ? PAST_DUE : FUTURE_DUE}T00:00:00Z`,
    status,
    currency: 'GHS',
    subTotal: total,
    total,
    totalTaxAmount: 0,
    paidAmount: paid,
    amountDue: total - paid,
  };
});

type BillRow = (typeof BILLS)[number];

/** The backend's search: OR over tokens, LIKE on id and serialised (case-insensitive). */
function backendSearch(rows: BillRow[], search: string | null): BillRow[] {
  const tokens = (search || '').split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
  if (!tokens.length) return rows;
  return rows.filter((r) =>
    tokens.some((t) => r.id.toLowerCase().includes(t) || r.serialised.toLowerCase().includes(t))
  );
}

interface Harness {
  /** Every /rest/bill/index.json request, as URLSearchParams. */
  billRequests: URLSearchParams[];
}

async function signInAndOpenBills(page: Page): Promise<Harness> {
  const harness: Harness = { billRequests: [] };

  await page.addInitScript(() => {
    const user = {
      username: 'admin',
      email: 'admin@soupfinance.com',
      roles: ['ROLE_ADMIN', 'ROLE_USER'],
      tenantId: 'account-001',
    };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({ state: { user, isAuthenticated: true, isInitialized: true }, version: 0 })
    );
  });

  // Catch-all FIRST — lowest precedence (Playwright routes are LIFO).
  await page.route('**/rest/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await mockTokenValidationApi(page, true);
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'account-001', name: 'Test Company', currency: 'GHS' }),
    })
  );
  await page.route('**/rest/trading/vendor/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VENDORS) })
  );
  await page.route('**/rest/bill/index.json*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    harness.billRequests.push(params);
    const max = Math.min(Number(params.get('max')) || 10, 1000);
    const offset = Number(params.get('offset')) || 0;
    const matched = backendSearch(BILLS, params.get('search'));
    const pageRows = matched.slice(offset, offset + max).map((r) => ({ ...r, totalCount: matched.length }));
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pageRows) });
  });

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');

  await page.locator('nav > div > a', { hasText: 'Bills' }).first().click();
  await expect(page.getByTestId('bill-list-table')).toBeVisible({ timeout: 15000 });
  return harness;
}

/** The bill numbers currently on screen, in order. */
async function visibleBillNumbers(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="bill-link-"]').allInnerTexts();
}

function lastBillRequest(h: Harness): Record<string, string> {
  return Object.fromEntries(h.billRequests[h.billRequests.length - 1].entries());
}

async function summary(page: Page): Promise<string> {
  return (await page.getByTestId('bill-pagination-summary').innerText()).replace(/\s+/g, ' ').trim();
}

const waitForBillRequest = (page: Page, test: (p: URLSearchParams) => boolean) =>
  page.waitForRequest((r: Request) => r.url().includes('/rest/bill/index.json') && test(new URL(r.url()).searchParams));

test.describe('SOUPFIN-171 — Bills list paging, search and filters', () => {
  test('#1 pages on the server: bill 21 and bill 45 are reachable', async ({ page }) => {
    const h = await signInAndOpenBills(page);
    await shot(page, '01-list-page-1');

    expect(lastBillRequest(h)).toEqual({ max: '20', offset: '0', sort: 'dateCreated', order: 'desc' });
    expect(await summary(page)).toBe('Showing 1 to 20 of 45 bills');
    expect(await visibleBillNumbers(page)).toHaveLength(20);
    await expect(page.getByText('BILL-21', { exact: true })).toHaveCount(0);

    const next = waitForBillRequest(page, (p) => p.get('offset') === '20');
    await page.getByTestId('bill-pagination-next').click();
    await next;
    await expect(page.getByText('BILL-21', { exact: true })).toBeVisible();
    expect(lastBillRequest(h)).toMatchObject({ max: '20', offset: '20' });
    expect(await summary(page)).toBe('Showing 21 to 40 of 45 bills');
    await shot(page, '02-list-page-2');

    const third = waitForBillRequest(page, (p) => p.get('offset') === '40');
    await page.getByTestId('bill-pagination-page-3').click();
    await third;
    await expect(page.getByText('BILL-45', { exact: true })).toBeVisible();
    expect(await visibleBillNumbers(page)).toEqual(['BILL-41', 'BILL-42', 'BILL-43', 'BILL-44', 'BILL-45']);
    expect(await summary(page)).toBe('Showing 41 to 45 of 45 bills');
    await expect(page.getByTestId('bill-pagination-next')).toBeDisabled();
    await shot(page, '03-list-last-page');
  });

  test('#2 highlights overdue bills: due date passed with money owed', async ({ page }) => {
    await signInAndOpenBills(page);

    // BILL-4, 8, 12, 16 are past due and unpaid; BILL-20 is past due but PAID.
    for (const n of [4, 8, 12, 16]) {
      const row = page.getByTestId(`bill-row-bill-${String(n).padStart(3, '0')}`);
      await expect(row).toHaveAttribute('data-overdue', 'true');
      await expect(row.getByTestId(`bill-overdue-bill-${String(n).padStart(3, '0')}`)).toHaveText(/Overdue/);
    }
    // The Overdue pill must not widen the table past the page: at 1280px the
    // Actions column (Edit) stayed visible before this feature and still must.
    const overflow = await page
      .getByTestId('bill-list-table')
      .evaluate((table) => {
        const scroller = table.parentElement as HTMLElement;
        return scroller.scrollWidth - scroller.clientWidth;
      });
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('bill-edit-bill-004')).toBeVisible();

    const paidPastDue = page.getByTestId('bill-row-bill-020');
    await expect(paidPastDue).not.toHaveAttribute('data-overdue', 'true');
    await expect(page.getByTestId('bill-row-bill-001')).not.toHaveAttribute('data-overdue', 'true');
    await page.getByTestId('bill-row-bill-004').scrollIntoViewIfNeeded();
    await shot(page, '04-overdue-highlighted');
  });

  test('#3 search by bill number finds BILL-7 only', async ({ page }) => {
    const h = await signInAndOpenBills(page);

    const searched = waitForBillRequest(page, (p) => p.get('search') === 'BILL 7');
    await page.getByTestId('bill-search-input').fill('BILL-7');
    await searched;

    // The server sends back every bill containing "BILL" OR "7"; the page narrows it.
    await expect
      .poll(() => lastBillRequest(h))
      .toEqual({ max: '1000', offset: '0', sort: 'dateCreated', order: 'desc', search: 'BILL 7' });
    await expect.poll(() => visibleBillNumbers(page)).toEqual(['BILL-7']);
    await expect(page.getByTestId('bill-pagination')).toHaveCount(0);
    await shot(page, '05-search-bill-number');
  });

  test('#4 search by vendor name', async ({ page }) => {
    await signInAndOpenBills(page);

    await page.getByTestId('bill-search-input').fill('zenith');
    await expect.poll(async () => (await visibleBillNumbers(page)).length).toBe(15);
    const vendors = await page.locator('[data-testid^="bill-row-"] td:nth-child(2)').allInnerTexts();
    expect(new Set(vendors)).toEqual(new Set(['Zenith Power']));
    await shot(page, '06-search-vendor');
  });

  test('#5 status filter: Overdue, then Paid', async ({ page }) => {
    const h = await signInAndOpenBills(page);

    await page.getByTestId('bill-status-filter').selectOption('OVERDUE');
    // Past due (n%4==0) and not PAID (n%5!=0): 4, 8, 12, 16, 24, 28, 32, 36, 44.
    await expect
      .poll(() => visibleBillNumbers(page))
      .toEqual(['BILL-4', 'BILL-8', 'BILL-12', 'BILL-16', 'BILL-24', 'BILL-28', 'BILL-32', 'BILL-36', 'BILL-44']);
    // The window is fetched and no `status` param is sent — the backend ignores it.
    expect(lastBillRequest(h)).toEqual({ max: '1000', offset: '0', sort: 'dateCreated', order: 'desc' });
    await shot(page, '07-status-overdue');

    await page.getByTestId('bill-status-filter').selectOption('PAID');
    await expect
      .poll(() => visibleBillNumbers(page))
      .toEqual(['BILL-5', 'BILL-10', 'BILL-15', 'BILL-20', 'BILL-25', 'BILL-30', 'BILL-35', 'BILL-40', 'BILL-45']);
    await shot(page, '08-status-paid');
  });

  test("#6 vendor filter keeps only the chosen vendor's 15 bills", async ({ page }) => {
    await signInAndOpenBills(page);

    const select = page.getByTestId('bill-vendor-filter');
    await expect(select.locator('option')).toHaveText(['All vendors', 'Acme Supplies', 'Office Hub', 'Zenith Power']);
    await select.selectOption({ label: 'Office Hub' });

    await expect.poll(async () => (await visibleBillNumbers(page)).length).toBe(15);
    const vendors = await page.locator('[data-testid^="bill-row-"] td:nth-child(2)').allInnerTexts();
    expect(new Set(vendors)).toEqual(new Set(['Office Hub']));
    await shot(page, '09-vendor-filter');
  });

  test('#7 bill-date range is inclusive and combines with the vendor filter', async ({ page }) => {
    const h = await signInAndOpenBills(page);

    await page.getByTestId('bill-date-from').fill('2026-03-10');
    await page.getByTestId('bill-date-to').fill('2026-04-10');
    // Months 03 and 04 → n%9 in {3, 4}: 3, 4, 12, 13, 21, 22, 30, 31, 39, 40.
    await expect
      .poll(() => visibleBillNumbers(page))
      .toEqual(['BILL-3', 'BILL-4', 'BILL-12', 'BILL-13', 'BILL-21', 'BILL-22', 'BILL-30', 'BILL-31', 'BILL-39', 'BILL-40']);
    // from/to are NOT sent: the Go gateway would filter the creation date instead.
    expect(lastBillRequest(h)).not.toHaveProperty('from');
    expect(lastBillRequest(h)).not.toHaveProperty('to');
    await shot(page, '10-date-range');

    await page.getByTestId('bill-vendor-filter').selectOption({ label: 'Acme Supplies' });
    await expect.poll(() => visibleBillNumbers(page)).toEqual(['BILL-4', 'BILL-13', 'BILL-22', 'BILL-31', 'BILL-40']);
    await shot(page, '11-date-and-vendor');
  });

  test('#8 no match shows the no-results state; Clear filters restores server paging', async ({ page }) => {
    const h = await signInAndOpenBills(page);

    await page.getByTestId('bill-search-input').fill('no such vendor');
    await expect(page.getByTestId('bill-list-no-results')).toBeVisible();
    await expect(page.getByTestId('bill-list-no-results')).toContainText('No bills match your filters');
    await expect(page.getByTestId('bill-list-empty')).toHaveCount(0);
    await shot(page, '12-no-results');

    // The search reached the server as a window request...
    expect(h.billRequests.some((p) => p.get('max') === '1000' && p.get('search') === 'no such vendor')).toBe(true);

    await page.getByTestId('bill-list-clear-filters-button').click();
    await expect(page.getByTestId('bill-search-input')).toHaveValue('');
    // ...and clearing returns to the server's first page (served from the query
    // cache, so it may not issue a new request).
    await expect.poll(() => summary(page)).toBe('Showing 1 to 20 of 45 bills');
    expect(await visibleBillNumbers(page)).toHaveLength(20);
    await shot(page, '13-filters-cleared');
  });
});
