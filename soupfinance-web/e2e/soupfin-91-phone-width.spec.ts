/**
 * SOUPFIN-91 — every signed-in page was wider than a phone screen.
 *
 * Measured before the fix at 360x780 in Firefox on /dashboard: the document was
 * 514px wide on a 360px screen. The dashboard heading, the KYC banner's button,
 * the KPI cards and the Recent Invoices table all ran off the right edge, and
 * the top bar was stretched to 514px with them.
 *
 * The top bar was not the cause: its own content needs 268px. The cause was
 * MainLayout's content column (`flex-1 flex flex-col`). A flex item defaults to
 * `min-width: auto`, so the column grew to the min-content width of the page
 * inside it: the dashboard table's `min-w-[480px]` plus its border and padding
 * made 514px. The table's own `overflow-x-auto` wrapper never got a chance to
 * scroll. `min-w-0` on the column fixes it for every page at once.
 *
 * The same fix lets a very long username overflow the top bar at desktop
 * widths, because the header is `whitespace-nowrap`. The name is now capped
 * and truncated; the last test covers that end.
 *
 * What this spec asserts is PAGE-level: the document cannot be scrolled
 * sideways and the top bar's content fits inside it. A few page rows still
 * clip inside <main> at 320px; they have their own causes and are tracked
 * separately (see the SOUPFIN-91 comments), so they are not asserted here.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  installUnmockedApiGuard,
  mockAmbientApi,
  mockTokenValidationApi,
  mockDashboardApi,
  mockInvoicesApi,
  mockBillsApi,
  mockVendorsApi,
  mockCorporate,
  isLxcMode,
  type UnmockedApiGuard,
} from './fixtures';

/**
 * Viewport captures, not full-page: the question each one answers is "what
 * does the phone screen show", so the frame IS the evidence. Written to a
 * git-tracked directory because `test-results/` is wiped on every run.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/playwright/screenshots/soupfin-91/${name}.png` });
}

/** The page cannot be scrolled sideways, and the top bar's content fits in the bar. */
async function expectFitsScreen(page: Page, where: string) {
  const w = await page.evaluate(() => {
    const header = document.querySelector('header')!;
    return {
      page: document.documentElement.scrollWidth,
      screen: document.documentElement.clientWidth,
      header: header.scrollWidth,
      bar: header.clientWidth,
    };
  });
  expect(w.page, `${where}: page is ${w.page}px wide on a ${w.screen}px screen`).toBe(w.screen);
  expect(w.header, `${where}: top bar content is ${w.header}px in a ${w.bar}px bar`)
    .toBeLessThanOrEqual(w.bar);
}

/** Both the left and the right edge of the element are on screen. */
async function expectOnScreenHorizontally(locator: Locator, screenWidth: number, name: string) {
  const box = await locator.boundingBox();
  expect(box, `${name} is not rendered`).not.toBeNull();
  expect(box!.x, `${name} starts off the left edge`).toBeGreaterThanOrEqual(0);
  const right = box!.x + box!.width;
  expect(right, `${name} ends at ${right}px, past the ${screenWidth}px screen`)
    .toBeLessThanOrEqual(screenWidth + 0.5);
}

async function signIn(page: Page, username = 'admin') {
  await page.addInitScript((name) => {
    const mockUser = {
      username: name,
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
  }, username);
}

/** Open the app at its root, the way a user types app.soupfinance.com. */
async function openApp(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dashboard-invoices-table')).toBeVisible({ timeout: 15000 });
}

const OVERLAY = 'div.fixed.inset-0.bg-black\\/50';

/**
 * The app sidebar. A bare `aside` is ambiguous: the Transaction Register page
 * renders its own <aside> for the advanced filters panel.
 */
function sidebar(page: Page) {
  return page
    .locator('aside')
    .filter({ has: page.getByRole('link', { name: 'Dashboard', exact: true }) });
}

/**
 * Reach a page from the sidebar. Below `md` (768px) the sidebar is a drawer
 * behind the menu button; from `md` up it is always on screen.
 */
async function navigateTo(page: Page, width: number, link: string) {
  if (width < 768) {
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(sidebar(page)).toBeInViewport({ ratio: 1 });
  }
  await sidebar(page).getByRole('link', { name: link, exact: true }).click();
  if (width < 768) {
    // SOUPFIN-76: the drawer closes on navigation. Measure the page, not the drawer.
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    await expect(sidebar(page)).not.toBeInViewport();
  }
}

/** The main pages, each reached through its sidebar link. */
const MAIN_PAGES = [
  { link: 'Invoices', url: /\/invoices$/, ready: 'invoice-list-heading', slug: 'invoices' },
  { link: 'Bills', url: /\/bills$/, ready: 'bill-list-heading', slug: 'bills' },
  { link: 'Vendors', url: /\/vendors$/, ready: 'vendor-list-heading', slug: 'vendors' },
  { link: 'Clients', url: /\/clients$/, ready: 'client-list-heading', slug: 'clients' },
  { link: 'Payments', url: /\/payments$/, ready: 'payment-list-heading', slug: 'payments' },
  { link: 'Ledger', url: /\/ledger\/accounts$/, ready: 'coa-heading', slug: 'ledger-accounts' },
  {
    link: 'Accounting',
    url: /\/accounting\/transactions$/,
    ready: 'transaction-register-heading',
    slug: 'accounting-transactions',
  },
  { link: 'Reports', url: /\/reports$/, ready: 'reports-heading', slug: 'reports' },
  { link: 'Settings', url: /\/settings\/users$/, ready: 'user-list-page', slug: 'settings-users' },
  // The guide inside the frame keeps loading images, so the network never goes
  // idle. It cannot widen the page either: iframe content is laid out apart.
  { link: 'Help', url: /\/help$/, ready: 'help-guide-frame', slug: 'help', noIdleWait: true },
];

test.describe('SOUPFIN-91: signed-in pages fit the screen', () => {
  test.skip(isLxcMode(), 'Mock-only spec: measures layout, not backend data');

  let guard: UnmockedApiGuard;

  test.beforeEach(async ({ page }) => {
    // Guard FIRST: routes are LIFO, so it only sees what no mock below claims.
    guard = await installUnmockedApiGuard(page);
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockInvoicesApi(page);
    await mockBillsApi(page);
    await mockVendorsApi(page);
    // The Transaction Register and Settings > Users lists. Empty is enough:
    // this spec measures the page frame, not the rows.
    for (const list of [
      '**/rest/ledgerTransactionGroup/index.json*',
      '**/rest/voucher/index.json*',
      '**/rest/agent/index.json*',
    ]) {
      await page.route(list, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      );
    }
  });

  test.afterEach(() => guard.assertNone('SOUPFIN-91'));

  test('dashboard at 360px: everything the ticket named is on screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await signIn(page);
    // Show the KYC banner: its "Continue verification" button was one of the
    // things cut off. Registered after mockAmbientApi so it wins.
    await page.route('**/rest/corporate/index.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ ...mockCorporate, id: 'corp-001', kycStatus: 'PENDING' }]),
      })
    );

    await openApp(page);
    const cta = page.getByTestId('kyc-onboarding-banner-cta');
    await expect(cta).toBeVisible({ timeout: 15000 });

    await expectFitsScreen(page, 'dashboard');
    await expectOnScreenHorizontally(page.locator('header'), 360, 'top bar');
    await expectOnScreenHorizontally(page.getByTestId('dashboard-heading'), 360, 'heading');
    await expectOnScreenHorizontally(cta, 360, 'Continue verification button');
    for (const card of ['stat-total-revenue', 'stat-outstanding-invoices', 'stat-expenses', 'stat-net-profit']) {
      await expectOnScreenHorizontally(page.getByTestId(card), 360, card);
    }
    const recent = page.getByTestId('dashboard-recent-invoices');
    await expectOnScreenHorizontally(recent, 360, 'Recent Invoices card');
    await shot(page, '360-dashboard-top');

    // The table is wider than a phone on purpose (min-w-[480px]). It must
    // scroll inside its card rather than widen the page, and scrolling the card
    // must bring its last column onto the screen.
    const table = page.getByTestId('dashboard-invoices-table');
    const scroller = table.locator('xpath=..');
    await recent.scrollIntoViewIfNeeded();
    const scroll = await scroller.evaluate((el) => ({ content: el.scrollWidth, box: el.clientWidth }));
    expect(scroll.content, 'the table is not wider than its card, so nothing proves it scrolls')
      .toBeGreaterThan(scroll.box);
    await shot(page, '360-dashboard-invoices-before-sideways-scroll');

    await scroller.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expectOnScreenHorizontally(
      table.getByRole('columnheader').last(),
      360,
      'Status column after scrolling the card'
    );
    // Scrolling the card did not scroll the page.
    await expectFitsScreen(page, 'dashboard after scrolling the invoice table');
    await shot(page, '360-dashboard-invoices-after-sideways-scroll');
  });

  for (const width of [320, 360, 768]) {
    test(`every main page fits a ${width}px screen, reached from the menu`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await signIn(page);

      await openApp(page);
      await expectFitsScreen(page, `${width}px dashboard`);
      await shot(page, `${width}-dashboard`);

      for (const target of MAIN_PAGES) {
        await test.step(target.link, async () => {
          await navigateTo(page, width, target.link);
          await expect(page).toHaveURL(target.url);
          await expect(page.getByTestId(target.ready)).toBeVisible({ timeout: 15000 });
          // Wait for the list data to render: a wide table is what widened the page.
          if (!('noIdleWait' in target)) await page.waitForLoadState('networkidle');

          await expectFitsScreen(page, `${width}px ${target.slug}`);
          // One capture per page at the width the ticket measured.
          if (width === 360) await shot(page, `360-${target.slug}`);
        });
      }
    });
  }

  test('a very long username is truncated instead of widening the top bar', async ({ page }) => {
    const longName =
      'finance.department.administrator@some-very-long-company-name.example.com';
    // lg (1024px) is where the name is shown; the sidebar leaves the bar 768px.
    await page.setViewportSize({ width: 1024, height: 768 });
    await signIn(page, longName);
    await page.route('**/rest/user/current.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          username: longName,
          email: 'admin@soupfinance.com',
          roles: ['ROLE_ADMIN', 'ROLE_USER'],
          tenantId: 'account-001',
          agentId: 'agent-001',
        }),
      })
    );

    await openApp(page);
    const name = page.getByTestId('topnav-username');
    await expect(name).toBeVisible();
    await expect(name).toHaveAttribute('title', longName);

    await expectFitsScreen(page, '1024px dashboard with a long username');
    await expectOnScreenHorizontally(name, 1024, 'username');
    // The name is cut short on screen, not by removing text.
    const text = await name.evaluate((el) => ({
      content: el.scrollWidth,
      box: el.clientWidth,
      full: el.textContent,
    }));
    expect(text.full).toBe(longName);
    expect(text.content, 'the name is not truncated').toBeGreaterThan(text.box);

    await page.locator('header').screenshot({
      path: 'e2e/playwright/screenshots/soupfin-91/1024-topbar-long-username.png',
    });
  });
});
