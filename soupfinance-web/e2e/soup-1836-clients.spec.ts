/**
 * SOUP-1836 — Clients search + Edit-form name mapping E2E spec
 *
 * Verifies the two genuinely-unfixed frontend items from the SOUP-1836 ticket
 * (the other items — account-settings dirty state, date picker 0/0/0, report
 * year navigation and the .null export extension — were already fixed under
 * SOUPFIN-14/16/18 and are covered by soupfin-16-v2-fixes.spec.ts):
 *
 *  1. Clients search — the quick-search term is sent to the backend as `q`
 *     (the param the backend honours for KYC subtype name matching). Sending
 *     it as `search` only matched the serialised text, so a name query like
 *     "alice" returned "No clients match your filters" even when the client
 *     existed.
 *  2. Edit Client — a name field is always shown and populated, including for
 *     records the backend returns as ITF / "UNKNOWN" (which surface their name
 *     only in the generic `name` field, not `companyName`).
 *
 * Mock mode (default): drives the SPA against intercepted routes so the test is
 * deterministic and does not depend on seed data. Screenshots are captured at
 * each validation point under test-results/screenshots/soup-1836/.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockTokenValidationApi, takeScreenshot, isLxcMode } from './fixtures';

async function setupMockAuth(page: Page) {
  await page.addInitScript(() => {
    const mockUser = {
      username: 'admin',
      email: 'admin@soupfinance.com',
      roles: ['ROLE_ADMIN', 'ROLE_USER'],
      tenantId: 'tenant-soupfin',
    };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { user: mockUser, isAuthenticated: true, isInitialized: true },
        version: 0,
      })
    );
  });
}

const mockAccountSettings = {
  id: 'tenant-soupfin',
  name: 'SoupFinance Demo',
  currency: 'GHS',
  startOfFiscalYear: '',
};

// One client per type, including an ITF/"UNKNOWN" record that surfaces its
// display name ONLY in the generic `name` field (no firstName/lastName/company).
const mockClients = [
  {
    id: 'client-alice',
    name: 'Alice Smith',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: '+233 24 000 0000',
    clientType: 'INDIVIDUAL' as const,
    archived: false,
    tenantId: 'tenant-soupfin',
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
  },
  {
    id: 'client-globex',
    name: 'Globex Industries',
    // companyName intentionally omitted — the backend corporate show response
    // can surface the company name only via the generic `name` field.
    email: 'billing@globex.com',
    clientType: 'CORPORATE' as const,
    archived: false,
    tenantId: 'tenant-soupfin',
    dateCreated: '2024-01-20T14:30:00Z',
    lastUpdated: '2024-01-20T14:30:00Z',
  },
  {
    id: 'client-estate',
    name: 'Estate of John Doe',
    // ITF / UNKNOWN type — only `name` is populated.
    email: 'trustee@estate.com',
    clientType: 'UNKNOWN' as never,
    archived: false,
    tenantId: 'tenant-soupfin',
    dateCreated: '2024-02-01T09:00:00Z',
    lastUpdated: '2024-02-01T09:00:00Z',
  },
];

// Records every querystring the SPA used to call /rest/client/index.json so we
// can assert the search term was sent as `q` (not `search`).
async function mockClientApis(page: Page, capturedQueries: URLSearchParams[]) {
  await mockTokenValidationApi(page, true);
  await page.route('**/account/show/*.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockAccountSettings),
    });
  });
  await page.route('**/rest/client/index.json*', (route) => {
    const url = new URL(route.request().url());
    capturedQueries.push(url.searchParams);
    // Mirror the real backend: `q` drives the name match. We deliberately do NOT
    // honour `search` here, so a regression that reverts to `search` would make
    // the matching test fail (the client would not be found).
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const clientType = url.searchParams.get('clientType');
    let filtered = [...mockClients];
    if (q) {
      filtered = filtered.filter((c) => (c.name || '').toLowerCase().includes(q));
    }
    if (clientType) {
      filtered = filtered.filter((c) => c.clientType === clientType);
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(filtered),
    });
  });
  await page.route('**/rest/client/show/*.json*', (route) => {
    const match = route.request().url().match(/\/show\/([^/.]+)/);
    const id = match ? match[1] : '';
    const found = mockClients.find((c) => c.id === id);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(found ?? mockClients[0]),
    });
  });
}

test.describe('SOUP-1836 — Clients quick-search uses `q`', () => {
  test('typing a name search sends `q` (not `search`) and returns the match', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    const capturedQueries: URLSearchParams[] = [];
    await setupMockAuth(page);
    await mockClientApis(page, capturedQueries);

    await page.goto('/clients');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('client-link-client-alice')).toBeVisible();
    await takeScreenshot(page, 'soup-1836/clients-initial-list');

    // Search by first name — the exact scenario from the ticket ("alice").
    await page.getByTestId('client-search-input').fill('alice');

    // The matching client stays visible and the non-matching ones drop out.
    await expect(page.getByTestId('client-link-client-alice')).toBeVisible();
    await expect(page.getByTestId('client-link-client-globex')).toHaveCount(0);
    await expect(page.getByTestId('client-list-no-results')).toHaveCount(0);
    await takeScreenshot(page, 'soup-1836/clients-search-alice-match');

    // The SPA must have sent the term as `q`, never as `search`.
    const sawQ = capturedQueries.some((p) => (p.get('q') || '') === 'alice');
    const sawSearch = capturedQueries.some((p) => p.has('search'));
    expect(sawQ).toBe(true);
    expect(sawSearch).toBe(false);
  });
});

test.describe('SOUP-1836 — Edit Client name field for corporate/unknown types', () => {
  test('Company Name is populated from `name` for a corporate record missing companyName', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    const capturedQueries: URLSearchParams[] = [];
    await setupMockAuth(page);
    await mockClientApis(page, capturedQueries);

    await page.goto('/clients');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('client-link-client-globex')).toBeVisible();

    // Navigate via the row's Edit link (no direct page.goto for internal routes).
    await page.getByTestId('client-edit-client-globex').click();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('client-form-company-name')).toBeVisible();
    await expect(page.getByTestId('client-form-company-name')).toHaveValue('Globex Industries');
    await takeScreenshot(page, 'soup-1836/edit-corporate-name-backfilled');
  });

  test('an "UNKNOWN" client type still exposes an editable, populated name field', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    const capturedQueries: URLSearchParams[] = [];
    await setupMockAuth(page);
    await mockClientApis(page, capturedQueries);

    await page.goto('/clients');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('client-link-client-estate')).toBeVisible();

    await page.getByTestId('client-edit-client-estate').click();
    await page.waitForLoadState('domcontentloaded');

    // The fix resolves ITF/UNKNOWN records to the Company section so the name is
    // shown and editable — previously neither section rendered for these types.
    await expect(page.getByTestId('client-form-company-section')).toBeVisible();
    await expect(page.getByTestId('client-form-company-name')).toHaveValue('Estate of John Doe');
    await takeScreenshot(page, 'soup-1836/edit-unknown-type-name-field');
  });
});
