/**
 * SOUPFIN-48 — bill/invoice form pages bounced to /login instead of rendering.
 *
 * Reported as "12 pre-existing failures in bills.spec.ts Create/Edit Bill", every
 * one with the same shape:
 *
 *     Locator: getByTestId("bill-form-page")
 *     Error: element(s) not found
 *       - navigated to "http://localhost:5186/login"
 *
 * ROOT CAUSE. `BillFormPage`, `BillDetailPage`, `InvoiceFormPage` and
 * `invoices.ts` all call `listTaxRates()`, which GETs `/rest/taxEntry/index.json`
 * — SOUPFIN-37/38 moved the line-item tax dropdown off the hardcoded rate list
 * onto the real TaxEntry records. No spec mocked that endpoint. In mock mode the
 * request still leaves the browser, the Vite proxy forwards it to the backend
 * carrying the fake `mock-jwt-token`, and the backend answers **401** (measured:
 * 403 with no token, 401 with an invalid one). The 401 branch of the `client.ts`
 * response interceptor then sets `window.location.href = '/login'`.
 *
 * WHY THE COUNT KEPT MOVING. The form renders before that response lands, so
 * whether a test fails is a race between its assertions and the redirect. The
 * same spec produced 2, 12 and ~31 failures across machines and worker counts
 * with no code change between them — and a green run never meant the hole was
 * closed, only that the assertions won that time.
 *
 * THE FIX, and what this spec pins. `mockTokenValidationApi(page, true)` now
 * registers the TaxEntry catalogue, so every spec that authenticates through it
 * is covered. These tests assert the invariant that actually matters rather than
 * the one endpoint that happened to be missing: **no page reachable in mock mode
 * may emit a `/rest/` 401**, because any such 401 silently redirects to /login
 * and resurfaces as this same opaque, timing-dependent failure.
 *
 * Screenshots land in e2e/playwright/screenshots/soupfin-48/ and are committed.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockTokenValidationApi,
  trackApi401s,
  isLxcMode,
  mockInvoices,
  mockBills,
  mockVendors,
} from './fixtures';

test.skip(isLxcMode(), 'Mock-only spec: a 401 against a real backend is an answer, not a missing mock');

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-48/${name}.png`,
    fullPage: true,
  });
}

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function authenticate(page: Page) {
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
      JSON.stringify({ state: { user: mockUser, isAuthenticated: true }, version: 0 })
    );
  });
  // Registers the TaxEntry catalogue as a side effect — that IS the fix.
  await mockTokenValidationApi(page, true);
}

/**
 * The mock set a bill/invoice page needs MINUS the tax catalogue. The catalogue
 * is deliberately left to `mockTokenValidationApi`, so if that registration is
 * ever dropped these tests fail rather than the bill spec flaking.
 */
async function mockPageDeps(page: Page) {
  await page.route('**/vendor/index.json*', (route) => route.fulfill(json(mockVendors)));
  await page.route('**/rest/client/index.json*', (route) =>
    route.fulfill(json([{ id: 'client-1', name: 'Acme Corp', accountServices: { id: 'as-001' } }]))
  );
  await page.route('**/rest/serviceDescription/index.json*', (route) => route.fulfill(json([])));
  await page.route('**/rest/billItem/index.json*', (route) => route.fulfill(json([])));
  await page.route('**/rest/invoiceItem/index.json*', (route) => route.fulfill(json([])));
  await page.route('**/rest/invoicePayment/index.json*', (route) => route.fulfill(json([])));
  await page.route('**/rest/billPayment/index.json*', (route) => route.fulfill(json([])));
  await page.route('**/rest/bill/index.json*', (route) => route.fulfill(json(mockBills)));
  await page.route('**/rest/invoice/index.json*', (route) => route.fulfill(json(mockInvoices)));
  await page.route('**/rest/bill/show/*', (route) => route.fulfill(json(mockBills[0])));
  await page.route('**/rest/invoice/show/*', (route) => route.fulfill(json(mockInvoices[0])));
}

/**
 * Every route that renders a line-item tax rate, i.e. every consumer of
 * `listTaxRates()`. `/bills/new` and `/bills/:id/edit` are where the reported
 * 12 failures lived.
 */
const TAX_DEPENDENT_ROUTES = [
  { path: '/bills/new', slug: 'bills-new', testId: 'bill-form-page' },
  { path: `/bills/${mockBills[0].id}/edit`, slug: 'bills-edit', testId: 'bill-form-page' },
  { path: `/bills/${mockBills[0].id}`, slug: 'bills-detail', testId: 'bill-detail-page' },
  { path: '/invoices/new', slug: 'invoices-new', testId: 'invoice-form-page' },
];

test.describe('SOUPFIN-48 — no mock-mode page may 401 its way to /login', () => {
  for (const route of TAX_DEPENDENT_ROUTES) {
    test(`${route.path} renders without a /rest 401 redirect`, async ({ page }) => {
      const seen401s = trackApi401s(page);

      await authenticate(page);
      await mockPageDeps(page);

      await page.goto(route.path, { waitUntil: 'domcontentloaded' });

      // The page must be the one requested, not the login screen. Asserting the
      // testId alone is not enough: it is exactly the assertion that raced.
      await expect(page.getByTestId(route.testId)).toBeVisible({ timeout: 15000 });

      // Give the interceptor the window it used to win in. Without this settle
      // the redirect can land after the test ends and the hole stays invisible.
      await page.waitForTimeout(3000);
      await shot(page, route.slug);

      expect(
        seen401s.urls,
        `Unmocked API call(s) 401'd, which redirects the SPA to /login and makes ` +
          `assertions on this page fail intermittently. Mock these endpoints: ` +
          `${seen401s.urls.join(', ')}`
      ).toEqual([]);

      expect(page.url(), 'page was redirected to /login by the 401 interceptor').not.toContain('/login');
      await expect(page.getByTestId(route.testId)).toBeVisible();
    });
  }

  test('the tax dropdown is populated from the catalogue, not left with only "No Tax"', async ({ page }) => {
    const seen401s = trackApi401s(page);

    await authenticate(page);
    await mockPageDeps(page);

    await page.goto('/bills/new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('bill-form-page')).toBeVisible({ timeout: 15000 });

    const taxSelect = page.getByTestId('bill-item-taxRate-0');
    await expect(taxSelect).toBeVisible();

    // A 401'd catalogue leaves exactly one option — the "No Tax" sentinel that
    // `listTaxRates` prepends locally. More than one proves the fetch succeeded.
    await expect
      .poll(async () => taxSelect.locator('option').count(), { timeout: 10000 })
      .toBeGreaterThan(1);

    await shot(page, 'tax-dropdown-populated');
    expect(seen401s.urls).toEqual([]);
  });

  test('an unmocked tax catalogue is caught, and is what redirects to /login', async ({ page }) => {
    // The regression guard proving the detector actually detects. Re-serving the
    // catalogue as 401 reproduces the reported defect exactly; if a future change
    // stops the interceptor redirecting, this test says so instead of silently
    // weakening every other test above.
    const seen401s = trackApi401s(page);

    await authenticate(page);
    await mockPageDeps(page);

    // LIFO: registered last, so this wins over the fixture's catalogue mock.
    await page.route('**/rest/taxEntry/index.json*', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Unauthorized"}' })
    );

    await page.goto('/bills/new', { waitUntil: 'domcontentloaded' });

    // Assert on LEAVING the form, not on arriving at /login. The interceptor does
    // set `location.href = '/login'`, but it clears only `access_token`/`user` and
    // leaves the persisted `auth-storage` claiming authenticated — so `PublicRoute`
    // immediately forwards /login to /dashboard. The reporter saw "/login" because
    // their run caught that hop mid-flight; the durable fact is that the requested
    // page is gone. (The stale `auth-storage` is tracked separately as SOUPFIN-49.)
    await page.waitForURL((url) => !url.pathname.startsWith('/bills/new'), { timeout: 15000 });

    await shot(page, 'unmocked-catalogue-bounces-off-the-form');

    expect(
      seen401s.urls.some((u) => u.includes('/rest/taxEntry/index.json')),
      'the detector must record the 401 that causes the bounce'
    ).toBe(true);
    expect(page.url(), 'a 401 must not leave the user on the form').not.toContain('/bills/new');
  });
});
