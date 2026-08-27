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
// API Response Shape Validators
// Validates mock data matches actual Grails backend response structures.
// These run at import time — if mock data drifts from backend shape, tests
// fail immediately with a clear error instead of silently testing wrong shapes.
// ===========================================================================

/** Validate a field exists and has expected type */
function assertField(obj: Record<string, unknown>, field: string, type: string, context: string) {
  if (!(field in obj)) throw new Error(`${context}: missing required field '${field}'`);
  if (type === 'array' && !Array.isArray(obj[field])) throw new Error(`${context}: '${field}' must be array`);
  if (type !== 'array' && typeof obj[field] !== type) throw new Error(`${context}: '${field}' must be ${type}, got ${typeof obj[field]}`);
}

/** Validate FK reference object has id (and optionally serialised, class) */
function assertFkRef(obj: Record<string, unknown>, field: string, context: string) {
  if (!(field in obj) || obj[field] === null || obj[field] === undefined) throw new Error(`${context}: missing FK '${field}'`);
  const fk = obj[field] as Record<string, unknown>;
  if (typeof fk !== 'object') throw new Error(`${context}: FK '${field}' must be object, got ${typeof fk}`);
  if (!('id' in fk)) throw new Error(`${context}: FK '${field}' missing 'id'`);
}

// Added: Validate invoice mock matches Grails Invoice domain
export function validateInvoiceShape(inv: Record<string, unknown>, context = 'Invoice') {
  assertField(inv, 'id', 'string', context);
  assertField(inv, 'number', 'number', context);
  assertFkRef(inv, 'accountServices', context);
  assertField(inv, 'invoiceDate', 'string', context);
  assertField(inv, 'status', 'string', context);
  assertField(inv, 'invoiceItemList', 'array', context);
  assertField(inv, 'invoicePaymentList', 'array', context);
  // Validate FK has serialised and class (Grails convention)
  const as = inv.accountServices as Record<string, unknown>;
  assertField(as, 'serialised', 'string', `${context}.accountServices`);
  assertField(as, 'class', 'string', `${context}.accountServices`);
}

// Added: Validate vendor mock matches Grails Vendor domain
export function validateVendorShape(vendor: Record<string, unknown>, context = 'Vendor') {
  assertField(vendor, 'id', 'string', context);
  assertField(vendor, 'name', 'string', context);
}

// Added: Validate bill mock matches Grails Bill domain
export function validateBillShape(bill: Record<string, unknown>, context = 'Bill') {
  assertField(bill, 'id', 'string', context);
  assertField(bill, 'billNumber', 'string', context);
  assertFkRef(bill, 'vendor', context);
  assertField(bill, 'billDate', 'string', context);
  assertField(bill, 'status', 'string', context);
  assertField(bill, 'totalAmount', 'number', context);
}

// Added: Validate login response matches /rest/api/login shape
export function validateLoginResponseShape(data: Record<string, unknown>, context = 'LoginResponse') {
  assertField(data, 'access_token', 'string', context);
  assertField(data, 'username', 'string', context);
  assertField(data, 'roles', 'array', context);
}

// Added: Validate user/current response matches SbUserController.current()
export function validateCurrentUserShape(data: Record<string, unknown>, context = 'CurrentUser') {
  assertField(data, 'username', 'string', context);
  assertField(data, 'roles', 'array', context);
  assertField(data, 'tenantId', 'string', context);
}

// Added: Validate account settings response
export function validateAccountShape(data: Record<string, unknown>, context = 'Account') {
  assertField(data, 'id', 'string', context);
  assertField(data, 'name', 'string', context);
  assertField(data, 'currency', 'string', context);
}

// Added: Validate ledger account matches Grails LedgerAccount domain
export function validateLedgerAccountShape(acct: Record<string, unknown>, context = 'LedgerAccount') {
  assertField(acct, 'id', 'string', context);
  assertField(acct, 'code', 'string', context);
  assertField(acct, 'name', 'string', context);
  assertField(acct, 'ledgerGroup', 'string', context);
}

// Added: Validate ledger transaction matches Grails LedgerTransaction domain
export function validateLedgerTransactionShape(txn: Record<string, unknown>, context = 'LedgerTransaction') {
  assertField(txn, 'id', 'string', context);
  assertField(txn, 'transactionDate', 'string', context);
  assertField(txn, 'description', 'string', context);
}

// Added: Validate trial balance response shape
export function validateTrialBalanceShape(data: Record<string, unknown>, context = 'TrialBalance') {
  assertField(data, 'resultList', 'object', context);
  assertField(data, 'totalDebit', 'number', context);
  assertField(data, 'totalCredit', 'number', context);
}

// Added: Validate bill item matches Grails BillItem domain
export function validateBillItemShape(item: Record<string, unknown>, context = 'BillItem') {
  assertField(item, 'id', 'string', context);
  assertField(item, 'description', 'string', context);
  assertField(item, 'quantity', 'number', context);
  assertField(item, 'unitPrice', 'number', context);
}

// ===========================================================================
// Runtime Response Validation
// Intercepts API responses during test execution and validates shapes.
// Works in both mock and integration modes.
// ===========================================================================

// Added: Map of URL patterns to validator functions for runtime response checking
const responseValidators: Array<{
  pattern: RegExp;
  validate: (data: unknown) => void;
}> = [
  {
    pattern: /\/rest\/invoice\/(?:index|show)/,
    validate: (data: unknown) => {
      if (Array.isArray(data)) {
        data.forEach((inv, i) => validateInvoiceShape(inv as Record<string, unknown>, `Response.invoice[${i}]`));
      } else if (data && typeof data === 'object' && 'id' in data) {
        validateInvoiceShape(data as Record<string, unknown>, 'Response.invoice');
      }
    },
  },
  {
    // SOUPFIN-25: VendorController is under the `trading` module prefix; match both paths.
    pattern: /\/rest\/(?:trading\/)?vendor\/(?:index|show)/,
    validate: (data: unknown) => {
      if (Array.isArray(data)) {
        data.forEach((v, i) => validateVendorShape(v as Record<string, unknown>, `Response.vendor[${i}]`));
      } else if (data && typeof data === 'object' && 'id' in data) {
        validateVendorShape(data as Record<string, unknown>, 'Response.vendor');
      }
    },
  },
  {
    pattern: /\/rest\/(?:finance\/)?bill\/(?:index|show)/,
    validate: (data: unknown) => {
      if (Array.isArray(data)) {
        data.forEach((b, i) => validateBillShape(b as Record<string, unknown>, `Response.bill[${i}]`));
      } else if (data && typeof data === 'object' && 'id' in data) {
        validateBillShape(data as Record<string, unknown>, 'Response.bill');
      }
    },
  },
  {
    pattern: /\/rest\/ledgerAccount\/(?:index|show)/,
    validate: (data: unknown) => {
      if (Array.isArray(data)) {
        data.forEach((a, i) => validateLedgerAccountShape(a as Record<string, unknown>, `Response.ledgerAccount[${i}]`));
      } else if (data && typeof data === 'object' && 'id' in data) {
        validateLedgerAccountShape(data as Record<string, unknown>, 'Response.ledgerAccount');
      }
    },
  },
  {
    pattern: /\/rest\/user\/current\.json/,
    validate: (data: unknown) => {
      if (data && typeof data === 'object' && 'username' in data) {
        validateCurrentUserShape(data as Record<string, unknown>, 'Response.currentUser');
      }
    },
  },
  {
    pattern: /\/rest\/api\/login/,
    validate: (data: unknown) => {
      if (data && typeof data === 'object' && 'access_token' in data) {
        validateLoginResponseShape(data as Record<string, unknown>, 'Response.login');
      }
    },
  },
  {
    pattern: /\/rest\/financeReports\/trialBalance/,
    validate: (data: unknown) => {
      if (data && typeof data === 'object' && 'resultList' in data) {
        validateTrialBalanceShape(data as Record<string, unknown>, 'Response.trialBalance');
      }
    },
  },
  {
    pattern: /\/account\/show\//,
    validate: (data: unknown) => {
      if (data && typeof data === 'object' && 'id' in data) {
        validateAccountShape(data as Record<string, unknown>, 'Response.account');
      }
    },
  },
];

/**
 * Set up runtime API response validation on a Playwright page.
 * Registers a response listener that validates JSON response shapes
 * for known API endpoints. Call in beforeEach for comprehensive validation.
 *
 * Validation errors are logged as warnings (non-fatal) to avoid
 * breaking tests for minor shape mismatches on the backend.
 * Set strict=true to make validation errors fail the test.
 */
export async function setupResponseValidation(
  page: import('@playwright/test').Page,
  options: { strict?: boolean } = {}
) {
  const errors: string[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();

    // Only validate successful JSON responses
    if (status < 200 || status >= 300) return;
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('application/json')) return;

    for (const { pattern, validate } of responseValidators) {
      if (pattern.test(url)) {
        try {
          const data = await response.json().catch(() => null);
          if (data !== null) {
            validate(data);
          }
        } catch (e) {
          const msg = `[RESPONSE VALIDATION] ${url}: ${(e as Error).message}`;
          if (options.strict) {
            errors.push(msg);
            throw new Error(msg);
          } else {
            console.warn(msg);
          }
        }
        break; // Only first matching validator
      }
    }
  });

  return errors;
}

// ===========================================================================
// Self-validation: Run shape checks on mock data at import time
// If any mock data doesn't match expected shape, tests fail immediately
// ===========================================================================

function selfValidateMockData() {
  // Validate after mockInvoices, mockBills, mockVendors are defined (deferred)
  queueMicrotask(() => {
    try {
      mockInvoices.forEach((inv, i) => validateInvoiceShape(inv as unknown as Record<string, unknown>, `mockInvoices[${i}]`));
      mockBills.forEach((bill, i) => validateBillShape(bill as unknown as Record<string, unknown>, `mockBills[${i}]`));
      mockVendors.forEach((v, i) => validateVendorShape(v as unknown as Record<string, unknown>, `mockVendors[${i}]`));
    } catch (e) {
      console.error('[FIXTURES] Mock data shape validation FAILED:', (e as Error).message);
      throw e;
    }
  });
}

selfValidateMockData();

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

  // Changed: Include tenantId in user/current response — accountSettingsApi.get() reads it
  // SbUserController.current() returns tenantId (= account ID) which is the tenant identifier
  await page.route('**/rest/user/current.json*', (route) => {
    if (success) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          username: 'admin',
          email: 'admin@soupfinance.com',
          roles: ['ROLE_ADMIN', 'ROLE_USER'],
          tenantId: 'account-001',
          agentId: 'agent-001',
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

  // Changed: Mock account/show endpoint — accountSettingsApi.get() uses tenantId from auth store
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

  // Fix (SOUPFIN-43): every invoice/bill form and detail page loads the TaxEntry
  // catalogue (SOUPFIN-37/38 moved line-item tax off the hardcoded rate list onto
  // real TaxEntry rows). No shared fixture mocked it, so in mock mode the request
  // proxied to an absent backend and the 401 redirected the page to /login — which
  // surfaced as "element(s) not found" on unrelated assertions across bills,
  // invoices, payments and user-journeys, not as an obviously missing mock.
  //
  // Registered here rather than per spec because every mock-mode spec already calls
  // this helper to stay authenticated. Playwright routes are LIFO, so a spec that
  // needs a specific catalogue (soupfin-37) still wins by registering its own after.
  if (success) {
    await mockTaxEntriesApi(page);
  }
}

/**
 * Default TaxEntry catalogue — shape verbatim from /rest/taxEntry/index.json.
 *
 * `listTaxRates()` drops withholding rows and keeps compound ones (SOUPFIN-42), so
 * a spec asserting on the dropdown should expect VAT-S present and WHT absent.
 */
export const mockTaxEntries = [
  {
    id: 'ff8081817fe4ae93017fe5c9cf10017b',
    name: 'CST',
    abbreviation: 'CST',
    description: 'Comsys',
    taxRate: 5.0,
    isTaxable: true,
    serialised: 'CST-5.0%',
  },
  {
    id: 'ff8081817f8e0105017f8ea9ba580014',
    name: 'Value Added Tax -Flat Rate',
    abbreviation: 'VAT-FR',
    taxRate: 15.0,
    serialised: 'VAT-FR-15.0%',
  },
];

/**
 * Helper to mock the TaxEntry catalogue.
 * CONDITIONAL: Skips mocking in LXC mode
 */
export async function mockTaxEntriesApi(
  page: Awaited<ReturnType<typeof base.page>>,
  entries: unknown[] = mockTaxEntries
) {
  if (isLxcMode()) return;

  await page.route('**/rest/taxEntry/index.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(entries),
    });
  });
}

/**
 * Record every `/rest/*` response that comes back 401 while a test runs.
 *
 * Fix (SOUPFIN-48): in mock mode an unmocked endpoint does NOT fail cleanly. The
 * request proxies to the backend carrying the fake `mock-jwt-token`, the backend
 * answers 401, and the 401 branch of the `client.ts` response interceptor sets
 * `window.location.href = '/login'`. The page has usually already rendered by
 * then, so whether a given test fails is a RACE between its assertions and that
 * redirect — the same spec reported 2, 12 and ~31 failures across machines and
 * worker counts with no code change between them, and the symptom is an opaque
 * `element(s) not found ... navigated to "/login"` rather than a named missing
 * mock.
 *
 * Asserting `urls` is empty converts that race into a stable failure that names
 * the endpoint nobody mocked. Tests that deliberately exercise session expiry
 * pass an `allow` pattern for the endpoint they expect to 401.
 *
 * No-op in LXC mode, where a 401 is a real backend answer rather than a hole in
 * the mock set.
 */
export function trackApi401s(
  page: Awaited<ReturnType<typeof base.page>>,
  options: { allow?: RegExp[] } = {}
): { urls: string[] } {
  const urls: string[] = [];
  if (isLxcMode()) return { urls };

  const allow = options.allow ?? [];
  page.on('response', (response) => {
    if (response.status() !== 401) return;
    const url = response.url();
    if (!url.includes('/rest/')) return;
    if (allow.some((pattern) => pattern.test(url))) return;
    // Store path-only: the port varies with E2E_PORT, so a full URL would make
    // the failure message differ between runs.
    urls.push(url.replace(/^https?:\/\/[^/]+/, ''));
  });

  return { urls };
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

  // Added: `invoiceItem` / `invoicePayment` are SEPARATE controllers — the
  // `**/rest/invoice/**` pattern above does NOT cover them (distinct path
  // segments). getInvoice() fetches items, and the payments list fetches
  // unscoped invoicePayments. Unmocked these 401 via the Vite proxy and bounce
  // the page to /login.
  await page.route('**/rest/invoiceItem/index.json*', (route) => {
    const invoiceId = new URL(route.request().url()).searchParams.get('invoice.id');
    const invoice = invoices.find((i) => i.id === invoiceId);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(invoice?.invoiceItemList ?? []),
    });
  });

  await page.route('**/rest/invoicePayment/index.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
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

  // Added: The KYC status page also loads directors and documents for the
  // corporate. `corporateAccountPerson` / `corporateDocuments` are separate
  // controllers not covered by the `corporate/...` patterns above. Empty
  // defaults — mockDirectorsApi / mockDocumentsApi register afterwards and take
  // precedence when a test needs real data.
  await page.route('**/rest/corporateAccountPerson/index.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/corporateDocuments/index.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
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

  // Added: getBill() and the bill detail/edit pages also fetch line items, and
  // the payments list fetches unscoped billPayments. Unmocked these 401 via the
  // Vite proxy and bounce the page to /login.
  await page.route('**/rest/billItem/index.json*', (route) => {
    const billId = new URL(route.request().url()).searchParams.get('bill.id');
    const bill = bills.find((b) => b.id === billId);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bill?.items ?? []),
    });
  });

  await page.route('**/rest/billPayment/index.json*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
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

  await page.route('**/vendor/index.json*', (route) => {
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

// ===========================================================================
// Ambient API Mocks
// ===========================================================================

/**
 * PaymentMethod is a domain-class FK, not a string enum — dropdowns render
 * `paymentMethod.name`. Matches /rest/paymentMethod/index.json.
 */
export const mockPaymentMethods = [
  { id: 'pm-001', name: 'Bank Transfer', class: 'soupbroker.finance.PaymentMethod' },
  { id: 'pm-002', name: 'Cash', class: 'soupbroker.finance.PaymentMethod' },
  { id: 'pm-003', name: 'Cheque', class: 'soupbroker.finance.PaymentMethod' },
];

/**
 * Mock the endpoints that fire on essentially ANY authenticated page, rather
 * than belonging to one feature:
 *
 * - `POST /rest/frontendLog/batch.json` — frontendLogger flushes captured
 *   console/JS errors. Fires from every page the moment anything logs an error.
 * - `GET /rest/paymentMethod/index.json` — usePaymentMethods(), used by every
 *   payment/voucher form.
 * - `GET /rest/serviceDescription/index.json` — invoice and bill line-item pickers.
 * - `GET /rest/client/index.json` — client pickers on invoice and receipt-voucher forms.
 * - `GET /rest/ledgerAccount/index.json` — account pickers on payment, voucher
 *   and journal-entry forms.
 *
 * Left unmocked these proxy to VITE_PROXY_TARGET; a real backend there answers
 * 401 and the client.ts interceptor redirects the page to /login mid-test.
 *
 * Safe empty//lookup defaults only — a test that asserts on this data should
 * register its own route AFTER this call, which then takes precedence
 * (Playwright matches route handlers in reverse registration order).
 *
 * CONDITIONAL: Skips mocking in LXC mode.
 */
export async function mockAmbientApi(page: import('@playwright/test').Page) {
  if (isLxcMode()) return;

  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route('**/rest/frontendLog/batch.json*', (route) =>
    route.fulfill(json({ received: 0 }))
  );
  await page.route('**/rest/paymentMethod/index.json*', (route) =>
    route.fulfill(json(mockPaymentMethods))
  );
  await page.route('**/rest/serviceDescription/index.json*', (route) =>
    route.fulfill(json([]))
  );
  await page.route('**/rest/client/index.json*', (route) => route.fulfill(json([])));
  await page.route('**/rest/ledgerAccount/index.json*', (route) => route.fulfill(json([])));
}

// ===========================================================================
// Unmocked API Guard
// ===========================================================================

/**
 * Handle returned by installUnmockedApiGuard.
 */
export interface UnmockedApiGuard {
  /** `METHOD /path?query` for every backend call no explicit mock handled. */
  readonly calls: string[];
  /** Throw with the full list if any backend call went unmocked. */
  assertNone(context?: string): void;
}

// Added: Backend path prefixes the Vite dev server proxies (see vite.config.ts).
//
// Anchored at the FIRST path segment on purpose. A loose glob like
// `**/client/**` also matches Vite's own `/node_modules/vite/dist/client/env.mjs`
// and stubbing that out breaks the HMR client on every page. Anchoring also
// keeps SPA routes clear: `/clients/new` and `/accounting/transactions` do not
// match, because the segment must be exactly `client` / `account`.
const PROXIED_API_PATTERNS = [
  /^https?:\/\/[^/]+\/rest\//,
  /^https?:\/\/[^/]+\/account\//,
  /^https?:\/\/[^/]+\/client\//,
];

/**
 * Fail loudly on API calls that no mock handles, instead of silently 401-ing.
 *
 * In mock mode the Vite dev server still proxies unmocked `/rest/*` calls to
 * whatever listens on VITE_PROXY_TARGET (default `http://localhost:9090`). On a
 * machine running a real backend those come back 401, and the `client.ts`
 * response interceptor clears credentials and redirects to `/login` — so the
 * test fails far from the cause, with a bare "testid never appeared" timeout.
 *
 * This guard intercepts anything the explicit mocks miss and answers 503 (which
 * does NOT trigger the auth redirect), recording the URL so `assertNone()` can
 * name the exact endpoints that need mocking.
 *
 * MUST be installed BEFORE the specific mocks: Playwright matches route handlers
 * in reverse registration order, so the last-registered mock wins and the guard
 * only sees what nothing else claimed.
 *
 * No-op in LXC mode, where hitting the real backend is the point.
 *
 * Usage:
 * ```typescript
 * let guard: UnmockedApiGuard;
 *
 * test.beforeEach(async ({ page }) => {
 *   guard = await installUnmockedApiGuard(page);   // FIRST
 *   await mockTokenValidationApi(page, true);      // then the mocks
 * });
 *
 * test.afterEach(() => guard.assertNone());
 * ```
 */
export async function installUnmockedApiGuard(
  page: import('@playwright/test').Page
): Promise<UnmockedApiGuard> {
  const calls: string[] = [];

  const guard: UnmockedApiGuard = {
    calls,
    assertNone(context?: string) {
      if (calls.length === 0) return;
      const unique = [...new Set(calls)].sort();
      throw new Error(
        `${context ? `${context}: ` : ''}${unique.length} unmocked backend ` +
          `endpoint(s) were called. In mock mode these proxy to ` +
          `VITE_PROXY_TARGET and a 401 would redirect the page to /login. ` +
          `Add mocks for:\n  ${unique.join('\n  ')}`
      );
    },
  };

  if (isLxcMode()) return guard;

  for (const pattern of PROXIED_API_PATTERNS) {
    await page.route(pattern, (route) => {
      const request = route.request();
      const { pathname, search } = new URL(request.url());
      calls.push(`${request.method()} ${pathname}${search}`);

      // 503, not 401 — a 401 here would trigger the client.ts redirect to
      // /login and hide the real cause behind a navigation timeout.
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'UnmockedEndpoint',
          message: `No E2E mock registered for ${request.method()} ${pathname}`,
        }),
      });
    });
  }

  return guard;
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
