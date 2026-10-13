/**
 * Added (SOUPFIN-169, SOUPFIN-7 #1): deleting a client must remove it from
 * /rest/client/index.json and list it in /rest/client/archived.json, against
 * the real LXC backend.
 *
 * The client is created through the New Client form, so it carries the same
 * linked records a real one does (contact, portfolio, Individual row). It is
 * then deleted from the Clients list, and the backend is asked directly what it
 * did: the DELETE response, then index.json and archived.json.
 *
 * Expected to FAIL until the backend change in
 * plans/soupfin-169-client-delete-backend.md ships. On 2026-10-13 the backend
 * answered the DELETE with 200 + relatedList, deleted nothing, and the client
 * stayed in index.json. Skipping the dependency check showed the second defect:
 * doDelete sets deleted=true and archived.json filters deleted=false, so a
 * deleted client is never listed there either.
 *
 * Run (the dev DB has no seed password for soup.support; any ROLE_ADMIN works):
 *   E2E_ADMIN_USERNAME=<admin> E2E_ADMIN_PASSWORD=<password> \
 *   npx playwright test --config=playwright.lxc.config.ts e2e/integration/clients-delete.integration.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { backendTestUsers } from '../fixtures';

// test-results/ is wiped on each run; the committed copy is the evidence.
const SHOT_DIRS = [
  'test-results/screenshots/soupfin-169',
  'e2e/playwright/screenshots/soupfin-169',
];
for (const dir of SHOT_DIRS) mkdirSync(dir, { recursive: true });

async function shot(page: Page, name: string) {
  for (const dir of SHOT_DIRS) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
  const remember = page.getByTestId('login-remember-checkbox');
  if (await remember.isVisible().catch(() => false)) await remember.check();
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
}

async function token(page: Page): Promise<string> {
  return page.evaluate(
    () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}

type ClientRow = { id: string; archived?: boolean | null };

// Through the Vite proxy, so the request carries the same Api-Authorization the app sends.
async function listIds(page: Page, list: 'index' | 'archived', q: string): Promise<string[]> {
  const response = await page.request.get(
    `/rest/client/${list}.json?max=100&q=${encodeURIComponent(q)}`,
    {
      headers: { 'X-Auth-Token': await token(page), Accept: 'application/json' },
      maxRedirects: 0,
      timeout: 60000,
    }
  );
  expect(response.status(), `${list}.json status`).toBe(200);
  const body = (await response.json()) as ClientRow[];
  return body.map((row) => row.id);
}

// Every run creates a client on the shared dev DB. If the backend refused the
// delete, archive it the way the admin "Delete Target Only" button does
// (relationChecked=true skips the linked-records check; the soft-delete keeps
// the rows), so failed runs do not pile up test clients.
let createdClientId: string | null = null;

test.describe('SOUPFIN-169 client delete against the LXC backend', () => {
  test.setTimeout(180000);

  test.afterEach(async ({ page }) => {
    if (!createdClientId) return;
    const id = createdClientId;
    createdClientId = null;
    await page.request
      .delete(`/rest/client/delete/${id}.json?relationChecked=true`, {
        headers: { 'X-Auth-Token': await token(page), Accept: 'application/json' },
        maxRedirects: 0,
        timeout: 60000,
      })
      .catch(() => null);
  });

  test('a deleted client leaves index.json and appears in archived.json', async ({ page }) => {
    const stamp = Date.now().toString(36).toUpperCase();
    const lastName = `Delete${stamp}`;

    await login(page);

    // 1. Create the client through the menu and the New Client form.
    await page.getByRole('navigation').first().getByRole('link', { name: 'Clients', exact: true }).click();
    await expect(page).toHaveURL(/\/clients$/);
    await page.getByTestId('client-new-button').click();
    await page.getByTestId('client-type-individual').click();
    await page.getByTestId('client-form-first-name').fill('Soupfin169');
    await page.getByTestId('client-form-last-name').fill(lastName);
    await page.getByTestId('client-form-email').fill(`soupfin169-${stamp.toLowerCase()}@example.com`);
    await shot(page, 'client-form-filled');
    await page.getByTestId('client-form-save').click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f]{32}$/, { timeout: 60000 });
    const clientId = page.url().split('/').pop()!;
    createdClientId = clientId;

    // State before the delete: listed as active, not archived.
    expect(await listIds(page, 'index', lastName)).toContain(clientId);
    expect(await listIds(page, 'archived', lastName)).not.toContain(clientId);

    // 2. Find it in the Clients list and delete it through the modal.
    await page.getByRole('navigation').first().getByRole('link', { name: 'Clients', exact: true }).click();
    await page.getByTestId('client-search-input').fill(lastName);
    await expect(page.getByTestId(`client-row-${clientId}`)).toBeVisible({ timeout: 60000 });
    await shot(page, 'client-list-before-delete');

    await page.getByTestId(`client-delete-${clientId}`).click();
    await expect(page.getByTestId('delete-confirmation-modal')).toBeVisible();
    await shot(page, 'client-delete-modal');

    const deleteResponse = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && r.url().includes(`/rest/client/delete/${clientId}`),
      { timeout: 60000 }
    );
    await page.getByTestId('delete-confirm-button').click();
    const response = await deleteResponse;
    const body = (await response.text()) || '';
    await page.waitForTimeout(500); // let the modal settle on success or error before the capture
    await shot(page, 'client-after-delete');

    // 3. What the backend did. A 200 with a relatedList means "not deleted".
    expect(
      body.includes('"relatedList"') && !body.includes('"relatedList":[]'),
      `DELETE returned ${response.status()} with a relatedList and deleted nothing ` +
        '(see plans/soupfin-169-client-delete-backend.md, defect 1)'
    ).toBe(false);
    expect(response.status()).toBeLessThan(300);

    await expect(page.getByTestId('delete-confirmation-modal')).toBeHidden({ timeout: 30000 });
    await expect(page.getByTestId(`client-row-${clientId}`)).toHaveCount(0, { timeout: 30000 });
    await shot(page, 'client-list-after-delete');

    expect(await listIds(page, 'index', lastName), 'deleted client still in index.json').not.toContain(clientId);
    expect(
      await listIds(page, 'archived', lastName),
      'deleted client missing from archived.json (plans/soupfin-169-client-delete-backend.md, defect 2)'
    ).toContain(clientId);
    createdClientId = null; // deleted for real; nothing to clean up
  });
});
