/**
 * Settings E2E Tests
 * Tests for User Management, Bank Accounts, and Account Settings pages
 *
 * DUAL-MODE TESTING:
 * - Mock mode (default): Uses route mocking for fast, isolated tests
 * - LXC mode: Runs against real soupfinance-backend for integration testing
 *
 * Usage:
 *   npm run test:e2e          # Run with mocks (default)
 *   npm run test:e2e:lxc      # Run against real LXC backend
 */
import { test, expect } from '@playwright/test';
import { mockTokenValidationApi, takeScreenshot, isLxcMode, backendTestUsers } from './fixtures';

// ===========================================================================
// Mock Data
// ===========================================================================

const mockUsers = [
  {
    id: 'user-001',
    firstName: 'John',
    lastName: 'Doe',
    designation: 'Manager',
    emailContacts: [{ id: 'email-001', email: 'john.doe@company.com' }],
    phoneContacts: [{ id: 'phone-001', phone: '+1-555-0101' }],
    userAccess: { id: 1, username: 'john.doe', enabled: true },
    authorities: [{ id: 1, authority: 'ROLE_ADMIN' }, { id: 2, authority: 'ROLE_USER' }],
    accountPerson: { id: 'ap-001' },
    // Added: account reference needed by accountSettingsApi.get() (agent → tenant_id flow)
    account: { id: 'account-001', name: 'SoupFinance Demo Company' },
    disabled: false,
    archived: false,
    dateCreated: '2024-01-15T10:00:00Z',
  },
  {
    id: 'user-002',
    firstName: 'Jane',
    lastName: 'Smith',
    designation: 'Accountant',
    emailContacts: [{ id: 'email-002', email: 'jane.smith@company.com' }],
    phoneContacts: [],
    userAccess: { id: 2, username: 'jane.smith', enabled: true },
    authorities: [{ id: 2, authority: 'ROLE_USER' }, { id: 3, authority: 'ROLE_FINANCE_REPORTS' }],
    accountPerson: null,
    account: { id: 'account-001', name: 'SoupFinance Demo Company' },
    disabled: false,
    archived: false,
    dateCreated: '2024-01-20T14:30:00Z',
  },
  {
    id: 'user-003',
    firstName: 'Bob',
    lastName: 'Wilson',
    designation: 'Analyst',
    emailContacts: [{ id: 'email-003', email: 'bob.wilson@company.com' }],
    phoneContacts: [{ id: 'phone-003', phone: '+1-555-0303' }],
    userAccess: { id: 3, username: 'bob.wilson', enabled: false },
    authorities: [{ id: 2, authority: 'ROLE_USER' }],
    accountPerson: null,
    account: { id: 'account-001', name: 'SoupFinance Demo Company' },
    disabled: true,
    archived: false,
    dateCreated: '2024-02-01T09:15:00Z',
  },
];

const mockBankAccounts = [
  {
    id: 'bank-001',
    accountName: 'Company Main Account',
    accountNumber: '1234567890',
    bank: { id: 'bank-gh-001', name: 'Ghana Commercial Bank' },
    bankBranch: 'Accra Main',
    priority: 'PRIMARY' as const,
    currency: 'GHS',
    ledgerAccount: { id: 'ledger-001', name: 'Cash at Bank - GCB', accountNumber: '1001' },
    defaultClientDebtAccount: true,
    defaultClientEquityAccount: false,
    archived: false,
  },
  {
    id: 'bank-002',
    accountName: 'USD Operations Account',
    accountNumber: '9876543210',
    bank: { id: 'bank-gh-002', name: 'Stanbic Bank' },
    bankBranch: 'Airport City',
    priority: 'SECONDARY' as const,
    currency: 'USD',
    ledgerAccount: { id: 'ledger-002', name: 'Cash at Bank - USD', accountNumber: '1002' },
    defaultClientDebtAccount: false,
    defaultClientEquityAccount: true,
    archived: false,
  },
];

const mockBanks = [
  { id: 'bank-gh-001', name: 'Ghana Commercial Bank' },
  { id: 'bank-gh-002', name: 'Stanbic Bank' },
  { id: 'bank-gh-003', name: 'Ecobank Ghana' },
  { id: 'bank-gh-004', name: 'Standard Chartered' },
];

const mockLedgerAccounts = [
  { id: 'ledger-001', name: 'Cash at Bank - GCB', accountNumber: '1001' },
  { id: 'ledger-002', name: 'Cash at Bank - USD', accountNumber: '1002' },
  { id: 'ledger-003', name: 'Petty Cash', accountNumber: '1003' },
];

const mockAccountSettings = {
  id: 'account-001',
  name: 'SoupFinance Demo Company',
  currency: 'GHS',
  countryOfOrigin: 'Ghana',
  businessLicenceCategory: 'SERVICES',
  designation: 'Financial Services Company',
  address: '123 Finance Street, Accra',
  location: 'Accra',
  website: 'https://demo.soupfinance.com',
  emailSubjectPrefix: '[SoupDemo]',
  smsIdPrefix: 'SOUPDEMO',
  slogan: 'Your Finance Partner',
};

const mockRoles = [
  { id: 1, authority: 'ROLE_ADMIN' },
  { id: 2, authority: 'ROLE_USER' },
  { id: 3, authority: 'ROLE_FINANCE_REPORTS' },
];

// ===========================================================================
// Authentication Helper
// ===========================================================================

async function setupAuth(page: any) {
  if (isLxcMode()) {
    // In LXC mode, authenticate with real backend
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Check if already logged in (redirected away from /login)
    const url = page.url();
    if (!url.includes('/login')) {
      // Already authenticated, continue
      return;
    }

    // Wait for login form to be ready
    await page.getByTestId('login-email-input').waitFor({ state: 'visible', timeout: 10000 });

    // Fill login form and submit
    await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
    await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);

    // Check "Remember me" so token is stored in localStorage (where API client reads from)
    await page.getByTestId('login-remember-checkbox').check();

    await page.getByTestId('login-submit-button').click();

    // Wait for successful login - dashboard page should be visible
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Give the auth state a moment to settle
    await page.waitForTimeout(500);

    return;
  }

  // In mock mode, set up fake auth state
  await page.addInitScript(() => {
    const mockUser = {
      username: 'admin',
      email: 'admin@soupfinance.com',
      roles: ['ROLE_ADMIN', 'ROLE_USER'],
    };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { user: mockUser, isAuthenticated: true },
        version: 0,
      })
    );
  });
}

// ===========================================================================
// Test Setup
// ===========================================================================

test.describe('Settings - User Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  // Helper to mock user APIs
  async function mockUserApis(
    page: ReturnType<typeof test.page> extends Promise<infer T> ? T : never,
    users = mockUsers
  ) {
    // Skip mocking in LXC mode - let requests go to real backend
    if (isLxcMode()) return;

    await mockTokenValidationApi(page, true);

    // Mock user (agent) list endpoint
    await page.route('**/rest/agent/index.json*', (route) => {
      const url = new URL(route.request().url());
      const search = url.searchParams.get('search') || '';

      const filtered = search
        ? users.filter(
            (u) =>
              u.firstName.toLowerCase().includes(search.toLowerCase()) ||
              u.lastName.toLowerCase().includes(search.toLowerCase()) ||
              u.emailContacts?.[0]?.email.toLowerCase().includes(search.toLowerCase())
          )
        : users;

      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered),
      });
    });

    // Mock single user endpoint
    await page.route('**/rest/agent/show/*.json*', (route) => {
      const url = route.request().url();
      const idMatch = url.match(/\/show\/([^/.]+)/);
      const userId = idMatch ? idMatch[1] : null;
      const user = users.find((u) => u.id === userId);

      if (user) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(user),
        });
      } else {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'User not found' }),
        });
      }
    });

    // Mock user save endpoint
    await page.route('**/rest/agent/save*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-new',
          firstName: 'New',
          lastName: 'User',
          dateCreated: new Date().toISOString(),
        }),
      });
    });

    // Mock user update endpoint
    await page.route('**/rest/agent/update*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-001',
          firstName: 'Updated',
          lastName: 'User',
        }),
      });
    });

    // Mock user delete endpoint
    await page.route('**/rest/agent/delete/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Mock roles endpoint
    await page.route('**/rest/sbRole/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRoles),
      });
    });

    // Mock account person endpoints
    await page.route('**/rest/accountPerson/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'ap-new', firstName: 'New', surname: 'Person' }),
      });
    });
  }

  // ===========================================================================
  // User List Tests
  // ===========================================================================

  test.describe('User List Page', () => {
    test('displays list of users', async ({ page }) => {
      await mockUserApis(page);

      await page.goto('/settings/users');
      await expect(page.getByTestId('user-list-page')).toBeVisible();

      if (isLxcMode()) {
        // In LXC mode, verify real backend users are displayed
        // The soupfinance-backend has these default users
        await expect(page.locator('text=Soup Support')).toBeVisible();
        await expect(page.locator('text=System Admin')).toBeVisible();
      } else {
        // In mock mode, verify mock users are displayed
        await expect(page.locator('text=John Doe')).toBeVisible();
        await expect(page.locator('text=Jane Smith')).toBeVisible();
        await expect(page.locator('text=Bob Wilson')).toBeVisible();
      }

      await takeScreenshot(page, 'user-list-page');
    });

    // Skip mock-only tests in LXC mode - these require controlled API responses
    test('shows loading state while fetching', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockTokenValidationApi(page, true);

      // Delay response
      await page.route('**/rest/agent/index.json*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUsers),
        });
      });

      await page.goto('/settings/users', { waitUntil: 'commit' });
      await page.waitForSelector('[data-testid="user-list-page"]', { timeout: 5000 });

      // Should show loading state
      await expect(page.locator('text=Loading users...')).toBeVisible({ timeout: 2000 });
    });

    test('shows empty state when no users', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockTokenValidationApi(page, true);

      await page.route('**/rest/agent/index.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/settings/users');

      // Should show empty state
      await expect(page.locator('text=No users yet')).toBeVisible();
      await takeScreenshot(page, 'user-list-empty');
    });

    test('shows error state on API failure', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockTokenValidationApi(page, true);

      await page.route('**/rest/agent/index.json*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto('/settings/users');

      // Should show error state
      await expect(page.locator('text=Failed to load users')).toBeVisible();
      await takeScreenshot(page, 'user-list-error');
    });

    // Skip in LXC mode - requires mock user with accountPerson set
    test('shows Account Person badge for users with accountPerson', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockUserApis(page);

      await page.goto('/settings/users');

      // John Doe has accountPerson, should show badge
      await expect(page.locator('text=Account Person').first()).toBeVisible();
    });

    test('shows correct status badges', async ({ page }) => {
      await mockUserApis(page);

      await page.goto('/settings/users');

      // Active users (should exist in both mock and LXC mode)
      await expect(page.locator('text=Active').first()).toBeVisible();

      // Skip disabled user check in LXC mode - may not have disabled users
      if (!isLxcMode()) {
        // Disabled user (Bob Wilson) - mock only
        await expect(page.locator('text=Disabled')).toBeVisible();
      }
    });

    test('can navigate to create user', async ({ page }) => {
      await mockUserApis(page);

      await page.goto('/settings/users');
      await page.click('text=Add User');

      await expect(page).toHaveURL(/\/settings\/users\/new/);
    });

    test('can navigate to edit user', async ({ page }) => {
      await mockUserApis(page);

      await page.goto('/settings/users');

      if (isLxcMode()) {
        // In LXC mode, click on real user
        await page.click('text=Soup Support');
        // Should navigate to user edit page (UUID format)
        await expect(page).toHaveURL(/\/settings\/users\/[a-f0-9-]+$/);
      } else {
        // In mock mode, click on mock user
        await page.click('text=John Doe');
        await expect(page).toHaveURL(/\/settings\/users\/user-001/);
      }
    });
  });

  // ===========================================================================
  // User Form Tests
  // ===========================================================================

  test.describe('User Form', () => {
    test('form displays required fields for new user', async ({ page }) => {
      await mockUserApis(page);

      await page.goto('/settings/users/new');

      // Verify form fields
      await expect(page.locator('input[name="firstName"]')).toBeVisible();
      await expect(page.locator('input[name="lastName"]')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();

      await takeScreenshot(page, 'user-form-new');
    });

    // Skip in LXC mode - depends on specific mock user ID and data
    test('loads existing user data in edit mode', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockUserApis(page);

      await page.goto('/settings/users/user-001');

      // Wait for data to load
      await expect(page.locator('input[name="firstName"]')).toHaveValue('John');
      await expect(page.locator('input[name="lastName"]')).toHaveValue('Doe');

      await takeScreenshot(page, 'user-form-edit');
    });

    test('cancel button returns to user list', async ({ page }) => {
      await mockUserApis(page);

      await page.goto('/settings/users/new');
      await page.click('text=Cancel');

      await expect(page).toHaveURL('/settings/users');
    });
  });

  // ===========================================================================
  // Delete User Tests
  // ===========================================================================

  test.describe('Delete User', () => {
    test('shows confirmation modal when clicking delete', async ({ page }) => {
      await mockUserApis(page);

      await page.goto('/settings/users');

      // Click delete button for first user
      await page.locator('[title="Delete"]').first().click();

      // Should show confirmation modal
      await expect(page.locator('text=Remove User')).toBeVisible();

      if (isLxcMode()) {
        // In LXC mode, first user is "Soup Support"
        await expect(page.locator('text=Soup Support').nth(1)).toBeVisible(); // In modal
      } else {
        // In mock mode, first user is "John Doe"
        await expect(page.locator('text=John Doe').nth(1)).toBeVisible(); // In modal
      }

      await takeScreenshot(page, 'user-delete-confirmation');
    });

    test('can cancel deletion', async ({ page }) => {
      await mockUserApis(page);

      await page.goto('/settings/users');
      await page.locator('[title="Delete"]').first().click();

      // Cancel deletion
      await page.click('button:has-text("Cancel")');

      // Modal should close
      await expect(page.locator('text=Remove User')).not.toBeVisible();
    });
  });
});

// ===========================================================================
// Bank Account Tests
// ===========================================================================

test.describe('Settings - Bank Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  async function mockBankAccountApis(
    page: ReturnType<typeof test.page> extends Promise<infer T> ? T : never,
    bankAccounts = mockBankAccounts
  ) {
    // Skip mocking in LXC mode - let requests go to real backend
    if (isLxcMode()) return;

    await mockTokenValidationApi(page, true);

    // Mock bank accounts list
    await page.route('**/rest/accountBankDetails/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(bankAccounts),
      });
    });

    // Mock single bank account
    await page.route('**/rest/accountBankDetails/show/*.json*', (route) => {
      const url = route.request().url();
      const idMatch = url.match(/\/show\/([^/.]+)/);
      const accountId = idMatch ? idMatch[1] : null;
      const account = bankAccounts.find((a) => a.id === accountId);

      if (account) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(account),
        });
      } else {
        route.fulfill({ status: 404 });
      }
    });

    // Mock banks list
    await page.route('**/rest/bank/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBanks),
      });
    });

    // Mock ledger accounts
    await page.route('**/rest/ledgerAccount/index.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLedgerAccounts),
      });
    });

    // Mock save/update/delete
    await page.route('**/rest/accountBankDetails/save*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'bank-new', accountName: 'New Account' }),
      });
    });

    await page.route('**/rest/accountBankDetails/update*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'bank-001', accountName: 'Updated Account' }),
      });
    });

    await page.route('**/rest/accountBankDetails/delete/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });
  }

  test.describe('Bank Account List Page', () => {
    // Skip in LXC mode - real backend may not have bank accounts configured
    test('displays list of bank accounts', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockBankAccountApis(page);

      await page.goto('/settings/bank-accounts');
      await expect(page.getByTestId('bank-account-list-page')).toBeVisible();

      // Verify accounts are displayed
      await expect(page.locator('text=Company Main Account')).toBeVisible();
      await expect(page.locator('text=USD Operations Account')).toBeVisible();

      await takeScreenshot(page, 'bank-account-list-page');
    });

    // Skip in LXC mode - depends on mock data
    test('shows PRIMARY badge for primary accounts', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockBankAccountApis(page);

      await page.goto('/settings/bank-accounts');
      await expect(page.locator('text=Primary')).toBeVisible();
    });

    // Skip in LXC mode - depends on mock ledger account names
    test('shows linked ledger account info', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockBankAccountApis(page);

      await page.goto('/settings/bank-accounts');

      // Check ledger account link is displayed
      await expect(page.locator('text=Cash at Bank - GCB')).toBeVisible();
    });

    test('shows empty state when no bank accounts', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockTokenValidationApi(page, true);

      await page.route('**/rest/accountBankDetails/index.json*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/settings/bank-accounts');
      await expect(page.locator('text=No bank accounts yet')).toBeVisible();
    });

    test('can navigate to create bank account', async ({ page }) => {
      await mockBankAccountApis(page);

      await page.goto('/settings/bank-accounts');
      await page.click('text=Add Bank Account');

      await expect(page).toHaveURL(/\/settings\/bank-accounts\/new/);
    });

    // Skip in LXC mode - depends on mock bank account ID
    test('can navigate to edit bank account', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockBankAccountApis(page);

      await page.goto('/settings/bank-accounts');
      await page.click('text=Edit >> nth=0');

      await expect(page).toHaveURL(/\/settings\/bank-accounts\/bank-001/);
    });
  });

  test.describe('Bank Account Form', () => {
    // Skip in LXC mode - form fields may be different
    test('form displays required fields', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockBankAccountApis(page);

      await page.goto('/settings/bank-accounts/new');

      await expect(page.locator('input[name="accountName"]')).toBeVisible();
      await expect(page.locator('input[name="accountNumber"]')).toBeVisible();
      await expect(page.locator('select[name="bankId"]')).toBeVisible();
      await expect(page.locator('select[name="ledgerAccountId"]')).toBeVisible();

      await takeScreenshot(page, 'bank-account-form-new');
    });

    // Skip in LXC mode - depends on mock bank account ID and data
    test('loads existing bank account data', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockBankAccountApis(page);

      await page.goto('/settings/bank-accounts/bank-001');

      await expect(page.locator('input[name="accountName"]')).toHaveValue('Company Main Account');
      await expect(page.locator('input[name="accountNumber"]')).toHaveValue('1234567890');
    });

    // Skip in LXC mode - navigates but may redirect differently
    test('cancel returns to list', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockBankAccountApis(page);

      await page.goto('/settings/bank-accounts/new');
      await page.click('text=Cancel');

      await expect(page).toHaveURL('/settings/bank-accounts');
    });
  });

  test.describe('Delete Bank Account', () => {
    // Skip in LXC mode - may not have bank accounts to delete
    test('shows confirmation modal', async ({ page }) => {
      if (isLxcMode()) {
        test.skip();
        return;
      }

      await mockBankAccountApis(page);

      await page.goto('/settings/bank-accounts');
      await page.click('text=Delete >> nth=0');

      await expect(page.locator('text=Delete Bank Account')).toBeVisible();
    });
  });
});

// ===========================================================================
// Account Settings Tests
// ===========================================================================

test.describe('Settings - Account Settings', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  async function mockAccountSettingsApis(
    page: ReturnType<typeof test.page> extends Promise<infer T> ? T : never
  ) {
    // Skip mocking in LXC mode - let requests go to real backend
    if (isLxcMode()) return;

    await mockTokenValidationApi(page, true);

    // Changed: Override account/show to return full mock account settings
    // (mockTokenValidationApi sets up a generic one; this overrides with test-specific data)
    await page.route('**/account/show/*.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAccountSettings),
      });
    });

    // Mock edit (CSRF token fetch) and update
    await page.route('**/account/edit/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockAccountSettings, SYNCHRONIZER_TOKEN: 'mock-token', SYNCHRONIZER_URI: '/account/update' }),
      });
    });
    await page.route('**/account/update/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockAccountSettings, name: 'Updated Company' }),
      });
    });
  }

  // Skip in LXC mode - form fields may differ from real backend
  test('displays account settings form', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }

    await mockAccountSettingsApis(page);

    await page.goto('/settings/account');

    await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('select[name="currency"]')).toBeVisible();

    await takeScreenshot(page, 'account-settings-page');
  });

  // Skip in LXC mode - depends on mock account data
  test('loads current settings values', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }

    await mockAccountSettingsApis(page);

    await page.goto('/settings/account');

    await expect(page.locator('input[name="name"]')).toHaveValue('SoupFinance Demo Company');
    await expect(page.locator('input[name="countryOfOrigin"]')).toHaveValue('Ghana');
  });

  // Skip in LXC mode - depends on mock account data
  test('shows unsaved changes indicator', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }

    await mockAccountSettingsApis(page);

    await page.goto('/settings/account');

    // Modify a field
    await page.locator('input[name="name"]').fill('Modified Company Name');

    // Should show unsaved changes indicator
    await expect(page.locator('text=You have unsaved changes')).toBeVisible();
  });

  // Skip in LXC mode - depends on mock account data
  test('reset button clears changes', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }

    await mockAccountSettingsApis(page);

    await page.goto('/settings/account');

    // Modify a field
    await page.locator('input[name="name"]').fill('Modified Company Name');

    // Click reset
    await page.click('button:has-text("Reset")');

    // Should revert to original value
    await expect(page.locator('input[name="name"]')).toHaveValue('SoupFinance Demo Company');
  });

  test('shows error on API failure', async ({ page }) => {
    if (isLxcMode()) {
      test.skip();
      return;
    }

    await mockTokenValidationApi(page, true);

    // Changed: Override account/show to return error (replaces /account/index.json)
    await page.route('**/account/show/*.json*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto('/settings/account');

    await expect(page.locator('text=Failed to load account settings')).toBeVisible();
  });
});

// ===========================================================================
// Settings Navigation Tests
// ===========================================================================

test.describe('Settings Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('settings page shows navigation tabs', async ({ page }) => {
    // Skip mocking in LXC mode - let requests go to real backend
    if (!isLxcMode()) {
      await mockTokenValidationApi(page, true);

      // Mock all API endpoints
      await page.route('**/rest/agent/index.json*', (route) => {
        route.fulfill({ status: 200, body: JSON.stringify([]) });
      });
    }

    await page.goto('/settings');

    // Should show settings overview with cards
    // Use specific locators to avoid strict mode violations (multiple elements with same text)
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Users/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Bank Accounts/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Account Settings/ }).first()).toBeVisible();
  });

  test('can navigate between settings sections', async ({ page }) => {
    // Skip mocking in LXC mode - let requests go to real backend
    if (!isLxcMode()) {
      await mockTokenValidationApi(page, true);

      await page.route('**/rest/agent/index.json*', (route) => {
        route.fulfill({ status: 200, body: JSON.stringify(mockUsers) });
      });
      await page.route('**/rest/accountBankDetails/index.json*', (route) => {
        route.fulfill({ status: 200, body: JSON.stringify(mockBankAccounts) });
      });
      // Changed: Mock account/show endpoint (replaces /account/index.json)
      await page.route('**/account/show/*.json*', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccountSettings) });
      });
    }

    await page.goto('/settings');

    // Navigate to Users
    await page.click('a:has-text("Users")');
    await expect(page).toHaveURL('/settings/users');

    // Navigate to Bank Accounts
    await page.click('a:has-text("Bank Accounts")');
    await expect(page).toHaveURL('/settings/bank-accounts');

    // Navigate to Account Settings
    await page.click('a:has-text("Account Settings")');
    await expect(page).toHaveURL('/settings/account');
  });
});

