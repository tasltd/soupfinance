/**
 * SOUPFIN-182: vendor form domain fields, archived filter and list pagination.
 * Runs against the REAL LXC backend (no mocks).
 *
 * soupbroker.trading.Vendor has symbol, vendorType, postalAddress, ledgerAccount
 * and archived; the form rendered none of them, and the list fetched one flat
 * page of 50. This spec drives the UI by clicks only (sidebar, buttons, links)
 * and checks the backend record through the API after every save, so a field
 * that renders but is dropped on the way to the database fails here.
 *
 * Run (the LXC dev DB needs david.tetteh, see e2e/fixtures.ts):
 *   E2E_PORT=5197 E2E_ADMIN_USERNAME=david.tetteh E2E_ADMIN_PASSWORD=david.tetteh \
 *     npx playwright test --config=playwright.lxc.config.ts \
 *     e2e/integration/soupfin-182-vendor-fields.integration.spec.ts --project=firefox
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { backendTestUsers } from '../fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-182';
const runId = Date.now().toString(36).toUpperCase();
const vendorName = `SOUPFIN-182 Vendor ${runId}`;
const vendorSymbol = `S182${runId}`;

test.use({ viewport: { width: 1440, height: 1000 } });
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

/**
 * Screenshots go to a git-tracked directory, not the wiped test-results/.
 * Viewport shots, not fullPage: the sticky nav is painted mid-page in a
 * full-page capture and covers the fields. Pass `focus` to centre a field.
 */
async function shot(page: Page, name: string, focus?: Locator) {
  if (focus) await focus.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function getAuthToken(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '');
}

/** Read through the Vite proxy so the Api-Authorization header is injected. */
async function apiGet<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/rest${path}`, {
    headers: { 'X-Auth-Token': await getAuthToken(page), Accept: 'application/json' },
    maxRedirects: 0,
    timeout: 90_000,
  });
  expect(response.status(), `GET ${path}`).toBe(200);
  return (await response.json()) as T;
}

interface VendorRecord {
  id: string;
  name: string;
  symbol?: string;
  vendorType?: string;
  postalAddress?: string;
  archived?: boolean;
  ledgerAccount?: { id: string; serialised?: string };
  totalCount?: number;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
  const remember = page.getByTestId('login-remember-checkbox');
  if (await remember.isVisible().catch(() => false)) await remember.check();
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await page
    .waitForFunction(() => !document.body.textContent?.includes('Verifying authentication'), null, { timeout: 20_000 })
    .catch(() => {});
}

async function openVendorsFromSidebar(page: Page) {
  await page.locator('aside').locator('a[href="/vendors"]').first().click();
  await expect(page).toHaveURL(/\/vendors$/);
  await expect(page.getByTestId('vendor-list-page')).toBeVisible();
}

async function waitForRows(page: Page) {
  await expect(page.getByTestId('vendor-list-loading')).toHaveCount(0, { timeout: 90_000 });
}

let createdId = '';
let chosenLedgerAccountId = '';

test.describe('SOUPFIN-182: vendor fields, archived filter, pagination (LXC)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('list pages through the server 20 rows at a time', async ({ page }) => {
    const firstPage = await apiGet<VendorRecord[]>(page, '/trading/vendor/index.json?max=20&offset=0&sort=name&order=asc');
    const total = firstPage[0]?.totalCount ?? firstPage.length;
    test.skip(total <= 20, `Only ${total} active vendors on this backend; pagination needs more than 20`);

    await openVendorsFromSidebar(page);
    await waitForRows(page);
    await expect(page.getByTestId('vendor-tab-active')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('vendor-pagination-range')).toHaveText(`Showing 1 to 20 of ${total} vendors`);
    await expect(page.locator('[data-testid^="vendor-row-"]')).toHaveCount(20);
    await expect(page.getByTestId(`vendor-row-${firstPage[0].id}`)).toBeVisible();
    await shot(page, 'list-active-page-1');
    await shot(page, 'list-active-page-1-pager', page.getByTestId('vendor-pagination'));

    const secondPage = await apiGet<VendorRecord[]>(page, '/trading/vendor/index.json?max=20&offset=20&sort=name&order=asc');
    await page.getByTestId('vendor-pagination-page-2').click();
    await expect(page.getByTestId(`vendor-row-${secondPage[0].id}`)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId(`vendor-row-${firstPage[0].id}`)).toHaveCount(0);
    await expect(page.getByTestId('vendor-pagination-page-2')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('vendor-pagination-range')).toHaveText(
      `Showing 21 to ${20 + secondPage.length} of ${total} vendors`
    );
    await shot(page, 'list-active-page-2', page.getByTestId('vendor-pagination'));
  });

  test('create a vendor with symbol, type, postal address and a liability ledger account', async ({ page }) => {
    await openVendorsFromSidebar(page);
    await page.getByTestId('vendor-new-button').click();
    await expect(page).toHaveURL(/\/vendors\/new$/);

    const ledgerSelect = page.getByTestId('vendor-form-ledger-account');
    // Fetches every ledger account page; this tenant has thousands
    await expect(ledgerSelect).toBeEnabled({ timeout: 120_000 });
    await expect(page.getByTestId('vendor-form-status-section')).toHaveCount(0);
    await shot(page, 'form-new-empty', page.getByTestId('vendor-form-symbol'));

    await page.getByTestId('vendor-form-name').fill(vendorName);
    await page.getByTestId('vendor-form-symbol').fill(vendorSymbol);
    await page.getByTestId('vendor-form-vendor-type').selectOption('SERVICE_PROVIDER');
    await page.getByTestId('vendor-form-email').fill(`ap+${runId.toLowerCase()}@example.com`);
    await page.getByTestId('vendor-form-payment-terms').fill('30');
    await page.getByTestId('vendor-form-postal-address').fill(`P.O. Box ${runId}, Accra`);

    const options = await ledgerSelect.locator('option').evaluateAll((els) =>
      els.map((el) => ({ value: (el as HTMLOptionElement).value, label: el.textContent ?? '' }))
    );
    chosenLedgerAccountId = options.find((o) => o.value)?.value ?? '';
    if (chosenLedgerAccountId) await ledgerSelect.selectOption(chosenLedgerAccountId);
    await shot(page, 'form-new-filled-basic', page.getByTestId('vendor-form-symbol'));
    await shot(page, 'form-new-filled-ledger-postal', page.getByTestId('vendor-form-ledger-account'));

    await page.getByTestId('vendor-form-save').click();
    await expect(page).toHaveURL(/\/vendors\/[0-9a-f]{32}$/, { timeout: 60_000 });
    createdId = page.url().split('/').pop()!;
    await expect(page.getByTestId('vendor-detail-page')).toBeVisible();
    await shot(page, 'detail-after-create');

    const saved = await apiGet<VendorRecord>(page, `/trading/vendor/show/${createdId}.json`);
    expect(saved.name).toBe(vendorName);
    expect(saved.symbol).toBe(vendorSymbol);
    expect(saved.vendorType).toBe('SERVICE_PROVIDER');
    expect(saved.postalAddress).toBe(`P.O. Box ${runId}, Accra`);
    expect(saved.archived ?? false).toBe(false);
    if (chosenLedgerAccountId) {
      expect(saved.ledgerAccount?.id).toBe(chosenLedgerAccountId);
    } else {
      // No liability account to pick: the backend generates "{name} Account"
      expect(saved.ledgerAccount?.id).toBeTruthy();
    }
  });

  test('edit loads the fields, archives the vendor, and the tabs follow', async ({ page }) => {
    test.skip(!createdId, 'create step did not run');

    await openVendorsFromSidebar(page);
    await page.getByTestId('vendor-search-input').fill(vendorSymbol);
    await expect(page.getByTestId(`vendor-row-${createdId}`)).toBeVisible({ timeout: 90_000 });
    await page.getByTestId(`vendor-edit-${createdId}`).click();
    await expect(page).toHaveURL(new RegExp(`/vendors/${createdId}/edit$`));

    await expect(page.getByTestId('vendor-form-symbol')).toHaveValue(vendorSymbol, { timeout: 60_000 });
    await expect(page.getByTestId('vendor-form-vendor-type')).toHaveValue('SERVICE_PROVIDER');
    await expect(page.getByTestId('vendor-form-postal-address')).toHaveValue(`P.O. Box ${runId}, Accra`);
    await expect(page.getByTestId('vendor-form-ledger-account')).toBeEnabled({ timeout: 120_000 });
    if (chosenLedgerAccountId) {
      await expect(page.getByTestId('vendor-form-ledger-account')).toHaveValue(chosenLedgerAccountId);
    }
    await expect(page.getByTestId('vendor-form-archived')).not.toBeChecked();
    await shot(page, 'form-edit-loaded', page.getByTestId('vendor-form-symbol'));

    await page.getByTestId('vendor-form-vendor-type').selectOption('CONSULTANT');
    await page.getByTestId('vendor-form-archived').check();
    await shot(page, 'form-edit-archive-checked', page.getByTestId('vendor-form-archived'));
    await page.getByTestId('vendor-form-save').click();
    await expect(page).toHaveURL(new RegExp(`/vendors/${createdId}$`), { timeout: 60_000 });

    const archived = await apiGet<VendorRecord>(page, `/trading/vendor/show/${createdId}.json`);
    expect(archived.archived).toBe(true);
    expect(archived.vendorType).toBe('CONSULTANT');
    expect(archived.symbol).toBe(vendorSymbol);
    const activeHits = await apiGet<VendorRecord[]>(page, `/trading/vendor/index.json?search=${vendorSymbol}`);
    expect(activeHits.map((v) => v.id)).not.toContain(createdId);
    const archivedHits = await apiGet<VendorRecord[]>(page, `/trading/vendor/archived.json?search=${vendorSymbol}`);
    expect(archivedHits.map((v) => v.id)).toContain(createdId);

    // Active tab no longer lists it; the Archived tab does, without a delete button
    await openVendorsFromSidebar(page);
    await page.getByTestId('vendor-search-input').fill(vendorSymbol);
    await expect(page.getByTestId('vendor-list-empty')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId(`vendor-row-${createdId}`)).toHaveCount(0);
    await shot(page, 'list-active-search-after-archive');

    await page.getByTestId('vendor-tab-archived').click();
    await expect(page.getByTestId(`vendor-row-${createdId}`)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId(`vendor-delete-${createdId}`)).toHaveCount(0);
    await expect(page.getByTestId('vendor-pagination-range')).toContainText('archived vendor');
    await shot(page, 'list-archived-tab');
  });

  test('restore from the Archived tab brings the vendor back to Active', async ({ page }) => {
    test.skip(!createdId, 'create step did not run');

    await openVendorsFromSidebar(page);
    await page.getByTestId('vendor-tab-archived').click();
    await page.getByTestId('vendor-search-input').fill(vendorSymbol);
    await expect(page.getByTestId(`vendor-row-${createdId}`)).toBeVisible({ timeout: 90_000 });
    await page.getByTestId(`vendor-edit-${createdId}`).click();

    await expect(page.getByTestId('vendor-form-archived')).toBeChecked({ timeout: 60_000 });
    await page.getByTestId('vendor-form-archived').uncheck();
    await page.getByTestId('vendor-form-save').click();
    await expect(page).toHaveURL(new RegExp(`/vendors/${createdId}$`), { timeout: 60_000 });

    const restored = await apiGet<VendorRecord>(page, `/trading/vendor/show/${createdId}.json`);
    expect(restored.archived ?? false).toBe(false);

    await openVendorsFromSidebar(page);
    await page.getByTestId('vendor-search-input').fill(vendorSymbol);
    await expect(page.getByTestId(`vendor-row-${createdId}`)).toBeVisible({ timeout: 90_000 });
    await shot(page, 'list-active-after-restore');
  });
});
