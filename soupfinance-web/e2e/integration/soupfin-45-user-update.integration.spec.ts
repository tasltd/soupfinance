/**
 * SOUPFIN-45 — "Update button on settings/users is not working"
 *
 * Regression E2E against the REAL LXC backend.
 *
 * The bug: /rest/agent/show/{id}.json serialises `userAccess` as a shallow Grails FK
 * ({ id, class }) with NO username — measured 0/100 agents. UserFormPage read
 * `userAccess.username` raw, so the Edit form loaded a BLANK username, Zod's
 * `min(3)` failed, and react-hook-form refused to submit. The Update button
 * therefore fired no request at all and gave no feedback near the button.
 *
 * These tests drive the real UI by clicking (never page.goto for an internal route)
 * and verify the BACKEND actually changed — a toast or a redirect alone would not
 * have caught this.
 *
 * NOTE on verification: the backend's `show/{id}.json` serves a STALE read after an
 * update (the DB and `index.json` both show the new value; `show` does not — filed
 * separately). So state is asserted through `index.json`, which reflects reality.
 */
import { test, expect, request as playwrightRequest, type Page } from '@playwright/test';
import { backendTestUsers } from '../fixtures';

const PROBE_USERNAME = 'soupfin45.probe';
// Git-tracked screenshot dir, matching the repo convention for per-ticket evidence.
// NOT test-results/, which is git-ignored — evidence must ship with the fix.
const SHOTS = 'e2e/playwright/screenshots/soupfin-45';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/soupfin-45-${name}.png`, fullPage: true });
}

async function loginAsAdmin(page: Page) {
  await page.goto('/login'); // only the initial login URL may be direct
  await page.getByTestId('login-email-input').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
  const remember = page.getByTestId('login-remember-checkbox');
  if (await remember.isVisible().catch(() => false)) await remember.check();
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

async function settleAuth(page: Page) {
  await page
    .waitForFunction(() => !document.body.textContent?.includes('Verifying authentication'), {
      timeout: 20000,
    })
    .catch(() => {});
}

/** Reads the probe agent straight from the backend list (fresh, unlike `show`). */
async function fetchProbeFromApi(page: Page) {
  const token = await page.evaluate(
    () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
  const res = await page.request.get('/rest/agent/index.json?max=1000', {
    headers: { 'X-Auth-Token': token, Accept: 'application/json' },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(200);
  const rows = (await res.json()) as Array<Record<string, any>>;
  return rows.find((r) => (r.simpleID || '').includes(PROBE_USERNAME));
}

/** Navigates Dashboard → Settings → Users by CLICKING the real menu. */
async function navigateToUsersByMenu(page: Page) {
  await settleAuth(page);
  await page.getByRole('link', { name: /settings/i }).first().click();
  await expect(page).toHaveURL(/\/settings/, { timeout: 20000 });
  await settleAuth(page);
  await shot(page, '01-settings-landing');

  await page.getByRole('link', { name: /^users$/i }).first().click();
  await expect(page).toHaveURL(/\/settings\/users/, { timeout: 20000 });
  await expect(page.getByTestId('user-list-page')).toBeVisible({ timeout: 20000 });
  await shot(page, '02-users-list');
}

/** Clicks through to the probe user's Edit form from the list. */
async function openProbeEditForm(page: Page) {
  const row = page.locator('tr', { hasText: 'Soupfin' }).first();
  await expect(row).toBeVisible({ timeout: 20000 });
  await row.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/settings\/users\/[0-9a-f]+/i, { timeout: 20000 });
  await expect(page.getByPlaceholder('Login username')).toBeVisible({ timeout: 20000 });
  // Wait for the query to land and the form to reset with real values.
  await expect(page.getByPlaceholder('Enter first name')).toHaveValue(/.+/, { timeout: 20000 });
}

/**
 * Ensures the probe agent exists before the suite runs, so this spec is self-contained
 * on a fresh database rather than silently depending on a hand-made fixture.
 * Goes through the Vite proxy (baseURL) so the Api-Authorization header is injected.
 */
async function ensureProbeAgentExists(baseURL: string) {
  const ctx = await playwrightRequest.newContext({ baseURL });
  try {
    const login = await ctx.post('/rest/api/login', {
      data: {
        username: backendTestUsers.admin.username,
        password: backendTestUsers.admin.password,
      },
      maxRedirects: 0,
    });
    expect(login.ok(), 'admin login must succeed').toBeTruthy();
    const token = (await login.json()).access_token as string;
    const headers = { 'X-Auth-Token': token, Accept: 'application/json' };

    const list = await ctx.get('/rest/agent/index.json?max=1000', { headers, maxRedirects: 0 });
    const rows = (await list.json()) as Array<Record<string, any>>;
    if (rows.some((r) => (r.simpleID || '').includes(PROBE_USERNAME))) return;

    // Create it. POST/save is the one verb that DOES require a Grails CSRF token, and
    // the token is session-bound — hence reusing this same request context.
    const create = await ctx.get('/rest/agent/create.json', { headers, maxRedirects: 0 });
    const csrf = await create.json();
    const qs = new URLSearchParams({
      SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
      SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
    }).toString();

    const saved = await ctx.post(`/rest/agent/save.json?${qs}`, {
      headers,
      data: {
        firstName: 'Soupfin',
        lastName: 'Probe',
        userAccess: { username: PROBE_USERNAME, password: 'secret123' },
        authorities: [{ authority: 'ROLE_USER' }],
      },
      maxRedirects: 0,
    });
    expect(saved.status(), 'probe agent must be creatable').toBeLessThan(300);
  } finally {
    await ctx.dispose();
  }
}

test.describe('SOUPFIN-45 — Update button on settings/users', () => {
  test.beforeAll(async ({ baseURL }) => {
    await ensureProbeAgentExists(baseURL!);
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Edit form prefills the username the backend actually sends', async ({ page }) => {
    await navigateToUsersByMenu(page);
    await openProbeEditForm(page);
    await shot(page, '03-edit-form-loaded');

    // THE FIX. Before it, this field was empty — which silently blocked submit.
    await expect(page.getByPlaceholder('Login username')).toHaveValue(PROBE_USERNAME, {
      timeout: 15000,
    });
    await shot(page, '04-username-prefilled');
  });

  test('Update fires a request and the backend state actually changes', async ({ page }) => {
    const before = await fetchProbeFromApi(page);
    expect(before, 'probe agent must exist on the backend').toBeTruthy();

    const newDesignation = `SOUPFIN45 ${Date.now()}`;

    await navigateToUsersByMenu(page);
    await openProbeEditForm(page);

    // Watch the wire: the whole ticket is that NO request was sent.
    const updateRequest = page.waitForRequest(
      (r) => r.method() === 'PUT' && /\/rest\/agent\/update\//.test(r.url()),
      { timeout: 20000 }
    );

    const designation = page.getByPlaceholder('e.g., Finance Manager');
    await designation.fill(newDesignation);
    await shot(page, '05-form-edited');

    await page.getByTestId('user-form-submit-button').click();

    const req = await updateRequest;
    expect(req.url()).toMatch(/\/rest\/agent\/update\//);
    await shot(page, '06-after-update-click');

    // SPA rule: never trust the UI alone — confirm the backend changed.
    await expect(page).toHaveURL(/\/settings\/users$/, { timeout: 20000 });
    await settleAuth(page);
    // Wait for the LIST to actually mount before capturing. A URL assertion resolves
    // the instant the route changes, so shooting here caught the still-mounted edit
    // form and labelled it "back on user list" — a screenshot that reads as evidence
    // while showing the previous screen.
    await expect(page.getByTestId('user-list-page')).toBeVisible({ timeout: 20000 });
    await expect(page.getByPlaceholder('Search users...')).toBeVisible({ timeout: 20000 });
    await shot(page, '07-back-on-user-list');

    await expect
      .poll(async () => (await fetchProbeFromApi(page))?.designation, { timeout: 30000 })
      .toBe(newDesignation);

    // And the change is visible to the user on the list they were returned to.
    // Narrow with the search box first: this tenant carries 1300+ agents, so an
    // unfiltered full-page capture is 9000px tall and useless as evidence.
    await page.reload();
    await settleAuth(page);
    await expect(page.getByTestId('user-list-page')).toBeVisible({ timeout: 20000 });
    await page.getByPlaceholder('Search users...').fill('Soupfin');
    const probeRow = page.locator('tr', { hasText: 'Soupfin' }).first();
    await expect(probeRow).toBeVisible({ timeout: 20000 });
    await expect(probeRow).toContainText(newDesignation, { timeout: 20000 });
    await shot(page, '08-list-shows-new-value');
  });

  test('a genuinely blocked submit is visible, not a dead button', async ({ page }) => {
    await navigateToUsersByMenu(page);
    await openProbeEditForm(page);

    // Make the form truly invalid, then press Update.
    await page.getByPlaceholder('Login username').fill('');
    await shot(page, '09-username-cleared');

    let sawRequest = false;
    page.on('request', (r) => {
      if (r.method() === 'PUT' && /\/rest\/agent\/update\//.test(r.url())) sawRequest = true;
    });

    await page.getByTestId('user-form-submit-button').click();

    // Correct to send nothing — the data really is invalid...
    const banner = page.getByTestId('user-form-submit-error');
    await expect(banner).toBeVisible({ timeout: 15000 });
    // ...but the user must be TOLD, right where they clicked.
    await expect(banner).toContainText(/username/i);
    expect(sawRequest, 'invalid form must not reach the backend').toBe(false);
    await shot(page, '10-blocked-submit-banner');
  });
});
