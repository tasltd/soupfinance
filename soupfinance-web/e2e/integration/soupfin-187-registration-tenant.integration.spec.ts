/**
 * SOUPFIN-187: a freshly registered tenant can reach its own data.
 * Runs against the REAL LXC backend (no mocks).
 *
 * The bug behind SOUPFIN-2: POST /account/register.json left the new Agent with a
 * NULL tenant_id, so after login every data call failed to resolve a tenant
 * (TenantNotFoundException / 403). This spec walks the whole path a new customer
 * takes and checks the result through the API, not only the screen:
 *
 *   register -> (confirm email) -> log in through the form -> dashboard
 *   -> GET /rest/user/current.json  tenantId === the new account id
 *   -> GET /rest/invoice/index.json 200 and empty (other tenants' invoices stay hidden)
 *   -> GET /rest/ledgerAccount/index.json 200 with the chart of accounts seeded for it
 *
 * The confirm leg needs the emailed token. The LXC dev box sends every email to
 * support@techatscale.io and signs the token with a per-start random secret, so the
 * spec takes it from ONE of these (see plans/soupfin-187-registration-tenant-id-backend.md):
 *
 *   E2E_REGISTRATION_TOKEN_SECRET  same value as REGISTRATION_TOKEN_SECRET on the
 *                                  backend; the spec mints the token itself.
 *   E2E_SINGLE_STEP_CONSUMER_ID +  an ApiConsumer with require_email_confirmation = 0
 *   E2E_SINGLE_STEP_CONSUMER_SECRET  (production's setting); registration then enables
 *                                  the user at once and there is nothing to confirm.
 *
 * With neither set and a consumer that requires confirmation, the test fails with a
 * message naming both, rather than passing on half the path.
 *
 * Run:
 *   E2E_PORT=5197 E2E_SINGLE_STEP_CONSUMER_ID='...' E2E_SINGLE_STEP_CONSUMER_SECRET='...' \
 *     npx playwright test --config=playwright.lxc.config.ts \
 *     e2e/integration/soupfin-187-registration-tenant.integration.spec.ts --project=firefox
 */
import { createHmac } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-187';
const BACKEND = process.env.VITE_PROXY_TARGET || 'http://10.115.213.183:9090';
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const companyName = `SOUPFIN-187 Tenant ${runId}`;
const email = `soupfin187-${runId}@example.com`;
// Meets the confirm page's rules (>= 8, upper, lower, digit) and the backend's (>= 6).
const password = 'Sf187Probe1';

test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(240_000);

interface RegisterResponse {
  success: boolean;
  message?: string;
  requiresConfirmation: boolean;
  account?: { id: string; name: string };
  agentId?: string;
  email?: string;
}

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

/**
 * Same format as AccountRegistrationService.generateConfirmationToken:
 * base64url("agentId:timestamp:" + base64url(HMAC-SHA256(secret, "agentId:timestamp"))), unpadded.
 */
function mintConfirmationToken(agentId: string, secret: string): string {
  const payload = `${agentId}:${Date.now()}`;
  const signature = createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
  return Buffer.from(`${payload}:${signature}`, 'utf8').toString('base64url');
}

/**
 * Registers through the single-step consumer when one is configured (direct to the
 * backend, because the Vite proxy would overwrite Api-Authorization with the
 * soupfinance-web consumer), otherwise through the app's own proxy.
 */
async function register(request: APIRequestContext): Promise<RegisterResponse> {
  const body = {
    companyName,
    businessType: 'SERVICES',
    adminFirstName: 'Soupfin',
    adminLastName: 'OneEightSeven',
    email,
    password,
  };
  const id = process.env.E2E_SINGLE_STEP_CONSUMER_ID;
  const secret = process.env.E2E_SINGLE_STEP_CONSUMER_SECRET;
  const response =
    id && secret
      ? await request.post(`${BACKEND}/account/register.json`, {
          data: body,
          headers: {
            Accept: 'application/json',
            'Api-Authorization': `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
          },
          maxRedirects: 0,
          timeout: 180_000,
        })
      : await request.post('/account/register.json', {
          data: body,
          headers: { Accept: 'application/json' },
          maxRedirects: 0,
          timeout: 180_000,
        });
  expect(response.status(), `register: ${await response.text()}`).toBe(201);
  return (await response.json()) as RegisterResponse;
}

async function getAuthToken(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '');
}

/** Read through the Vite proxy, as the app does, so Api-Authorization is injected. */
async function apiGet<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/rest${path}`, {
    headers: { 'X-Auth-Token': await getAuthToken(page), Accept: 'application/json' },
    maxRedirects: 0,
    timeout: 90_000,
  });
  expect(response.status(), `GET /rest${path}`).toBe(200);
  return (await response.json()) as T;
}

test('a new tenant registers, confirms, logs in and reads its own data', async ({ page }) => {
  // 1. Register a brand-new tenant.
  const registered = await register(page.request);
  expect(registered.success, registered.message).toBe(true);
  expect(registered.email).toBe(email);
  const accountId = registered.account?.id ?? '';
  const agentId = registered.agentId ?? '';
  expect(accountId, 'register returns the new account id').toMatch(/^[0-9a-f]{32}$/);
  expect(agentId, 'register returns the new agent id').toMatch(/^[0-9a-f]{32}$/);

  // 2. Confirm the email when this consumer asks for it.
  if (registered.requiresConfirmation) {
    // Before confirming, the account must not be usable.
    const early = await page.request.post('/rest/api/login', {
      data: { username: email, password },
      headers: { Accept: 'application/json' },
      maxRedirects: 0,
    });
    expect(early.status(), 'login before confirming the email is refused').not.toBe(200);

    const secret = process.env.E2E_REGISTRATION_TOKEN_SECRET;
    if (!secret) {
      throw new Error(
        'This consumer requires email confirmation, and the LXC box mails the token to ' +
          'support@techatscale.io. Set E2E_REGISTRATION_TOKEN_SECRET (= REGISTRATION_TOKEN_SECRET ' +
          'on the backend) or E2E_SINGLE_STEP_CONSUMER_ID/_SECRET. See ' +
          'plans/soupfin-187-registration-tenant-id-backend.md.',
      );
    }
    const confirm = await page.request.post('/account/confirmEmail.json', {
      data: { token: mintConfirmationToken(agentId, secret), password, confirmPassword: password },
      headers: { Accept: 'application/json' },
      maxRedirects: 0,
      timeout: 90_000,
    });
    const confirmed = (await confirm.json()) as { success: boolean; message?: string };
    expect(confirmed.success, `confirmEmail: ${confirmed.message}`).toBe(true);
  }

  // 3. Log in through the form, as a customer would.
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await shot(page, 'login-filled');
  await page.getByTestId('login-submit-button').click();
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 90_000 });
  // The dashboard's own data calls finish without an error panel (the SOUPFIN-2 symptom).
  await expect(page.getByTestId('dashboard-invoices-loading')).toHaveCount(0, { timeout: 90_000 });
  await expect(page.getByTestId('dashboard-invoices-error')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-stats-error')).toHaveCount(0);
  await shot(page, 'dashboard-new-tenant');

  // 4. The session resolves to the new tenant, not the box's default one.
  const current = await apiGet<{ username: string; tenantId?: string; agentId?: string }>(page, '/user/current.json');
  expect(current.username).toBe(email);
  expect(current.tenantId, 'current.json tenantId is the new account').toBe(accountId);
  expect(current.agentId).toBe(agentId);

  // 5. Data calls succeed and are scoped to this tenant. A brand-new tenant has no
  //    invoices; any row here would belong to someone else.
  const invoices = await apiGet<unknown[]>(page, '/invoice/index.json?max=50');
  expect(Array.isArray(invoices)).toBe(true);
  expect(invoices).toHaveLength(0);

  // Chart of accounts is seeded at registration (SOUPFIN-144), and readable.
  const ledgerAccounts = await apiGet<Array<{ id: string }>>(page, '/ledgerAccount/index.json?max=500');
  expect(ledgerAccounts.length, 'seeded chart of accounts is visible to the new tenant').toBeGreaterThan(0);

  // 6. The invoice list page renders the empty state, not an error.
  await page.getByRole('link', { name: /invoices/i }).first().click();
  await expect(page.getByTestId('invoice-list-page')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('invoice-list-error')).toHaveCount(0);
  await shot(page, 'invoices-empty-new-tenant');
});
