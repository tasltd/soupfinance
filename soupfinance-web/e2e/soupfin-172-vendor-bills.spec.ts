/**
 * SOUPFIN-172 — Vendor detail: bill history and AP payment summary
 *
 * The vendor page now shows Total Billed / Total Paid / Outstanding (PRD VND-2),
 * the vendor's bills with status badges and links, and a "Create bill" action
 * that opens the bill form with the vendor already chosen.
 *
 * The backend has no vendor paymentSummary action and Bill.searchList ignores
 * any vendor filter, so the page reads /rest/bill/index.json (open bills) and
 * /rest/bill/archived.json (PAID bills) and filters by vendor in the browser.
 * The mocks below therefore deliberately include another vendor's bill and a
 * soft-deleted bill: both must stay out of the table and the totals.
 *
 * Every test reaches the vendor page by clicking: sidebar Vendors, then the
 * vendor's name. Screenshots go to e2e/playwright/screenshots/soupfin-172/.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import {
  installUnmockedApiGuard,
  mockAmbientApi,
  mockDashboardApi,
  mockTokenValidationApi,
  isLxcMode,
  type UnmockedApiGuard,
} from './fixtures';

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-172/${name}.png`,
    fullPage: true,
  });
}

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const VENDOR = {
  id: 'vendor-001',
  name: 'Kumasi Office Supplies',
  email: 'accounts@kumasi-office.example',
  phoneNumber: '+233 24 555 0101',
  paymentTerms: 30,
  address: '12 Adum Road, Kumasi',
  dateCreated: '2026-01-15T10:00:00Z',
};
const OTHER_VENDOR = { id: 'vendor-002', name: 'Accra Print House', dateCreated: '2026-01-16T10:00:00Z' };

/** A bill row exactly as `_bill.gson` renders it: backend amount spellings. */
function rawBill(
  id: string,
  vendor: { id: string; name: string },
  over: Record<string, unknown>
): Record<string, unknown> {
  return {
    id,
    class: 'soupbroker.finance.Bill',
    archived: false,
    billNumber: `BILL-${id.toUpperCase()}`,
    number: 1,
    vendor: { id: vendor.id, class: 'soupbroker.trading.Vendor', serialised: `(${vendor.name})[PROVIDER]` },
    billDate: '2026-09-01T00:00:00Z',
    paymentDate: '2026-10-01T00:00:00Z',
    currency: 'USD',
    status: 'PENDING',
    subTotal: 0,
    totalTaxAmount: 0,
    total: 0,
    paidAmount: 0,
    amountDue: 0,
    billItemList: null,
    ...over,
  };
}

// index.json: open bills (the backend leaves PAID bills out of this list)
const OPEN_BILLS = [
  rawBill('b-open-1', VENDOR, {
    billDate: '2026-09-15T00:00:00Z', paymentDate: '2026-10-15T00:00:00Z',
    status: 'PENDING', subTotal: 1500, total: 1500, paidAmount: 0, amountDue: 1500,
  }),
  rawBill('b-open-2', VENDOR, {
    billDate: '2026-08-20T00:00:00Z', paymentDate: '2026-09-19T00:00:00Z',
    status: 'PARTIAL', subTotal: 2400, total: 2400, paidAmount: 900, amountDue: 1500,
  }),
  // Another vendor's bill: the backend does not filter, so it arrives here.
  rawBill('b-other', OTHER_VENDOR, {
    status: 'PENDING', subTotal: 5000, total: 5000, paidAmount: 0, amountDue: 5000,
  }),
];
// archived.json: archived=true OR status=PAID
const CLOSED_BILLS = [
  rawBill('b-paid-1', VENDOR, {
    billDate: '2026-07-10T00:00:00Z', paymentDate: '2026-08-09T00:00:00Z',
    status: 'PAID', subTotal: 3200, total: 3200, paidAmount: 3200, amountDue: 0,
  }),
  // Soft-deleted: must not count.
  rawBill('b-deleted', VENDOR, {
    archived: true, status: 'PENDING', subTotal: 999, total: 999, paidAmount: 0, amountDue: 999,
  }),
];

interface BillLists {
  open: unknown[];
  closed: unknown[];
  /** Answer the bill lists with this HTTP status instead of data. */
  failWith?: number;
}

async function setUp(page: Page, lists: BillLists, vendor = VENDOR) {
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
  await mockAmbientApi(page);
  await mockTokenValidationApi(page, true);
  await mockDashboardApi(page);

  // Vendors appear in the sidebar only for TRADING tenants (SOUPFIN-25).
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill(json({
      id: 'account-001', name: 'Test Company', currency: 'USD',
      businessLicenceCategory: 'TRADING', dateCreated: '2024-01-01T00:00:00Z',
    }))
  );
  await page.route('**/rest/trading/vendor/index.json*', (route) =>
    route.fulfill(json([vendor, OTHER_VENDOR]))
  );
  await page.route('**/rest/trading/vendor/show/*.json*', (route) =>
    route.fulfill(json(vendor))
  );

  const billList = (rows: unknown[]) => (route: Route) =>
    route.fulfill(lists.failWith
      ? json({ error: 'Internal Server Error', message: 'Bill list failed' }, lists.failWith)
      : json(rows));
  // Registered after mockDashboardApi, so these win for the vendor page (LIFO).
  await page.route('**/rest/bill/index.json*', billList(lists.open));
  await page.route('**/rest/bill/archived.json*', billList(lists.closed));

  // Bill detail page + bill form dependencies.
  await page.route('**/rest/bill/show/*.json*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop()!.replace('.json', '');
    const bill = [...lists.open, ...lists.closed].find((b) => (b as { id: string }).id === id);
    route.fulfill(bill ? json(bill) : json({ error: 'Not Found' }, 404));
  });
  await page.route('**/rest/billItem/index.json*', (route) => route.fulfill(json([])));
  await page.route('**/rest/billPayment/index.json*', (route) => route.fulfill(json([])));
  await page.route('**/rest/taxEntry/index.json*', (route) => route.fulfill(json([])));
}

/** Dashboard → sidebar Vendors → the vendor's name. */
async function openVendorByClicking(page: Page, vendorName = VENDOR.name) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
  const vendorsLink = page.locator('aside a[href="/vendors"]');
  await expect(vendorsLink).toBeVisible({ timeout: 15000 });
  await vendorsLink.click();
  await expect(page.getByTestId('vendor-list-page')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('vendor-list-table').getByRole('link', { name: vendorName, exact: true }).click();
  await expect(page.getByTestId('vendor-detail-page')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1, name: vendorName })).toBeVisible();
}

test.describe('SOUPFIN-172: vendor detail bill history and AP summary', () => {
  test.skip(isLxcMode(), 'Mock spec: the LXC backend has no bills with non-zero totals');

  let guard: UnmockedApiGuard;

  test.beforeEach(async ({ page }) => {
    // FIRST, so the specific mocks registered after it take precedence.
    guard = await installUnmockedApiGuard(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test.afterEach(() => guard.assertNone());

  test('shows the AP summary and only this vendor’s live bills', async ({ page }) => {
    await setUp(page, { open: OPEN_BILLS, closed: CLOSED_BILLS });
    await openVendorByClicking(page);

    // Totals: 1500 + 2400 + 3200 billed; 0 + 900 + 3200 paid; 1500 + 1500 owed.
    await expect(page.getByTestId('vendor-summary-total-billed')).toHaveText('$7,100.00');
    await expect(page.getByTestId('vendor-summary-total-paid')).toHaveText('$4,100.00');
    await expect(page.getByTestId('vendor-summary-outstanding')).toHaveText('$3,000.00');
    await expect(page.getByTestId('vendor-summary-incomplete')).toHaveCount(0);

    const table = page.getByTestId('vendor-bills-table');
    await expect(table).toBeVisible();
    // Header + 3 bills, newest first. No other-vendor bill, no deleted bill.
    await expect(table.getByRole('row')).toHaveCount(4);
    await expect(table.locator('tbody tr')).toHaveText([/BILL-B-OPEN-1/, /BILL-B-OPEN-2/, /BILL-B-PAID-1/]);
    await expect(page.getByTestId('vendor-bill-row-b-other')).toHaveCount(0);
    await expect(page.getByTestId('vendor-bill-row-b-deleted')).toHaveCount(0);
    await expect(page.getByTestId('vendor-bills-count')).toHaveText('3 bills');

    await expect(page.getByTestId('vendor-bill-status-b-paid-1')).toHaveText('PAID');
    await expect(page.getByTestId('vendor-bill-status-b-open-2')).toHaveText('PARTIAL');
    const paidRow = page.getByTestId('vendor-bill-row-b-paid-1');
    await expect(paidRow).toContainText('2026-07-10');
    await expect(paidRow).toContainText('$3,200.00');
    await shot(page, '01-vendor-detail-summary-and-bills');

    await page.getByTestId('vendor-bill-link-b-open-2').click();
    await expect(page).toHaveURL(/\/bills\/b-open-2$/);
    await expect(page.getByTestId('bill-detail-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('BILL-B-OPEN-2').first()).toBeVisible();
    await shot(page, '02-bill-opened-from-vendor-history');
  });

  test('“Create bill” opens the bill form with the vendor chosen and saves it', async ({ page }) => {
    await setUp(page, { open: OPEN_BILLS, closed: CLOSED_BILLS });

    let savedBody: Record<string, unknown> | null = null;
    await page.route('**/rest/bill/create.json*', (route) =>
      route.fulfill(json({ SYNCHRONIZER_TOKEN: 'csrf-172', SYNCHRONIZER_URI: '/rest/bill/save' }))
    );
    await page.route('**/rest/bill/save.json*', (route) => {
      savedBody = route.request().postDataJSON();
      route.fulfill(json(rawBill('b-new', VENDOR, { status: 'PENDING', total: 250 })));
    });

    await openVendorByClicking(page);
    await page.getByTestId('vendor-detail-create-bill').click();

    await expect(page).toHaveURL(/\/bills\/new\?vendorId=vendor-001$/);
    await expect(page.getByTestId('bill-form-page')).toBeVisible({ timeout: 15000 });
    const vendorSelect = page.getByTestId('bill-vendor-select');
    await expect(vendorSelect).toHaveValue(VENDOR.id);
    await expect(vendorSelect.locator('option:checked')).toHaveText(VENDOR.name);
    await shot(page, '03-bill-form-vendor-preselected');

    await page.getByTestId('bill-due-date-input').fill('2026-11-30');
    await page.getByTestId('bill-item-description-0').fill('Printer paper, 20 reams');
    await page.getByTestId('bill-item-unitPrice-0').fill('250');
    await shot(page, '04-bill-form-filled');
    await page.getByTestId('bill-form-save-button').click();

    await expect(page).toHaveURL(/\/bills$/, { timeout: 15000 });
    expect(savedBody).not.toBeNull();
    expect(savedBody!.vendor).toEqual({ id: VENDOR.id });
    await shot(page, '05-bill-saved-back-on-bills-list');
  });

  test('a vendor with no bills shows zero totals and a way to add one', async ({ page }) => {
    // Bills exist, but none of them belong to this vendor.
    await setUp(page, { open: [OPEN_BILLS[2]], closed: [] });
    await openVendorByClicking(page);

    await expect(page.getByTestId('vendor-bills-empty')).toContainText('No bills from this vendor yet');
    await expect(page.getByTestId('vendor-summary-total-billed')).toHaveText('$0.00');
    await expect(page.getByTestId('vendor-summary-total-paid')).toHaveText('$0.00');
    await expect(page.getByTestId('vendor-summary-outstanding')).toHaveText('$0.00');
    await expect(page.getByTestId('vendor-bills-create-first')).toHaveAttribute(
      'href',
      '/bills/new?vendorId=vendor-001'
    );
    await shot(page, '06-vendor-with-no-bills');
  });

  test('a failed bill list shows the error, not zero totals', async ({ page }) => {
    await setUp(page, { open: OPEN_BILLS, closed: CLOSED_BILLS, failWith: 500 });
    await openVendorByClicking(page);

    await expect(page.getByTestId('vendor-bills-error')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('vendor-summary')).toHaveCount(0);
    await expect(page.getByTestId('vendor-bills-empty')).toHaveCount(0);
    // The vendor's own details still render.
    await expect(page.getByText('Basic Information')).toBeVisible();
    await shot(page, '07-bill-list-failed');
  });

  test('a page cut off at the backend cap warns the totals may be low', async ({ page }) => {
    // 150 of this vendor's bills, each row claiming 4500 matches in total:
    // the vendor filter runs in the browser, so more of its bills may be unread.
    const many = Array.from({ length: 150 }, (_, i) =>
      rawBill(`b-${String(i).padStart(3, '0')}`, VENDOR, {
        billDate: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
        status: i % 3 === 0 ? 'PARTIAL' : 'PENDING',
        subTotal: 12_345.67, total: 12_345.67, paidAmount: 2_345.67, amountDue: 10_000,
        totalCount: 4500,
      })
    );
    await setUp(page, { open: many, closed: [] });
    await openVendorByClicking(page);

    await expect(page.getByTestId('vendor-bills-table').locator('tbody tr')).toHaveCount(150);
    await expect(page.getByTestId('vendor-summary-total-billed')).toHaveText('$1,851,850.50');
    await expect(page.getByTestId('vendor-summary-outstanding')).toHaveText('$1,500,000.00');
    await expect(page.getByTestId('vendor-summary-incomplete')).toContainText('totals may be low');
    // Top of the page only: the full 150-row page is too tall to be useful.
    await page.screenshot({
      path: 'e2e/playwright/screenshots/soupfin-172/08-truncated-bill-list-warning.png',
    });
  });
});
