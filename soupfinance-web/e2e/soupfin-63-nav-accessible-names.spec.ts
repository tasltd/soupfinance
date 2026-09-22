/**
 * SOUPFIN-63 — SideNav icon ligature leaks into every nav link accessible name
 *
 * Material Symbols draws its glyph from the element's TEXT CONTENT, so
 * `<span class="material-symbols-outlined">receipt_long</span>` puts the literal
 * string "receipt_long" in the DOM. Without `aria-hidden` that text joins the
 * accessible name of the link wrapping it, and the Invoices link is named
 * "receipt_long Invoices" rather than "Invoices".
 *
 * The user-facing cost is that screen reader users hear the raw ligature before
 * every label. The test-facing cost is what this spec pins: an exact-name role
 * query silently never matches, so navigation specs had to fall back to loose
 * regexes (see the comment this fix removes from soupfin-55).
 *
 * Every test below therefore navigates by CLICKING a link located by its exact
 * accessible name. Each one fails against the pre-fix build — not by asserting
 * an aria attribute, but by being unable to find the link at all.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockAmbientApi, mockTokenValidationApi, mockDashboardApi, isLxcMode } from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-63/${name}.png`,
    fullPage: true,
  });
}

/** Top-level sidebar destinations, as (exact accessible name, landing URL). */
const NAV_ITEMS: Array<[label: string, url: RegExp]> = [
  ['Invoices', /\/invoices/],
  ['Bills', /\/bills/],
  ['Clients', /\/clients/],
  ['Payments', /\/payments/],
  ['Ledger', /\/ledger\/accounts/],
  ['Accounting', /\/accounting\/transactions/],
  ['Reports', /\/reports/],
  ['Dashboard', /\/dashboard/],
];

/** The ligatures the sidebar renders. None may appear in an accessible name. */
const LIGATURES = [
  'dashboard',
  'receipt_long',
  'receipt',
  'people',
  'payments',
  'account_balance',
  'calculate',
  'analytics',
  'settings',
];

test.describe('SOUPFIN-63: nav links are named without the icon ligature', () => {
  test.skip(isLxcMode(), 'Mock-only spec: drives the nav chrome, not backend data');

  test.beforeEach(async ({ page }) => {
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
  });

  test('every top-level item navigates when located by its exact name', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await shot(page, '01-dashboard-loaded');

    const nav = page.locator('nav');

    for (const [label, url] of NAV_ITEMS) {
      // `exact: true` is the whole ticket. Before the fix this resolved to zero
      // elements for every label and the click timed out.
      const link = nav.getByRole('link', { name: label, exact: true });
      await expect(link).toHaveCount(1);

      // Navigate by clicking the menu — never page.goto() for an internal route.
      await link.click();
      await expect(page).toHaveURL(url);
    }

    await shot(page, '02-navigated-all-items-by-exact-name');
  });

  test('no ligature survives in any sidebar link accessible name', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

    // The aria snapshot is the accessibility tree as Playwright sees it. Parse
    // the quoted link names out of it — matching the raw YAML would false-positive
    // on the `/url: /dashboard` line, which is an href, not a name.
    const snapshot = await page.locator('nav').ariaSnapshot();
    const names = [...snapshot.matchAll(/- link "([^"]*)"/g)].map((m) => m[1]);

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name.trim()).not.toBe('');
      for (const ligature of LIGATURES) {
        expect(name).not.toContain(ligature);
      }
    }

    // Stated positively: the top-level names ARE the labels, in order. Vendors
    // is hidden for SERVICES tenants (SOUPFIN-25), but these mocks leave the
    // business category unset, so all ten render.
    expect(names.slice(0, 10)).toEqual([
      'Dashboard',
      'Invoices',
      'Bills',
      'Vendors',
      'Clients',
      'Payments',
      'Ledger',
      'Accounting',
      'Reports',
      'Settings',
    ]);
    await shot(page, '03-sidebar-names-clean');
  });

  test('the icons are still drawn — hiding them from a11y must not blank the UI', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

    const icons = page.locator('nav .material-symbols-outlined');
    const count = await icons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const icon = icons.nth(i);
      await expect(icon).toHaveAttribute('aria-hidden', 'true');
      // The glyph text is what renders the icon; it must remain.
      expect((await icon.textContent())?.trim()).toBeTruthy();
      await expect(icon).toBeVisible();
    }
    await shot(page, '04-icons-still-rendered');
  });

  test('sub-items remain reachable by exact name under an expanded section', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

    const nav = page.locator('nav');
    await nav.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page).toHaveURL(/\/reports/);

    // Child links carry no icon, so these always worked — assert they still do,
    // i.e. the parent fix did not disturb them.
    for (const child of ['Balance Sheet', 'Trial Balance', 'Cash Flow']) {
      await expect(nav.getByRole('link', { name: child, exact: true })).toHaveCount(1);
    }
    await shot(page, '05-reports-expanded-children-exact');

    await nav.getByRole('link', { name: 'Trial Balance', exact: true }).click();
    await expect(page).toHaveURL(/\/reports\/trial-balance/);
    await shot(page, '06-trial-balance-reached');
  });

  test('collapsing the sidebar keeps every link named', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

    // The toggle is icon-only, so it too was named by its ligature before.
    const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
    await expect(collapse).toHaveCount(1);
    await collapse.click();
    await shot(page, '07-sidebar-collapsed');

    // Collapsed mode drops the visible label. If the icon were hidden without an
    // aria-label the link would have NO name — a worse bug than the original.
    const nav = page.locator('nav');
    for (const [label, url] of [
      ['Invoices', /\/invoices/],
      ['Dashboard', /\/dashboard/],
    ] as Array<[string, RegExp]>) {
      const link = nav.getByRole('link', { name: label, exact: true });
      await expect(link).toHaveCount(1);
      await link.click();
      await expect(page).toHaveURL(url);
    }
    await shot(page, '08-collapsed-nav-still-usable');

    await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Collapse sidebar', exact: true })).toHaveCount(1);
    await shot(page, '09-sidebar-re-expanded');
  });

  test('header icon-only buttons are named by intent', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

    // Previously named "notifications" by its ligature; the label now comes from
    // aria-label, and the button reports its expanded state.
    const notifications = page.getByRole('button', { name: 'Notifications', exact: true });
    await expect(notifications).toHaveCount(1);
    await expect(notifications).toHaveAttribute('aria-expanded', 'false');
    await notifications.click();
    await expect(notifications).toHaveAttribute('aria-expanded', 'true');
    await shot(page, '10-notifications-open');
    await notifications.click();

    // The theme toggle was named "light_mode"/"dark_mode" by its ligature. It is
    // now named for the mode it switches TO, and clicking it changes that name.
    for (const ligature of ['light_mode', 'dark_mode', 'settings_brightness']) {
      await expect(page.getByRole('button', { name: ligature, exact: true })).toHaveCount(0);
    }
    const themeNames = ['Dark mode', 'Light mode', 'System theme'];
    const visibleBefore = await Promise.all(
      themeNames.map((n) => page.getByRole('button', { name: n, exact: true }).count())
    );
    expect(visibleBefore.filter(Boolean)).toHaveLength(1);

    const currentLabel = themeNames[visibleBefore.findIndex(Boolean)];
    await page.getByRole('button', { name: currentLabel, exact: true }).click();
    // Cycling the theme must move the label on — proof the name tracks state
    // rather than being a static string that happens to read well.
    await expect(page.getByRole('button', { name: currentLabel, exact: true })).toHaveCount(0);
    await shot(page, '11-theme-toggled-label-moved');
  });

  test('settings tabs are named without their ligature too', async ({ page }) => {
    // /settings redirects to /settings/users, which loads staff + roles. Left
    // unmocked these 401 and the app bounces to /login before the tabs render.
    const json = (body: unknown) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
    await page.route('**/rest/agent/index.json*', (route) => route.fulfill(json([])));
    await page.route('**/rest/sbRole/index.json*', (route) => route.fulfill(json([])));

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

    await page.locator('nav').getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings/);

    // SettingsLayout renders its own icon+label tabs — the same defect class.
    for (const tab of ['Users', 'Bank Accounts', 'Account Settings']) {
      await expect(page.getByRole('link', { name: tab, exact: true }).first()).toBeVisible({
        timeout: 15000,
      });
    }
    await shot(page, '12-settings-tabs-exact-names');
  });
});
