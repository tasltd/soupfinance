/**
 * SOUPFIN-59 — a negative amount rendered the minus AFTER the currency symbol
 *
 * `accountStore.formatCurrency` built its output as `symbol + formatted`, where
 * `formatted` came from `Number.toLocaleString` and already carried its own
 * leading minus. A negative therefore reached the screen as "GH₵-1,200.00"
 * instead of "-GH₵1,200.00".
 *
 * That formatter is the one every money figure in the app routes through, so
 * this reproduced on the dashboard, the invoice and bill lists, the ledger,
 * payments and the reports — anywhere a negative can appear. The numbers were
 * right; only the sign placement was wrong.
 *
 * This spec drives the real screen a person sees. It signs in as a GHS tenant,
 * navigates to the dashboard through the side navigation, and reads the Net
 * Profit tile for a month with expenses and no paid invoices — the ordinary way
 * a negative reaches a KPI tile.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockLoginApi,
  mockTokenValidationApi,
  mockTaxEntriesApi,
  isLxcMode,
} from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  // The dashboard runs a GSAP entrance (`useGsapAnimations`) that fades the KPI
  // cards in from opacity 0. GSAP writes inline styles from JS, so Playwright's
  // `animations: 'disabled'` does not freeze it — without this wait the capture
  // races the tween and lands on a blank-looking page.
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[data-anim]')).every(
          (el) => Number(getComputedStyle(el).opacity) === 1
        ),
      undefined,
      { timeout: 10000 }
    )
    .catch(() => {});

  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-59/${name}.png`,
    fullPage: true,
  });
}

/** A bill dated inside the current month, so it lands in the expenses-MTD window. */
function currentMonthDate(day: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), day);
  return d.toISOString().split('T')[0];
}

/**
 * A month that runs at a loss: no paid invoices, one 1,200.00 bill.
 *
 * `useDashboardStats` computes netProfit as (paid invoices) − (bills this
 * month), so this yields exactly −1,200.00 — the figure quoted on the ticket.
 */
const LOSS_MAKING_BILL = {
  id: 'bill-soupfin-59',
  billNumber: 'BILL-2026-059',
  vendor: { id: 'vendor-001', name: 'Acme Corp' },
  billDate: currentMonthDate(15),
  paymentDate: currentMonthDate(28),
  status: 'PENDING' as const,
  subtotal: 1200.0,
  taxAmount: 0,
  totalAmount: 1200.0,
  amountPaid: 0,
  amountDue: 1200.0,
  items: [],
};

/**
 * Pin the tenant currency to Ghana Cedi — the currency on the ticket, and a
 * multi-character symbol, which is where "GH₵-1,200.00" reads worst.
 *
 * Registered AFTER `mockTokenValidationApi` on purpose: Playwright routes are
 * LIFO, so the last registration wins over the fixture's USD default.
 */
async function mockGhsTenant(page: Page) {
  await page.route('**/account/show/*.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'account-001',
        name: 'GHS Tenant',
        currency: 'GHS',
        dateCreated: '2024-01-01T00:00:00Z',
      }),
    })
  );
}

/**
 * Sign in through the login form, then reload.
 *
 * The reload is what actually loads the tenant settings: `login()` never returns
 * `tenantId`, so only `initialize()` → `validateToken()` on a page load enriches
 * it, and App.tsx gates the settings fetch on `tenantId` being present. The
 * token survives the reload because it sits in sessionStorage.
 */
async function signInAsGhsTenant(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill('admin@soupfinance.com');
  await page.getByTestId('login-password-input').fill('admin123');
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

const netProfit = (page: Page) => page.getByTestId('stat-net-profit-value');

test.describe('SOUPFIN-59 — the minus sign leads the currency symbol', () => {
  test.skip(isLxcMode(), 'Needs a pinned GHS tenant and a loss-making month; mock mode only.');

  test.beforeEach(async ({ page }) => {
    await mockLoginApi(page, true);
    await mockTokenValidationApi(page, true);
    await mockTaxEntriesApi(page);

    // No PAID invoices, so revenue is zero and the single bill drives the loss.
    await page.route('**/rest/invoice/index.json*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.route('**/rest/bill/index.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([LOSS_MAKING_BILL]),
      })
    );

    await mockGhsTenant(page);
  });

  test('a negative KPI renders as -GH₵1,200.00, not GH₵-1,200.00', async ({ page }) => {
    // Two page loads plus the settings fetch does not comfortably fit the
    // suite's per-test budget once everything runs in parallel.
    test.slow();

    // Arrange + Act
    await signInAsGhsTenant(page);

    // Baseline: without this, the assertions below would also pass on a tenant
    // whose currency had never been applied at all.
    await expect(netProfit(page)).toContainText('GH₵', { timeout: 15000 });

    // Assert: the exact string a person reads.
    await expect(netProfit(page)).toHaveText('-GH₵1,200.00');

    // Assert the defect explicitly — this is the string the ticket reported.
    await expect(netProfit(page)).not.toHaveText('GH₵-1,200.00');
    await expect(netProfit(page)).not.toContainText('₵-');

    // Assert the sign leads the whole figure and appears exactly once.
    const rendered = (await netProfit(page).textContent())?.trim() ?? '';
    expect(rendered.startsWith('-')).toBe(true);
    expect(rendered.match(/-/g)).toHaveLength(1);

    await shot(page, '01-dashboard-negative-net-profit');
  });

  test('navigating to the dashboard from the side menu shows the same corrected sign', async ({ page }) => {
    test.slow();

    // Arrange: arrive signed in, then leave the dashboard.
    await signInAsGhsTenant(page);
    await expect(netProfit(page)).toContainText('GH₵', { timeout: 15000 });

    // SideNav has no nav-* testids, and each link's accessible name carries the
    // Material icon ligature ("receipt_long Invoices"), so match on a substring
    // rather than an exact name — an exact match never hits a top-level nav item.
    await page.getByRole('link', { name: /Invoices/ }).first().click();
    await expect(page).toHaveURL(/\/invoices/, { timeout: 15000 });
    await shot(page, '02-navigated-away-to-invoices');

    // Act: come back via the side navigation, the way a person does.
    await page.getByRole('link', { name: /Dashboard/ }).first().click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Assert: the sign placement survives a client-side route change.
    await expect(netProfit(page)).toHaveText('-GH₵1,200.00', { timeout: 15000 });
    await shot(page, '03-back-on-dashboard-via-menu');
  });

  test('a positive figure is unchanged by the fix', async ({ page }) => {
    test.slow();

    // Arrange: expenses MTD is the same 1,200.00 bill, rendered positive.
    await signInAsGhsTenant(page);

    // Assert: no stray leading minus was introduced on the positive side.
    const expenses = page.getByTestId('stat-expenses-value');
    await expect(expenses).toHaveText('GH₵1,200.00', { timeout: 15000 });
    await expect(expenses).not.toContainText('-');

    await shot(page, '04-positive-figure-unchanged');
  });
});
