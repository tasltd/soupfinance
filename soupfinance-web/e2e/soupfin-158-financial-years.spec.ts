/**
 * SOUPFIN-158: financial years, year-end close, the lock date and opening balances.
 *
 * Mock-only. The close, reopen, checklist, lock-date and opening-balance
 * endpoints are specified in plans/soupfin-158-period-end-backend.md and do not
 * exist on the backend yet, so the LXC backend cannot run this. The mock below
 * is stateful and follows that contract: closing a year moves the lock date to
 * its last day, and a journal entry dated on or before the lock date gets
 * 422 PERIOD_LOCKED. Each test reads the mock's state before and after the UI
 * action, not just what the page shows.
 *
 * Navigation is by sidebar and tab clicks, never page.goto on a target route.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, ledgerAccounts, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-158';
// Added: the guide images, re-captured from this spec (see public/user-guide).
const GUIDE_DIR = 'public/user-guide/images';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

async function shot(page: Page, name: string, guideName?: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  // Sticky header and sidebar draw mid-page in a full-page capture taken while scrolled.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
  if (guideName) await page.screenshot({ path: `${GUIDE_DIR}/${guideName}.jpg`, quality: 85, fullPage: true });
}

interface MockYear {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
  status: 'OPEN' | 'CLOSED';
  closedAt?: string;
  closedBy?: string;
}

interface Backend {
  years: MockYear[];
  lockDate: string | null;
  pendingEntries: number;
  journalEntries: Array<Record<string, unknown>>;
  openingBalances: Array<{ ledgerAccount: { id: string }; debit: number; credit: number }>;
  calls: string[];
}

const CHART = [
  ...ledgerAccounts,
  { id: 'acc-3200', code: '3200', name: 'Opening Balance Equity', ledgerGroup: 'EQUITY', balance: 0, archived: false },
];

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** The SOUPFIN-158 backend contract, held in memory. */
async function installFinancialYearBackend(page: Page, backend: Backend) {
  await page.route('**/rest/ledgerAccount/index.json*', (route) => json(route, 200, CHART));

  await page.route('**/rest/financialYear/index.json*', (route) => json(route, 200, backend.years));
  await page.route('**/rest/financialYear/create.json*', (route) =>
    json(route, 200, { SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/financialYear/save' })
  );
  await page.route('**/rest/financialYear/save.json*', (route) => {
    const body = route.request().postDataJSON() as MockYear;
    const year: MockYear = { ...body, id: `fy-${body.fromDate.slice(0, 4)}`, status: 'OPEN' };
    backend.years = [year, ...backend.years];
    backend.calls.push(`save ${year.name}`);
    return json(route, 201, year);
  });
  await page.route('**/rest/financialYear/closeChecklist/*.json*', (route) =>
    json(route, 200, {
      pendingEntries: backend.pendingEntries,
      trialBalance: { totalDebit: 153500, totalCredit: 153500, balanced: true },
      netIncome: 41200,
      retainedEarningsAccount: { id: 'acc-3100', name: 'Retained Earnings' },
    })
  );
  await page.route('**/rest/financialYear/close/*.json*', (route) => {
    const id = route.request().url().match(/close\/([^/.]+)\.json/)![1];
    const year = backend.years.find((y) => y.id === id)!;
    year.status = 'CLOSED';
    year.closedAt = '2026-01-20';
    year.closedBy = 'ama.mensah';
    backend.lockDate = !backend.lockDate || year.toDate > backend.lockDate ? year.toDate : backend.lockDate;
    backend.calls.push(`close ${year.name}`);
    return json(route, 200, year);
  });
  await page.route('**/rest/financialYear/reopen/*.json*', (route) => {
    const id = route.request().url().match(/reopen\/([^/.]+)\.json/)![1];
    const year = backend.years.find((y) => y.id === id)!;
    year.status = 'OPEN';
    delete year.closedAt;
    delete year.closedBy;
    const stillClosed = backend.years.filter((y) => y.status === 'CLOSED').map((y) => y.toDate).sort();
    backend.lockDate = stillClosed.length ? stillClosed[stillClosed.length - 1] : null;
    backend.calls.push(`reopen ${year.name}`);
    return json(route, 200, year);
  });
  await page.route('**/rest/financialYear/lockDate.json*', (route) => {
    if (route.request().method() === 'PUT') {
      backend.lockDate = (route.request().postDataJSON() as { lockDate: string | null }).lockDate;
      backend.calls.push(`lockDate ${backend.lockDate}`);
    }
    return json(route, 200, { lockDate: backend.lockDate });
  });
  await page.route('**/rest/financialYear/openingBalances.json*', (route) => {
    const body = route.request().postDataJSON() as { asOfDate: string; lines: Backend['openingBalances'] };
    backend.openingBalances = body.lines;
    backend.calls.push(`openingBalances ${body.asOfDate} x${body.lines.length}`);
    const total = (side: 'debit' | 'credit') => body.lines.reduce((sum, l) => sum + l[side], 0);
    return json(route, 201, {
      asOfDate: body.asOfDate, lineCount: body.lines.length, totalDebit: total('debit'), totalCredit: total('credit'),
    });
  });

  // Journal entries: the lock date applies (plan §3).
  await page.route('**/rest/ledgerTransaction/create.json*', (route) =>
    json(route, 200, { SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/ledgerTransaction/save' })
  );
  await page.route('**/rest/ledgerTransaction/saveMultiple.json*', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const date = String(body.groupDate ?? body.transactionDate ?? '').slice(0, 10);
    if (backend.lockDate && date && date <= backend.lockDate) {
      backend.calls.push(`journal refused ${date}`);
      return json(route, 422, {
        code: 'PERIOD_LOCKED',
        lockDate: backend.lockDate,
        field: 'groupDate',
      });
    }
    backend.journalEntries.push(body);
    backend.calls.push(`journal saved ${date}`);
    return json(route, 201, { id: `jg-${backend.journalEntries.length}`, groupDate: date, status: 'DRAFT', ledgerTransactionList: [] });
  });
}

function freshBackend(): Backend {
  return {
    years: [
      { id: 'fy-2025', name: 'FY 2025', fromDate: '2025-01-01', toDate: '2025-12-31', status: 'OPEN' },
      { id: 'fy-2024', name: 'FY 2024', fromDate: '2024-01-01', toDate: '2024-12-31', status: 'CLOSED', closedAt: '2025-01-18', closedBy: 'ama.mensah' },
    ],
    lockDate: '2024-12-31',
    pendingEntries: 0,
    journalEntries: [],
    openingBalances: [],
    calls: [],
  };
}

async function openFinancialYears(page: Page, backend: Backend) {
  await installGuideMocks(page);
  await installFinancialYearBackend(page, backend);
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });

  await page.locator('aside').getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/users$/);
  await page.locator('aside').getByRole('link', { name: 'Financial Years', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/financial-years$/);
  await expect(page.getByTestId('financial-years-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('financial-year-row-fy-2025')).toBeVisible();
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-158: financial years and period close', () => {
  test.skip(isLxcMode(), 'Mock-only: the period-end endpoints are not on the backend yet');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('closing FY 2025 locks it: a journal entry dated in it is refused, one after it saves', async ({ page }) => {
    const backend = freshBackend();
    await openFinancialYears(page, backend);
    await expect(page.getByTestId('financial-year-status-fy-2025')).toContainText('Open');
    await expect(page.getByTestId('lock-date-current')).toContainText('December 31, 2024');
    await shot(page, '01-financial-years-list', 'financial-years');

    // Close FY 2025 through the checklist
    await page.getByTestId('close-year-button-fy-2025').click();
    const dialog = page.getByTestId('close-year-dialog');
    await expect(dialog.getByTestId('check-pending-entries')).toHaveAttribute('data-ok', 'true');
    await expect(dialog.getByTestId('check-trial-balance')).toContainText('Trial balance balances');
    await expect(dialog.getByTestId('check-retained-earnings')).toContainText('goes to Retained Earnings');
    await shot(page, '02-close-checklist', 'financial-years-close');

    expect(backend.years.find((y) => y.id === 'fy-2025')!.status).toBe('OPEN');
    await dialog.getByTestId('close-year-confirm').click();
    await expect(page.getByTestId('financial-years-notice')).toContainText('FY 2025 is closed');
    await expect(page.getByTestId('financial-year-status-fy-2025')).toContainText('Closed');
    await expect(page.getByTestId('lock-date-current')).toContainText('December 31, 2025');
    expect(backend.years.find((y) => y.id === 'fy-2025')!.status).toBe('CLOSED');
    expect(backend.lockDate).toBe('2025-12-31');
    await shot(page, '03-year-closed');

    // A journal entry dated inside the closed year
    await page.locator('aside').getByRole('link', { name: 'Accounting', exact: true }).click();
    await page.locator('aside').getByRole('link', { name: 'Journal Entry', exact: true }).click();
    await expect(page.getByTestId('journal-entry-page')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('journal-entry-date-input').fill('2025-11-30');
    await page.getByTestId('journal-entry-description-input').fill('November office costs');
    await page.getByTestId('journal-entry-line-0-account').selectOption('acc-5000');
    await page.getByTestId('journal-entry-line-0-debit').fill('350');
    await page.getByTestId('journal-entry-line-1-account').selectOption('acc-1000');
    await page.getByTestId('journal-entry-line-1-credit').fill('350');
    await page.getByTestId('journal-entry-save-draft-button').click();

    const lockMessage = page.getByText('The books are closed up to December 31, 2025. Choose a date after that day.');
    await expect(lockMessage).toBeVisible();
    await expect(page.getByTestId('journal-entry-error')).toHaveCount(0);
    await expect(page).toHaveURL(/\/accounting\/journal-entry$/);
    expect(backend.journalEntries).toHaveLength(0);
    expect(backend.calls).toContain('journal refused 2025-11-30');
    await shot(page, '04-journal-entry-refused-locked-date', 'journal-entry-locked-date');

    // The same entry dated in the open year saves
    await page.getByTestId('journal-entry-date-input').fill('2026-01-15');
    await page.getByTestId('journal-entry-save-draft-button').click();
    await expect(page).toHaveURL(/\/accounting\/transactions$/, { timeout: 15_000 });
    expect(backend.journalEntries).toHaveLength(1);
    expect(backend.calls).toContain('journal saved 2026-01-15');
    await shot(page, '05-journal-entry-saved-after-lock');
  });

  test('the checklist blocks closing while entries are pending', async ({ page }) => {
    const backend = freshBackend();
    backend.pendingEntries = 4;
    await openFinancialYears(page, backend);
    await page.getByTestId('close-year-button-fy-2025').click();
    const pending = page.getByTestId('check-pending-entries');
    await expect(pending).toHaveAttribute('data-ok', 'false');
    await expect(pending).toContainText('4 pending entries');
    await expect(page.getByTestId('close-year-confirm')).toBeDisabled();
    await shot(page, '06-close-blocked-pending-entries');
    expect(backend.calls.filter((c) => c.startsWith('close'))).toHaveLength(0);
  });

  test('an administrator creates the next year, reopens a closed one and moves the lock date', async ({ page }) => {
    const backend = freshBackend();
    await openFinancialYears(page, backend);

    await page.getByTestId('new-financial-year-button').click();
    await expect(page.getByTestId('financial-year-name-input')).toHaveValue('FY 2026');
    await expect(page.getByTestId('financial-year-from-input')).toHaveValue('2026-01-01');
    await expect(page.getByTestId('financial-year-to-input')).toHaveValue('2026-12-31');
    await shot(page, '07-new-year-form');
    expect(backend.years).toHaveLength(2);
    await page.getByTestId('financial-year-submit').click();
    await expect(page.getByTestId('financial-year-row-fy-2026')).toBeVisible();
    expect(backend.years.map((y) => y.name)).toEqual(['FY 2026', 'FY 2025', 'FY 2024']);

    // Reopen FY 2024
    await page.getByTestId('reopen-year-button-fy-2024').click();
    await page.getByTestId('reopen-year-confirm').click();
    await expect(page.getByTestId('financial-years-notice')).toContainText('FY 2024 is open again');
    await expect(page.getByTestId('financial-year-status-fy-2024')).toContainText('Open');
    await expect(page.getByTestId('lock-date-current')).toContainText('No lock date is set');
    expect(backend.lockDate).toBeNull();

    // Set a lock date by hand
    await page.getByTestId('lock-date-input').fill('2024-06-30');
    await page.getByTestId('lock-date-save').click();
    await expect(page.getByTestId('lock-date-saved')).toBeVisible();
    await expect(page.getByTestId('lock-date-current')).toContainText('June 30, 2024');
    expect(backend.lockDate).toBe('2024-06-30');
    await shot(page, '08-reopened-and-lock-date-set');
  });

  test('opening balances must balance, then post and show on the trial balance', async ({ page }) => {
    const backend = freshBackend();
    await openFinancialYears(page, backend);
    // The trial balance reads whatever was posted as opening balances.
    await page.route('**/rest/financeReports/trialBalance*', (route) => {
      const byId = new Map(CHART.map((a) => [a.id, a]));
      const groups: Record<string, { accountList: unknown[] }> = {};
      for (const line of backend.openingBalances) {
        const account = byId.get(line.ledgerAccount.id)!;
        (groups[account.ledgerGroup] ??= { accountList: [] }).accountList.push({
          id: account.id, name: account.name, currency: 'GHS', endingDebit: line.debit, endingCredit: line.credit,
        });
      }
      const sum = (side: 'debit' | 'credit') => backend.openingBalances.reduce((s, l) => s + l[side], 0);
      return json(route, 200, { resultList: groups, totalDebit: sum('debit'), totalCredit: sum('credit') });
    });

    await page.getByTestId('opening-balances-link').click();
    await expect(page).toHaveURL(/\/settings\/financial-years\/opening-balances$/);
    await expect(page.getByTestId('opening-balances-grid')).toBeVisible({ timeout: 15_000 });
    // The day before the earliest year, FY 2024
    await expect(page.getByTestId('opening-balances-date-input')).toHaveValue('2023-12-31');

    await page.getByTestId('opening-balance-debit-acc-1000').fill('60,000');
    await page.getByTestId('opening-balance-debit-acc-1200').fill('25000');
    await page.getByTestId('opening-balance-credit-acc-2000').fill('7,500');
    await page.getByTestId('opening-balance-credit-acc-3000').fill('50000');
    await expect(page.getByTestId('opening-balances-balance-status')).toContainText('Out of balance by');
    await expect(page.getByTestId('opening-balances-balance-status')).toContainText('27,500.00');
    await expect(page.getByTestId('opening-balances-submit')).toBeDisabled();
    await shot(page, '09-opening-balances-out-of-balance', 'opening-balances');

    await page.getByTestId('opening-balances-plug-button').click();
    await expect(page.getByTestId('opening-balance-credit-acc-3200')).toHaveValue('27500.00');
    await expect(page.getByTestId('opening-balances-balance-status')).toContainText('Debits equal credits');
    await expect(page.getByTestId('opening-balances-submit')).toBeEnabled();
    expect(backend.openingBalances).toHaveLength(0);
    await page.getByTestId('opening-balances-submit').click();

    await expect(page.getByTestId('opening-balances-success')).toContainText('Posted 5 opening balances as of December 31, 2023');
    expect(backend.openingBalances).toEqual([
      { ledgerAccount: { id: 'acc-1000' }, debit: 60000, credit: 0 },
      { ledgerAccount: { id: 'acc-1200' }, debit: 25000, credit: 0 },
      { ledgerAccount: { id: 'acc-2000' }, debit: 0, credit: 7500 },
      { ledgerAccount: { id: 'acc-3000' }, debit: 0, credit: 50000 },
      { ledgerAccount: { id: 'acc-3200' }, debit: 0, credit: 27500 },
    ]);
    await shot(page, '10-opening-balances-posted');

    await page.getByTestId('opening-balances-trial-balance-link').click();
    await expect(page).toHaveURL(/\/reports\/trial-balance$/);
    await expect(page.getByText('Opening Balance Equity').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Office Equipment').first()).toBeVisible();
    await shot(page, '11-trial-balance-shows-opening-balances');
  });
});
