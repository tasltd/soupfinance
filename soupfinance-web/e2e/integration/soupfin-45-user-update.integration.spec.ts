/**
 * SOUPFIN-45 — "Update button on settings/users is not working".
 *
 * The Edit User form fired NO request when Update was clicked.
 *
 * Root cause (verified against the live LXC backend, 50/50 agents):
 * `/rest/agent/show/{id}.json` serialises `userAccess` as a shallow Grails FK —
 * `{ id, class }` with no `username`. The form seeded its Username field from
 * `userAccess.username`, so it was always ''. Zod's `username: z.string().min(3)`
 * then failed, react-hook-form refused to invoke onSubmit, and no HTTP request was
 * ever sent. The login username is only recoverable from `simpleID`
 * ("First Last, Access:the.username") — the recovery UserListPage has done since
 * SOUPFIN-30 #9 and UserFormPage was missing.
 *
 * These tests navigate by CLICKING menu items (never a direct `goto` for an internal
 * route) so they also prove the surface is reachable, and they validate SPA-style:
 * the backend agent record is read BEFORE and AFTER the UI action, so a passing test
 * means the server state genuinely changed — not that a toast appeared.
 *
 * Screenshots are written to e2e/playwright/screenshots/soupfin-45/ and committed as
 * evidence (the shared `takeScreenshot` helper writes under `test-results/`, which
 * Playwright wipes at the start of each run).
 */
import { test, expect, type Page } from '@playwright/test';
import { backendTestUsers } from '../fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-45';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

/** Reads the token from BOTH storages — login uses a dual-storage strategy. */
async function getAuthToken(page: Page): Promise<string> {
  return page.evaluate(
    () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}

async function loginAsAdmin(page: Page) {
  // The login URL is the ONLY direct navigation permitted — everything after this
  // is reached by clicking.
  await page.goto('/login');
  await page.getByTestId('login-email-input').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);

  const remember = page.getByTestId('login-remember-checkbox');
  if (await remember.isVisible().catch(() => false)) await remember.check();

  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
}

/** Clicks Settings -> Users in the sidebar. No route goto. */
async function navigateToUsersByMenu(page: Page) {
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await expect(page).toHaveURL(/\/settings/, { timeout: 20000 });
  await page.waitForFunction(
    () => !document.body.textContent?.includes('Verifying authentication'),
    { timeout: 25000 }
  ).catch(() => {});

  // The sidebar reveals its children once the section is active; the Settings
  // sub-nav also renders a Users link.
  await page.getByRole('link', { name: 'Users', exact: true }).first().click();
  await expect(page).toHaveURL(/\/settings\/users/, { timeout: 20000 });
  await expect(page.getByTestId('user-list-page')).toBeVisible({ timeout: 25000 });
}

/** Fetches an agent straight from the backend so we can compare server state. */
async function fetchAgent(page: Page, id: string) {
  const token = await getAuthToken(page);
  const res = await page.request.get(`/rest/agent/show/${id}.json`, {
    headers: { 'X-Auth-Token': token, Accept: 'application/json' },
    maxRedirects: 0, // Grails redirects to https://localhost:9090 otherwise
  });
  expect(res.status()).toBe(200);
  return res.json();
}

test.describe('SOUPFIN-45 — Update User actually submits', () => {
  // Lives in e2e/integration/ because this bug only exists against a REAL backend
  // payload: the mock fixtures supply a `username` the real server never sends,
  // which is exactly how it went unnoticed. No test.skip() — this always runs.

  test('clicking Update fires the request and persists the change', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => {
      if (/\/rest\/agent\/update\//.test(r.url())) requests.push(`${r.method()} ${r.url()}`);
    });

    await loginAsAdmin(page);
    await shot(page, '01-dashboard-after-login');

    await navigateToUsersByMenu(page);
    await shot(page, '02-user-list');

    // Open the first user's edit form by clicking its row action.
    await page.locator('a[href^="/settings/users/"]:not([href$="/new"])').first().click();
    await expect(page).toHaveURL(/\/settings\/users\/[^/]+$/, { timeout: 20000 });
    await expect(page.getByTestId('user-form-submit-button')).toBeVisible({ timeout: 25000 });

    const agentId = (page.url().match(/\/settings\/users\/([^/?#]+)/) || [])[1];
    expect(agentId, 'edit route should carry an agent id').toBeTruthy();

    const before = await fetchAgent(page, agentId!);
    await shot(page, '03-edit-form-loaded');

    // REGRESSION GUARD: the Username field must be populated. A blank box here is
    // the visible face of the bug — it is what made Zod block the submit.
    const username = page.getByPlaceholder('Login username');
    await expect(username).not.toHaveValue('', { timeout: 15000 });
    const usernameValue = await username.inputValue();
    expect(usernameValue.length).toBeGreaterThanOrEqual(3);

    // Make a change we can assert on the server afterwards.
    const newDesignation = `QA Update ${Date.now()}`;
    const designation = page.getByPlaceholder('e.g., Finance Manager').first();
    await designation.fill(newDesignation);
    await shot(page, '04-edit-form-filled');

    const submit = page.getByTestId('user-form-submit-button');
    await expect(submit).toBeEnabled();

    const updateCall = page
      .waitForResponse((r) => /\/rest\/agent\/update\//.test(r.url()), { timeout: 30000 })
      .catch(() => null);
    await submit.click();
    const response = await updateCall;

    // THE ASSERTION THIS ISSUE IS ABOUT: a request must actually leave the browser.
    await shot(page, '05-after-update-click');
    expect(requests.length, `no /rest/agent/update/ request was sent. Seen: ${JSON.stringify(requests)}`)
      .toBeGreaterThan(0);
    expect(response, 'update request produced no response').not.toBeNull();

    // Round-trip: the SERVER state changed, not just the UI.
    const after = await fetchAgent(page, agentId!);
    expect(after.designation).toBe(newDesignation);
    expect(after.designation).not.toBe(before.designation);
    await shot(page, '06-persisted-on-server');
  });

  test('a refused submit explains itself instead of doing nothing', async ({ page }) => {
    // EDGE: the failure mode this issue reported was silence. Clearing a required
    // field must produce visible feedback AND still block the request.
    const requests: string[] = [];
    page.on('request', (r) => {
      if (/\/rest\/agent\/update\//.test(r.url())) requests.push(r.url());
    });

    await loginAsAdmin(page);
    await navigateToUsersByMenu(page);

    await page.locator('a[href^="/settings/users/"]:not([href$="/new"])').first().click();
    await expect(page.getByTestId('user-form-submit-button')).toBeVisible({ timeout: 25000 });

    await page.getByPlaceholder('Enter first name').fill('');
    await shot(page, '07-invalid-form');

    await page.getByTestId('user-form-submit-button').click();

    const banner = page.getByTestId('user-form-submit-error');
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner).toContainText(/First name/i);
    await shot(page, '08-blocked-submit-explained');

    expect(requests, 'an invalid form must not reach the backend').toHaveLength(0);
  });

  test('the user list shows the same username the edit form loads', async ({ page }) => {
    // Guards the divergence that caused this bug: list and form now share
    // getAgentUsername(), so they can never disagree again.
    await loginAsAdmin(page);
    await navigateToUsersByMenu(page);

    const listUsername = await page.locator('text=/^@[\\w.@-]+$/').first().textContent();
    expect(listUsername, 'user list should display an @username').toBeTruthy();
    await shot(page, '09-list-username');

    await page.locator('a[href^="/settings/users/"]:not([href$="/new"])').first().click();
    await expect(page.getByTestId('user-form-submit-button')).toBeVisible({ timeout: 25000 });

    const formUsername = await page.getByPlaceholder('Login username').inputValue();
    expect(formUsername).toBe(listUsername!.replace(/^@/, ''));
    await shot(page, '10-form-username-matches');
  });
});
