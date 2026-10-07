/**
 * SOUPFIN-101 — external accountant invite and Accountant role.
 *
 * The backend half is not built yet (plans/soupfin-101-accountant-invite-backend.md), so
 * there is nothing on the LXC backend to drive. This spec stands in for it with a
 * STATEFUL mock: every invite lives in `server.invites`, the mock applies each request
 * to it the way the planned controller will, and the tests assert that state before and
 * after each UI action, not just what the page shows.
 *
 * Flows:
 *  1. Admin: Settings → Users → Accountants, invite (with validation), resend, revoke.
 *  2. Admin removes an accountant who already has access.
 *  3. The tab before the backend ships (404) says so instead of a raw error.
 *  4. Accountant: opens the emailed link, sets a password, is told to sign in.
 *  5. A revoked accountant's next request is a 401 and lands them on sign-in.
 *  6. 60 invites and a 200-character address keep the page inside the viewport.
 *
 * Navigation is by clicking the sidebar and tabs. The one `page.goto` on an internal
 * route besides /dashboard is /accept-invite, which a user only ever reaches from the
 * link in the invitation email.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { mockAmbientApi, mockTokenValidationApi, mockDashboardApi, isLxcMode } from './fixtures';

/** Git-tracked screenshot dir — `test-results/` is wiped at the start of every run. */
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/playwright/screenshots/soupfin-101/${name}.png`, fullPage: true });
}

interface Invite {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  dateCreated: string;
  lastSentAt: string | null;
  sendCount: number;
  expiresAt: string | null;
  acceptedAt?: string | null;
  revokedAt?: string | null;
}

/** In-memory stand-in for the AccountantInvite table plus what each request did to it. */
class FakeServer {
  invites: Invite[] = [];
  requests: { method: string; path: string; body: unknown }[] = [];
  private nextId = 1;

  add(partial: Partial<Invite> & { email: string }): Invite {
    const invite: Invite = {
      id: `inv-${this.nextId++}`,
      status: 'PENDING',
      dateCreated: '2026-10-01T09:00:00Z',
      lastSentAt: '2026-10-01T09:00:00Z',
      sendCount: 1,
      expiresAt: '2999-01-01T00:00:00Z',
      ...partial,
    };
    this.invites.push(invite);
    return invite;
  }

  find(email: string) {
    return this.invites.find((i) => i.email === email);
  }
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** The planned /rest/accountantInvite/* controller, applied to `server`. */
async function mockAccountantInviteApi(page: Page, server: FakeServer) {
  await page.route('**/rest/accountantInvite/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/rest/, '');
    const body = req.postDataJSON?.() ?? null;
    server.requests.push({ method: req.method(), path: `${path}${url.search}`, body });

    if (path === '/accountantInvite/index.json') {
      const newestFirst = [...server.invites].sort((a, b) => b.dateCreated.localeCompare(a.dateCreated));
      return json(route, 200, newestFirst);
    }
    if (path === '/accountantInvite/create.json') {
      return json(route, 200, { SYNCHRONIZER_TOKEN: 'csrf-101', SYNCHRONIZER_URI: '/accountantInvite/save' });
    }
    if (path === '/accountantInvite/save.json' && req.method() === 'POST') {
      // Real Grails returns 302 to the HTML form without the token.
      if (url.searchParams.get('SYNCHRONIZER_TOKEN') !== 'csrf-101') return route.fulfill({ status: 302 });
      const { email, firstName, lastName } = body as { email: string; firstName?: string; lastName?: string };
      if (server.invites.some((i) => i.email === email && (i.status === 'PENDING' || i.status === 'ACCEPTED'))) {
        return json(route, 409, { message: 'This accountant already has an invitation.' });
      }
      const invite = server.add({
        email,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        dateCreated: new Date().toISOString(),
        lastSentAt: new Date().toISOString(),
      });
      return json(route, 201, invite);
    }
    const action = path.match(/^\/accountantInvite\/(resend|revoke)\/([^/]+)\.json$/);
    if (action && req.method() === 'POST') {
      const invite = server.invites.find((i) => i.id === action[2]);
      if (!invite) return json(route, 404, { message: 'Invitation not found.' });
      if (action[1] === 'resend') {
        invite.sendCount += 1;
        invite.lastSentAt = new Date().toISOString();
      } else {
        invite.status = 'REVOKED';
        invite.revokedAt = new Date().toISOString();
      }
      return json(route, 200, invite);
    }
    return json(route, 404, { message: 'Not found' });
  });
}

/** Signed in as the tenant admin, on the dashboard. */
async function signedInAdmin(page: Page) {
  await page.addInitScript(() => {
    const user = {
      username: 'admin',
      email: 'admin@soupfinance.com',
      roles: ['ROLE_ADMIN', 'ROLE_USER'],
      tenantId: 'account-001',
    };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('auth-storage', JSON.stringify({ state: { user, isAuthenticated: true }, version: 0 }));
  });
  await mockAmbientApi(page);
  await mockTokenValidationApi(page, true);
  await mockDashboardApi(page);
  await page.route('**/rest/agent/index.json*', (route) =>
    json(route, 200, [
      {
        id: 'agent-001',
        firstName: 'Kofi',
        lastName: 'Mensah',
        designation: 'Director',
        simpleID: 'Kofi Mensah, Access:admin',
        authorities: [{ id: 1, authority: 'ROLE_ADMIN' }],
      },
    ])
  );
  await page.route('**/rest/sbRole/index.json*', (route) => json(route, 200, []));
}

/** Sidebar Settings → Users → Accountants tab. */
async function openAccountantsTab(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
  // The sidebar; the Settings page renders its own tab <nav> with a "Users" link too.
  const sidebar = page.locator('aside nav');
  await sidebar.getByRole('link', { name: 'Settings', exact: true }).click();
  await sidebar.getByRole('link', { name: 'Users', exact: true }).click();
  await expect(page.getByTestId('user-list-page')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('users-tab-accountants').click();
  await expect(page).toHaveURL(/\/settings\/users\/accountants$/);
  await expect(page.getByTestId('accountant-list-page')).toBeVisible();
}

test.describe('SOUPFIN-101: accountant invite (admin side)', () => {
  test.skip(isLxcMode(), 'The backend half is not built yet; this spec stands in for it');

  test('invite, resend and cancel an accountant invitation', async ({ page }) => {
    const server = new FakeServer();
    await signedInAdmin(page);
    await mockAccountantInviteApi(page, server);

    await openAccountantsTab(page);
    await expect(page.getByTestId('accountant-list-empty')).toBeVisible();
    await expect(page.getByTestId('users-tab-accountants')).toHaveAttribute('aria-current', 'page');
    await shot(page, '01-accountants-tab-empty');

    // Validation: nothing reaches the server for a bad address.
    await page.getByTestId('accountant-invite-button').click();
    await page.getByTestId('accountant-email-input').fill('ama-at-ledgerworks');
    await page.getByTestId('accountant-invite-submit').click();
    await expect(page.getByTestId('accountant-email-error')).toContainText('valid email address');
    await shot(page, '02-invite-dialog-invalid-email');
    expect(server.requests.filter((r) => r.path.startsWith('/accountantInvite/save'))).toHaveLength(0);

    // Before: no invite on the server.
    expect(server.find('ama@ledgerworks.example')).toBeUndefined();
    await page.getByTestId('accountant-email-input').fill('  Ama@LedgerWorks.example ');
    await page.getByTestId('accountant-first-name-input').fill('Ama');
    await page.getByTestId('accountant-last-name-input').fill('Owusu');
    await expect(page.getByTestId('accountant-email-error')).toHaveCount(0);
    await shot(page, '03-invite-dialog-filled');
    await page.getByTestId('accountant-invite-submit').click();

    await expect(page.getByText('Invitation sent to ama@ledgerworks.example.')).toBeVisible();
    await expect(page.getByTestId('accountant-invite-dialog')).toBeHidden();
    // After: one PENDING invite, address normalised, saved with the CSRF token.
    const saved = server.find('ama@ledgerworks.example');
    expect(saved).toMatchObject({ status: 'PENDING', firstName: 'Ama', lastName: 'Owusu', sendCount: 1 });
    const save = server.requests.find((r) => r.path.startsWith('/accountantInvite/save.json'));
    expect(save?.path).toContain('SYNCHRONIZER_TOKEN=csrf-101');
    const row = page.getByTestId(`accountant-row-${saved!.id}`);
    await expect(row).toContainText('Ama Owusu');
    await expect(row).toContainText('ama@ledgerworks.example');
    await expect(page.getByTestId(`accountant-status-${saved!.id}`)).toHaveText('Pending');
    await shot(page, '04-invite-sent-pending-row');

    // A second invite to the same address is stopped before it is sent.
    await page.getByTestId('accountant-invite-button').click();
    await page.getByTestId('accountant-email-input').fill('ama@ledgerworks.example');
    await page.getByTestId('accountant-invite-submit').click();
    await expect(page.getByTestId('accountant-email-error')).toContainText('already has a pending invitation');
    await shot(page, '05-duplicate-invite-blocked');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(server.invites).toHaveLength(1);

    // Resend: the server's send count goes from 1 to 2.
    await page.getByTestId(`accountant-resend-${saved!.id}`).click();
    await expect(page.getByText('Invitation sent again to ama@ledgerworks.example.')).toBeVisible();
    expect(server.find('ama@ledgerworks.example')!.sendCount).toBe(2);
    await shot(page, '06-invite-resent');

    // Cancel the pending invite: confirm first, then the server row is REVOKED.
    await page.getByTestId(`accountant-revoke-${saved!.id}`).click();
    await expect(page.getByTestId('accountant-revoke-dialog')).toContainText(
      'Cancel the invitation to ama@ledgerworks.example?'
    );
    await shot(page, '07-cancel-invite-confirm');
    expect(server.find('ama@ledgerworks.example')!.status).toBe('PENDING');
    await page.getByTestId('accountant-revoke-confirm').click();
    await expect(page.getByText('Invitation to ama@ledgerworks.example cancelled.')).toBeVisible();
    expect(server.find('ama@ledgerworks.example')!.status).toBe('REVOKED');
    await expect(page.getByTestId(`accountant-status-${saved!.id}`)).toHaveText('Revoked');
    await expect(page.getByTestId(`accountant-resend-${saved!.id}`)).toHaveCount(0);
    await shot(page, '08-invite-cancelled');
  });

  test('remove an accountant who already has access', async ({ page }) => {
    const server = new FakeServer();
    const active = server.add({
      email: 'kofi@boatengcpa.example',
      firstName: 'Kofi',
      lastName: 'Boateng',
      status: 'ACCEPTED',
      acceptedAt: '2026-10-02T10:00:00Z',
    });
    server.add({ email: 'late@firm.example', expiresAt: '2000-01-01T00:00:00Z' });
    await signedInAdmin(page);
    await mockAccountantInviteApi(page, server);

    await openAccountantsTab(page);
    await expect(page.getByTestId(`accountant-status-${active.id}`)).toHaveText('Active');
    await expect(page.getByTestId('accountant-table')).toContainText('Expired');
    await shot(page, '09-active-and-expired-rows');

    await page.getByTestId(`accountant-revoke-${active.id}`).click();
    const dialog = page.getByTestId('accountant-revoke-dialog');
    await expect(dialog).toContainText('Remove Kofi Boateng’s access?');
    await expect(dialog).toContainText('signed out straight away');
    await shot(page, '10-remove-access-confirm');
    await dialog.getByRole('button', { name: 'Remove access' }).click();

    await expect(page.getByText('Access removed for kofi@boatengcpa.example.')).toBeVisible();
    expect(server.find('kofi@boatengcpa.example')!.status).toBe('REVOKED');
    expect(server.requests.some((r) => r.method === 'POST' && r.path === `/accountantInvite/revoke/${active.id}.json`)).toBe(true);
    await expect(page.getByTestId(`accountant-status-${active.id}`)).toHaveText('Revoked');
    await shot(page, '11-access-removed');
  });

  test('before the backend ships, the tab says the feature is not available', async ({ page }) => {
    await signedInAdmin(page);
    await page.route('**/rest/accountantInvite/**', (route) => json(route, 404, { message: 'Not Found' }));

    await openAccountantsTab(page);
    await expect(page.getByTestId('accountant-list-unavailable')).toContainText(
      'Accountant access isn’t available yet'
    );
    await expect(page.getByTestId('accountant-invite-button')).toHaveCount(0);
    await expect(page.getByText(/status code/i)).toHaveCount(0);
    await shot(page, '12-not-available-yet');

    // The Team members tab is unaffected.
    await page.getByTestId('users-tab-team').click();
    await expect(page.getByTestId('user-list-page')).toContainText('Kofi Mensah');
  });

  test('60 invites and a 200-character address stay inside the viewport', async ({ page }) => {
    const server = new FakeServer();
    server.add({ email: `${'a'.repeat(200)}@firm.example`, dateCreated: '2026-10-05T00:00:00Z' });
    for (let i = 1; i < 60; i++) {
      server.add({ email: `acct${i}@firm.example`, firstName: `Acct`, lastName: `${i}` });
    }
    await signedInAdmin(page);
    await mockAccountantInviteApi(page, server);

    await openAccountantsTab(page);
    await expect(page.getByTestId('accountant-table').locator('tbody tr')).toHaveCount(60);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, '13-sixty-invites-long-address');
  });
});

test.describe('SOUPFIN-101: accepting an invitation (accountant side)', () => {
  test.skip(isLxcMode(), 'The backend half is not built yet; this spec stands in for it');

  test('a new accountant sets a password and is sent to sign in', async ({ page }) => {
    const accepted: unknown[] = [];
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, false);
    await page.route('**/account/accountantInvite.json*', (route) => {
      expect(new URL(route.request().url()).searchParams.get('token')).toBe('tok-101');
      return json(route, 200, {
        status: 'PENDING',
        email: 'ama@ledgerworks.example',
        firstName: 'Ama',
        lastName: 'Owusu',
        companyName: 'Acme Trading Ltd',
        existingUser: false,
      });
    });
    await page.route('**/account/acceptAccountantInvite.json', (route) => {
      accepted.push(route.request().postDataJSON());
      return json(route, 200, { success: true, message: 'Accepted', username: 'ama@ledgerworks.example' });
    });

    // Reached only from the emailed link.
    await page.goto('/accept-invite?token=tok-101');
    await expect(page.getByTestId('accept-invite-heading')).toHaveText('Join Acme Trading Ltd on SoupFinance');
    await shot(page, '14-accept-invite-new-login');

    await page.getByTestId('accept-invite-password-input').fill('Ledger2026');
    await page.getByTestId('accept-invite-confirm-password-input').fill('Ledger2026');
    await shot(page, '15-accept-invite-password-set');
    expect(accepted).toHaveLength(0);
    await page.getByTestId('accept-invite-submit').click();

    await expect(page.getByTestId('accept-invite-success')).toContainText(
      'Sign in with ama@ledgerworks.example to start working on Acme Trading Ltd’s books.'
    );
    expect(accepted).toEqual([{ token: 'tok-101', password: 'Ledger2026', confirmPassword: 'Ledger2026' }]);
    await shot(page, '16-accept-invite-success');

    await page.getByTestId('accept-invite-login-button').click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a cancelled invitation link explains itself', async ({ page }) => {
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, false);
    await page.route('**/account/accountantInvite.json*', (route) =>
      json(route, 410, { status: 'REVOKED', message: 'This invitation was cancelled.' })
    );

    await page.goto('/accept-invite?token=tok-revoked');
    await expect(page.getByTestId('accept-invite-invalid')).toContainText('This invitation is no longer valid');
    await expect(page.getByTestId('accept-invite-invalid-reason')).toContainText('cancelled this invitation');
    await shot(page, '17-accept-invite-revoked');
  });

  test('a revoked accountant is sent to sign in on their next request', async ({ page }) => {
    let revoked = false;
    // Seed the session once, so the redirect's reload does not sign them back in.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const user = {
        username: 'ama@ledgerworks.example',
        email: 'ama@ledgerworks.example',
        roles: ['ROLE_USER', 'ROLE_ACCOUNTANT'],
        tenantId: 'account-001',
      };
      sessionStorage.setItem('access_token', 'accountant-token');
      sessionStorage.setItem('user', JSON.stringify(user));
    });
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    // After revoke, the planned interceptor answers 401 for every request on that token.
    await page.route('**/rest/**', (route) =>
      revoked ? json(route, 401, { error: 'Unauthorized' }) : route.fallback()
    );

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await shot(page, '18-accountant-signed-in');

    revoked = true;
    await page.locator('aside nav').getByRole('link', { name: 'Invoices', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
    expect(await page.evaluate(() => sessionStorage.getItem('access_token'))).toBeNull();
    await shot(page, '19-revoked-accountant-signed-out');
  });
});
