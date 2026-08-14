/**
 * SOUPFIN-43 — Bill detail Amount Summary rendered all zeros.
 *
 * Reported (V23, app.soupfinance.com): bill #6 (qty 3 × GH₵500, VAT 15%) had a
 * correct backend header — `GET /rest/bill/show/…` returned
 * `subTotal:1500.0, totalTaxAmount:225.00, total:1725.00` — yet the page showed
 * `Subtotal GH₵0.00 / Tax GH₵0.00 / Total GH₵0.00` while `Balance Due` showed
 * the right GH₵1,725.00.
 *
 * Root cause (verified against grails-app/views/bill/_bill.gson): a FIELD-NAME
 * mismatch, not a per-item read. The template emits
 *
 *   subTotal · total · totalTaxAmount · paidAmount · amountDue
 *
 * while this codebase's `Bill` declares
 *
 *   subtotal · totalAmount · taxAmount  · amountPaid · amountDue
 *
 * Only `amountDue` collided — which is exactly why Balance Due alone was right.
 * The other four arrived `undefined` and `formatCurrency(undefined)` printed
 * 0.00. `transformBill()` now maps them, so the detail page, the Bills list
 * Total column (same GSON template serves index.json) and the bill PDF all
 * agree with the backend.
 *
 * Navigation is by sidebar menu click and by clicking the bill's own link —
 * never a direct `goto` for an internal route — so these also prove the surface
 * is reachable the way a user reaches it. Screenshots land in
 * e2e/playwright/screenshots/soupfin-43/ and are committed.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, isLxcMode } from './fixtures';

test.skip(isLxcMode(), 'Mock-only spec: pins exact backend-shaped payloads');

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-43/${name}.png`,
    fullPage: true,
  });
}

const BILL_ID = '9b10e338f1034ec18894f4eeddf6ee91';

/**
 * The reported bill, in the EXACT shape `_bill.gson` emits — backend spellings
 * only. Using the frontend's own field names here would test nothing.
 */
function backendBill(overrides: Record<string, unknown> = {}) {
  return {
    id: BILL_ID,
    'class': 'soupbroker.finance.Bill',
    number: 6,
    numberPrefix: 'BILL',
    billNumber: 'BILL-6',
    vendor: {
      id: 'vendor-1',
      'class': 'soupbroker.finance.Vendor',
      serialised: '(Ayawaso West Municipal Assembly)',
    },
    billDate: '2026-08-14T00:00:00Z',
    paymentDate: '2026-09-13T00:00:00Z',
    status: 'PENDING',
    currency: 'GHS',
    exchangeRate: 1,
    subTotal: 1500.0,
    total: 1725.0,
    baseTotal: 1725.0,
    totalTaxAmount: 225.0,
    paidAmount: 0,
    basePaidAmount: 0,
    amountDue: 1725.0,
    // _bill.gson does NOT render the line-item collection at all.
    billItemList: null,
    ...overrides,
  };
}

/** What /rest/billItem/index.json returns — getBill() fetches these separately. */
const BILL_ITEMS = [
  {
    id: 'item-1',
    'class': 'soupbroker.finance.BillItem',
    bill: { id: BILL_ID },
    description: 'Consulting Services',
    quantity: 3,
    unitPrice: 500,
    amount: 1500,
    taxEntryBillItemList: [
      {
        id: 'tx-1',
        'class': 'soupbroker.finance.TaxEntryBillItem',
        serialised:
          'TaxEntryBillItem(BillItem(quantity:3.0, unitPrice:500.00), VAT-S-15.0%, 225.0)',
      },
    ],
  },
];

async function setupMockAuth(page: Page) {
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
      JSON.stringify({
        state: { user: mockUser, isAuthenticated: true, isInitialized: true },
        version: 0,
      })
    );
  });
}

/**
 * Common mocks + landing on the dashboard, the only direct URL these tests use.
 * Everything after this happens through clicks.
 */
async function signInAndLand(
  page: Page,
  opts: { bill?: Record<string, unknown>; items?: unknown[] } = {}
) {
  const bill = opts.bill ?? backendBill();
  const items = opts.items ?? BILL_ITEMS;

  await setupMockAuth(page);

  // Catch-all FIRST so it has the lowest precedence (Playwright routes are LIFO).
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

  // index.json is rendered by the SAME template as show.json — same field names.
  await page.route('**/rest/bill/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([bill]) })
  );
  await page.route(`**/rest/bill/show/${BILL_ID}.json*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bill) })
  );
  await page.route('**/rest/billItem/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items) })
  );

  // The tax catalogue backs the Line Items "Tax Rate" column, which resolves a
  // line's TaxEntry by matching the label inside its join row's serialised
  // string (`VAT-S-15.0%`) against each entry's own `serialised`. Without this
  // the catch-all returns [], nothing matches, and the column falls back to
  // "No Tax" — rendering 0% next to a GH₵225.00 tax, which contradicts the very
  // Amount Summary this spec exists to prove. Mock it so the captured
  // screenshots show what production shows.
  await page.route('**/rest/taxEntry/index.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'tax-vat-15',
          'class': 'soupbroker.finance.TaxEntry',
          name: 'VAT Standard',
          abbreviation: 'VAT-S',
          taxRate: 15.0,
          isWithholdingTax: false,
          serialised: 'VAT-S-15.0%',
        },
      ]),
    })
  );

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
}

/** Click a top-level sidebar entry by its visible label. */
async function clickNav(page: Page, label: string) {
  await page.locator('nav > div > a', { hasText: label }).first().click();
  await page.waitForLoadState('domcontentloaded');
}

/** Reach the bill detail page the way a user does: sidebar → Bills → the bill's link. */
async function openBillDetail(page: Page) {
  await clickNav(page, 'Bills');
  await expect(page.getByTestId('bill-list-table')).toBeVisible({ timeout: 15000 });
  await shot(page, 'bills-list-total-column');

  await page.getByTestId(`bill-link-${BILL_ID}`).click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('bill-amount-card')).toBeVisible({ timeout: 15000 });
}

test.describe('SOUPFIN-43 — bill detail Amount Summary', () => {
  test('#1 Subtotal / Tax / Total come from the bill header, not zero', async ({ page }) => {
    await signInAndLand(page);
    await openBillDetail(page);
    await shot(page, 'bill-detail-amount-summary');

    // The reported numbers, each row asserted individually so a swap cannot pass.
    await expect(page.getByTestId('bill-detail-subtotal')).toHaveText('GH₵1,500.00');
    await expect(page.getByTestId('bill-detail-tax')).toHaveText('GH₵225.00');
    await expect(page.getByTestId('bill-detail-total')).toHaveText('GH₵1,725.00');
    await expect(page.getByTestId('bill-detail-amount-paid')).toHaveText('GH₵0.00');
    // Was already correct before the fix — regression guard.
    await expect(page.getByTestId('bill-detail-balance-due')).toHaveText('GH₵1,725.00');

    // The Line Items "Tax Rate" column is a SEPARATE read path (join row →
    // catalogue) from the header amounts above. Assert it agrees, so the page
    // can never again show a rate that contradicts its own tax figure —
    // 15% of GH₵1,500.00 is the GH₵225.00 asserted above.
    await expect(page.getByRole('cell', { name: '15%' })).toBeVisible();

    await shot(page, 'bill-detail-totals-asserted');
  });

  test('#2 Total and Balance Due agree on the same page', async ({ page }) => {
    await signInAndLand(page);
    await openBillDetail(page);

    // The reported inconsistency: Total 0.00 alongside Balance Due 1,725.00 on an
    // unpaid bill. Unpaid means these two must be equal.
    const total = await page.getByTestId('bill-detail-total').innerText();
    const balance = await page.getByTestId('bill-detail-balance-due').innerText();
    expect(total).toBe(balance);

    await shot(page, 'total-matches-balance-due');
  });

  test('#3 the Bills list Total column shows the taxed total', async ({ page }) => {
    await signInAndLand(page);
    await clickNav(page, 'Bills');

    await expect(page.getByTestId('bill-list-table')).toBeVisible({ timeout: 15000 });

    // Same GSON template serves index.json, so the list understated identically.
    const row = page.getByTestId(`bill-row-${BILL_ID}`);
    await expect(row).toContainText('1,725.00');
    await expect(row).not.toContainText('GH₵0.00');

    await shot(page, 'bills-list-row-taxed-total');
  });

  test('#4 a partially paid bill separates Total, Paid and Balance Due', async ({ page }) => {
    await signInAndLand(page, {
      bill: backendBill({ paidAmount: 725.0, amountDue: 1000.0, status: 'PARTIAL' }),
    });
    await openBillDetail(page);

    await expect(page.getByTestId('bill-detail-total')).toHaveText('GH₵1,725.00');
    await expect(page.getByTestId('bill-detail-amount-paid')).toHaveText('GH₵725.00');
    await expect(page.getByTestId('bill-detail-balance-due')).toHaveText('GH₵1,000.00');

    await shot(page, 'partially-paid-bill');
  });

  test('#5 falls back to the line items when the header degrades to zero', async ({ page }) => {
    // _bill.gson catches LazyInitializationException and emits 0 for EVERY amount.
    // The separately-fetched line items are then the surviving truth — otherwise
    // the page reproduces the reported all-zero summary from a healthy bill.
    await signInAndLand(page, {
      bill: backendBill({
        subTotal: 0,
        total: 0,
        baseTotal: 0,
        totalTaxAmount: 0,
        paidAmount: 0,
        amountDue: 0,
      }),
    });
    await openBillDetail(page);

    await expect(page.getByTestId('bill-detail-subtotal')).toHaveText('GH₵1,500.00');
    await expect(page.getByTestId('bill-detail-tax')).toHaveText('GH₵225.00');
    await expect(page.getByTestId('bill-detail-total')).toHaveText('GH₵1,725.00');
    await expect(page.getByTestId('bill-detail-balance-due')).toHaveText('GH₵1,725.00');

    await shot(page, 'lazy-init-fallback-to-items');
  });

  test('#6 a genuinely zero bill still renders 0.00, not blank or NaN', async ({ page }) => {
    await signInAndLand(page, {
      bill: backendBill({
        subTotal: 0,
        total: 0,
        baseTotal: 0,
        totalTaxAmount: 0,
        amountDue: 0,
        status: 'DRAFT',
      }),
      items: [],
    });
    await openBillDetail(page);

    await expect(page.getByTestId('bill-detail-subtotal')).toHaveText('GH₵0.00');
    await expect(page.getByTestId('bill-detail-total')).toHaveText('GH₵0.00');
    await expect(page.getByTestId('bill-detail-balance-due')).toHaveText('GH₵0.00');

    await shot(page, 'zero-bill-renders-zero');
  });
});
