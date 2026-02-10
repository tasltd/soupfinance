/**
 * Playwright E2E Test Fixtures
 * Provides common test utilities and authentication helpers
 *
 * Added: Mock helpers for corporate onboarding flow (directors, documents)
 * Changed: Added real backend test credentials for integration tests against LXC backend
 * Changed: Added dual-mode support - tests can run with mocks OR against real backend
 *
 * DUAL-MODE TESTING:
 * - Mock mode (default): Uses route mocking for fast, isolated tests
 * - LXC mode: Runs against real soupfinance-backend for integration testing
 *
 * Usage:
 *   npm run test:e2e          # Run with mocks (default)
 *   npm run test:e2e:lxc      # Run against real LXC backend
 *   npm run test:e2e:lxc:all  # Run ALL tests against LXC backend (including mock tests)
 */
import { test as base, expect } from '@playwright/test';

// ===========================================================================
// Test Mode Detection
// ===========================================================================

/**
 * Check if tests are running against real LXC backend
 * Set by TEST_MODE=lxc environment variable (configured in playwright.lxc.config.ts)
 */
export function isLxcMode(): boolean {
  return process.env.TEST_MODE === 'lxc';
}

/**
 * Get test users based on current mode
 * Returns backendTestUsers for LXC mode, mockUsers for mock mode
 */
export function getTestUsers() {
  return isLxcMode() ? backendTestUsers : mockUsers;
}

/**
 * Log test mode for debugging
 */
export function logTestMode() {
  console.log(`[E2E] Running in ${isLxcMode() ? 'LXC BACKEND' : 'MOCK'} mode`);
}

// ===========================================================================
// Real Backend Test Credentials (LXC Backend: soupfinance-backend)
// WARNING: These are for TEST ONLY - do NOT use in production
// ===========================================================================

export const backendTestUsers = {
  // Primary admin account - soup.support (soupmarkets-web seed data)
  // This user should work across tenants
  admin: {
    username: 'soup.support',
    password: 'secret',
    email: 'soup.support',
    roles: ['ROLE_ADMIN', 'ROLE_USER'],
  },
  // Secondary admin - fui@techatscale.io (SoupFinance tenant - TAS)
  // Can be used as fallback if primary doesn't work
  fuiTas: {
    username: 'fui@techatscale.io',
    password: 'fui@techatscale.io',
    email: 'fui@techatscale.io',
    roles: ['ROLE_ADMIN', 'ROLE_USER'],
  },
  // Demo user for demo tenant
  demo: {
    username: 'fui.nusenu',
    password: 'secret',
    email: 'fui.nusenu',
    roles: ['ROLE_USER'],
  },
  // Test agent user (use primary admin)
  testAgent: {
    username: 'soup.support',
    password: 'secret',
    email: 'soup.support',
    roles: ['ROLE_USER'],
  },
  // Finance-focused user (use primary admin)
  finance: {
    username: 'soup.support',
    password: 'secret',
    email: 'soup.support',
    roles: ['ROLE_ADMIN', 'ROLE_USER', 'ROLE_FINANCE_REPORTS'],
  },
  // Legacy reference (same as admin)
  legacyAdmin: {
    username: 'soup.support',
    password: 'secret',
    email: 'soup.support',
    roles: ['ROLE_ADMIN', 'ROLE_USER'],
  },
};

// ===========================================================================
// Mock User Data (for mocked E2E tests without backend)
// ===========================================================================

export const mockUsers = {
  admin: {
    email: 'admin@soupfinance.com',
    password: 'testPassword123!',
    username: 'admin',
    roles: ['ROLE_ADMIN', 'ROLE_USER'],
  },
  corporate: {
    email: 'finance@acme.com',
    password: 'corporate123!',
    username: 'acme_finance',
    roles: ['ROLE_CORPORATE', 'ROLE_USER'],
    corporateId: 'corp-123',
  },
};

// ===========================================================================
// Mock Invoice Data
// ===========================================================================

// Changed: Mock invoices now match Grails Invoice domain structure
// - number (int) instead of invoiceNumber
// - accountServices (FK) instead of client
// - invoiceItemList with quantity/unitPrice so transformInvoice computes correct totals
// - invoicePaymentList for PAID invoices
export const mockInvoices = [
  {
    id: 'inv-001',
    number: 1,
    accountServices: { id: 'as-001', serialised: 'Acme Corp', class: 'soupbroker.AccountServices' },
    invoiceDate: '2024-01-15T00:00:00Z',
    paymentDate: '2024-02-15T00:00:00Z',
    status: 'SENT',
    invoiceItemList: [
      { id: 'ii-001', quantity: 5, unitPrice: 500.0, description: 'Consulting Services' },
    ],
    invoicePaymentList: [],
  },
  {
    id: 'inv-002',
    number: 2,
    accountServices: { id: 'as-002', serialised: 'TechStart Inc', class: 'soupbroker.AccountServices' },
    invoiceDate: '2024-01-20T00:00:00Z',
    paymentDate: '2024-02-20T00:00:00Z',
    status: 'PAID',
    invoiceItemList: [
      { id: 'ii-002', quantity: 1, unitPrice: 4750.5, description: 'Software License' },
    ],
    invoicePaymentList: [
      { id: 'ip-001', amount: 4750.5, paymentDate: '2024-02-01', paymentMethod: 'BANK_TRANSFER' },
    ],
  },
  {
    id: 'inv-003',
    number: 3,
    accountServices: { id: 'as-003', serialised: 'Global Solutions', class: 'soupbroker.AccountServices' },
    invoiceDate: '2024-01-10T00:00:00Z',
    paymentDate: '2024-01-25T00:00:00Z',
    status: 'OVERDUE',
    invoiceItemList: [
      { id: 'ii-003', quantity: 4, unitPrice: 300.0, description: 'Support Services' },
    ],
    invoicePaymentList: [],
  },
];

// ===========================================================================
// Mock Corporate Data
// ===========================================================================

// Added: Mock corporate registration data
export const mockCorporate = {
  id: 'corp-new-001',
  name: 'Test Company LLC',
  certificateOfIncorporationNumber: 'C-987654',
  businessCategory: 'LIMITED_LIABILITY',
  registrationDate: '2020-06-15',
  taxIdentificationNumber: '12-3456789',
  email: 'test@testcompany.com',
  phoneNumber: '+1 555-123-4567',
  kycStatus: 'PENDING' as const,
  dateCreated: '2024-01-15T10:30:00Z',
};

// Added: Mock director data for onboarding
export const mockDirector = {
  id: 'director-001',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@testcompany.com',
  phoneNumber: '+1 555-234-5678',
  role: 'DIRECTOR' as const,
  corporate: { id: 'corp-new-001' },
  dateCreated: '2024-01-15T11:00:00Z',
};

// Added: Mock document data for onboarding
export const mockDocument = {
  id: 'doc-001',
  documentType: 'CERTIFICATE_OF_INCORPORATION' as const,
  fileName: 'certificate-of-incorporation.pdf',
  fileUrl: '/uploads/documents/certificate-of-incorporation.pdf',
  corporate: { id: 'corp-new-001' },
  dateCreated: '2024-01-15T12:00:00Z',
};

// ===========================================================================
// Extended Test Fixtures
// ===========================================================================

// Extended test with authenticated page fixture
export const test = base.extend<{
  authenticatedPage: Awaited<ReturnType<typeof base.page>>;
}>({
  authenticatedPage: async ({ page }, use) => {
    // Set up mock authentication state before navigating
    await page.addInitScript(() => {
      const mockUser = {
        username: 'admin',
        email: 'admin@soupfinance.com',
        roles: ['ROLE_ADMIN', 'ROLE_USER'],
      };
      localStorage.setItem('access_token', 'mock-jwt-token-for-testing');
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: mockUser,
            isAuthenticated: true,
          },
          version: 0,
        })
      );
    });
    await use(page);
  },
});

// ===========================================================================
// Generic API Mock Helpers
// ===========================================================================

/**
 * Helper to mock API responses
 * CONDITIONAL: Skips mocking in LXC mode (requests go to real backend)
 */
export async function mockApiResponse(
  page: Awaited<ReturnType<typeof base.page>>,
  urlPattern: string | RegExp,
  response: object,
  status = 200
) {
  // Skip mocking in LXC mode - let requests go to real backend
  if (isLxcMode()) return;

  await page.route(urlPattern, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

// Helper to take screenshot with consistent naming
export async function takeScreenshot(
  page: Awaited<ReturnType<typeof base.page>>,
  name: string
) {
  await page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: true,
  });
}

// ===========================================================================
// Authentication API Mocks
// CONDITIONAL: All mock functions skip mocking in LXC mode
// ===========================================================================

/**
 * Helper to mock login API
 * CONDITIONAL: Skips mocking in LXC mode
 * Changed: Use /rest/api/login pattern to match actual endpoint
 */
export async function mockLoginApi(
  page: Awaited<ReturnType<typeof base.page>>,
  success = true,
  user = mockUsers.admin
) {
  // Skip mocking in LXC mode - use real backend authentication
  if (isLxcMode()) return;

  await page.route('**/rest/api/login', (route) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-jwt-token',
          token_type: 'Bearer',
          username: user.username,
          roles: user.roles,
        }),
      });
    } else {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Invalid credentials',
        }),
      });
    }
  });
}

/**
 * Helper to mock token validation endpoint
 * CONDITIONAL: Skips mocking in LXC mode
 * Used by authStore.validateToken() on page load
 */
export async function mockTokenValidationApi(
  page: Awaited<ReturnType<typeof base.page>>,
  success = true
) {
  if (isLxcMode()) return;

  await page.route('**/rest/user/current.json*', (route) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          username: 'admin',
          email: 'admin@soupfinance.com',
          roles: ['ROLE_ADMIN', 'ROLE_USER'],
        }),
      });
    } else {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Token expired or invalid',
        }),
      });
    }
  });

  // Changed: Mock agent endpoint for account settings flow (agent → tenant_id → account/show)
  // accountSettingsApi.get() calls /rest/agent/index.json first to get the account ID
  await page.route('**/rest/agent/index.json*', (route) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'agent-001',
          firstName: 'Admin',
          lastName: 'User',
          account: { id: 'account-001', name: 'Test Company' },
        }]),
      });
    } else {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Not authenticated',
        }),
      });
    }
  });

  // Changed: Mock account/show endpoint (replaces /account/index.json)
  // accountSettingsApi.get() calls /account/show/{id}.json after getting agent
  await page.route('**/account/show/*.json*', (route) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'account-001',
          name: 'Test Company',
          currency: 'USD',
          dateCreated: '2024-01-01T00:00:00Z',
        }),
      });
    } else {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Not authenticated',
        }),
      });
    }
  });
}

/**
 * Helper to mock OTP request API
 * CONDITIONAL: Skips mocking in LXC mode
 */
export async function mockOtpRequestApi(
  page: Awaited<ReturnType<typeof base.page>>,
  success = true
) {
  if (isLxcMode()) return;

  await page.route('**/client/authenticate.json', (route) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'OTP sent successfully',
        }),
      });
    } else {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Invalid contact',
        }),
      });
    }
  });
}

// ===========================================================================
// Invoice API Mocks
// CONDITIONAL: All mock functions skip mocking in LXC mode
// ===========================================================================

/**
 * Helper to mock invoices list API
 * CONDITIONAL: Skips mocking in LXC mode
 * Changed: Use glob pattern to match /rest/invoice/index.json
 */
export async function mockInvoicesApi(
  page: Awaited<ReturnType<typeof base.page>>,
  invoices = mockInvoices
) {
  if (isLxcMode()) return;

  await page.route('**/rest/invoice/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(invoices),
    });
  });
}

// ===========================================================================
// Corporate Registration API Mocks
// CONDITIONAL: All mock functions skip mocking in LXC mode
// ===========================================================================

/**
 * Helper to mock corporate registration API
 * CONDITIONAL: Skips mocking in LXC mode
 */
export async function mockCorporateRegistrationApi(
  page: Awaited<ReturnType<typeof base.page>>,
  success = true,
  corporate = mockCorporate
) {
  if (isLxcMode()) return;

  await page.route('**/rest/corporate/save*', (route) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(corporate),
      });
    } else {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Registration failed',
          message: 'Company already exists',
        }),
      });
    }
  });
}

// ===========================================================================
// Corporate Onboarding API Mocks
// CONDITIONAL: All mock functions skip mocking in LXC mode
// Added: Mock helpers for complete onboarding flow
// ===========================================================================

/**
 * Mock corporate show/update API for onboarding pages
 * CONDITIONAL: Skips mocking in LXC mode
 * Added: Supports GET /rest/corporate/show/:id and PUT /rest/corporate/update/:id
 */
export async function mockCorporateApi(
  page: Awaited<ReturnType<typeof base.page>>,
  corporateId: string,
  corporate: Partial<typeof mockCorporate> = mockCorporate
) {
  if (isLxcMode()) return;

  // Mock GET /rest/corporate/show/:id.json
  await page.route(`**/rest/corporate/show/${corporateId}*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...mockCorporate, ...corporate, id: corporateId }),
    });
  });

  // Also mock current.json endpoint if needed
  await page.route('**/rest/corporate/current*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...mockCorporate, ...corporate, id: corporateId }),
    });
  });
}

/**
 * Mock directors list/CRUD API for onboarding
 * CONDITIONAL: Skips mocking in LXC mode
 * Added: Supports GET /rest/corporateAccountPerson/index and CRUD operations
 */
export async function mockDirectorsApi(
  page: Awaited<ReturnType<typeof base.page>>,
  corporateId: string,
  directors: Array<Partial<typeof mockDirector>> = []
) {
  if (isLxcMode()) return;

  // Mock GET /rest/corporateAccountPerson/index.json
  await page.route('**/rest/corporateAccountPerson/index*', (route) => {
    // Verify the corporate.id param matches if present in URL
    const url = route.request().url();
    if (url.includes(`corporate.id=${corporateId}`) || !url.includes('corporate.id')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          directors.map((d, i) => ({
            ...mockDirector,
            ...d,
            id: d.id || `director-${i}`,
          }))
        ),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
  });
}

/**
 * Mock documents list/upload API for onboarding
 * CONDITIONAL: Skips mocking in LXC mode
 * Added: Supports GET /rest/corporateDocuments/index and upload
 */
export async function mockDocumentsApi(
  page: Awaited<ReturnType<typeof base.page>>,
  corporateId: string,
  documents: Array<Partial<typeof mockDocument>> = []
) {
  if (isLxcMode()) return;

  // Mock GET /rest/corporateDocuments/index.json
  await page.route('**/rest/corporateDocuments/index*', (route) => {
    // Verify the corporate.id param matches if present in URL
    const url = route.request().url();
    if (url.includes(`corporate.id=${corporateId}`) || !url.includes('corporate.id')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          documents.map((d, i) => ({
            ...mockDocument,
            ...d,
            id: d.id || `doc-${i}`,
          }))
        ),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
  });
}

// ===========================================================================
// Dashboard API Mocks
// CONDITIONAL: All mock functions skip mocking in LXC mode
// Added: Mock helpers for dashboard E2E tests
// ===========================================================================

// Added: Mock dashboard stats data
export const mockDashboardStats = {
  totalRevenue: 125430.50,
  totalRevenueChange: 12.5,
  outstandingInvoices: 45320.00,
  outstandingInvoicesCount: 12,
  expensesMTD: 32150.00,
  expensesMTDChange: -8.3,
  netProfit: 93280.50,
  netProfitChange: 18.2,
};

/**
 * Mock all dashboard APIs (invoices + bills for stats calculation)
 * CONDITIONAL: Skips mocking in LXC mode
 * Added: Comprehensive mock for dashboard page tests
 */
export async function mockDashboardApi(
  page: Awaited<ReturnType<typeof base.page>>,
  invoices = mockInvoices,
  bills = mockBills
) {
  if (isLxcMode()) return;

  // Mock invoices list
  await page.route('**/rest/invoice/index.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(invoices),
    });
  });

  // Mock bills list
  await page.route('**/rest/bill/index.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bills),
    });
  });

  // Mock token validation for authenticated page
  await mockTokenValidationApi(page, true);
}

// Re-export expect for convenience
export { expect };

// ===========================================================================
// Mock Bill Data
// Added: Mock data for bill CRUD E2E tests
// ===========================================================================

export const mockVendors = [
  { id: 'vendor-001', name: 'Acme Corp', email: 'billing@acme.com' },
  { id: 'vendor-002', name: 'Tech Supplies Inc', email: 'accounts@techsupplies.com' },
  { id: 'vendor-003', name: 'Office Solutions', email: 'invoices@officesolutions.com' },
];

export const mockBillItems = [
  {
    id: 'item-001',
    bill: { id: 'bill-001' },
    description: 'Office Supplies',
    quantity: 10,
    unitPrice: 50.0,
    taxRate: 10,
    amount: 550.0,
  },
  {
    id: 'item-002',
    bill: { id: 'bill-001' },
    description: 'Printer Cartridges',
    quantity: 5,
    unitPrice: 80.0,
    taxRate: 10,
    amount: 440.0,
  },
];

// Changed (2026-02-01): Use current month dates so MTD calculations work correctly
// Helper to get current month dates for mock data
function getCurrentMonthDate(day: number): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getNextMonthDate(day: number): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getLastMonthDate(day: number): string {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, day);
  return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const mockBills = [
  {
    id: 'bill-001',
    billNumber: 'BILL-2026-001',
    vendor: { id: 'vendor-001', name: 'Acme Corp' },
    billDate: getCurrentMonthDate(15),
    paymentDate: getNextMonthDate(14),
    status: 'PENDING' as const,
    subtotal: 900.0,
    taxAmount: 90.0,
    totalAmount: 990.0,
    amountPaid: 0,
    amountDue: 990.0,
    items: mockBillItems,
  },
  {
    id: 'bill-002',
    billNumber: 'BILL-2026-002',
    vendor: { id: 'vendor-002', name: 'Tech Supplies Inc' },
    billDate: getCurrentMonthDate(10),
    paymentDate: getNextMonthDate(10),
    status: 'PAID' as const,
    subtotal: 2000.0,
    taxAmount: 200.0,
    totalAmount: 2200.0,
    amountPaid: 2200.0,
    amountDue: 0,
    items: [],
  },
  {
    id: 'bill-003',
    billNumber: 'BILL-2026-003',
    vendor: { id: 'vendor-003', name: 'Office Solutions' },
    billDate: getLastMonthDate(1),
    paymentDate: getLastMonthDate(31),
    status: 'OVERDUE' as const,
    subtotal: 1500.0,
    taxAmount: 150.0,
    totalAmount: 1650.0,
    amountPaid: 500.0,
    amountDue: 1150.0,
    items: [],
  },
];

export const mockBillPayments = [
  {
    id: 'payment-001',
    bill: { id: 'bill-003' },
    amount: 500.0,
    paymentDate: '2026-01-05',
    paymentMethod: 'BANK_TRANSFER' as const,
    reference: 'TRF-001',
    notes: 'Partial payment',
  },
];

// ===========================================================================
// Bill API Mocks
// CONDITIONAL: All mock functions skip mocking in LXC mode
// Added: Mock helpers for bill CRUD E2E tests
// ===========================================================================

/**
 * Mock bills list API
 * CONDITIONAL: Skips mocking in LXC mode
 * GET /rest/bill/index.json
 */
export async function mockBillsApi(
  page: Awaited<ReturnType<typeof base.page>>,
  bills = mockBills
) {
  if (isLxcMode()) return;

  await page.route('**/rest/bill/index.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bills),
    });
  });
}

/**
 * Mock single bill detail API
 * CONDITIONAL: Skips mocking in LXC mode
 * GET /rest/bill/show/:id.json
 */
export async function mockBillDetailApi(
  page: Awaited<ReturnType<typeof base.page>>,
  bill: typeof mockBills[0]
) {
  if (isLxcMode()) return;

  await page.route(`**/rest/bill/show/${bill.id}.json*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bill),
    });
  });
}

/**
 * Mock vendors list API
 * CONDITIONAL: Skips mocking in LXC mode
 * GET /rest/vendor/index.json
 */
export async function mockVendorsApi(
  page: Awaited<ReturnType<typeof base.page>>,
  vendors = mockVendors
) {
  if (isLxcMode()) return;

  await page.route('**/rest/vendor/index.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(vendors),
    });
  });
}

/**
 * Mock bill payments list API
 * CONDITIONAL: Skips mocking in LXC mode
 * GET /rest/billPayment/index.json?bill.id=:id
 */
export async function mockBillPaymentsApi(
  page: Awaited<ReturnType<typeof base.page>>,
  billId: string,
  payments: typeof mockBillPayments = []
) {
  if (isLxcMode()) return;

  await page.route(`**/rest/billPayment/index.json*bill.id=${billId}*`, (route) => {
    const billPayments = payments.filter((p) => p.bill.id === billId);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(billPayments),
    });
  });
}

// ===========================================================================
// Real Backend Integration Helpers
// Added: Helpers for tests running against actual LXC backend
// ===========================================================================

/**
 * Authenticate against real backend and set up page with credentials
 * Use for integration E2E tests against LXC backend (soupfinance-backend)
 *
 * Usage:
 * ```typescript
 * import { backendTestUsers, authenticateWithBackend } from './fixtures';
 *
 * test('integration test', async ({ page }) => {
 *   await authenticateWithBackend(page, backendTestUsers.admin);
 *   // ... test against real API
 * });
 * ```
 */
export async function authenticateWithBackend(
  page: Awaited<ReturnType<typeof base.page>>,
  user: typeof backendTestUsers.admin
) {
  // Navigate to login page
  await page.goto('/login');

  // Fill in credentials
  await page.fill('input[name="email"], input[type="email"]', user.username);
  await page.fill('input[name="password"], input[type="password"]', user.password);

  // Submit login form
  await page.click('button[type="submit"]');

  // Wait for successful login (redirect to dashboard or authenticated state)
  await page.waitForURL(/\/(dashboard|$)/, { timeout: 10000 });

  return user;
}

/**
 * Set up pre-authenticated state for real backend tests
 * Calls the actual login API and injects the response into localStorage
 */
export async function setupBackendAuth(
  page: Awaited<ReturnType<typeof base.page>>,
  user: typeof backendTestUsers.admin,
  baseUrl: string
) {
  // Call real login API
  const response = await page.request.post(`${baseUrl}/rest/api/login`, {
    data: {
      username: user.username,
      password: user.password,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${response.statusText()}`);
  }

  const loginData = await response.json();

  // Inject auth state into localStorage
  await page.addInitScript((authData) => {
    localStorage.setItem('access_token', authData.access_token);
    localStorage.setItem(
      'user',
      JSON.stringify({
        username: authData.username,
        roles: authData.roles,
      })
    );
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: {
          user: {
            username: authData.username,
            roles: authData.roles,
          },
          isAuthenticated: true,
        },
        version: 0,
      })
    );
  }, loginData);

  return loginData;
}
