/**
 * SOUPFIN-81 — Change of logo and help anchorage
 *
 * Two asks:
 *   1. The user guide's masthead shows the SoupFinance logo the app uses,
 *      not the orange "S" placeholder it shipped with.
 *   2. Every page, and the sections that matter on it, carries a
 *      "? Need Help?" link that opens the matching section of the guide.
 *
 * Each page is reached by clicking the sidebar (never page.goto to an internal
 * route). Each link is then CLICKED: the assertions run in the guide tab it
 * opens, checking the URL hash, the heading that the hash lands on, and that
 * the heading sits below the guide's sticky masthead rather than under it.
 *
 * Mock mode only: the data is the curated guide set in user-guide/guide-mocks.ts,
 * behind the unmocked-API guard so a missed endpoint fails by name.
 *
 * Run: npx playwright test e2e/soupfin-81-need-help-links.spec.ts --project=firefox
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession, trialBalance } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-81';

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'parallel' });
test.setTimeout(120_000);

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture, which writes under the wiped `test-results/`.
 */
async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage });
}

/** Sidebar link, addressed by route so labels containing icon text stay unambiguous. */
function menu(page: Page, href: string) {
  return page.locator('aside').locator(`a[href="${href}"]`).first();
}

async function navigate(page: Page, href: string, pageTestId: string) {
  await menu(page, href).click();
  await expect(page).toHaveURL(new RegExp(`${href.replace(/\//g, '\\/')}$`));
  await expect(page.getByTestId(pageTestId)).toBeVisible({ timeout: 15_000 });
}

async function startAtDashboard(page: Page) {
  await installGuideMocks(page);
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
}

/** The "? Need Help?" link for a section: visible, worded, and aimed at the guide. */
async function helpLink(scope: Page | Locator, section: string, testId = `help-link-${section}`) {
  const link = scope.getByTestId(testId);
  await expect(link).toBeVisible();
  await expect(link).toContainText('Need Help?');
  // The question-mark icon is the Material Symbols "help" glyph.
  await expect(link.locator('.material-symbols-outlined')).toHaveText('help');
  await expect(link).toHaveAttribute('href', `/user-guide/index.html#${section}`);
  await expect(link).toHaveAttribute('target', '_blank');
  return link;
}

/**
 * Click a help link and check the guide tab it opens: right file, right hash,
 * the anchored element reads as expected and sits in view below the masthead.
 */
async function openGuideAt(page: Page, link: Locator, section: string, heading: string | RegExp) {
  const appUrl = page.url();
  const [guide] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await guide.waitForLoadState('domcontentloaded');

  await expect(guide).toHaveURL(new RegExp(`/user-guide/index\\.html#${section}$`));
  await expect(guide).toHaveTitle('SoupFinance | User Guide');

  const target = guide.locator(`[id="${section}"]`);
  await expect(target).toHaveCount(1);
  await expect(target).toContainText(heading);
  await guide.evaluate(() => document.fonts.ready.then(() => true));

  // Heading of the target: the element itself when it is a heading, else its h2.
  const title = guide.locator(`h2[id="${section}"], h3[id="${section}"], h4[id="${section}"], [id="${section}"] > h2`).first();
  await expect(title).toBeInViewport();
  const mastheadBox = await guide.locator('header.masthead').boundingBox();
  await expect
    .poll(async () => (await title.boundingBox())?.y ?? -1, { message: `#${section} heading hidden under the masthead` })
    .toBeGreaterThanOrEqual((mastheadBox?.height ?? 0) - 1);

  // The app tab stayed where it was: the link never navigates away from work in progress.
  expect(page.url()).toBe(appUrl);
  return guide;
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-81: "Need Help?" links and the guide logo', () => {
  test.skip(isLxcMode(), 'Mock-only spec: curated guide data, no backend involved');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit guide mock takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('the user guide shows the same logo as the app', async ({ page, context }) => {
    await startAtDashboard(page);

    const appLogo = page.locator('aside img[alt="SoupFinance Logo"]').first();
    await expect(appLogo).toBeVisible();
    const appLogoSrc = await appLogo.getAttribute('src');
    expect(appLogoSrc).toBeTruthy();

    await page.getByRole('link', { name: 'Help', exact: true }).click();
    await expect(page).toHaveURL(/\/help$/);
    const frame = page.frameLocator('[data-testid="help-guide-frame"]');
    const guideLogo = frame.locator('header.masthead img.masthead__mark');
    await expect(guideLogo).toBeVisible({ timeout: 15_000 });
    await expect(frame.locator('header.masthead')).not.toContainText(/^\s*S\s*Soup/);
    await expect
      .poll(() => guideLogo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);

    // Same picture, byte for byte, as the mark in the app's own sidebar.
    const guideLogoUrl = await guideLogo.evaluate((img: HTMLImageElement) => img.currentSrc || img.src);
    const [appBytes, guideBytes] = await Promise.all([
      page.request.get(new URL(appLogoSrc!, page.url()).href).then((r) => r.body()),
      page.request.get(guideLogoUrl).then((r) => r.body()),
    ]);
    expect(guideBytes.length).toBeGreaterThan(0);
    expect(guideBytes.equals(appBytes)).toBe(true);

    // The wordmark beside it is coloured exactly as the sidebar's, read live.
    const sidebarWord = page.locator('aside h1').filter({ hasText: 'SoupFinance' }).first();
    const [appSoup, appFinance] = await Promise.all([
      sidebarWord.locator('span').nth(0).evaluate((el) => getComputedStyle(el).color),
      sidebarWord.locator('span').nth(1).evaluate((el) => getComputedStyle(el).color),
    ]);
    expect(appSoup).not.toBe(appFinance);
    await expect(frame.locator('.masthead__soup')).toHaveText('Soup');
    await expect(frame.locator('.masthead__soup')).toHaveCSS('color', appSoup);
    await expect(frame.locator('.masthead__finance')).toHaveText('Finance');
    await expect(frame.locator('.masthead__finance')).toHaveCSS('color', appFinance);
    await shot(page, '01-help-page-guide-logo');

    // And in the stand-alone guide tab.
    const [popup] = await Promise.all([context.waitForEvent('page'), page.getByTestId('help-open-new-tab').click()]);
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup.locator('header.masthead img.masthead__mark')).toBeVisible();
    await expect
      .poll(() => popup.locator('header.masthead img.masthead__mark').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await shot(popup, '02-guide-new-tab-logo');
    await popup.close();
  });

  test('sign-in, registration and password pages link to getting started', async ({ page }) => {
    await installGuideMocks(page);
    await page.goto('/login');
    await expect(page.getByTestId('login-page')).toBeVisible();

    let link = await helpLink(page, 'sign-in', 'help-link-auth-page');
    await shot(page, '03-login-need-help');
    let guide = await openGuideAt(page, link, 'sign-in', 'Sign in');
    await shot(guide, '04-guide-at-sign-in');
    await guide.close();

    await page.getByTestId('login-register-link').click();
    await expect(page.getByTestId('registration-page')).toBeVisible();
    link = await helpLink(page, 'register', 'help-link-auth-page');
    guide = await openGuideAt(page, link, 'register', 'Register your company');
    await shot(guide, '05-guide-at-register');
    await guide.close();

    await page.getByTestId('registration-login-link').click();
    await page.getByTestId('login-forgot-password-link').click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    link = await helpLink(page, 'password', 'help-link-auth-page');
    await shot(page, '06-forgot-password-need-help');
    guide = await openGuideAt(page, link, 'password', 'Reset your password');
    await guide.close();
  });

  test('dashboard: the page and its recent invoices section', async ({ page }) => {
    await startAtDashboard(page);

    const pageLink = await helpLink(page, 'dashboard');
    const recent = page.getByTestId('dashboard-recent-invoices');
    const sectionLink = await helpLink(recent, 'recent-invoices');
    await shot(page, '07-dashboard-need-help');

    let guide = await openGuideAt(page, pageLink, 'dashboard', 'Dashboard');
    await guide.close();
    guide = await openGuideAt(page, sectionLink, 'recent-invoices', 'Recent invoices');
    await shot(guide, '08-guide-at-recent-invoices');
    await guide.close();
  });

  test('clients and invoices, including a half-filled form that survives a help lookup', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/clients', 'client-list-page');
    let guide = await openGuideAt(page, await helpLink(page, 'clients'), 'clients', 'Clients');
    await guide.close();

    await page.getByTestId('client-new-button').click();
    await expect(page.getByTestId('client-form-page')).toBeVisible();
    await page.getByTestId('client-type-corporate').click();
    await page.getByTestId('client-form-company-name').fill('Harbour Logistics Ltd');
    await shot(page, '09-client-form-need-help');
    guide = await openGuideAt(page, await helpLink(page, 'add-client'), 'add-client', 'Add a client');
    await shot(guide, '10-guide-at-add-client');
    await guide.close();
    // Nothing typed is lost: the form tab never left the page.
    await expect(page.getByTestId('client-form-company-name')).toHaveValue('Harbour Logistics Ltd');

    await navigate(page, '/invoices', 'invoice-list-page');
    guide = await openGuideAt(page, await helpLink(page, 'invoices'), 'invoices', 'Invoices');
    await guide.close();

    await page.getByTestId('invoice-new-button').click();
    await expect(page.getByTestId('invoice-form-page')).toBeVisible();
    guide = await openGuideAt(page, await helpLink(page, 'create-invoice'), 'create-invoice', 'Create an invoice');
    await guide.close();

    await page.getByTestId('invoice-form-cancel-button').click();
    await page.getByTestId('invoice-link-inv-001').click();
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible();
    const payments = page.getByTestId('invoice-payments-card');
    await payments.scrollIntoViewIfNeeded();
    await shot(page, '11-invoice-detail-need-help', true);
    guide = await openGuideAt(page, await helpLink(page, 'view-invoice'), 'view-invoice', 'View an invoice');
    await guide.close();
    guide = await openGuideAt(page, await helpLink(payments, 'record-payment'), 'record-payment', 'Record a payment');
    await shot(guide, '12-guide-at-record-payment');
    await guide.close();
  });

  test('vendors, bills and payments', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/vendors', 'vendor-list-page');
    await shot(page, '13-vendors-need-help');
    let guide = await openGuideAt(page, await helpLink(page, 'vendors'), 'vendors', 'Vendors');
    await guide.close();

    await navigate(page, '/bills', 'bill-list-page');
    guide = await openGuideAt(page, await helpLink(page, 'bills'), 'bills', 'Bills');
    await guide.close();

    await page.getByTestId('bill-new-button').click();
    await expect(page.getByTestId('bill-form-page')).toBeVisible();
    guide = await openGuideAt(page, await helpLink(page, 'record-bill'), 'record-bill', 'Record a bill');
    await shot(guide, '14-guide-at-record-bill');
    await guide.close();

    await navigate(page, '/payments', 'payment-list-page');
    guide = await openGuideAt(page, await helpLink(page, 'payments'), 'payments', 'Payments');
    await guide.close();

    await page.getByTestId('record-payment-button').first().click();
    await expect(page.getByTestId('payment-form-page')).toBeVisible();
    await shot(page, '15-payment-form-need-help');
    guide = await openGuideAt(page, await helpLink(page, 'record-payment'), 'record-payment', 'Record a payment');
    await guide.close();
  });

  test('ledger and accounting', async ({ page }) => {
    await startAtDashboard(page);

    const stops: Array<[string, string, string, string]> = [
      ['/ledger/accounts', 'chart-of-accounts-page', 'chart-of-accounts', 'Chart of accounts'],
      ['/ledger/transactions', 'ledger-transactions-page', 'ledger-transactions', 'Ledger transactions'],
      ['/accounting/transactions', 'transaction-register-page', 'transaction-register', 'Transaction register'],
      ['/accounting/journal-entry', 'journal-entry-page', 'journal-entry', 'Journal entry'],
      ['/accounting/voucher/payment', 'voucher-form-page', 'vouchers', 'Vouchers'],
    ];
    for (const [href, pageId, section, heading] of stops) {
      await navigate(page, href, pageId);
      const guide = await openGuideAt(page, await helpLink(page, section), section, heading);
      if (section === 'journal-entry') {
        await shot(page, '16-journal-entry-need-help');
        await shot(guide, '17-guide-at-journal-entry');
      }
      await guide.close();
    }
  });

  test('reports hub and every report', async ({ page }) => {
    await startAtDashboard(page);

    const stops: Array<[string, string, string, string]> = [
      ['/reports', 'reports-page', 'reports', 'Reports'],
      ['/reports/pnl', 'profit-loss-page', 'profit-loss', 'Profit and loss'],
      ['/reports/balance-sheet', 'balance-sheet-page', 'balance-sheet', 'Balance sheet'],
      ['/reports/cash-flow', 'cash-flow-page', 'cash-flow', 'Cash flow'],
      ['/reports/aging', 'aging-reports-page', 'aging', 'Aging reports'],
      ['/reports/trial-balance', 'trial-balance-page', 'trial-balance', 'Trial balance'],
      ['/reports/scheduled', 'scheduled-reports-page', 'scheduled-reports', 'Scheduled reports'],
    ];
    for (const [href, pageId, section, heading] of stops) {
      await navigate(page, href, pageId);
      const guide = await openGuideAt(page, await helpLink(page, section), section, heading);
      if (section === 'reports') await shot(page, '18-reports-hub-need-help');
      if (section === 'trial-balance') {
        // Balanced books: the "does not balance" help stays out of the way.
        await expect(page.getByTestId('trial-balance-status')).toContainText('Books are balanced');
        await expect(page.getByTestId('help-link-trial-balance-unbalanced')).toHaveCount(0);
        await shot(page, '19-trial-balance-balanced-need-help');
      }
      await guide.close();
    }
  });

  test('an unbalanced trial balance links to the guide answer for it', async ({ page }) => {
    await startAtDashboard(page);
    // Registered after the guide mocks, so it wins for this one report.
    await page.route('**/rest/financeReports/trialBalance*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...trialBalance, totalCredit: trialBalance.totalCredit - 1250 }),
      })
    );

    await navigate(page, '/reports', 'reports-page');
    await navigate(page, '/reports/trial-balance', 'trial-balance-page');
    const status = page.getByTestId('trial-balance-status');
    await expect(status).toContainText('Books are NOT balanced');
    const link = await helpLink(status, 'trial-balance-unbalanced');
    await shot(page, '20-trial-balance-unbalanced-need-help');
    const guide = await openGuideAt(page, link, 'trial-balance-unbalanced', 'My trial balance does not balance');
    await shot(guide, '21-guide-at-trial-balance-unbalanced');
    await guide.close();
  });

  test('settings: the link follows the open tab', async ({ page }) => {
    await startAtDashboard(page);

    const stops: Array<[string, string, string, string]> = [
      ['/settings/users', 'user-list-page', 'users', 'Users'],
      ['/settings/bank-accounts', 'bank-account-list-page', 'bank-accounts', 'Bank accounts'],
      ['/settings/account', 'account-settings-fieldset', 'account-settings', 'Company settings'],
    ];
    for (const [href, pageId, section, heading] of stops) {
      await navigate(page, href, pageId);
      const guide = await openGuideAt(page, await helpLink(page, section, 'help-link-settings-page'), section, heading);
      if (section === 'bank-accounts') {
        await shot(page, '22-settings-bank-accounts-need-help');
        await shot(guide, '23-guide-at-bank-accounts');
      }
      await guide.close();
    }
  });

  test('a module the plan lacks links to the guide answer for it', async ({ page }) => {
    await startAtDashboard(page);
    // The SERVICES license gates Ledger: the backend answers 403 by controller name.
    // Changed (SOUPFIN-150): use FinanceModuleInterceptor's real body. A bare
    // "Forbidden" is a role denial and now renders as "access restricted".
    await page.route('**/rest/ledgerAccount/index.json*', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Finance module is not enabled for this tenant' }),
      })
    );

    await navigate(page, '/ledger/accounts', 'chart-of-accounts-page');
    const errorCard = page.locator('[data-error-kind="module_disabled"]');
    await expect(errorCard).toBeVisible({ timeout: 15_000 });
    const link = await helpLink(errorCard, 'module-not-enabled');
    // The page header link is still there beside it.
    await helpLink(page, 'chart-of-accounts');
    await shot(page, '24-module-disabled-need-help');
    const guide = await openGuideAt(page, link, 'module-not-enabled', 'A page says a module is not enabled');
    await shot(guide, '25-guide-at-module-not-enabled');
    await guide.close();
  });
});
