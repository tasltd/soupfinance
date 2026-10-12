/**
 * SOUPFIN-159: audit trail — the History panel on journal entries and
 * vouchers, and the /reports/audit-trail report.
 *
 * Mock-only. /rest/ledgerTransactionGroup/post and /reverse do not exist on the
 * backend yet (SOUPFIN-155), so a journal entry cannot be posted and reversed
 * against the LXC. The mock below is stateful:
 *
 * - post and reverse change the entry's status and append the audit rows the
 *   audit-logging plugin writes for that save: one row per changed property,
 *   stamped with the acting user and the request path;
 * - /rest/auditTrail/index.json follows the loosest contract a build may have:
 *   each word of `search` must match some column, `from`/`to` bound
 *   dateCreated, and the exact filters (className, persistedObjectId, actor)
 *   are ignored. The LXC build of 2026-10-12 applies className and
 *   persistedObjectId exactly; the page must be right on either.
 *
 * The real-backend half (a journal entry created on the LXC shows "Created by
 * soup.support") is e2e/integration/soupfin-159-audit-trail.integration.spec.ts.
 *
 * Navigation is by sidebar and menu clicks, never page.goto on a target route.
 */
import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Route } from '@playwright/test';
import { guideUser, installGuideMocks, ledgerAccounts, seedAuthenticatedSession } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-159';
const GUIDE_DIR = 'public/user-guide/images';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

async function shot(page: Page, name: string, guideName?: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
  if (guideName) await page.screenshot({ path: `${GUIDE_DIR}/${guideName}.jpg`, quality: 85, fullPage: true });
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

interface AuditRow {
  id: number;
  actor: string;
  uri: string;
  className: string;
  persistedObjectId: string;
  eventName: 'INSERT' | 'UPDATE' | 'DELETE';
  propertyName: string;
  oldValue?: string;
  newValue?: string;
  dateCreated: string;
  tenantId: string;
}

interface Backend {
  group: Record<string, unknown> & { id: string; status: string };
  voucher: Record<string, unknown> & { id: string; status: string };
  audit: AuditRow[];
  /** Mock clock: each save is one minute after the last, so order is deterministic. */
  clock: number;
  calls: string[];
  auditQueries: URLSearchParams[];
}

const COLLEAGUE = 'kofi.boateng';
const JE = 'soupbroker.finance.LedgerTransactionGroup';
const VOUCHER = 'soupbroker.finance.Voucher';

/** Grails renders dateCreated without milliseconds. */
const stamp = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The rows one save writes: one per property, plus the plugin's noise. */
function save(
  backend: Backend,
  actor: string,
  uri: string,
  className: string,
  id: string,
  eventName: AuditRow['eventName'],
  changes: Record<string, [string | undefined, string | undefined]>
) {
  backend.clock += 60_000;
  const dateCreated = stamp(backend.clock);
  const props = { ...changes, serialised: ['before', 'after'] as [string, string], tenantId: [undefined, guideUser.tenantId] as [undefined, string] };
  for (const [propertyName, [oldValue, newValue]] of Object.entries(props)) {
    backend.audit.push({
      id: backend.audit.length + 1,
      actor, uri, className, persistedObjectId: id, eventName, propertyName,
      ...(oldValue !== undefined && { oldValue }),
      ...(newValue !== undefined && { newValue }),
      dateCreated,
      tenantId: guideUser.tenantId,
    });
  }
}

function freshBackend(): Backend {
  const backend: Backend = {
    group: {
      id: 'je-rent',
      groupDate: '2026-10-01',
      transactionDate: '2026-10-01',
      description: 'October office rent',
      reference: 'JE-2026-0042',
      status: 'DRAFT',
      posted: false,
      totalAmount: 4500,
      ledgerTransactionList: [
        { id: 'line-rent-1', ledgerAccount: { id: ledgerAccounts[0].id, name: ledgerAccounts[0].name }, amount: 4500, transactionState: 'DEBIT', description: 'October office rent', transactionDate: '2026-10-01' },
        { id: 'line-rent-2', ledgerAccount: { id: ledgerAccounts[1].id, name: ledgerAccounts[1].name }, amount: 4500, transactionState: 'CREDIT', description: 'October office rent', transactionDate: '2026-10-01' },
      ],
    },
    voucher: {
      id: 'pv-genset',
      voucherNumber: 'PV-2026-011',
      voucherType: 'PAYMENT',
      voucherTo: 'VENDOR',
      voucherDate: '2026-10-03',
      transactionDate: '2026-10-03',
      amount: 1250,
      currency: 'GHS',
      beneficiaryName: 'Volta Power Services',
      description: 'Generator service, October',
      status: 'POSTED',
      // The register lists a voucher only through its accounts.
      cashAccount: { id: ledgerAccounts[0].id, code: ledgerAccounts[0].code, name: ledgerAccounts[0].name },
      expenseAccount: { id: ledgerAccounts[1].id, code: ledgerAccounts[1].code, name: ledgerAccounts[1].name },
      ledgerTransaction: { id: 'line-genset' },
    },
    audit: [],
    clock: Date.now() - 2 * 24 * 60 * 60 * 1000,
    calls: [],
    auditQueries: [],
  };
  save(backend, COLLEAGUE, '/rest/ledgerTransaction/saveMultiple', JE, 'je-rent', 'INSERT', {
    description: [undefined, 'October office rent'],
    reference: [undefined, 'JE-2026-0042'],
    totalDebit: [undefined, '4500'],
    totalCredit: [undefined, '4500'],
  });
  save(backend, COLLEAGUE, '/rest/voucher', VOUCHER, 'pv-genset', 'INSERT', {
    voucherType: [undefined, 'PAYMENT'],
    amount: [undefined, '1250'],
    beneficiaryName: [undefined, 'Volta Power Services'],
  });
  save(backend, COLLEAGUE, '/rest/voucher/post/pv-genset.json', VOUCHER, 'pv-genset', 'UPDATE', {
    status: ['PENDING', 'POSTED'],
  });
  return backend;
}

/** AuditTrailController.index as it behaves today. */
function auditIndex(backend: Backend, url: URL) {
  const params = url.searchParams;
  backend.auditQueries.push(params);
  const words = (params.get('search') ?? '').split(/\s+/).filter(Boolean).map((w) => w.toLowerCase());
  const from = params.get('from');
  const to = params.get('to');
  const max = Number(params.get('max') ?? 10);
  const columns: Array<keyof AuditRow> = ['actor', 'uri', 'className', 'persistedObjectId', 'eventName', 'propertyName', 'oldValue', 'newValue'];
  return backend.audit
    .filter((row) => words.every((w) => columns.some((c) => String(row[c] ?? '').toLowerCase().includes(w))))
    .filter((row) => !from || row.dateCreated.slice(0, 10) >= from)
    .filter((row) => !to || row.dateCreated.slice(0, 10) <= to)
    .sort((a, b) => (a.dateCreated < b.dateCreated ? 1 : a.dateCreated > b.dateCreated ? -1 : b.id - a.id))
    .slice(0, max);
}

async function installAuditBackend(page: Page, backend: Backend) {
  await page.route('**/rest/ledgerTransactionGroup/index.json*', (route) => json(route, 200, [backend.group]));
  await page.route('**/rest/ledgerTransactionGroup/show/*.json*', (route) => json(route, 200, backend.group));
  await page.route('**/rest/voucher/index.json*', (route) => json(route, 200, [backend.voucher]));
  await page.route('**/rest/voucher/show/*.json*', (route) => json(route, 200, backend.voucher));

  // SOUPFIN-155 contract: post and reverse a journal entry
  await page.route('**/rest/ledgerTransactionGroup/post/*.json*', (route) => {
    const from = backend.group.status;
    backend.group = { ...backend.group, status: 'POSTED', posted: true };
    save(backend, guideUser.username, `/rest/ledgerTransactionGroup/post/${backend.group.id}.json`, JE, backend.group.id, 'UPDATE', {
      status: [from, 'POSTED'],
      posted: ['false', 'true'],
    });
    backend.calls.push('post je-rent');
    return json(route, 200, backend.group);
  });
  await page.route('**/rest/ledgerTransactionGroup/reverse/*.json*', (route) => {
    backend.group = { ...backend.group, status: 'REVERSED' };
    save(backend, guideUser.username, `/rest/ledgerTransactionGroup/reverse/${backend.group.id}.json`, JE, backend.group.id, 'UPDATE', {
      status: ['POSTED', 'REVERSED'],
    });
    backend.calls.push('reverse je-rent');
    return json(route, 200, backend.group);
  });

  await page.route('**/rest/auditTrail/index.json*', (route) =>
    json(route, 200, auditIndex(backend, new URL(route.request().url())))
  );
}

async function signIn(page: Page, backend: Backend) {
  await installGuideMocks(page);
  await installAuditBackend(page, backend);
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
}

async function openRegister(page: Page) {
  await page.locator('aside').getByRole('link', { name: 'Accounting', exact: true }).click();
  await page.locator('aside').getByRole('link', { name: 'Transaction Register', exact: true }).click();
  await expect(page).toHaveURL(/\/accounting\/transactions$/);
  await expect(page.getByTestId('transaction-table')).toBeVisible({ timeout: 15_000 });
}

async function rowAction(page: Page, rowId: string, action: 'View' | 'Post' | 'Reverse') {
  await page.getByTestId(`transaction-actions-${rowId}`).click();
  await page.getByTestId(`transaction-dropdown-${rowId}`).getByRole('button', { name: action }).click();
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-159: audit trail', () => {
  test.skip(isLxcMode(), 'Mock-only: journal entry post and reverse are not on the backend yet (SOUPFIN-155)');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('posting then reversing a journal entry shows both events with the acting user', async ({ page }) => {
    const backend = freshBackend();
    await signIn(page, backend);
    await openRegister(page);
    await expect(page.getByTestId('transaction-status-je-rent-0')).toContainText(/draft/i);
    await shot(page, '01-register-draft-entry');

    // Post
    await rowAction(page, 'je-rent-0', 'Post');
    await expect(page.getByText('Transaction JE-2026-0042 posted.')).toBeVisible();
    await expect(page.getByTestId('transaction-status-je-rent-0')).toContainText(/posted/i);
    expect(backend.group.status).toBe('POSTED');

    // Reverse
    await rowAction(page, 'je-rent-0', 'Reverse');
    await expect(page.getByText('Transaction JE-2026-0042 reversed.')).toBeVisible();
    await expect(page.getByTestId('transaction-status-je-rent-0')).toContainText(/reversed/i);
    expect(backend.group.status).toBe('REVERSED');
    expect(backend.calls).toEqual(['post je-rent', 'reverse je-rent']);
    await shot(page, '02-register-entry-reversed');

    // The entry's History panel
    await rowAction(page, 'je-rent-0', 'View');
    await expect(page).toHaveURL(/\/accounting\/journal-entry\/je-rent$/);
    const history = page.getByTestId('journal-entry-history');
    await expect(history.getByTestId('journal-entry-history-list')).toBeVisible({ timeout: 15_000 });
    const events = history.locator('[data-testid^="journal-entry-history-event-"][data-action]');
    await expect(events).toHaveCount(3);
    await expect(events.nth(0)).toHaveAttribute('data-action', 'REVERSED');
    await expect(events.nth(0)).toContainText(`Reversed by ${guideUser.username}`);
    await expect(events.nth(1)).toHaveAttribute('data-action', 'POSTED');
    await expect(events.nth(1)).toContainText(`Posted by ${guideUser.username}`);
    await expect(events.nth(2)).toHaveAttribute('data-action', 'CREATED');
    await expect(events.nth(2)).toContainText(`Created by ${COLLEAGUE}`);

    // The panel asked for the entry and both of its lines
    const askedFor = backend.auditQueries.map((q) => q.get('persistedObjectId'));
    expect(askedFor).toEqual(expect.arrayContaining(['je-rent', 'line-rent-1', 'line-rent-2']));

    await history.getByTestId('journal-entry-history-event-0-toggle').click();
    await expect(history.getByTestId('journal-entry-history-event-0-changes')).toContainText('POSTED');
    await expect(history.getByTestId('journal-entry-history-event-0-changes')).toContainText('REVERSED');
    // The post and reverse toasts would cover the lines in the guide image.
    await expect(page.getByText('Transaction JE-2026-0042 reversed.')).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText('Transaction JE-2026-0042 posted.')).toBeHidden({ timeout: 15_000 });
    await shot(page, '03-journal-entry-history', 'journal-entry-history');
  });

  test('a voucher opened from the register shows who created and posted it', async ({ page }) => {
    const backend = freshBackend();
    await signIn(page, backend);
    await openRegister(page);

    await rowAction(page, 'pv-genset-cash', 'View');
    await expect(page).toHaveURL(/\/accounting\/vouchers\/pv-genset$/);

    const history = page.getByTestId('voucher-history');
    await expect(history.getByTestId('voucher-history-list')).toBeVisible({ timeout: 15_000 });
    const events = history.locator('[data-testid^="voucher-history-event-"][data-action]');
    await expect(events).toHaveCount(2);
    await expect(events.nth(0)).toContainText(`Posted by ${COLLEAGUE}`);
    await expect(events.nth(1)).toContainText(`Created by ${COLLEAGUE}`);
    // The panel asked for the voucher and its ledger transaction
    const askedFor = backend.auditQueries.map((q) => q.get('persistedObjectId'));
    expect(askedFor).toEqual(expect.arrayContaining(['pv-genset', 'line-genset']));
    await shot(page, '04-voucher-history');
  });

  test('the Audit Trail report filters by event, opens a change, and exports CSV', async ({ page }) => {
    const backend = freshBackend();
    // The entry was posted and reversed by the signed-in user before the report is opened.
    save(backend, guideUser.username, '/rest/ledgerTransactionGroup/post/je-rent.json', JE, 'je-rent', 'UPDATE', { status: ['DRAFT', 'POSTED'] });
    save(backend, guideUser.username, '/rest/ledgerTransactionGroup/reverse/je-rent.json', JE, 'je-rent', 'UPDATE', { status: ['POSTED', 'REVERSED'] });
    await signIn(page, backend);

    await page.locator('aside').getByRole('link', { name: 'Reports', exact: true }).click();
    await page.locator('aside').getByRole('link', { name: 'Audit Trail', exact: true }).click();
    await expect(page).toHaveURL(/\/reports\/audit-trail$/);
    await expect(page.getByTestId('audit-trail-page')).toBeVisible();

    const rows = page.getByTestId('audit-trail-table').locator('tr[data-action]');
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId('audit-trail-total')).toHaveText('5');
    await expect(page.getByTestId('audit-trail-users')).toHaveText('2');
    // The request covered the default 30 days
    const first = backend.auditQueries[0];
    expect(first.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first.get('max')).toBe('1000');
    await shot(page, '05-audit-trail-all');

    // Only reversals
    await page.getByTestId('audit-filter-event').selectOption('REVERSED');
    await page.getByTestId('audit-filter-apply').click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-entity-id', 'je-rent');
    await expect(rows.first()).toHaveAttribute('data-actor', guideUser.username);
    await rows.first().getByRole('button', { name: 'Show changes' }).click();
    await expect(page.getByTestId('audit-row-changes-0')).toContainText('POSTED');
    await expect(page.getByTestId('audit-row-changes-0')).toContainText('REVERSED');
    await shot(page, '06-audit-trail-reversal-opened', 'audit-trail');

    // Only the colleague's changes, then nothing for a user who changed nothing
    await page.getByTestId('audit-filter-event').selectOption('');
    await page.getByTestId('audit-filter-user').fill(COLLEAGUE);
    await page.getByTestId('audit-filter-apply').click();
    await expect(rows).toHaveCount(3);
    expect(backend.auditQueries[backend.auditQueries.length - 1].get('search')).toBe(COLLEAGUE);
    await page.getByTestId('audit-filter-user').fill('nobody.here');
    await page.getByTestId('audit-filter-apply').click();
    await expect(page.getByTestId('audit-trail-empty')).toBeVisible();
    await expect(page.getByTestId('audit-trail-export-csv')).toBeDisabled();
    await shot(page, '07-audit-trail-no-match');

    // Reset and export everything
    await page.getByTestId('audit-filter-reset').click();
    await expect(rows).toHaveCount(5);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('audit-trail-export-csv').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^audit-trail-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync((await download.path())!, 'utf8').trim().split('\r\n');
    expect(csv[0]).toBe('Timestamp,User,Event,Record type,Record ID,Summary,Changes');
    expect(csv).toHaveLength(6);
    expect(csv[1]).toContain(`${guideUser.username},Reversed,Journal entry,je-rent`);
    expect(csv[2]).toContain(`${guideUser.username},Posted,Journal entry,je-rent`);
  });

  test('a role denial shows an error on the report, not an empty log', async ({ page }) => {
    const backend = freshBackend();
    await signIn(page, backend);
    await page.route('**/rest/auditTrail/index.json*', (route) =>
      json(route, 403, { timestamp: 1, status: 403, error: 'Forbidden', path: '/rest/auditTrail/index.json' })
    );
    await page.locator('aside').getByRole('link', { name: 'Reports', exact: true }).click();
    await page.locator('aside').getByRole('link', { name: 'Audit Trail', exact: true }).click();
    await expect(page.getByTestId('audit-trail-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('audit-trail-error')).toHaveAttribute('data-error-kind', 'forbidden');
    await expect(page.getByTestId('audit-trail-empty')).toHaveCount(0);
    await shot(page, '08-audit-trail-forbidden');
  });
});
