/**
 * SOUPFIN-163 — Ledger transactions and Transaction Register: server-side
 * paging, account ledger with running balance, CSV export of every row.
 *
 * What was wrong:
 *   - Ledger Transactions asked for 100 rows with no offset and filtered on
 *     `accountId`/`startDate`/`endDate`, names the backend ignores. The account
 *     and date filters returned every row; nothing past row 100 was reachable.
 *   - The Transaction Register asked for 500 rows of each source. Row 501 and
 *     on vanished from the screen and from its CSV export.
 *   - No account ledger existed.
 *
 * The /ledgerTransaction/index.json mock below behaves like the Grails action
 * (verified on LXC): `max` defaults to 10 and is clamped to 1000, `offset`
 * pages, `ledgerAccount`/`from`/`to` filter, and every row carries the filtered
 * `totalCount`. Pages are reached by clicking the sidebar, never page.goto.
 *
 * Run: npx playwright test e2e/soupfin-163-ledger-paging.spec.ts --project=firefox
 */
import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-163';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage });
}

const ACCOUNTS = [
  { id: 'la-1000', name: 'Cash and Cash Equivalents', number: '1000', ledgerAccountCategory: { id: 'cat-ca', serialised: 'Current Assets < ASSET' } },
  { id: 'la-4000', name: 'Service Revenue', number: '4000', ledgerAccountCategory: { id: 'cat-rev', serialised: 'Revenue < INCOME' } },
  { id: 'la-5200', name: 'Rent Expense', number: '5200', ledgerAccountCategory: { id: 'cat-opex', serialised: 'Operating Expenses < EXPENSE' } },
];
const ACCOUNT_LABEL: Record<string, string> = {
  'la-1000': 'Cash and Cash Equivalents (1000)[ Current Assets < ASSET ] - GHS',
  'la-4000': 'Service Revenue (4000)[ Revenue < INCOME ] - GHS',
  'la-5200': 'Rent Expense (5200)[ Operating Expenses < EXPENSE ] - GHS',
};

type RawTx = {
  id: string;
  transactionDate: string;
  dateCreated: string;
  transactionState: 'DEBIT' | 'CREDIT';
  amount: number;
  notes: string;
  quickReference: string;
  status: string;
  ledgerAccount: { id: string; class: string; serialised: string };
};

/** Backend-shaped index rows: notes, quickReference, shallow ledgerAccount. */
function makeLedger(count: number, accountFor = (i: number) => (i % 2 === 0 ? 'la-5200' : 'la-1000')): RawTx[] {
  return Array.from({ length: count }, (_, i) => {
    const day = String((i % 28) + 1).padStart(2, '0');
    const accountId = accountFor(i);
    return {
      id: `lt-${String(i).padStart(5, '0')}`,
      transactionDate: `2026-03-${day}T00:00:00Z`,
      dateCreated: `2026-03-${day}T09:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
      transactionState: i % 2 === 0 ? 'DEBIT' : 'CREDIT',
      amount: 100 + i,
      notes: i === 0 ? 'Rent, March "HQ"' : `Posting ${i}`,
      quickReference: `QR${String(i).padStart(5, '0')}`,
      status: 'PENDING',
      ledgerAccount: { id: accountId, class: 'soupbroker.finance.LedgerAccount', serialised: ACCOUNT_LABEL[accountId] },
    };
  });
}

/** Serve /rest/ledgerTransaction/index.json like LedgerTransactionController.index and record requests. */
async function serveLedgerTransactions(page: Page, all: RawTx[]) {
  const requests: URL[] = [];
  await page.route('**/rest/ledgerTransaction/index.json*', (route: Route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const p = url.searchParams;
    const max = Math.min(Number(p.get('max')) || 10, 1000);
    const offset = Number(p.get('offset')) || 0;
    let rows = all.filter((r) =>
      (!p.get('ledgerAccount') || r.ledgerAccount.id === p.get('ledgerAccount')) &&
      (!p.get('from') || r.transactionDate.slice(0, 10) >= p.get('from')!) &&
      (!p.get('to') || r.transactionDate.slice(0, 10) <= p.get('to')!)
    );
    const dir = p.get('order') === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => (a.transactionDate + a.dateCreated).localeCompare(b.transactionDate + b.dateCreated) * dir);
    const total = rows.length;
    const body = rows.slice(offset, offset + max).map((r) => ({ ...r, totalCount: total }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return requests;
}

async function openFromMenu(page: Page, href: string, testId: string) {
  if (!/\/dashboard$/.test(page.url())) {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  }
  const aside = page.locator('aside');
  const target = aside.locator(`a[href="${href}"]`).first();
  if (!(await target.isVisible())) {
    // Child links show once the section is open: click the section (e.g. Ledger) first
    const section = `/${href.split('/')[1]}/`;
    await aside.locator(`a[href^="${section}"]`).first().click();
    await expect(target).toBeVisible();
  }
  await target.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 15_000 });
}

const last = <T,>(xs: T[]): T => xs[xs.length - 1];

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-163: ledger paging, account ledger and export', () => {
  test.skip(isLxcMode(), 'Mock-only spec: e2e/integration covers the real backend');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock below takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
    await installGuideMocks(page);
    await seedAuthenticatedSession(page);
    await page.route('**/rest/ledgerAccount/index.json*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACCOUNTS) })
    );
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('Ledger Transactions pages past page 1 on the server', async ({ page }) => {
    const all = makeLedger(120);
    const requests = await serveLedgerTransactions(page, all);
    // Newest first, the order the mock (and the backend) returns
    const newest = [...all].sort((a, b) => (b.transactionDate + b.dateCreated).localeCompare(a.transactionDate + a.dateCreated));
    await openFromMenu(page, '/ledger/transactions', 'ledger-transactions-page');

    await expect(page.getByTestId('ledger-pagination-range')).toHaveText('Rows 1–50 of 120');
    await expect(page.getByTestId('ledger-page-indicator')).toHaveText('Page 1 of 3');
    await expect(page.locator('[data-testid^="ledger-row-"]')).toHaveCount(50);
    expect(last(requests).searchParams.get('max')).toBe('50');
    expect(last(requests).searchParams.get('offset')).toBe('0');
    // Display fields come from notes and quickReference
    const top = newest[0];
    await expect(page.getByTestId(`ledger-row-${top.id}`)).toContainText(top.quickReference);
    await expect(page.getByTestId(`ledger-row-${top.id}`)).toContainText(top.notes);
    await shot(page, 'ledger-page-1');

    await page.getByTestId('ledger-pagination-next').click();
    await expect(page.getByTestId('ledger-pagination-range')).toHaveText('Rows 51–100 of 120');
    expect(last(requests).searchParams.get('offset')).toBe('50');
    await expect(page.getByTestId(`ledger-row-${newest[50].id}`)).toBeVisible();
    await expect(page.getByTestId(`ledger-row-${newest[99].id}`)).toBeVisible();
    await expect(page.getByTestId(`ledger-row-${top.id}`)).toHaveCount(0);
    await shot(page, 'ledger-page-2');

    await page.getByTestId('ledger-pagination-next').click();
    await expect(page.getByTestId('ledger-pagination-range')).toHaveText('Rows 101–120 of 120');
    await expect(page.getByTestId('ledger-page-indicator')).toHaveText('Page 3 of 3');
    await expect(page.getByTestId('ledger-pagination-next')).toBeDisabled();
    await expect(page.locator('[data-testid^="ledger-row-"]')).toHaveCount(20);
    await shot(page, 'ledger-page-3-last');

    // The account filter goes to the server as ledgerAccount and returns to page 1
    await page.getByTestId('account-filter').selectOption('la-1000');
    await expect(page.getByTestId('ledger-pagination-range')).toHaveText('Rows 1–50 of 60');
    const filtered = last(requests).searchParams;
    expect(filtered.get('ledgerAccount')).toBe('la-1000');
    expect(filtered.get('offset')).toBe('0');
    expect(filtered.has('accountId')).toBe(false);
    await shot(page, 'ledger-filtered-by-account');
  });

  test('Ledger Transactions exports every filtered row, not just the page on screen', async ({ page }) => {
    const requests = await serveLedgerTransactions(page, makeLedger(2300));
    await openFromMenu(page, '/ledger/transactions', 'ledger-transactions-page');
    await expect(page.getByTestId('ledger-pagination-range')).toHaveText('Rows 1–50 of 2,300');
    await shot(page, 'export-before');

    const download = page.waitForEvent('download');
    await page.getByTestId('ledger-export-button').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^ledger-transactions-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync(await file.path(), 'utf8').split('\n');

    expect(csv[0]).toBe('Date,Reference,Account #,Account Name,Description,Debit,Credit,Status');
    expect(csv).toHaveLength(2301);
    expect(csv.join('\n')).toContain('"Rent, March ""HQ"""');
    // Walked three server pages of 1000
    const exportOffsets = requests.filter((u) => u.searchParams.get('max') === '1000').map((u) => u.searchParams.get('offset'));
    expect(exportOffsets).toEqual(['0', '1000', '2000']);
    await expect(page.getByText('Exported 2,300 transaction(s) to CSV.')).toBeVisible();
    await shot(page, 'export-done-toast');
  });

  test('Chart of Accounts opens an account ledger with opening, running and closing balances', async ({ page }) => {
    // Rent Expense: 60 debits of 100, 102, 104 … in March, plus 2,500 of debits
    // and 500 of credits before the period → opening 2,000.00
    const ledger = makeLedger(120);
    await serveLedgerTransactions(page, ledger);
    const balanceRequests: URL[] = [];
    await page.route('**/rest/ledgerAccount/show/*.json*', (route) => {
      const id = route.request().url().match(/ledgerAccount\/show\/([^.]+)\.json/)?.[1];
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACCOUNTS.find((a) => a.id === id)) });
    });
    await page.route('**/rest/ledgerAccount/balance/*.json*', (route) => {
      balanceRequests.push(new URL(route.request().url()));
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ debit: 2500, credit: 500, endingBalance: 0 }) });
    });

    await openFromMenu(page, '/ledger/accounts', 'chart-of-accounts-page');
    await shot(page, 'coa-account-links');
    await page.getByTestId('coa-ledger-link-la-5200').click();
    await expect(page).toHaveURL(/\/ledger\/accounts\/la-5200$/);
    await expect(page.getByTestId('account-ledger-page')).toBeVisible();
    await expect(page.getByTestId('account-ledger-heading')).toHaveText('5200 · Rent Expense');

    // From = 1 January this year; March 2026 is inside it only while it is 2026,
    // so set the period explicitly to keep the test date-proof.
    await page.getByTestId('account-ledger-start-date').fill('2026-03-01');
    await page.getByTestId('account-ledger-end-date').fill('2026-03-31');
    await expect(page.getByTestId('account-ledger-period')).toHaveText('2026-03-01 to 2026-03-31');

    await expect(page.getByTestId('account-ledger-opening')).toContainText('2,000.00');
    expect(last(balanceRequests).searchParams.get('from')).toBe('1900-01-01');
    expect(last(balanceRequests).searchParams.get('to')).toBe('2026-02-28');

    // Rent lines are the even postings: amounts 100, 102, … 218 (60 lines, 9,540.00)
    const rent = ledger.filter((r) => r.ledgerAccount.id === 'la-5200');
    const sum = rent.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(9540);
    await expect(page.getByTestId('account-ledger-total-debit')).toContainText('9,540.00');
    await expect(page.getByTestId('account-ledger-total-credit')).toContainText('0.00');
    await expect(page.getByTestId('account-ledger-closing')).toContainText('11,540.00');

    // First line by date: 1 March, lt-00000 (100.00) → 2,100.00
    await expect(page.getByTestId('account-ledger-balance-lt-00000')).toContainText('2,100.00');
    await shot(page, 'account-ledger-page-1');

    await page.getByTestId('account-ledger-next').click();
    await expect(page.getByTestId('account-ledger-brought-forward')).toContainText('Balance brought forward');
    await shot(page, 'account-ledger-page-2');
  });

  test('a ledger row links to its account ledger', async ({ page }) => {
    await serveLedgerTransactions(page, makeLedger(10));
    await page.route('**/rest/ledgerAccount/show/*.json*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACCOUNTS[0]) })
    );
    await page.route('**/rest/ledgerAccount/balance/*.json*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ debit: 0, credit: 0 }) })
    );
    await openFromMenu(page, '/ledger/transactions', 'ledger-transactions-page');
    await page.getByTestId('ledger-account-link-lt-00001').click();
    await expect(page).toHaveURL(/\/ledger\/accounts\/la-1000$/);
    await expect(page.getByTestId('account-ledger-heading')).toHaveText('1000 · Cash and Cash Equivalents');
    await shot(page, 'account-ledger-from-row');
  });

  test('Transaction Register shows and exports rows past the old 500 cap', async ({ page }) => {
    // 1,300 payment vouchers → 2,600 register lines, over two server pages
    const vouchers = Array.from({ length: 1300 }, (_, i) => ({
      id: `pv-${String(i).padStart(5, '0')}`,
      voucherType: 'PAYMENT',
      voucherNumber: `PV-${String(i).padStart(5, '0')}`,
      voucherDate: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      description: `Supplier payment ${i}`,
      amount: 50,
      status: 'POSTED',
      cashAccount: { id: 'la-1000', code: '1000', name: 'Cash' },
      expenseAccount: { id: 'la-5200', code: '5200', name: 'Rent Expense' },
    }));
    const voucherRequests: URL[] = [];
    await page.route('**/rest/voucher/index.json*', (route) => {
      const url = new URL(route.request().url());
      voucherRequests.push(url);
      const max = Math.min(Number(url.searchParams.get('max')) || 10, 1000);
      const offset = Number(url.searchParams.get('offset')) || 0;
      const body = vouchers.slice(offset, offset + max).map((v) => ({ ...v, totalCount: vouchers.length }));
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/rest/ledgerTransactionGroup/index.json*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );

    await openFromMenu(page, '/accounting/transactions', 'transaction-register-page');
    await expect(page.getByTestId('pagination')).toContainText('of 2600 results');
    expect(voucherRequests.map((u) => u.searchParams.get('offset'))).toEqual(['0', '1000']);
    await expect(page.getByTestId('register-truncated')).toHaveCount(0);
    await shot(page, 'register-2600-rows');

    const download = page.waitForEvent('download');
    await page.getByTestId('export-button').click();
    const csv = readFileSync(await (await download).path(), 'utf8').split('\n');
    expect(csv).toHaveLength(2601);
    expect(csv.join('\n')).toContain('PV-01299');
    await expect(page.getByText('Exported 2600 transaction(s) to CSV.')).toBeVisible();
    await shot(page, 'register-export-done');
  });
});
