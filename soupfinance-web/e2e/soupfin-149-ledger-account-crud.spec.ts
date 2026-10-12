/**
 * SOUPFIN-149 — ledger account CRUD (new, edit, delete/deactivate) respecting
 * the system flags.
 *
 * The mock backend is stateful: an in-memory ledger that the save, update and
 * delete routes change, and that index.json reads back. Each test checks the
 * request the page sent (CSRF on POST only, nested FKs, archived flag) AND the
 * backend state after it, then that the chart shows that state.
 *
 * Navigation is by clicking: dashboard -> sidebar "Chart of Accounts" -> the
 * page's own buttons. Screenshots go to the git-tracked
 * e2e/playwright/screenshots/soupfin-149/ (test-results/ is wiped per run).
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import {
  installUnmockedApiGuard,
  isLxcMode,
  mockAmbientApi,
  mockDashboardApi,
  mockTokenValidationApi,
  type UnmockedApiGuard,
} from './fixtures';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/playwright/screenshots/soupfin-149/${name}.png`, fullPage: true });
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

type RawAccount = Record<string, unknown> & { id: string; name: string };

const CATEGORIES = [
  { id: 'cat-cash', name: 'Cash and Bank', ledgerGroup: 'ASSET', serialised: 'Cash And Bank < ASSET' },
  { id: 'cat-recv', name: 'Receivables', ledgerGroup: 'ASSET', serialised: 'Receivables < ASSET' },
  { id: 'cat-sales', name: 'Sales', ledgerGroup: 'INCOME', serialised: 'Sales < INCOME' },
];
const catRef = (id: string) => {
  const c = CATEGORIES.find((x) => x.id === id)!;
  return { id: c.id, class: 'soupbroker.finance.LedgerAccountCategory', serialised: c.serialised };
};

/** The seeded chart: one plain account, one with transactions, two locked by system flags. */
function seedAccounts(): RawAccount[] {
  return [
    { id: 'acc-bank', name: 'Main Bank', number: '1000', ledgerAccountCategory: catRef('cat-cash'), currency: 'GHS', cashFlow: true, editable: true, deletable: true, systemAccount: false, archived: false },
    { id: 'acc-petty', name: 'Petty Cash', number: '1010', ledgerAccountCategory: catRef('cat-cash'), currency: 'GHS', cashFlow: true, editable: null, deletable: null, systemAccount: null, archived: false },
    { id: 'acc-ar', name: 'Accounts Receivable', number: '1100', ledgerAccountCategory: catRef('cat-recv'), currency: 'GHS', cashFlow: false, editable: false, deletable: false, systemAccount: true, archived: false },
    { id: 'acc-sales', name: 'Consulting Revenue', number: '4000', ledgerAccountCategory: catRef('cat-sales'), currency: 'GHS', cashFlow: false, editable: true, deletable: false, systemAccount: false, archived: false },
  ];
}

interface Backend {
  accounts: RawAccount[];
  /** Accounts that ledger transactions reference. */
  withTransactions: Set<string>;
  requests: { method: string; path: string; search: string; body: unknown }[];
}

async function mockLedgerBackend(page: Page): Promise<Backend> {
  const backend: Backend = { accounts: seedAccounts(), withTransactions: new Set(['acc-bank']), requests: [] };
  const record = (req: Request) => {
    const url = new URL(req.url());
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    backend.requests.push({ method: req.method(), path: url.pathname, search: url.search, body });
  };

  await page.route('**/rest/ledgerAccountCategory/index.json*', (route) => route.fulfill(json(CATEGORIES)));

  await page.route('**/rest/ledgerAccount/**', async (route) => {
    const req = route.request();
    record(req);
    const { pathname } = new URL(req.url());
    const idFrom = (action: string) => pathname.match(new RegExp(`/${action}/([^/.]+)\\.json`))?.[1];

    if (pathname.endsWith('/ledgerAccount/index.json')) {
      return route.fulfill(json(backend.accounts.filter((a) => !a.archived)));
    }
    if (pathname.endsWith('/ledgerAccount/create.json')) {
      return route.fulfill(
        json({ ledgerAccount: { SYNCHRONIZER_TOKEN: 'csrf-149', SYNCHRONIZER_URI: '/rest/ledgerAccount/create.json' } })
      );
    }
    if (pathname.endsWith('/ledgerAccount/save.json') && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>;
      const cat = body.ledgerAccountCategory as { id: string };
      const parent = body.parentAccount as { id: string } | null;
      const saved: RawAccount = {
        ...body,
        id: `acc-new-${backend.accounts.length}`,
        name: String(body.name),
        ledgerAccountCategory: catRef(cat.id),
        parentAccount: parent ? { id: parent.id, name: backend.accounts.find((a) => a.id === parent.id)?.name } : null,
        editable: true,
        deletable: true,
        systemAccount: false,
        archived: false,
      };
      backend.accounts.push(saved);
      return route.fulfill(json(saved, 201));
    }
    const showId = idFrom('show');
    if (showId) {
      const found = backend.accounts.find((a) => a.id === showId);
      return route.fulfill(found ? json(found) : json({}, 404));
    }
    const updateId = idFrom('update');
    if (updateId && req.method() === 'PUT') {
      const body = req.postDataJSON() as Record<string, unknown>;
      const idx = backend.accounts.findIndex((a) => a.id === updateId);
      const next: RawAccount = { ...backend.accounts[idx], ...body, id: updateId };
      if (body.ledgerAccountCategory) next.ledgerAccountCategory = catRef((body.ledgerAccountCategory as { id: string }).id);
      backend.accounts[idx] = next;
      return route.fulfill(json(next));
    }
    const deleteId = idFrom('delete');
    if (deleteId && req.method() === 'DELETE') {
      backend.accounts = backend.accounts.filter((a) => a.id !== deleteId);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill(json({ error: `unhandled ${req.method()} ${pathname}` }, 500));
  });

  await page.route('**/rest/ledgerTransaction/index.json*', (route) => {
    record(route.request());
    const id = new URL(route.request().url()).searchParams.get('ledgerAccount');
    return route.fulfill(json(id && backend.withTransactions.has(id) ? [{ id: 'tx-1', amount: 100 }] : []));
  });

  return backend;
}

async function setUp(page: Page): Promise<Backend> {
  await page.addInitScript(() => {
    const user = { username: 'admin', email: 'admin@soupfinance.com', roles: ['ROLE_ADMIN', 'ROLE_USER'], tenantId: 'account-001' };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('auth-storage', JSON.stringify({ state: { user, isAuthenticated: true }, version: 0 }));
  });
  await mockAmbientApi(page);
  await mockTokenValidationApi(page, true);
  await mockDashboardApi(page);
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill(json({ id: 'account-001', name: 'Accra Consulting', currency: 'GHS', dateCreated: '2024-01-01T00:00:00Z' }))
  );
  return mockLedgerBackend(page);
}

/** Dashboard -> sidebar Ledger -> Chart of Accounts. */
async function openChart(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  const aside = page.locator('aside');
  const link = aside.locator('a[href="/ledger/accounts"]').first();
  if (!(await link.isVisible().catch(() => false))) {
    await aside.getByRole('button', { name: /ledger/i }).first().click();
  }
  await link.click();
  await expect(page).toHaveURL(/\/ledger\/accounts$/);
  await expect(page.getByTestId('coa-account-acc-bank')).toBeVisible();
}

test.describe('SOUPFIN-149 ledger account CRUD', () => {
  test.skip(isLxcMode(), 'Mock-only: drives an in-memory ledger backend');

  let guard: UnmockedApiGuard;
  let backend: Backend;

  test.beforeEach(async ({ page }) => {
    guard = await installUnmockedApiGuard(page);
    backend = await setUp(page);
  });

  test.afterEach(() => guard.assertNone());

  test('system flags decide which rows offer Edit and Delete', async ({ page }) => {
    await openChart(page);
    await shot(page, 'coa-actions');

    await expect(page.getByTestId('coa-edit-acc-bank')).toBeVisible();
    await expect(page.getByTestId('coa-delete-acc-bank')).toBeVisible();
    // Null flags on old rows = domain defaults (editable, deletable).
    await expect(page.getByTestId('coa-edit-acc-petty')).toBeVisible();
    await expect(page.getByTestId('coa-delete-acc-petty')).toBeVisible();
    // System account: no actions, labelled System.
    await expect(page.getByTestId('coa-edit-acc-ar')).toHaveCount(0);
    await expect(page.getByTestId('coa-delete-acc-ar')).toHaveCount(0);
    await expect(page.getByTestId('coa-system-acc-ar')).toHaveText('System');
    // deletable=false: edit only.
    await expect(page.getByTestId('coa-edit-acc-sales')).toBeVisible();
    await expect(page.getByTestId('coa-delete-acc-sales')).toHaveCount(0);
  });

  test('creates an account through the CSRF save flow', async ({ page }) => {
    await openChart(page);
    await page.getByTestId('coa-new-account').click();
    await expect(page).toHaveURL(/\/ledger\/accounts\/new$/);
    await expect(page.getByTestId('ledger-account-form-heading')).toHaveText('New Account');
    await shot(page, 'new-form-empty');

    // Required fields first.
    await page.getByTestId('ledger-account-form-save').click();
    await expect(page.getByText('Account name is required')).toBeVisible();
    await expect(page.getByText('Category is required')).toBeVisible();
    await shot(page, 'new-form-validation');
    expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(0);

    await page.getByTestId('ledger-account-form-code').fill('1020');
    await page.getByTestId('ledger-account-form-name').fill('Mobile Money Float');
    await page.getByTestId('ledger-account-form-category').selectOption('cat-cash');
    // Parents are limited to the same group: two cash accounts plus "None".
    await expect(page.getByTestId('ledger-account-form-parent').locator('option')).toHaveCount(4);
    await page.getByTestId('ledger-account-form-parent').selectOption('acc-bank');
    await page.getByTestId('ledger-account-form-currency').selectOption('USD');
    await page.getByTestId('ledger-account-form-cash-flow').check();
    await page.getByTestId('ledger-account-form-description').fill('MTN merchant wallet');
    await shot(page, 'new-form-filled');

    const before = backend.accounts.length;
    await page.getByTestId('ledger-account-form-save').click();
    await expect(page).toHaveURL(/\/ledger\/accounts$/);

    // Request: CSRF fetched, then sent as URL params on the POST.
    const createIdx = backend.requests.findIndex((r) => r.path.endsWith('/ledgerAccount/create.json'));
    const save = backend.requests.find((r) => r.method === 'POST' && r.path.endsWith('/ledgerAccount/save.json'));
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(save).toBeDefined();
    expect(backend.requests.indexOf(save!)).toBeGreaterThan(createIdx);
    expect(save!.search).toContain('SYNCHRONIZER_TOKEN=csrf-149');
    expect(save!.body).toEqual({
      number: '1020',
      name: 'Mobile Money Float',
      description: 'MTN merchant wallet',
      ledgerAccountCategory: { id: 'cat-cash' },
      parentAccount: { id: 'acc-bank' },
      currency: 'USD',
      cashFlow: true,
    });

    // Backend state changed, and the chart reads it back.
    expect(backend.accounts).toHaveLength(before + 1);
    const created = backend.accounts[backend.accounts.length - 1];
    await expect(page.getByTestId(`coa-account-${created.id}`)).toContainText('Mobile Money Float');
    await expect(page.getByTestId(`coa-account-${created.id}`)).toContainText('1020');
    await expect(page.getByTestId(`coa-account-${created.id}`)).toContainText('(under Main Bank)');
    await shot(page, 'new-account-in-chart');
  });

  test('edits an account with a PUT and no CSRF token', async ({ page }) => {
    await openChart(page);
    await page.getByTestId('coa-edit-acc-petty').click();
    await expect(page).toHaveURL(/\/ledger\/accounts\/acc-petty\/edit$/);
    await expect(page.getByTestId('ledger-account-form-name')).toHaveValue('Petty Cash');
    await shot(page, 'edit-form-loaded');

    await page.getByTestId('ledger-account-form-name').fill('Petty Cash - Accra');
    await page.getByTestId('ledger-account-form-code').fill('1011');
    await shot(page, 'edit-form-changed');
    await page.getByTestId('ledger-account-form-save').click();
    await expect(page).toHaveURL(/\/ledger\/accounts$/);

    const put = backend.requests.find((r) => r.method === 'PUT' && r.path.endsWith('/ledgerAccount/update/acc-petty.json'));
    expect(put).toBeDefined();
    expect(put!.search).toBe('');
    expect(put!.body).toMatchObject({ id: 'acc-petty', name: 'Petty Cash - Accra', number: '1011', parentAccount: null });
    expect(backend.requests.some((r) => r.path.includes('/ledgerAccount/edit/'))).toBe(false);
    expect(backend.requests.some((r) => r.path.endsWith('/ledgerAccount/create.json'))).toBe(false);

    expect(backend.accounts.find((a) => a.id === 'acc-petty')).toMatchObject({ name: 'Petty Cash - Accra', number: '1011' });
    await expect(page.getByTestId('coa-account-acc-petty')).toContainText('Petty Cash - Accra');
    await shot(page, 'edit-saved-in-chart');
  });

  test('deletes an account that has no transactions', async ({ page }) => {
    await openChart(page);
    await page.getByTestId('coa-delete-acc-petty').click();
    await expect(page.getByTestId('coa-remove-dialog')).toContainText('Delete Petty Cash?');
    await shot(page, 'delete-confirm');

    await page.getByTestId('coa-remove-confirm').click();
    await expect(page.getByTestId('coa-notice')).toHaveText(/Petty Cash was deleted\./);
    await expect(page.getByTestId('coa-account-acc-petty')).toHaveCount(0);
    await shot(page, 'delete-done');

    expect(backend.requests.some((r) => r.path.endsWith('/ledgerTransaction/index.json') && r.search.includes('ledgerAccount=acc-petty'))).toBe(true);
    expect(backend.requests.some((r) => r.method === 'DELETE' && r.path.endsWith('/ledgerAccount/delete/acc-petty.json'))).toBe(true);
    expect(backend.accounts.find((a) => a.id === 'acc-petty')).toBeUndefined();
  });

  test('deactivates instead of deleting when the account has transactions', async ({ page }) => {
    await openChart(page);
    await page.getByTestId('coa-delete-acc-bank').click();
    await expect(page.getByTestId('coa-remove-dialog')).toContainText('Deactivate Main Bank?');
    await expect(page.getByTestId('coa-remove-message')).toContainText("has transactions, so it can't be deleted");
    await expect(page.getByTestId('coa-remove-confirm')).toHaveText('Deactivate');
    await shot(page, 'deactivate-confirm');

    await page.getByTestId('coa-remove-confirm').click();
    await expect(page.getByTestId('coa-notice')).toContainText('Main Bank was deactivated');
    await expect(page.getByTestId('coa-account-acc-bank')).toHaveCount(0);
    await shot(page, 'deactivate-done');

    // Archived through PUT, never hard-deleted: the row and its history remain.
    expect(backend.requests.some((r) => r.method === 'DELETE')).toBe(false);
    const put = backend.requests.find((r) => r.method === 'PUT' && r.path.endsWith('/ledgerAccount/update/acc-bank.json'));
    expect(put!.body).toEqual({ archived: true, id: 'acc-bank' });
    expect(backend.accounts.find((a) => a.id === 'acc-bank')).toMatchObject({ archived: true, name: 'Main Bank' });
  });

  test('cancel leaves the account untouched', async ({ page }) => {
    await openChart(page);
    await page.getByTestId('coa-delete-acc-petty').click();
    await expect(page.getByTestId('coa-remove-confirm')).toHaveText('Delete');
    await page.getByTestId('coa-remove-cancel').click();
    await expect(page.getByTestId('coa-remove-dialog')).toHaveCount(0);
    await expect(page.getByTestId('coa-account-acc-petty')).toBeVisible();
    expect(backend.requests.some((r) => r.method === 'DELETE' || r.method === 'PUT')).toBe(false);
  });
});
