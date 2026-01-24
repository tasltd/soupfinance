/**
 * Playwright E2E Test Fixtures
 * Provides common test utilities and authentication helpers
 *
 * Added: Mock helpers for corporate onboarding flow (directors, documents)
 * Changed: Added real backend test credentials for integration tests against LXC backend
 */
import { test as base, expect } from '@playwright/test';

// ===========================================================================
// Real Backend Test Credentials (LXC Backend: soupfinance-backend)
// WARNING: These are for TEST ONLY - do NOT use in production
// ===========================================================================

export const backendTestUsers = {
  // Full admin access (ROLE_ADMIN + ROLE_USER)
  admin: {
    username: 'test.admin',
    password: 'secret',
    email: 'test.admin@soupfinance.test',
    roles: ['ROLE_ADMIN', 'ROLE_USER'],
  },
  // Regular user (ROLE_USER only)
  user: {
    username: 'test.user',
    password: 'secret',
    email: 'test.user@soupfinance.test',
    roles: ['ROLE_USER'],
  },
  // Finance-focused user (invoice, bill, ledger, voucher access)
  finance: {
    username: 'test.finance',
    password: 'secret',
    email: 'test.finance@soupfinance.test',
    roles: ['ROLE_USER', 'ROLE_INVOICE', 'ROLE_BILL', 'ROLE_LEDGER_TRANSACTION',
            'ROLE_VENDOR', 'ROLE_FINANCE_REPORTS', 'ROLE_LEDGER_ACCOUNT', 'ROLE_VOUCHER'],
  },
  // Legacy admin (from seed data)
  legacyAdmin: {
    username: 'soup.support',
    password: 'secret',
    email: 'soup.support@soupmarkets.com',
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

export const mockInvoices = [
  {
    id: 'inv-001',
    invoiceNumber: 'INV-2024-001',
    client: { id: 'client-1', name: 'Acme Corp' },
    issueDate: '2024-01-15',
    dueDate: '2024-02-15',
    totalAmount: 2500.0,
    status: 'SENT',
  },
  {
    id: 'inv-002',
    invoiceNumber: 'INV-2024-002',
    client: { id: 'client-2', name: 'TechStart Inc' },
    issueDate: '2024-01-20',
    dueDate: '2024-02-20',
    totalAmount: 4750.5,
    status: 'PAID',
  },
  {
    id: 'inv-003',
    invoiceNumber: 'INV-2024-003',
    client: { id: 'client-3', name: 'Global Solutions' },
    issueDate: '2024-01-10',
    dueDate: '2024-01-25',
    totalAmount: 1200.0,
    status: 'OVERDUE',
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

// Helper to mock API responses
export async function mockApiResponse(
  page: Awaited<ReturnType<typeof base.page>>,
  urlPattern: string | RegExp,
  response: object,
  status = 200
) {
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
// ===========================================================================

// Helper to mock login API
// Changed: Use /rest/api/login pattern to match actual endpoint
export async function mockLoginApi(
  page: Awaited<ReturnType<typeof base.page>>,
  success = true,
  user = mockUsers.admin
) {
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

// Added: Helper to mock token validation endpoint
// Used by authStore.validateToken() on page load
export async function mockTokenValidationApi(
  page: Awaited<ReturnType<typeof base.page>>,
  success = true
) {
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
}

// Helper to mock OTP request API
export async function mockOtpRequestApi(
  page: Awaited<ReturnType<typeof base.page>>,
  success = true
) {
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
// ===========================================================================

// Helper to mock invoices list API
export async function mockInvoicesApi(
  page: Awaited<ReturnType<typeof base.page>>,
  invoices = mockInvoices
) {
  await page.route('**/rest/invoice*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(invoices),
    });
  });
}

// ===========================================================================
// Corporate Registration API Mocks
// ===========================================================================

// Helper to mock corporate registration API
export async function mockCorporateRegistrationApi(
  page: Awaited<ReturnType<typeof base.page>>,
  success = true,
  corporate = mockCorporate
) {
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
// Added: Mock helpers for complete onboarding flow
// ===========================================================================

/**
 * Mock corporate show/update API for onboarding pages
 * Added: Supports GET /rest/corporate/show/:id and PUT /rest/corporate/update/:id
 */
export async function mockCorporateApi(
  page: Awaited<ReturnType<typeof base.page>>,
  corporateId: string,
  corporate: Partial<typeof mockCorporate> = mockCorporate
) {
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
 * Added: Supports GET /rest/corporateAccountPerson/index and CRUD operations
 */
export async function mockDirectorsApi(
  page: Awaited<ReturnType<typeof base.page>>,
  corporateId: string,
  directors: Array<Partial<typeof mockDirector>> = []
) {
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
 * Added: Supports GET /rest/corporateDocuments/index and upload
 */
export async function mockDocumentsApi(
  page: Awaited<ReturnType<typeof base.page>>,
  corporateId: string,
  documents: Array<Partial<typeof mockDocument>> = []
) {
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
 * Added: Comprehensive mock for dashboard page tests
 */
export async function mockDashboardApi(
  page: Awaited<ReturnType<typeof base.page>>,
  invoices = mockInvoices,
  bills = mockBills
) {
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

export const mockBills = [
  {
    id: 'bill-001',
    billNumber: 'BILL-2026-001',
    vendor: { id: 'vendor-001', name: 'Acme Corp' },
    issueDate: '2026-01-15',
    dueDate: '2026-02-14',
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
    issueDate: '2026-01-10',
    dueDate: '2026-02-10',
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
    issueDate: '2025-12-01',
    dueDate: '2025-12-31',
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
// Added: Mock helpers for bill CRUD E2E tests
// ===========================================================================

/**
 * Mock bills list API
 * GET /rest/bill/index.json
 */
export async function mockBillsApi(
  page: Awaited<ReturnType<typeof base.page>>,
  bills = mockBills
) {
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
 * GET /rest/bill/show/:id.json
 */
export async function mockBillDetailApi(
  page: Awaited<ReturnType<typeof base.page>>,
  bill: typeof mockBills[0]
) {
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
 * GET /rest/vendor/index.json
 */
export async function mockVendorsApi(
  page: Awaited<ReturnType<typeof base.page>>,
  vendors = mockVendors
) {
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
 * GET /rest/billPayment/index.json?bill.id=:id
 */
export async function mockBillPaymentsApi(
  page: Awaited<ReturnType<typeof base.page>>,
  billId: string,
  payments: typeof mockBillPayments = []
) {
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
