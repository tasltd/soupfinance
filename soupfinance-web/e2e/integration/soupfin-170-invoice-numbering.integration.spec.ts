/**
 * Added (SOUPFIN-170): five invoices saved in a row through the UI must all succeed, each with
 * its own number, against the real LXC backend. No mocks.
 *
 * The defect (SOUP-2619): InvoiceService.save() took the next number from GORM last(), which
 * orders by the random UUID id, so it regenerated a number already in use and the save was
 * refused with 422 "Property [number] must be unique". The backend fix (DocumentNumberSequencer,
 * MAX(number) per numberPrefix) is soupmarkets-web d5ad3765b3, merged 2026-08-04.
 *
 * One save in a row is not enough: last() returned an arbitrary row, so a single save could
 * pass by luck. Five consecutive saves with distinct, increasing numbers is the check the
 * ticket asks for.
 *
 * The spec also times GET /rest/invoice/create.json, which every invoice save calls first for
 * its CSRF token. SOUPFIN-41 measured it at about 23 s on the old last() lookup.
 *
 * Run (the dev DB has no seed password for soup.support; any ROLE_ADMIN works):
 *   E2E_ADMIN_USERNAME=<admin> E2E_ADMIN_PASSWORD=<password> \
 *   npx playwright test --config=playwright.lxc.config.ts \
 *     e2e/integration/soupfin-170-invoice-numbering.integration.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { backendTestUsers } from '../fixtures';
import { selectInvoiceableClient } from './invoice-client-helper';

const API_BASE = 'http://10.115.213.183:9090';
const SAVES = 5;

// test-results/ is wiped on each run; the committed copy is the evidence.
const SHOT_DIRS = [
  'test-results/screenshots/soupfin-170',
  'e2e/playwright/screenshots/soupfin-170',
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

/** The auth gate renders before content; never use networkidle on this backend. */
async function waitForAuthSettled(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForFunction(() => !document.body.textContent?.includes('Verifying authentication'), {
      timeout: 20000,
    })
    .catch(() => {});
}

function dueDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

/** Time GET /rest/invoice/create.json through the Vite proxy, as the app calls it. */
async function timeCreateJson(page: Page, authToken: string): Promise<number> {
  const started = Date.now();
  const response = await page.request.get('/rest/invoice/create.json', {
    headers: { 'X-Auth-Token': authToken, Accept: 'application/json' },
    maxRedirects: 0,
    timeout: 120000,
  });
  const elapsed = Date.now() - started;
  expect(response.status(), 'create.json status').toBe(200);
  const body = await response.json();
  expect(body.SYNCHRONIZER_TOKEN, 'create.json must carry a CSRF token').toBeTruthy();
  return elapsed;
}

test.describe('SOUPFIN-170 invoice numbering against the LXC backend', () => {
  test('GET /rest/invoice/create.json latency', async ({ page }) => {
    test.setTimeout(600000);
    await login(page);
    const authToken = await token(page);

    const samples: number[] = [];
    for (let i = 0; i < 3; i++) samples.push(await timeCreateJson(page, authToken));
    console.log(`[SOUPFIN-170] create.json latency ms: ${samples.join(', ')}`);

    // The app's axios timeout is 30 s. A CSRF fetch that long leaves no room for the save.
    for (const ms of samples) expect(ms, 'create.json must answer inside the 30 s client timeout').toBeLessThan(30000);
  });

  test(`${SAVES} consecutive invoice saves each get a new number and no 422`, async ({ page }) => {
    test.setTimeout(900000);

    // Every 422 the app receives during the run, from any endpoint.
    const unprocessable: string[] = [];
    page.on('response', (r) => {
      if (r.status() === 422) unprocessable.push(`${r.request().method()} ${r.url()}`);
    });

    await login(page);
    const authToken = await token(page);
    await shot(page, 'soupfin-170-01-logged-in');

    const saved: { id: string; number: number }[] = [];
    let clientId = '';

    for (let n = 1; n <= SAVES; n++) {
      // Menu click, not a direct goto. Matched by href because the Material Symbols ligature
      // pollutes the link's accessible name.
      await page.locator('aside a[href="/invoices"]').first().click();
      await waitForAuthSettled(page);
      await expect(page).toHaveURL(/\/invoices$/, { timeout: 20000 });
      await page.getByTestId('invoice-new-button').click();
      await waitForAuthSettled(page);
      await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 20000 });

      const clientSelect = page.getByTestId('invoice-client-select');
      if (!clientId) {
        clientId = await selectInvoiceableClient(page, clientSelect, API_BASE, authToken, 'Soupfin170');
      } else {
        await expect
          .poll(async () => (await clientSelect.locator('option').count()), { timeout: 30000 })
          .toBeGreaterThan(1);
        await clientSelect.selectOption(clientId);
      }

      await page.getByTestId('invoice-due-date-input').fill(dueDateIso());
      await page.getByTestId('invoice-item-description-0').fill(`SOUPFIN-170 consecutive save ${n}`);
      await page.getByTestId('invoice-item-quantity-0').fill('1');
      await page.getByTestId('invoice-item-unitPrice-0').fill(String(100 * n));
      await shot(page, `soupfin-170-0${n + 1}-invoice-${n}-filled`);

      const saveResponse = page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/rest\/invoice\/save\.json/.test(r.url()),
        { timeout: 120000 }
      );
      await page.getByTestId('invoice-form-save-draft-button').click();
      const response = await saveResponse;

      // The bug's exact signature: 422 with a uniqueness message on the number.
      const status = response.status();
      const bodyText = await response.text();
      expect(status, `save ${n} returned ${status}: ${bodyText.slice(0, 300)}`).toBeLessThan(300);

      const body = JSON.parse(bodyText);
      const created = body.invoice ?? body;
      expect(created.id, `save ${n} must return the new invoice id`).toBeTruthy();

      await expect(page).toHaveURL(/\/invoices$/, { timeout: 120000 });
      await waitForAuthSettled(page);

      // Read the number off the backend rather than trusting the save response alone.
      const show = await page.request.get(`${API_BASE}/rest/invoice/show/${created.id}.json`, {
        headers: { 'X-Auth-Token': authToken }, maxRedirects: 0, timeout: 60000,
      });
      expect(show.ok(), `show ${created.id}`).toBeTruthy();
      const persisted = await show.json();
      const number = Number(persisted.number);
      expect(Number.isFinite(number), `invoice ${created.id} must have a number`).toBe(true);
      saved.push({ id: created.id, number });
      console.log(`[SOUPFIN-170] save ${n}: id=${created.id} number=${number} status=${status}`);
    }

    await shot(page, `soupfin-170-0${SAVES + 2}-invoice-list-after-saves`);

    expect(unprocessable, 'no request may be refused 422 during the run').toEqual([]);
    expect(new Set(saved.map((s) => s.id)).size, 'five distinct invoices').toBe(SAVES);
    expect(new Set(saved.map((s) => s.number)).size, 'five distinct numbers').toBe(SAVES);
    for (let i = 1; i < saved.length; i++) {
      expect(saved[i].number, `invoice ${i + 1} must be numbered after invoice ${i}`).toBeGreaterThan(
        saved[i - 1].number
      );
    }
  });
});
