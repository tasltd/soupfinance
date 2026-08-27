/**
 * SOUPFIN-44 — a bill line item showed "Tax Rate 0%" when its TaxEntry could not
 * be resolved.
 *
 * Reported: on a bill whose Amount Summary read Tax GHS 225.00, the Line Items
 * table showed 0% for the VAT line — the two figures contradicted each other on
 * the same screen.
 *
 * Root cause: `resolveBillItemTaxEntryId()` returns the EMPTY STRING when a line's
 * TaxEntry cannot be resolved (a bare FK reference whose serialised label misses
 * the catalogue, or a catalogue that failed to load). `listTaxRates()` prepends
 * NO_TAX_OPTION, whose id is ALSO the empty string, so
 * `taxRates.find(t => t.id === entryId)` matched "No Tax" and returned rate 0.
 * The column therefore printed "0%" — a POSITIVE CLAIM of no tax — instead of the
 * dash the code intended for "unknown".
 *
 * These tests prove, through the real UI:
 *   #1 a taxed line whose entry is not in the catalogue renders "—", never "0%",
 *      while the Amount Summary still shows the tax it carries
 *   #2 a line that genuinely carries no tax still renders a truthful "0%"
 *   #3 a resolvable line renders its real rate
 *   #4 a catalogue that fails to load (the 403 module gate) leaves every taxed
 *      line unknown rather than claiming 0%
 *   #5 the column holds up on an over-populated bill (12 lines, mixed states)
 *
 * Navigation is by sidebar menu click and then a row link — never a direct route
 * `goto` for an internal page — so the tests also prove the surface is reachable.
 * Screenshots land in e2e/playwright/screenshots/soupfin-44/ and are committed.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, isLxcMode } from './fixtures';

test.skip(isLxcMode(), 'Mock-only spec: pins the exact unresolvable-FK response shape');

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-44/${name}.png`,
    fullPage: true,
  });
}

/**
 * The tenant's TaxEntry catalogue. VAT-S is deliberately ABSENT — that is the
 * reported condition: a line references an entry this catalogue does not carry.
 */
const TAX_ENTRIES = [
  {
    id: 'ff8081817fe4ae93017fe5c9cf10017b',
    name: 'CST',
    abbreviation: 'CST',
    taxRate: 5.0,
    isTaxable: true,
    serialised: 'CST-5.0%',
  },
  {
    id: 'ff8081817f8e0105017f8ea9ba580014',
    name: 'Value Added Tax -Flat Rate',
    abbreviation: 'VAT-FR',
    taxRate: 15.0,
    serialised: 'VAT-FR-15.0%',
  },
];

/** Verbatim TaxEntryBillItem.serialised shape — ONE trailing number, not two. */
function billJoinRow(label: string, taxAmount: number): { serialised: string } {
  return {
    serialised:
      `TaxEntryBillItem(BillItem(quantity:1.0, unitPrice:1500, taxEntries:[${label}], ` +
      `bill:Bill((805 Restaurant)[PROVIDER], 202206-03, 230)), ${label}, ${taxAmount})`,
  };
}

const BILL_ID = 'bill-044';

/** Header figures, which are what the unresolvable line used to contradict. */
const BILL = {
  id: BILL_ID,
  billNumber: 'BILL-2026-0044',
  vendor: { id: 'vendor-1', serialised: '(805 Restaurant)[PROVIDER]' },
  billDate: '2026-08-01T00:00:00Z',
  paymentDate: '2026-08-31T00:00:00Z',
  status: 'PENDING',
  subtotal: 3000,
  taxAmount: 225,
  totalAmount: 3225,
  amountPaid: 0,
  amountDue: 3225,
};

/** One line per state the Tax Rate column has to tell apart. */
const BILL_ITEMS = [
  {
    id: 'item-unresolvable',
    bill: { id: BILL_ID },
    description: 'Catering services',
    quantity: 1,
    unitPrice: 1500,
    // Bare FK reference whose label is absent from TAX_ENTRIES — the reported case.
    taxEntryBillItemList: [billJoinRow('VAT-S-15.0%', 225.0)],
  },
  {
    id: 'item-untaxed',
    bill: { id: BILL_ID },
    description: 'Printing',
    quantity: 1,
    unitPrice: 900,
    // No join rows at all: genuinely untaxed, so "0%" is a true statement.
    taxEntryBillItemList: [],
  },
  {
    id: 'item-resolvable',
    bill: { id: BILL_ID },
    description: 'Consultancy',
    quantity: 1,
    unitPrice: 600,
    taxEntryBillItemList: [billJoinRow('CST-5.0%', 30.0)],
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

interface Options {
  /** Items to serve from /rest/billItem/index.json. */
  items?: typeof BILL_ITEMS;
  /** Simulate the 403 module gate on the TaxEntry catalogue. */
  taxCatalogueFails?: boolean;
}

/**
 * Common mocks + landing on the dashboard, the only direct URL these tests use.
 * Everything after this happens through menu clicks and row links.
 */
async function signInAndLand(page: Page, options: Options = {}) {
  const items = options.items ?? BILL_ITEMS;

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

  await page.route('**/rest/taxEntry/index.json*', (route) =>
    options.taxCatalogueFails
      ? route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Module not enabled for this license category' }),
        })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(TAX_ENTRIES),
        })
  );

  await page.route('**/rest/bill/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([BILL]) })
  );

  // getBill() fetches the header, then the full line items separately.
  await page.route('**/rest/bill/show/*.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...BILL, billItemList: null }),
    })
  );
  await page.route('**/rest/billItem/index.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items) })
  );

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
}

/** Click a top-level sidebar entry by its visible label. */
async function clickNav(page: Page, label: string) {
  await page.locator('nav > div > a', { hasText: label }).first().click();
  await page.waitForLoadState('domcontentloaded');
}

/** Reach the bill detail the way a user does: sidebar → Bills → the row link. */
async function openBillDetail(page: Page) {
  await clickNav(page, 'Bills');
  await expect(page.getByTestId('bill-list-table')).toBeVisible({ timeout: 15000 });
  await shot(page, 'bills-list');

  await page.getByTestId(`bill-link-${BILL_ID}`).click();
  await expect(page.getByTestId('bill-items-table')).toBeVisible({ timeout: 15000 });
}

/**
 * The Tax Rate cell (4th column) of the line-items row whose description matches.
 * Reading it by description rather than index keeps the assertion honest if the
 * row order ever changes.
 */
function taxRateCell(page: Page, description: string) {
  return page
    .getByTestId('bill-items-table')
    .locator('tbody tr')
    .filter({ hasText: description })
    .locator('td')
    .nth(3);
}

test.describe('SOUPFIN-44 — bill line item Tax Rate column', () => {
  test('#1/#2/#3 tells apart unknown, untaxed and resolved tax', async ({ page }) => {
    await signInAndLand(page);
    await openBillDetail(page);

    // #1 — THE REGRESSION. This line carries VAT the catalogue cannot name. It
    // must read as unknown, never as a positive claim of no tax.
    const unknown = taxRateCell(page, 'Catering services');
    await expect(unknown).toHaveText('—');
    await expect(unknown).not.toHaveText('0%');

    // ...and the contradiction the report described is gone: the header still
    // shows the tax this bill carries while the line reads "unknown".
    await expect(page.getByTestId('bill-amount-card')).toContainText('225.00');

    // #2 — a line with no tax rows at all still reports a truthful 0%.
    await expect(taxRateCell(page, 'Printing')).toHaveText('0%');

    // #3 — a resolvable line shows its real rate.
    await expect(taxRateCell(page, 'Consultancy')).toHaveText('5%');

    await shot(page, 'bill-detail-tax-rate-column');
  });

  test('#4 renders unknown, not 0%, when the tax catalogue is unavailable', async ({ page }) => {
    // The SERVICES license category 403s several module endpoints. A catalogue
    // the page could not load is "I do not know", not "there is no tax".
    await signInAndLand(page, { taxCatalogueFails: true });
    await openBillDetail(page);

    await expect(taxRateCell(page, 'Catering services')).toHaveText('—');
    await expect(taxRateCell(page, 'Consultancy')).toHaveText('—');
    // A line with no tax rows needs no catalogue to be certain about.
    await expect(taxRateCell(page, 'Printing')).toHaveText('0%');

    await shot(page, 'bill-detail-tax-catalogue-unavailable');
  });

  test('#5 holds up on an over-populated bill without any line claiming a false 0%', async ({ page }) => {
    // Excess: 12 lines cycling through all three states. Every unresolved line
    // must still read "—", and the table must stay inside its card.
    const many = Array.from({ length: 12 }, (_, i) => {
      const base = {
        id: `item-${i}`,
        bill: { id: BILL_ID },
        quantity: 1,
        unitPrice: 1500 + i,
      };
      if (i % 3 === 0) {
        return {
          ...base,
          description: `Unresolvable line ${i}`,
          taxEntryBillItemList: [billJoinRow('VAT-S-15.0%', 225.0)],
        };
      }
      if (i % 3 === 1) {
        return { ...base, description: `Untaxed line ${i}`, taxEntryBillItemList: [] };
      }
      return {
        ...base,
        description: `Resolved line ${i}`,
        taxEntryBillItemList: [billJoinRow('CST-5.0%', 30.0)],
      };
    });

    await signInAndLand(page, { items: many });
    await openBillDetail(page);

    const rows = page.getByTestId('bill-items-table').locator('tbody tr');
    await expect(rows).toHaveCount(12);

    for (let i = 0; i < 12; i++) {
      const expected = i % 3 === 0 ? '—' : i % 3 === 1 ? '0%' : '5%';
      await expect(rows.nth(i).locator('td').nth(3)).toHaveText(expected);
    }

    // No unresolved line anywhere in the table is labelled 0%.
    await expect(
      rows.filter({ hasText: 'Unresolvable line' }).filter({ hasText: '0%' })
    ).toHaveCount(0);

    // Containment: the table stays within the card that owns it.
    const card = await page.getByTestId('bill-items-card').boundingBox();
    const table = await page.getByTestId('bill-items-table').boundingBox();
    expect(card).not.toBeNull();
    expect(table).not.toBeNull();
    expect(table!.y + table!.height).toBeLessThanOrEqual(card!.y + card!.height + 1);

    await shot(page, 'bill-detail-tax-rate-column-overloaded');
  });
});
