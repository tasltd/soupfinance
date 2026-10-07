/**
 * SOUPFIN-102 — Custom user roles and granular permissions
 *
 * Two journeys, both driven through the UI:
 *
 *  1. An admin opens Settings → Roles from the side menu, builds a "Sales" role
 *     (invoices: view + create, no bills) from the permission matrix, saves it,
 *     opens a built-in role (read-only, no delete), and deletes the custom role.
 *     The mocked backend keeps state, so each save/delete is asserted against
 *     the backend's role list BEFORE and AFTER the UI action — not just the screen.
 *
 *  2. A user on that "Sales" role signs in and sees only what it allows: the menu
 *     shows Invoices but not Bills, the invoice list offers New but not Edit, the
 *     Bills page opened by URL shows "You do not have permission", and a 403 the
 *     API returns for bills reads "You do not have permission" — never
 *     "module not enabled".
 *
 * Mock mode only: the backend side (permission SbRoles, tenant-scoped groups and
 * the enforcing interceptor) is not built yet — plans/soupfin-102-custom-roles-backend.md.
 * The 403 body classification IS checked against the live backend in
 * e2e/integration/soupfin-102-custom-roles.integration.spec.ts.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import {
  installUnmockedApiGuard,
  isLxcMode,
  mockAmbientApi,
  mockDashboardApi,
  mockInvoicesApi,
  mockLoginApi,
  mockTokenValidationApi,
  type UnmockedApiGuard,
} from './fixtures';

/** Screenshots go to a git-tracked directory; test-results/ is wiped every run. */
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/playwright/screenshots/soupfin-102/${name}.png`, fullPage: true });
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// Every permission cell seeded as an SbRole, the way §1 of the backend plan seeds them.
const PERMISSIONS = [
  ...['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE'].flatMap((a) => [
    `ROLE_PERM_INVOICES_${a}`,
    `ROLE_PERM_BILLS_${a}`,
    `ROLE_PERM_PAYMENTS_${a}`,
    `ROLE_PERM_LEDGER_${a}`,
  ]),
  ...['VIEW', 'CREATE', 'EDIT', 'DELETE'].flatMap((a) => [
    `ROLE_PERM_VENDORS_${a}`,
    `ROLE_PERM_CLIENTS_${a}`,
    `ROLE_PERM_SETTINGS_${a}`,
  ]),
  'ROLE_PERM_REPORTS_VIEW',
];
const SB_ROLES = [
  { id: 1, authority: 'ROLE_ADMIN' },
  { id: 2, authority: 'ROLE_USER' },
  ...PERMISSIONS.map((authority, i) => ({ id: 100 + i, authority })),
];
const roleById = (id: number) => SB_ROLES.find((r) => r.id === id)!;
const idOf = (authority: string) => SB_ROLES.find((r) => r.authority === authority)!.id;

interface MockGroup {
  id: number;
  name: string;
  tenantId: string | null;
  builtIn?: boolean;
  authorities: { id: number; authority: string }[];
}

/**
 * Stateful /rest/sbRoleGroup/* mock. Returns the live list so a test can read the
 * "backend" state before and after a UI action, plus every request body it got.
 */
async function mockRoleBackend(page: Page) {
  const groups: MockGroup[] = [
    { id: 1, name: 'Administrators', tenantId: null, builtIn: true, authorities: [roleById(1)] },
  ];
  const requests: { method: string; url: string; body: unknown }[] = [];
  let nextId = 50;

  await page.route('**/rest/sbRole/index.json*', (route) => json(route, SB_ROLES));
  await page.route('**/rest/sbRoleGroup/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const body = request.postData() ? JSON.parse(request.postData()!) : undefined;
    requests.push({ method: request.method(), url: pathname, body });

    if (pathname.endsWith('/index.json')) return json(route, groups);
    if (pathname.endsWith('/create.json')) {
      return json(route, { SYNCHRONIZER_TOKEN: 'csrf-token', SYNCHRONIZER_URI: '/sbRoleGroup/create' });
    }
    if (pathname.endsWith('/save.json') && request.method() === 'POST') {
      const created: MockGroup = {
        id: nextId++,
        name: body.name,
        tenantId: 'account-001',
        builtIn: false,
        authorities: body.authorities.map((a: { id: number }) => roleById(a.id)),
      };
      groups.push(created);
      return json(route, created, 201);
    }
    const id = Number(pathname.match(/\/(\d+)\.json$/)?.[1]);
    const group = groups.find((g) => g.id === id);
    if (!group) return json(route, { error: 'Not Found' }, 404);
    if (pathname.includes('/show/')) return json(route, group);
    if (pathname.includes('/update/') && request.method() === 'PUT') {
      group.name = body.name;
      group.authorities = body.authorities.map((a: { id: number }) => roleById(a.id));
      return json(route, group);
    }
    if (pathname.includes('/delete/') && request.method() === 'DELETE') {
      groups.splice(groups.indexOf(group), 1);
      return route.fulfill({ status: 204 });
    }
    return json(route, { error: 'Unexpected' }, 400);
  });

  // The Users tab is the first Settings child, so the menu lands there first.
  await page.route('**/rest/agent/index.json*', (route) => json(route, []));

  return { groups, requests };
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill('admin@soupfinance.com');
  await page.getByTestId('login-password-input').fill('admin123');
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

const sideNav = (page: Page) => page.locator('aside nav');

test.describe('SOUPFIN-102 — custom roles', () => {
  test.skip(isLxcMode(), 'Backend support is planned, not built: mock mode only.');

  let guard: UnmockedApiGuard;

  test.afterEach(() => guard.assertNone('SOUPFIN-102'));

  test('an admin builds a "Sales" role from the matrix, cannot touch a built-in role, and deletes the custom one', async ({
    page,
  }) => {
    test.slow();
    guard = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
    await mockLoginApi(page, true);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    const backend = await mockRoleBackend(page);

    await signIn(page);

    // Menu: Settings → Roles tab
    await sideNav(page).getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/users/);
    await page.getByRole('main').getByRole('link', { name: 'Roles', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/roles$/);
    await expect(page.getByTestId('role-row-1')).toBeVisible();
    await expect(page.getByTestId('role-builtin-badge-1')).toHaveText(/Built-in/);
    await expect(page.getByTestId('role-delete-1')).toHaveCount(0);
    await shot(page, '01-roles-list-built-in-only');

    // New role
    expect(backend.groups).toHaveLength(1);
    await page.getByTestId('role-list-new-button').click();
    await expect(page).toHaveURL(/\/settings\/roles\/new$/);
    await expect(page.getByTestId('permission-matrix')).toBeVisible();
    await expect(page.getByTestId('role-form-missing-permissions')).toHaveCount(0);
    await shot(page, '02-new-role-empty-matrix');

    // Submitting empty shows both validation messages and sends nothing
    await page.getByTestId('role-form-submit').click();
    await expect(page.getByTestId('role-form-name-error')).toHaveText('Enter a name for this role');
    await expect(page.getByTestId('role-form-permissions-error')).toHaveText('Tick at least one permission');
    expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
    await shot(page, '03-new-role-validation-errors');

    // "Sales: create invoices, no bills"
    await page.getByTestId('role-form-name').fill('Sales');
    await page.getByTestId('permission-invoices-create').check();
    await expect(page.getByTestId('permission-invoices-view')).toBeChecked();
    await expect(page.getByTestId('permission-bills-view')).not.toBeChecked();
    await shot(page, '04-sales-role-filled');

    await page.getByTestId('role-form-submit').click();
    await expect(page).toHaveURL(/\/settings\/roles$/);

    // Backend state AFTER: one more group, with exactly the two invoice permissions
    expect(backend.groups).toHaveLength(2);
    const save = backend.requests.find((r) => r.method === 'POST' && r.url.endsWith('/save.json'))!;
    expect(save.url).toBe('/rest/sbRoleGroup/save.json');
    expect((save.body as { name: string }).name).toBe('Sales');
    expect(((save.body as { authorities: { id: number }[] }).authorities.map((a) => a.id)).sort()).toEqual(
      [idOf('ROLE_PERM_INVOICES_VIEW'), idOf('ROLE_PERM_INVOICES_CREATE')].sort()
    );
    const sales = backend.groups.find((g) => g.name === 'Sales')!;
    await expect(page.getByTestId(`role-row-${sales.id}`)).toBeVisible();
    await expect(page.getByTestId(`role-permission-count-${sales.id}`)).toHaveText('2 permissions');
    await shot(page, '05-roles-list-with-sales');

    // Edit: add Invoices → Edit
    await page.getByTestId(`role-name-${sales.id}`).click();
    await expect(page.getByTestId('role-form-name')).toHaveValue('Sales');
    await expect(page.getByTestId('permission-invoices-create')).toBeChecked();
    await page.getByTestId('permission-invoices-edit').check();
    await page.getByTestId('role-form-submit').click();
    await expect(page).toHaveURL(/\/settings\/roles$/);
    expect(sales.authorities.map((a) => a.authority)).toContain('ROLE_PERM_INVOICES_EDIT');
    await expect(page.getByTestId(`role-permission-count-${sales.id}`)).toHaveText('3 permissions');

    // Built-in role opens read-only
    await page.getByTestId('role-name-1').click();
    await expect(page.getByTestId('role-form-builtin-notice')).toBeVisible();
    await expect(page.getByTestId('role-form-submit')).toHaveCount(0);
    await expect(page.getByTestId('permission-invoices-view')).toBeDisabled();
    await shot(page, '06-built-in-role-read-only');
    await page.getByRole('link', { name: 'Back to roles' }).click();

    // Delete the custom role
    await page.getByTestId(`role-delete-${sales.id}`).click();
    await expect(page.getByTestId('role-delete-dialog')).toContainText('Delete the Sales role?');
    await shot(page, '07-delete-confirmation');
    await page.getByTestId('role-delete-confirm').click();
    await expect(page.getByTestId(`role-row-${sales.id}`)).toHaveCount(0);
    expect(backend.groups.map((g) => g.name)).toEqual(['Administrators']);
    expect(backend.requests.some((r) => r.method === 'DELETE' && r.url === `/rest/sbRoleGroup/delete/${sales.id}.json`)).toBe(true);
    // The built-in role was never sent a delete
    expect(backend.requests.some((r) => r.method === 'DELETE' && r.url.endsWith('/delete/1.json'))).toBe(false);
    await shot(page, '08-after-delete');
  });

  test('a user on the "Sales" role sees only invoices, and a refused request reads "You do not have permission"', async ({
    page,
  }) => {
    test.slow();
    const SALES_ROLES = ['ROLE_USER', 'ROLE_PERM_INVOICES_VIEW', 'ROLE_PERM_INVOICES_CREATE'];
    guard = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
    await mockLoginApi(page, true, {
      email: 'sales@soupfinance.com',
      password: 'x',
      username: 'sales.rep',
      roles: SALES_ROLES,
    });
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockInvoicesApi(page);
    // After mockDashboardApi, which re-registers the admin current.json: routes are
    // LIFO, so this one wins and a page reload keeps the Sales roles.
    await page.route('**/rest/user/current.json*', (route) =>
      json(route, { username: 'sales.rep', email: 'sales@soupfinance.com', roles: SALES_ROLES, tenantId: 'account-001' })
    );
    // The API is the authority: a bills request from this user is refused with
    // Spring Security's own 403 body (captured from the LXC backend).
    await page.route('**/rest/bill/index.json*', (route) =>
      json(route, { timestamp: 1791367969595, status: 403, error: 'Forbidden', path: '/rest/bill/index.json' }, 403)
    );

    await signIn(page);

    // Menu shows Invoices, hides Bills, Payments, Ledger, Reports, Settings
    await expect(sideNav(page).getByRole('link', { name: 'Invoices', exact: true })).toBeVisible();
    for (const hidden of ['Bills', 'Payments', 'Ledger', 'Accounting', 'Reports', 'Settings']) {
      await expect(sideNav(page).getByRole('link', { name: hidden, exact: true })).toHaveCount(0);
    }
    await shot(page, '09-sales-user-menu');

    // Invoices: New is offered, Edit is not
    await sideNav(page).getByRole('link', { name: 'Invoices', exact: true }).click();
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(page.getByTestId('invoice-new-button')).toBeVisible();
    await expect(page.locator('[data-testid^="invoice-row-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="invoice-edit-"]')).toHaveCount(0);
    await shot(page, '10-sales-user-invoice-list');

    // Bills has no menu entry for this user, so the only way in is an old link or
    // a typed URL — which is exactly the case the page guard exists for.
    await page.goto('/bills');
    await expect(page.getByTestId('permission-forbidden')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('permission-forbidden-title')).toHaveText('You do not have permission');
    await expect(page.getByTestId('permission-forbidden')).not.toContainText(/module/i);
    await expect(page.getByTestId('bill-list-page')).toHaveCount(0);
    await shot(page, '11-sales-user-bills-by-url-forbidden');
  });

  test('a 403 the API returns for a page the role shows reads "You do not have permission", not "module disabled"', async ({
    page,
  }) => {
    // The role claims bills:view, but the server refuses — the API is the authority.
    const ROLES = ['ROLE_USER', 'ROLE_PERM_BILLS_VIEW'];
    guard = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
    await mockLoginApi(page, true, { email: 'ap@soupfinance.com', password: 'x', username: 'ap.clerk', roles: ROLES });
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await page.route('**/rest/user/current.json*', (route) =>
      json(route, { username: 'ap.clerk', email: 'ap@soupfinance.com', roles: ROLES, tenantId: 'account-001' })
    );
    await page.route('**/rest/bill/index.json*', (route) =>
      json(route, { code: 'PERMISSION_DENIED', error: 'Your role does not allow you to see bills.' }, 403)
    );

    await signIn(page);
    await sideNav(page).getByRole('link', { name: 'Bills', exact: true }).click();
    await expect(page).toHaveURL(/\/bills$/);

    const card = page.getByTestId('bill-list-forbidden');
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toHaveAttribute('data-error-kind', 'forbidden');
    await expect(card).toContainText('You do not have permission');
    await expect(card).toContainText('Your role does not allow you to see bills.');
    await expect(card).not.toContainText(/module/i);
    // A view-only bills role is not offered "New Bill"
    await expect(page.getByTestId('bill-new-button')).toHaveCount(0);
    await shot(page, '12-api-403-reads-forbidden');
  });
});
