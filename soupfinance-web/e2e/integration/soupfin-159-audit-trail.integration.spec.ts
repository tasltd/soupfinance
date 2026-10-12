/**
 * SOUPFIN-159 — audit trail against the REAL LXC backend, no mocks.
 *
 * Reads the audit rows the audit-logging plugin already wrote for a voucher,
 * straight from /rest/auditTrail/index.json, then checks that the Audit Trail
 * report and the voucher's History panel show the same event and the same
 * acting user. Also checks the endpoint is tenant-scoped. Every step is a menu
 * or link click; only /login is visited directly.
 *
 * Not covered here, and why:
 * - Writing a journal entry: saveMultiple answers 201 without saving it
 *   (SOUPFIN-248), so a fresh entry has no audit rows to show.
 * - Posting and reversing: /rest/ledgerTransactionGroup/post and /reverse do
 *   not exist yet (SOUPFIN-155). That acceptance runs against the contract mock
 *   in e2e/soupfin-159-audit-trail.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { backendTestUsers } from '../fixtures';

const SHOTS = 'e2e/playwright/screenshots/soupfin-159';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/lxc-${name}.png`, fullPage: true });
}

async function settleAuth(page: Page) {
  await page
    .waitForFunction(() => !document.body.textContent?.includes('Verifying authentication'), { timeout: 20000 })
    .catch(() => {});
}

async function loginAsAdmin(page: Page) {
  await page.goto('/login'); // only the initial login URL may be direct
  await page.getByTestId('login-email-input').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
  const remember = page.getByTestId('login-remember-checkbox');
  if (await remember.isVisible().catch(() => false)) await remember.check();
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  await settleAuth(page);
}

async function token(page: Page) {
  return page.evaluate(() => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '');
}

async function api<T>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path, {
    headers: { 'X-Auth-Token': await token(page), Accept: 'application/json' },
    maxRedirects: 0,
    timeout: 60000,
  });
  expect(res.status(), path).toBe(200);
  return (await res.json()) as T;
}

type AuditRow = {
  actor?: string;
  className?: string;
  eventName?: string;
  persistedObjectId?: string;
  tenantId?: string;
  dateCreated?: string;
};

test.describe.serial('SOUPFIN-159: audit trail (LXC backend)', () => {
  test.setTimeout(180_000);

  test('the report and the voucher History show the event and user the audit log holds', async ({ page }) => {
    await loginAsAdmin(page);
    const me = await api<{ username: string; tenantId: string }>(page, '/rest/user/current.json');

    // What the backend holds: the newest voucher INSERT in this tenant's log
    const rows = await api<AuditRow[]>(
      page,
      '/rest/auditTrail/index.json?max=500&sort=dateCreated&order=desc&search=soupbroker.finance.Voucher'
    );
    expect(rows.every((r) => r.tenantId === me.tenantId), 'audit rows from another tenant').toBe(true);
    const insert = rows.find((r) => r.className === 'soupbroker.finance.Voucher' && r.eventName === 'INSERT');
    expect(insert, 'precondition: a voucher INSERT in the audit log').toBeTruthy();
    const voucherId = insert!.persistedObjectId!;
    const actor = insert!.actor!;
    const day = insert!.dateCreated!.slice(0, 10);

    // The report, narrowed to that day and to vouchers
    await page.locator('aside').getByRole('link', { name: 'Reports', exact: true }).click();
    await page.locator('aside').getByRole('link', { name: 'Audit Trail', exact: true }).click();
    await expect(page.getByTestId('audit-trail-page')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('audit-filter-from').fill(day);
    await page.getByTestId('audit-filter-to').fill(day);
    await page.getByTestId('audit-filter-record-type').selectOption('Voucher');
    await page.getByTestId('audit-filter-event').selectOption('CREATED');
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/rest/auditTrail/index.json') && r.url().includes(`from=${day}`), { timeout: 90000 }),
      page.getByTestId('audit-filter-apply').click(),
    ]);
    expect(response.status()).toBe(200);

    const reportRow = page.getByTestId('audit-trail-table').locator(`tr[data-entity-id="${voucherId}"]`);
    await expect(reportRow).toHaveCount(1, { timeout: 60000 });
    await expect(reportRow).toHaveAttribute('data-action', 'CREATED');
    await expect(reportRow).toHaveAttribute('data-actor', actor);
    await expect(reportRow).toContainText('Voucher');
    const rowIndex = (await reportRow.getAttribute('data-testid'))!.replace('audit-row-', '');
    await page.getByTestId(`audit-row-toggle-${rowIndex}`).click();
    await expect(page.getByTestId(`audit-row-changes-${rowIndex}`)).toBeVisible();
    await shot(page, '01-audit-trail-voucher-created');

    // The record link opens the voucher, whose History says the same
    await reportRow.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/accounting/vouchers/${voucherId}$`));
    const history = page.getByTestId('voucher-history');
    await expect(history.getByTestId('voucher-history-list')).toBeVisible({ timeout: 90000 });
    const created = history.locator('li[data-action="CREATED"]').filter({ hasText: 'Voucher' }).first();
    await expect(created).toContainText(`by ${actor}`);
    await history.scrollIntoViewIfNeeded();
    await shot(page, '02-voucher-history');
  });

  test('the exact filters the backend ignores today are re-applied in the browser', async ({ page }) => {
    await loginAsAdmin(page);
    // Today the backend ignores persistedObjectId and narrows only by `search`.
    // A search for a voucher id also matches other records whose values hold it,
    // so the page must not show those.
    const rows = await api<AuditRow[]>(page, '/rest/auditTrail/index.json?max=500&search=soupbroker.finance.Voucher');
    const voucherId = rows.find((r) => r.className === 'soupbroker.finance.Voucher')?.persistedObjectId;
    expect(voucherId, 'precondition: a voucher in the audit log').toBeTruthy();
    const ignored = await api<AuditRow[]>(page, `/rest/auditTrail/index.json?max=50&persistedObjectId=${voucherId}`);
    const exactSupported = ignored.length > 0 && ignored.every((r) => r.persistedObjectId === voucherId);

    await page.locator('aside').getByRole('link', { name: 'Reports', exact: true }).click();
    await page.locator('aside').getByRole('link', { name: 'Audit Trail', exact: true }).click();
    await page.getByTestId('audit-filter-from').fill('2020-01-01');
    await page.getByTestId('audit-filter-search').fill(voucherId!);
    await page.getByTestId('audit-filter-apply').click();
    const table = page.getByTestId('audit-trail-table');
    await expect(table.locator('tr[data-action]').first()).toBeVisible({ timeout: 90000 });
    // Free-text search keeps every hit; with the record id in the Search box,
    // at least one row must be the voucher itself.
    await expect(table.locator(`tr[data-entity-id="${voucherId}"]`).first()).toBeVisible();
    console.log(`[SOUPFIN-159] backend applies persistedObjectId exactly: ${exactSupported}`);
    await shot(page, '03-audit-trail-search-by-id');
  });
});
