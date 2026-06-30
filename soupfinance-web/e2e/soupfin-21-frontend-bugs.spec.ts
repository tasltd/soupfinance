/**
 * SOUPFIN-21 — Two frontend bug fixes (V10)
 *
 * Bug 1: Blank client name in the delete confirmation dialog.
 *   For a corporate client whose `name` field is null, the dialog rendered
 *   "Are you sure you want to delete ?" — a blank identifier. The fix passes the
 *   resolved display name (companyName / firstName+lastName / email fallback) to
 *   the dialog, so it never shows a blank.
 *
 * Bug 2: Account Settings form renders editable in its empty/default state when
 *   the backend `/account/show/{id}.json` GET fails with a 500. The empty form
 *   looked like a fresh state, so a user could unknowingly Save and overwrite
 *   their real saved settings. The fix LOCKS the form (disabled fieldset + Save)
 *   on a server/network load failure and prompts a Retry.
 *
 * Mock mode (default): deterministic, intercepted routes. Screenshots are saved
 * under test-results/screenshots/soupfin-21/.
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

// A corporate client with a NULL `name` — the exact shape that produced the
// blank delete-confirmation identifier. The display name must resolve to
// companyName.
const mockClients = [
  {
    id: 'client-acme',
    name: '', // null/blank on the backend domain for this corporate record
    companyName: 'Acme Holdings Ltd',
    email: 'billing@acme.example',
    clientType: 'CORPORATE' as const,
    archived: false,
    tenantId: 'tenant-soupfin',
    dateCreated: '2024-03-01T09:00:00Z',
    lastUpdated: '2024-03-01T09:00:00Z',
  },
];

test.describe('SOUPFIN-21 #1 — delete confirmation shows the resolved client name', () => {
  test('corporate client with a null name renders its company name (not a blank) in the dialog', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await setupMockAuth(page);
    await mockTokenValidationApi(page, true);
    await page.route('**/rest/client/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClients),
      });
    });

    await page.goto('/clients');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('client-delete-client-acme')).toBeVisible();
    await takeScreenshot(page, 'soupfin-21/clients-list-loaded');

    // Open the delete confirmation for the corporate client.
    await page.getByTestId('client-delete-client-acme').click();

    const modal = page.getByTestId('delete-confirmation-modal');
    await expect(modal).toBeVisible();
    // The resolved company name appears in the confirmation text...
    await expect(modal).toContainText('Acme Holdings Ltd');
    // ...and there is no dangling "delete ?" with a blank identifier.
    await expect(modal).toContainText(/delete\s+Acme Holdings Ltd\s*\?/i);
    await takeScreenshot(page, 'soupfin-21/delete-dialog-resolved-name');
  });
});

test.describe('SOUPFIN-21 #2 — Account Settings locks the form on a load failure', () => {
  test('a 500 from account/show locks the fieldset and Save, and a successful retry unlocks it', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await setupMockAuth(page);
    // Base mocks: /rest/user/current.json (200, gives tenantId). mockTokenValidationApi
    // also registers a 200 account/show route; we override it below so EVERY account/show
    // call fails with a 500 until we explicitly swap it for the Retry. (There are two
    // independent callers of account/show — the app-level account store for currency and
    // the settings-page query — so the override must be unconditional, not a one-shot.)
    await mockTokenValidationApi(page, true);

    // Registered AFTER mockTokenValidationApi → takes precedence (Playwright LIFO).
    await page.route('**/account/show/*.json*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    );

    await page.goto('/settings/account');
    await page.waitForLoadState('domcontentloaded');

    // The non-blocking warning banner is shown and the form is LOCKED.
    await expect(page.getByTestId('account-settings-load-error')).toBeVisible();
    await expect(page.getByTestId('account-settings-fieldset')).toBeDisabled();
    await expect(page.getByTestId('account-settings-save')).toBeDisabled();
    // The Retry control stays usable (it lives outside the locked fieldset).
    await expect(page.getByTestId('account-settings-load-error-retry')).toBeEnabled();
    await takeScreenshot(page, 'soupfin-21/account-settings-locked-on-500');

    // Swap the backend to a healthy 200 response, then Retry → form unlocks + populates.
    await page.unroute('**/account/show/*.json*');
    await page.route('**/account/show/*.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'tenant-soupfin',
          name: 'Saved Company Name',
          currency: 'GHS',
          startOfFiscalYear: '',
        }),
      })
    );
    await page.getByTestId('account-settings-load-error-retry').click();

    await expect(page.getByTestId('account-settings-load-error')).toHaveCount(0);
    await expect(page.getByTestId('account-settings-fieldset')).toBeEnabled();
    await expect(page.getByPlaceholder(/Your company name/i)).toHaveValue('Saved Company Name');
    await takeScreenshot(page, 'soupfin-21/account-settings-unlocked-after-retry');
  });
});
