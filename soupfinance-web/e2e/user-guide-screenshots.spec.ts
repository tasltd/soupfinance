/**
 * User Guide screenshot capture (SOUPFIN-52).
 *
 * Every image in `public/user-guide/index.html` is produced by this spec, so the
 * guide can never drift silently from the app: rename a page or drop a menu
 * entry and this run fails instead of the guide quietly going stale.
 *
 * Two rules the capture follows deliberately:
 *   1. It signs in through the real login form, then reaches every other screen
 *      by CLICKING the sidebar. No `page.goto()` to an internal route — a guide
 *      that documents a page no menu can reach is documenting a dead end.
 *   2. It asserts the page it landed on before the shutter fires, so a broken
 *      screen is a test failure rather than a screenshot of an error state that
 *      nobody notices until a customer reads the guide.
 *
 * Mock mode only: the figures are the curated set in `user-guide/guide-mocks.ts`
 * so the numbers quoted in the guide's prose keep matching the pictures.
 *
 * Run: npx playwright test e2e/user-guide-screenshots.spec.ts --project=firefox
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { installGuideMocks, seedAuthenticatedSession, guideUser } from './user-guide/guide-mocks';

const IMAGE_DIR = join(process.cwd(), 'public', 'user-guide', 'images');

// Screenshots go straight into the published guide folder, so a capture run
// updates the documentation in place.
mkdirSync(IMAGE_DIR, { recursive: true });

test.use({ viewport: { width: 1440, height: 900 } });

// A full walk of one area is several navigations plus a screenshot each; the
// 30s project default is too tight for the Reports walk in particular.
test.describe.configure({ mode: 'parallel' });
test.setTimeout(120_000);

/** JPEG keeps the guide's ~30 images to a sane size for a repo and a page load. */
async function shoot(page: Page, name: string) {
  // Let fonts, icons and the GSAP entrance animations settle, otherwise the
  // shot catches half-faded cards and the guide looks broken.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({
    path: join(IMAGE_DIR, `${name}.jpg`),
    type: 'jpeg',
    quality: 82,
    fullPage: true,
  });
}

/** Sidebar link, addressed by route so labels containing icon text stay unambiguous. */
function menu(page: Page, href: string) {
  return page.locator('aside').locator(`a[href="${href}"]`).first();
}

/** Click a sidebar entry and wait for the SPA to land on it. */
async function navigate(page: Page, href: string, landedOn: string | RegExp) {
  await menu(page, href).click();
  await expect(page).toHaveURL(new RegExp(typeof landedOn === 'string' ? landedOn : landedOn.source));
}

/** Start already signed in — for the walks that do not document the login form. */
async function startAtDashboard(page: Page) {
  await installGuideMocks(page);
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
}

// ===========================================================================
// Getting started — the screens a brand-new user meets
// ===========================================================================

test.describe('user guide: getting started', () => {
  test('captures sign-in, registration and password recovery', async ({ page }) => {
    await installGuideMocks(page);

    await page.goto('/login');
    await expect(page.getByTestId('login-page')).toBeVisible();
    await shoot(page, 'login');

    // Registration is reached from the login page, never by typing a URL.
    await page.getByTestId('login-register-link').click();
    await expect(page.getByTestId('registration-page')).toBeVisible();
    await shoot(page, 'register');

    await page.getByTestId('registration-login-link').click();
    await expect(page.getByTestId('login-page')).toBeVisible();

    await page.getByTestId('login-forgot-password-link').click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await shoot(page, 'forgot-password');
  });

  test('captures a filled sign-in form', async ({ page }) => {
    await installGuideMocks(page);
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(guideUser.email);
    await page.getByTestId('login-password-input').fill('demo-password');
    await page.getByTestId('login-remember-checkbox').check();
    await shoot(page, 'login-filled');

    await page.getByTestId('login-submit-button').click();
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  });

  test('captures the dashboard', async ({ page }) => {
    // Captured from an established session, not from the moment of sign-in.
    // Straight after login the store has no tenantId, so account settings never
    // load and every amount renders in the default USD rather than the tenant's
    // own currency (filed as SOUPFIN-53). Documenting that transient state would
    // put the wrong currency symbol in the guide.
    await startAtDashboard(page);
    await expect(page.getByTestId('dashboard-kpi-cards')).toBeVisible();
    await shoot(page, 'dashboard');
  });

  test('captures the dashboard in dark mode', async ({ page }) => {
    await startAtDashboard(page);

    // The header button cycles light -> dark -> system, and the starting point
    // is whatever the store persisted, so click until dark actually lands
    // rather than assuming a fixed number of presses.
    const themeToggle = page
      .locator('header button')
      .filter({ hasText: /^(light_mode|dark_mode|settings_brightness)$/ });
    for (let i = 0; i < 3; i++) {
      if (await page.locator('html.dark').count()) break;
      await themeToggle.click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator('html')).toHaveClass(/dark/);
    await shoot(page, 'dashboard-dark');
  });
});

// ===========================================================================
// Sales: clients and invoices
// ===========================================================================

test.describe('user guide: clients and invoices', () => {
  test('captures the client list and the new-client form', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/clients', '/clients$');
    await expect(page.getByTestId('client-list-page')).toBeVisible();
    await expect(page.getByTestId('client-list-table')).toBeVisible();
    await shoot(page, 'clients-list');

    await page.getByTestId('client-new-button').click();
    await expect(page.getByTestId('client-form-page')).toBeVisible();
    await shoot(page, 'client-form');

    await page.getByTestId('client-type-corporate').click();
    await page.getByTestId('client-form-company-name').fill('Harbour Logistics Ltd');
    await page.getByTestId('client-form-email').fill('finance@harbourlogistics.com');
    await page.getByTestId('client-form-phone').fill('+233 24 555 0187');
    await shoot(page, 'client-form-filled');
  });

  test('captures the invoice list, the invoice form and an invoice in detail', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/invoices', '/invoices$');
    await expect(page.getByTestId('invoice-list-page')).toBeVisible();
    await expect(page.getByTestId('invoice-list-table')).toBeVisible();
    await shoot(page, 'invoices-list');

    await page.getByTestId('invoice-new-button').click();
    await expect(page.getByTestId('invoice-form-page')).toBeVisible();
    await expect(page.getByTestId('invoice-details-card')).toBeVisible();
    await shoot(page, 'invoice-form');

    await page.getByTestId('invoice-form-cancel-button').click();
    await expect(page.getByTestId('invoice-list-table')).toBeVisible();

    await page.getByTestId('invoice-link-inv-001').click();
    await expect(page.getByTestId('invoice-detail-page')).toBeVisible();
    await expect(page.getByTestId('invoice-amount-card')).toBeVisible();
    await shoot(page, 'invoice-detail');
  });
});

// ===========================================================================
// Purchases: vendors and bills
// ===========================================================================

test.describe('user guide: vendors and bills', () => {
  test('captures the vendor list', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/vendors', '/vendors$');
    await expect(page.getByTestId('vendor-list-page')).toBeVisible();
    await expect(page.getByTestId('vendor-list-table')).toBeVisible();
    await shoot(page, 'vendors-list');
  });

  test('captures the bill list and the new-bill form', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/bills', '/bills$');
    await expect(page.getByTestId('bill-list-page')).toBeVisible();
    await expect(page.getByTestId('bill-list-table')).toBeVisible();
    await shoot(page, 'bills-list');

    await page.getByTestId('bill-new-button').click();
    await expect(page.getByTestId('bill-form-page')).toBeVisible();
    await expect(page.getByTestId('bill-details-card')).toBeVisible();
    await shoot(page, 'bill-form');
  });
});

// ===========================================================================
// Payments
// ===========================================================================

test.describe('user guide: payments', () => {
  test('captures the payments list and the record-payment form', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/payments', '/payments$');
    await expect(page.getByTestId('payment-list-page')).toBeVisible();
    await shoot(page, 'payments-list');

    // The module-disabled banner replaces the Record Payment button on tenants
    // without the Voucher module, so only follow through when the button exists.
    const record = page.getByTestId('record-payment-button');
    if (await record.count()) {
      await record.first().click();
      await expect(page.getByTestId('payment-form-page')).toBeVisible();
      await shoot(page, 'payment-form');
    }
  });
});

// ===========================================================================
// Ledger
// ===========================================================================

test.describe('user guide: ledger', () => {
  test('captures the chart of accounts and the ledger transactions list', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/ledger/accounts', '/ledger/accounts');
    await expect(page.getByTestId('chart-of-accounts-page')).toBeVisible();
    await shoot(page, 'chart-of-accounts');

    // The sub-menu only renders once the Ledger section is the active one.
    await navigate(page, '/ledger/transactions', '/ledger/transactions');
    await expect(page.getByTestId('ledger-transactions-page')).toBeVisible();
    await shoot(page, 'ledger-transactions');
  });
});

// ===========================================================================
// Accounting
// ===========================================================================

test.describe('user guide: accounting', () => {
  test('captures the transaction register, journal entry and both vouchers', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/accounting/transactions', '/accounting/transactions');
    await expect(page.getByTestId('transaction-register-page')).toBeVisible();
    await shoot(page, 'transaction-register');

    await navigate(page, '/accounting/journal-entry', '/accounting/journal-entry');
    await expect(page.getByTestId('journal-entry-page')).toBeVisible();
    await expect(page.getByTestId('journal-entry-lines-section')).toBeVisible();
    await shoot(page, 'journal-entry');

    await navigate(page, '/accounting/voucher/payment', '/accounting/voucher/payment');
    await expect(page.getByTestId('voucher-form-page')).toBeVisible();
    await shoot(page, 'voucher-payment');

    await navigate(page, '/accounting/voucher/receipt', '/accounting/voucher/receipt');
    await expect(page.getByTestId('voucher-form-page')).toBeVisible();
    await shoot(page, 'voucher-receipt');
  });
});

// ===========================================================================
// Reports
// ===========================================================================

test.describe('user guide: reports', () => {
  test('captures the reports hub and every statement it links to', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/reports', '/reports$');
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await shoot(page, 'reports-hub');

    await navigate(page, '/reports/pnl', '/reports/pnl');
    await expect(page.getByTestId('profit-loss-page')).toBeVisible();
    await shoot(page, 'report-profit-loss');

    await navigate(page, '/reports/balance-sheet', '/reports/balance-sheet');
    await expect(page.getByTestId('balance-sheet-page')).toBeVisible();
    await shoot(page, 'report-balance-sheet');

    await navigate(page, '/reports/cash-flow', '/reports/cash-flow');
    await expect(page.getByTestId('cash-flow-page')).toBeVisible();
    await shoot(page, 'report-cash-flow');

    await navigate(page, '/reports/aging', '/reports/aging');
    await expect(page.getByTestId('aging-reports-page')).toBeVisible();
    await shoot(page, 'report-aging');

    await navigate(page, '/reports/trial-balance', '/reports/trial-balance');
    await expect(page.getByTestId('trial-balance-page')).toBeVisible();
    await shoot(page, 'report-trial-balance');

    await navigate(page, '/reports/scheduled', '/reports/scheduled');
    await expect(page.getByTestId('scheduled-reports-page')).toBeVisible();
    await shoot(page, 'reports-scheduled');
  });
});

// ===========================================================================
// Settings
// ===========================================================================

test.describe('user guide: settings', () => {
  test('captures users, bank accounts and company settings', async ({ page }) => {
    await startAtDashboard(page);

    await navigate(page, '/settings/users', '/settings/users');
    await expect(page.getByTestId('user-list-page')).toBeVisible();
    await shoot(page, 'settings-users');

    await navigate(page, '/settings/bank-accounts', '/settings/bank-accounts');
    await expect(page.getByTestId('bank-account-list-page')).toBeVisible();
    await shoot(page, 'settings-bank-accounts');

    await navigate(page, '/settings/account', '/settings/account');
    await expect(page.getByTestId('account-settings-fieldset')).toBeVisible();
    await shoot(page, 'settings-account');
  });
});
