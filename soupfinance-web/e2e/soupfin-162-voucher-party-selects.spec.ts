/**
 * SOUPFIN-162: the voucher form's Vendor, Client and Staff fields choose a real record.
 *
 * Before the fix they were free-text inputs ("Search or enter vendor name")
 * with no search behind them, and whatever the user typed was posted as the FK
 * id: a vendor *name* reached the backend as vendor.id. The client field also
 * posted under a `client` key that the backend Voucher does not have; its
 * client party is `accountServices`.
 *
 * Each test opens the form from the sidebar, fills it, saves, and asserts the
 * body the backend receives. Mock-only: it controls the party lists.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import { agents, clients, installGuideMocks, seedAuthenticatedSession, vendors } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-162';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

async function shot(page: Page, name: string, inView = 'voucher-beneficiary-section') {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  // Viewport shot with the party section in view: a full-page capture paints
  // the sticky sidebar halfway down the page.
  await page.getByTestId(inView).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

/** Sign in, then reach a voucher form through Accounting in the sidebar. */
async function openVoucherForm(page: Page, kind: 'payment' | 'receipt') {
  await installGuideMocks(page);
  await page.route('**/rest/voucher/create.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ voucher: { SYNCHRONIZER_TOKEN: 'vtok', SYNCHRONIZER_URI: '/voucher/create' } }),
    })
  );
  await page.route('**/rest/voucher/save.json*', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'v-new' }) })
  );
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });

  const sidebar = page.locator('aside');
  await sidebar.locator('a[href="/accounting/transactions"]').first().click();
  await expect(page).toHaveURL(/\/accounting\/transactions$/);
  await sidebar.locator(`a[href="/accounting/voucher/${kind}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/accounting/voucher/${kind}$`));
  await expect(page.getByTestId('voucher-form-page')).toBeVisible();
}

/** Fill everything except the party, with the first account of each kind. */
async function fillBasics(page: Page, kind: 'payment' | 'receipt') {
  await page.getByTestId('voucher-notes-input').fill('SOUPFIN-162 check');
  const pickFirst = async (testId: string) => {
    const select = page.getByTestId(testId);
    await expect(select.locator('option:not([value=""])').first()).toBeAttached();
    const value = await select.locator('option:not([value=""])').first().getAttribute('value');
    await select.selectOption(value!);
  };
  await pickFirst('voucher-cash-account-select');
  await pickFirst(kind === 'payment' ? 'voucher-expense-account-select' : 'voucher-income-account-select');
  await page.getByTestId('voucher-amount-input').fill('250');
}

function waitForSave(page: Page): Promise<Request> {
  return page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/rest/voucher/save.json'));
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-162: voucher party fields are real selects', () => {
  test.skip(isLxcMode(), 'Mock-only spec: controls the vendor, client and staff lists');

  test.beforeEach(async ({ page }) => {
    apiGuard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('a payment voucher pays a vendor chosen from the vendor list', async ({ page }) => {
    await openVoucherForm(page, 'payment');

    const vendor = page.getByTestId('voucher-vendor-select');
    expect(await vendor.evaluate((el) => el.tagName)).toBe('SELECT');
    await expect(vendor.locator('option:not([value=""])')).toHaveCount(vendors.length);
    await expect(page.getByTestId('voucher-add-vendor-button')).toBeVisible();
    await shot(page, '01-payment-vendor-select');

    await fillBasics(page, 'payment');
    await vendor.selectOption({ label: vendors[1].name });
    await shot(page, '02-payment-vendor-chosen');

    const save = waitForSave(page);
    await page.getByTestId('voucher-form-save-draft-button').click();
    const body = (await save).postDataJSON();
    expect(body.voucherTo).toBe('VENDOR');
    expect(body.vendor).toEqual({ id: vendors[1].id });
    for (const key of ['client', 'accountServices', 'staff']) expect(body).not.toHaveProperty(key);

    await expect(page).toHaveURL(/\/accounting\/transactions$/);
    await shot(page, '03-payment-saved-register', 'transaction-register-page');
  });

  test('a payment voucher without a vendor is refused and nothing is sent', async ({ page }) => {
    await openVoucherForm(page, 'payment');
    let posted = false;
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/voucher/save.json')) posted = true;
    });

    await fillBasics(page, 'payment');
    await page.getByTestId('voucher-form-save-draft-button').click();

    await expect(page.getByText('Select a vendor')).toBeVisible();
    await expect(page).toHaveURL(/\/accounting\/voucher\/payment$/);
    expect(posted).toBe(false);
    await shot(page, '04-payment-no-vendor-refused');
  });

  test('the + button opens the new vendor form in a new tab', async ({ page, context }) => {
    await openVoucherForm(page, 'payment');

    const [newTab] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('voucher-add-vendor-button').click(),
    ]);
    await newTab.waitForLoadState('domcontentloaded');
    expect(new URL(newTab.url()).pathname).toBe('/vendors/new');
    // The half-filled voucher stays where it was.
    await expect(page).toHaveURL(/\/accounting\/voucher\/payment$/);
    await newTab.close();
  });

  test('a receipt from a client sends the client account as accountServices', async ({ page }) => {
    await openVoucherForm(page, 'receipt');

    const client = page.getByTestId('voucher-client-select');
    await expect(client.locator(`option[value="${clients[0].id}"]`)).toBeAttached();
    await fillBasics(page, 'receipt');
    await client.selectOption(clients[0].id);
    await shot(page, '05-receipt-client-chosen');

    const save = waitForSave(page);
    await page.getByTestId('voucher-form-save-draft-button').click();
    const body = (await save).postDataJSON();
    expect(body.voucherTo).toBe('CLIENT');
    expect(body.accountServices).toEqual({ id: clients[0].portfolioList[0].accountServices!.id });
    expect(body).not.toHaveProperty('client');
    expect(body).not.toHaveProperty('vendor');
  });

  test('a payment to staff sends the chosen agent as staff', async ({ page }) => {
    await openVoucherForm(page, 'payment');
    await page.getByLabel('Staff', { exact: true }).check();

    const staff = page.getByTestId('voucher-staff-select');
    await expect(staff.locator('option:not([value=""])')).toHaveCount(agents.length);
    await fillBasics(page, 'payment');
    await staff.selectOption(agents[0].id);
    await shot(page, '06-payment-staff-chosen');

    const save = waitForSave(page);
    await page.getByTestId('voucher-form-save-draft-button').click();
    const body = (await save).postDataJSON();
    expect(body).toMatchObject({ voucherTo: 'STAFF', staff: { id: agents[0].id } });
    expect(body).not.toHaveProperty('vendor');
  });
});
