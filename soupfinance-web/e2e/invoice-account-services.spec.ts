/**
 * SOUPFIN-27 — Invoice creation must resolve the client's AccountServices FK.
 *
 * These E2E tests model the REAL backend network shape (unlike the older mocks
 * that artificially injected `accountServices` onto the client / portfolio):
 *
 *   GET /rest/client/index.json         → portfolioList entries are BARE refs
 *                                         ({ id, class, serialised }) with NO
 *                                         nested accountServices.
 *   GET /rest/clientPortfolio/show/{id} → the ONLY place the accountServices FK
 *                                         is available.
 *
 * Regression coverage:
 *   §1  invoice creation is NOT blocked — the form fetches the portfolio detail
 *       and submits the resolved accountServices.id.
 *   §2  the dropdown shows one option per client (client's own name).
 *   §3  the ?clientId URL parameter pre-selects the matching client.
 *
 * Screenshots are captured at every key validation point under
 * test-results/screenshots/ (see takeScreenshot).
 */
import { test, expect } from '@playwright/test';
import { takeScreenshot, mockTokenValidationApi, isLxcMode } from './fixtures';

// The real list shape: portfolio entries WITHOUT nested accountServices.
const CLIENTS = [
  {
    id: 'client-ada',
    name: '', // KYC Individual — blank name, resolves via first+last
    firstName: 'Ada',
    lastName: 'Lovelace',
    clientType: 'INDIVIDUAL',
    portfolioList: [
      { id: 'pf-ada', class: 'soupbroker.kyc.ClientPortfolio', serialised: 'Ada portfolio ref' },
    ],
  },
  {
    id: 'client-globex',
    name: 'Globex Corporation',
    clientType: 'CORPORATE',
    portfolioList: [
      // TWO portfolios — must still produce ONE dropdown option, not two.
      { id: 'pf-globex-1', class: 'soupbroker.kyc.ClientPortfolio', serialised: 'Globex ref 1' },
      { id: 'pf-globex-2', class: 'soupbroker.kyc.ClientPortfolio', serialised: 'Globex ref 2' },
    ],
  },
];

// Portfolio detail → the accountServices FK the list omitted.
const PORTFOLIO_ACCOUNT_SERVICES: Record<string, { id: string; serialised: string }> = {
  'pf-ada': { id: 'as-ada', serialised: 'Direct Account : Individual(Ada Lovelace)' },
  'pf-globex-1': { id: 'as-globex', serialised: 'Direct Account : Corporate(Globex)' },
  'pf-globex-2': { id: 'as-globex', serialised: 'Direct Account : Corporate(Globex)' },
};

async function setupAuth(page: any) {
  await page.addInitScript(() => {
    const mockUser = { username: 'admin', email: 'admin@soupfinance.com', roles: ['ROLE_ADMIN', 'ROLE_USER'] };
    localStorage.setItem('access_token', 'mock-jwt-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({ state: { user: mockUser, isAuthenticated: true }, version: 0 })
    );
  });
  await mockTokenValidationApi(page, true);
}

/** Mock every endpoint the invoice form touches, using the real backend shapes. */
async function mockInvoiceForm(page: any) {
  // List: portfolioList entries are bare refs (NO accountServices).
  await page.route('**/rest/client/index.json*', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CLIENTS) })
  );
  // Portfolio detail: resolves the accountServices FK.
  await page.route('**/rest/clientPortfolio/show/*', (route: any) => {
    const m = route.request().url().match(/clientPortfolio\/show\/([^./?]+)/);
    const pid = m?.[1] ?? '';
    const as = PORTFOLIO_ACCOUNT_SERVICES[pid];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(as ? { id: pid, accountServices: as } : { id: pid }),
    });
  });
  // Service descriptions + invoice items (empty is fine).
  await page.route('**/rest/serviceDescription/index.json*', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/rest/invoiceItem/index.json*', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  // Invoice list (for post-create navigation target).
  await page.route('**/rest/invoice/index.json*', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

test.describe('SOUPFIN-27: Invoice AccountServices resolution', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(isLxcMode(), 'Mock-only test: models the real backend shape via route mocks');
    await setupAuth(page);
    await mockInvoiceForm(page);
  });

  // §2 — one option per client, name resolved (never a portfolio serialised).
  test('client dropdown shows one option per client with resolved names', async ({ page }) => {
    await page.goto('/invoices');
    // Navigate via the New Invoice link (not a raw form URL).
    await page.getByTestId('invoice-new-button').click();
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    const select = page.getByTestId('invoice-client-select');
    await expect(select.locator('option')).toHaveCount(3); // placeholder + 2 clients
    await expect(page.getByRole('option', { name: 'Ada Lovelace' })).toBeAttached();
    await expect(page.getByRole('option', { name: 'Globex Corporation' })).toBeAttached();
    // Portfolio serialised strings must NOT leak into the dropdown.
    await expect(page.getByRole('option', { name: /portfolio ref/i })).toHaveCount(0);
    await takeScreenshot(page, 'soupfin27-dropdown-clients');
  });

  // §1 — selecting a client resolves the FK and creates the invoice (no block).
  test('selecting a client resolves accountServices and creates the invoice', async ({ page }) => {
    await page.goto('/invoices');
    await page.getByTestId('invoice-new-button').click();
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, 'soupfin27-form-loaded');

    await page.getByTestId('invoice-client-select').selectOption('client-globex');

    // The old bug surfaced "This client has no linked account services." — it must
    // NOT appear once the portfolio detail resolves the FK.
    await expect(page.getByText(/no linked account services/i)).toHaveCount(0);
    await takeScreenshot(page, 'soupfin27-client-selected-resolved');

    // Fill the rest of the form.
    await page.getByTestId('invoice-due-date-input').fill('2026-03-31');
    await page.getByTestId('invoice-item-description-0').fill('Consulting services');
    await page.getByTestId('invoice-item-quantity-0').fill('2');
    await page.getByTestId('invoice-item-unitPrice-0').fill('150');

    // Capture the create round-trip: CSRF + save. Assert the payload carries the
    // resolved accountServices FK (the whole point of the fix).
    await page.route('**/rest/invoice/create.json*', (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/rest/invoice/create' }),
      })
    );
    let savedBody: any = null;
    await page.route('**/rest/invoice/save.json*', (route: any) => {
      savedBody = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'inv-new', number: 42, accountServices: { id: 'as-globex' } }),
      });
    });

    await page.getByTestId('invoice-form-save-draft-button').click();

    // Successful create navigates back to the invoice list.
    await expect(page).toHaveURL(/\/invoices$/, { timeout: 15000 });
    await takeScreenshot(page, 'soupfin27-invoice-created');

    expect(savedBody).toBeTruthy();
    expect(savedBody.accountServices).toEqual({ id: 'as-globex' });
  });

  // §3 — the ?clientId deep link pre-selects the client and resolves its FK.
  test('honors the ?clientId URL parameter and resolves its accountServices', async ({ page }) => {
    // This deep link is exactly what the client detail page's "Create Invoice"
    // quick action produces, so a direct navigation is the feature under test.
    await page.goto('/invoices/new?clientId=client-ada');
    await expect(page.getByTestId('invoice-form-page')).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId('invoice-client-select')).toHaveValue('client-ada');
    await expect(page.getByText(/no linked account services/i)).toHaveCount(0);
    await takeScreenshot(page, 'soupfin27-clientid-preselected');
  });
});
