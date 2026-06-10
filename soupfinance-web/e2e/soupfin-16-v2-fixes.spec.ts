/**
 * SOUPFIN-16 V2 fixes E2E spec
 *
 * Verifies the V2 round of frontend fixes called out in the SOUPFIN-16 issue:
 *  1. Account Settings — Save/Reset buttons are enabled on initial load
 *     (no more "disabled until edited" UX surprise).
 *  2. Account Settings — Logo and Favicon upload are functional (no
 *     "coming soon" placeholder).
 *  3. Account Settings — Start of Fiscal Year date picker doesn't render
 *     0/0/0 when the backend returns a NULL sentinel.
 *  4. Account Settings — SMS Sender ID Prefix is capped at 11 characters.
 *  5. Clients — Searching for a non-matching record shows a "No clients match
 *     your filters" message (NOT the "No clients yet" empty-state).
 *  6. Clients — The type filter shows visual feedback when applied.
 *  7. Clients Edit — First Name and Last Name fields render for individuals.
 *  8. Reports — Date pickers allow navigating to years earlier than 2026.
 *  9. Reports — Exported PDFs use the correct ".pdf" extension (not ".null").
 *
 * Screenshots are captured at each validation point and stored under
 * test-results/screenshots/soupfin-16/ as required by the project's
 * E2E Screenshots Validation rule.
 */
import { test, expect } from '@playwright/test';
import {
  mockTokenValidationApi,
  takeScreenshot,
  isLxcMode,
  backendTestUsers,
  setupResponseValidation,
} from './fixtures';

// ============================================================================
// Auth helper — mirrors the pattern used by settings.spec.ts.
// ============================================================================
async function setupAuth(page: Parameters<typeof mockTokenValidationApi>[0]) {
  if (isLxcMode()) {
    // Real backend: log in via the login form so the auth flow is exercised.
    await page.goto('/login');
    await page.getByTestId('login-username-input').fill(backendTestUsers.admin.username);
    await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
    const rememberCheckbox = page.getByTestId('login-remember-checkbox');
    if (await rememberCheckbox.isVisible().catch(() => false)) {
      await rememberCheckbox.check();
    }
    await page.getByTestId('login-submit-button').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await page.waitForLoadState('domcontentloaded');
    return;
  }
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
  await setupResponseValidation(page);
}

// ============================================================================
// Mock data — minimal account settings + client list that the page can
// hydrate from without a real backend.
// ============================================================================
const mockAccountSettings = {
  id: 'tenant-soupfin',
  name: 'SoupFinance Demo',
  currency: 'GHS',
  countryOfOrigin: 'GH',
  businessLicenceCategory: 'SERVICES',
  address: '123 Demo Lane',
  location: 'Accra',
  website: 'https://demo.soupfinance.com',
  emailSubjectPrefix: '[Demo]',
  smsIdPrefix: 'DEMO',
  slogan: 'A demo tenant',
  // The bug-reproducer value — backend NULL date sentinel.
  startOfFiscalYear: '0000-00-00',
};

const mockClients = [
  {
    id: 'client-alice',
    name: 'Alice Smith',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: '+233 24 000 0000',
    address: '12 Test Street',
    clientType: 'INDIVIDUAL' as const,
    archived: false,
    tenantId: 'tenant-soupfin',
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
  },
  {
    id: 'client-acme',
    name: 'Acme Corp',
    companyName: 'Acme Corp',
    email: 'billing@acme.com',
    phone: '+233 24 111 1111',
    clientType: 'CORPORATE' as const,
    archived: false,
    tenantId: 'tenant-soupfin',
    dateCreated: '2024-01-20T14:30:00Z',
    lastUpdated: '2024-01-20T14:30:00Z',
  },
];

async function mockAccountSettingsApis(page: Parameters<typeof mockTokenValidationApi>[0]) {
  if (isLxcMode()) return;
  await mockTokenValidationApi(page, true);
  await page.route('**/account/show/*.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockAccountSettings),
    });
  });
  await page.route('**/account/edit/*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...mockAccountSettings,
        SYNCHRONIZER_TOKEN: 'mock-token',
        SYNCHRONIZER_URI: '/account/update',
      }),
    });
  });
  await page.route('**/account/update/*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...mockAccountSettings, name: 'SoupFinance Demo' }),
    });
  });
}

async function mockClientApis(
  page: Parameters<typeof mockTokenValidationApi>[0],
  clients = mockClients
) {
  if (isLxcMode()) return;
  await mockTokenValidationApi(page, true);
  // MainLayout / accountStore call accountSettingsApi.get() on mount; without
  // a mock the unmocked request falls through to the dev proxy, the page
  // never hydrates, and ProtectedRoute redirects to /login.
  await page.route('**/account/show/*.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockAccountSettings),
    });
  });
  await page.route('**/rest/client/index.json*', (route) => {
    const url = new URL(route.request().url());
    const search = (url.searchParams.get('search') || '').toLowerCase();
    const clientType = url.searchParams.get('clientType');
    let filtered = [...clients];
    if (search) {
      filtered = filtered.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(search) ||
          (c.email || '').toLowerCase().includes(search)
      );
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
  // Detail / edit endpoints used when navigating to an edit page.
  await page.route('**/rest/client/show/*.json*', (route) => {
    const match = route.request().url().match(/\/show\/([^/.]+)/);
    const id = match ? match[1] : '';
    const found = clients.find((c) => c.id === id);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(found ?? clients[0]),
    });
  });
}

// ============================================================================
// 1–4 Account Settings tests
// ============================================================================
test.describe('SOUPFIN-16 V2 — Account Settings', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockAccountSettingsApis(page);
  });

  test('Save and Reset buttons are enabled on initial load (no longer mysterious)', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await page.goto('/settings/account');
    await page.waitForLoadState('domcontentloaded');

    const saveBtn = page.getByTestId('account-settings-save');
    const resetBtn = page.getByTestId('account-settings-reset');

    await expect(saveBtn).toBeVisible();
    await expect(resetBtn).toBeVisible();
    // Fix (SOUPFIN-16): both buttons start enabled so the user sees the active state.
    await expect(saveBtn).toBeEnabled();
    await expect(resetBtn).toBeEnabled();

    await takeScreenshot(page, 'soupfin-16/account-settings-buttons-enabled-on-load');
  });

  test('Logo and Favicon dropzones are functional (no "coming soon" placeholder)', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await page.goto('/settings/account');
    await page.waitForLoadState('domcontentloaded');

    // The hidden file inputs should be in the DOM and accept image MIME types.
    const logoInput = page.getByTestId('account-settings-logo-input');
    const faviconInput = page.getByTestId('account-settings-favicon-input');
    await expect(logoInput).toHaveAttribute('type', 'file');
    await expect(faviconInput).toHaveAttribute('type', 'file');
    await expect(logoInput).toHaveAttribute('accept', /image\//);
    await expect(faviconInput).toHaveAttribute('accept', /image\//);

    // The dropzone labels are clickable wrappers around those hidden inputs.
    await expect(page.getByTestId('account-settings-logo-dropzone')).toBeVisible();
    await expect(page.getByTestId('account-settings-favicon-dropzone')).toBeVisible();

    // The old "(coming soon)" placeholder copy must be gone.
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);

    await takeScreenshot(page, 'soupfin-16/account-settings-logo-favicon-functional');
  });

  test('Start of Fiscal Year picker is blank when backend returns 0000-00-00 (no 0/0/0)', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await page.goto('/settings/account');
    await page.waitForLoadState('domcontentloaded');

    const fiscalInput = page.getByTestId('account-settings-fiscal-year');
    await expect(fiscalInput).toHaveAttribute('type', 'date');
    // Fix (SOUPFIN-16): the sanitizer turns the backend's "0000-00-00" sentinel
    // into an empty value so the picker doesn't render the "0/0/0" placeholder.
    await expect(fiscalInput).toHaveValue('');

    await takeScreenshot(page, 'soupfin-16/account-settings-fiscal-year-blank');
  });

  test('SMS Sender ID caps user input at 11 characters', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await page.goto('/settings/account');
    await page.waitForLoadState('domcontentloaded');

    const smsInput = page.getByTestId('account-settings-sms-prefix');
    await expect(smsInput).toHaveAttribute('maxlength', '11');

    await smsInput.fill('');
    await smsInput.type('WAYTOOLONGSENDER', { delay: 5 });
    const value = await smsInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(11);

    await takeScreenshot(page, 'soupfin-16/account-settings-sms-capped');
  });
});

// ============================================================================
// 5–7 Clients tests
// ============================================================================
test.describe('SOUPFIN-16 V2 — Clients module', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockClientApis(page);
  });

  test('Search with no matches shows the "No clients match" state, not "No clients yet"', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await page.goto('/clients');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the populated list to render before searching.
    await expect(page.getByTestId('client-link-client-alice')).toBeVisible();

    // Type a search term that won't match anything.
    await page.getByTestId('client-search-input').fill('zzz-no-match');

    // Fix (SOUPFIN-16): the empty state distinguishes "no clients yet"
    // from "no clients match your filters" so the user knows to broaden.
    await expect(page.getByTestId('client-list-no-results')).toBeVisible();
    await expect(page.getByTestId('client-list-empty')).toHaveCount(0);
    await expect(page.getByTestId('client-list-clear-filters-button')).toBeVisible();

    await takeScreenshot(page, 'soupfin-16/clients-no-results-state');
  });

  test('Type filter shows visible feedback when applied', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await page.goto('/clients');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('client-link-client-alice')).toBeVisible();

    const filter = page.getByTestId('client-type-filter');
    // Apply the CORPORATE filter — the list refetches and the active ring shows.
    await filter.selectOption('CORPORATE');

    // Fix (SOUPFIN-16): the filter has primary-colored ring + font-semibold
    // styling when a type is selected.
    await expect(filter).toHaveClass(/ring-primary\/20/);
    await expect(filter).toHaveClass(/font-semibold/);

    // The "Clear filters" chip appears next to the filter, providing a 1-click reset.
    await expect(page.getByTestId('client-filters-clear')).toBeVisible();

    await takeScreenshot(page, 'soupfin-16/clients-type-filter-active');
  });

  test('Edit form shows First Name and Last Name fields for an individual client', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await page.goto('/clients');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('client-link-client-alice')).toBeVisible();

    // Navigate via the row's Edit link instead of a direct page.goto.
    await page.getByTestId('client-edit-client-alice').click();
    await page.waitForLoadState('domcontentloaded');

    // Fix (SOUPFIN-16): the Personal Information section renders, with both
    // First Name and Last Name inputs populated from the loaded client.
    await expect(page.getByTestId('client-form-personal-section')).toBeVisible();
    await expect(page.getByTestId('client-form-first-name')).toBeVisible();
    await expect(page.getByTestId('client-form-last-name')).toBeVisible();
    await expect(page.getByTestId('client-form-first-name')).toHaveValue('Alice');
    await expect(page.getByTestId('client-form-last-name')).toHaveValue('Smith');

    await takeScreenshot(page, 'soupfin-16/clients-edit-first-last-name');
  });
});

// ============================================================================
// 8–9 Reports tests
// ============================================================================
test.describe('SOUPFIN-16 V2 — Reports', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    if (!isLxcMode()) {
      await mockTokenValidationApi(page, true);
      // Minimum mocks so the report pages can render without errors.
      await page.route('**/rest/financeReports/balanceSheet.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ledgerAccountList: [] }),
        });
      });
      await page.route('**/rest/financeReports/incomeStatement.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ledgerAccountList: [] }),
        });
      });
      await page.route('**/rest/financeReports/trialBalance.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ resultList: {}, totalDebit: 0, totalCredit: 0 }),
        });
      });
    }
  });

  test('Balance Sheet date picker permits years before 2026', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await page.goto('/reports/balance-sheet');
    await page.waitForLoadState('domcontentloaded');

    const datePicker = page.getByTestId('balance-sheet-date-picker');
    await expect(datePicker).toBeVisible();
    // Fix (SOUPFIN-16): explicit min=1900-01-01 so the browser-native year
    // navigation exposes every historic year, not just 2026.
    await expect(datePicker).toHaveAttribute('min', '1900-01-01');

    // Set a 2025 date to confirm the input accepts historic years.
    await datePicker.fill('2025-03-15');
    await expect(datePicker).toHaveValue('2025-03-15');

    await takeScreenshot(page, 'soupfin-16/reports-balance-sheet-historic-date');
  });

  test('Profit & Loss date pickers permit years before 2026', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await page.goto('/reports/pnl');
    await page.waitForLoadState('domcontentloaded');

    const fromDate = page.getByTestId('profit-loss-from-date');
    const toDate = page.getByTestId('profit-loss-to-date');
    await expect(fromDate).toHaveAttribute('min', '1900-01-01');
    await expect(toDate).toHaveAttribute('min', '1900-01-01');

    await fromDate.fill('2024-01-01');
    await toDate.fill('2024-12-31');
    await expect(fromDate).toHaveValue('2024-01-01');
    await expect(toDate).toHaveValue('2024-12-31');

    await takeScreenshot(page, 'soupfin-16/reports-pnl-historic-date');
  });

  test('Trial Balance date pickers permit years before 2026', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    await page.goto('/reports/trial-balance');
    await page.waitForLoadState('domcontentloaded');

    const fromDate = page.getByTestId('trial-balance-filter-from');
    const toDate = page.getByTestId('trial-balance-filter-to');
    await expect(fromDate).toHaveAttribute('min', '1900-01-01');
    await expect(toDate).toHaveAttribute('min', '1900-01-01');

    await takeScreenshot(page, 'soupfin-16/reports-trial-balance-historic-date');
  });

  test('Balance Sheet PDF export downloads with a .pdf extension (never .null)', async ({
    page,
  }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }
    // Stub the export endpoint with a tiny PDF-like blob so we can capture the
    // browser download metadata.
    await page.route('**/rest/financeReports/balanceSheet.json**f=pdf*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: Buffer.from('%PDF-1.4 mock\n%%EOF'),
      });
    });

    await page.goto('/reports/balance-sheet');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('balance-sheet-export-pdf')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('balance-sheet-export-pdf').click(),
    ]);

    const suggestedName = download.suggestedFilename();
    expect(suggestedName.toLowerCase()).toMatch(/\.pdf$/);
    expect(suggestedName.toLowerCase()).not.toMatch(/\.null$/);
    expect(suggestedName.toLowerCase()).not.toMatch(/\.undefined$/);

    await takeScreenshot(page, 'soupfin-16/reports-pdf-extension-correct');
  });
});
