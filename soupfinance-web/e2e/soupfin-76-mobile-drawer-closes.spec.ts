/**
 * SOUPFIN-76 — Mobile sidebar drawer stays open after tapping a nav link
 *
 * On a phone-sized screen the sidebar is a drawer opened from the menu button.
 * Tapping a link inside it navigated, but the drawer and its dark overlay stayed
 * on top of the new page: the only code that closed it was the overlay's own
 * onClick. The fix closes the drawer on every navigation, so each test below
 * opens the menu, taps a link, and then asserts the page it opened is visible
 * with the drawer and overlay gone — without touching the overlay.
 *
 * The viewport is 390px wide (an iPhone 12-14), under the `md` breakpoint where
 * the sidebar becomes a drawer.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mockAmbientApi,
  mockTokenValidationApi,
  mockDashboardApi,
  mockInvoicesApi,
  isLxcMode,
} from './fixtures';

/**
 * Screenshots go to a git-tracked directory rather than through the shared
 * `takeScreenshot` fixture: that helper writes under `test-results/`, which
 * Playwright wipes at the start of every run, so the evidence would not survive.
 */
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/playwright/screenshots/soupfin-76/${name}.png`,
    fullPage: true,
  });
}

const OVERLAY = 'div.fixed.inset-0.bg-black\\/50';

async function openDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
}

/** Open the drawer from the top bar and wait until it has slid fully in. */
async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await expect(page.locator(OVERLAY)).toBeVisible();
  await expect(page.locator('aside')).toBeInViewport({ ratio: 1 });
}

/**
 * The drawer is closed: the overlay is gone and the sidebar has slid off the
 * left edge. `not.toBeInViewport` waits out the 300ms slide transition.
 */
async function expectMenuClosed(page: Page) {
  await expect(page.locator(OVERLAY)).toHaveCount(0);
  await expect(page.locator('aside')).not.toBeInViewport();
}

test.describe('SOUPFIN-76: the mobile drawer closes when a nav link is tapped', () => {
  test.skip(isLxcMode(), 'Mock-only spec: drives the nav chrome, not backend data');

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const mockUser = {
        username: 'admin',
        email: 'admin@soupfinance.com',
        roles: ['ROLE_ADMIN', 'ROLE_USER'],
        tenantId: 'account-001',
      };
      localStorage.setItem('access_token', 'mock-jwt-token');
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { user: mockUser, isAuthenticated: true }, version: 0 })
      );
    });
    await mockAmbientApi(page);
    await mockTokenValidationApi(page, true);
    await mockDashboardApi(page);
    await mockInvoicesApi(page);
  });

  test('tapping Invoices shows the invoice list, not the drawer', async ({ page }) => {
    await openDashboard(page);
    await openMenu(page);
    await shot(page, '01-drawer-open-on-dashboard');

    await page.getByRole('link', { name: 'Invoices', exact: true }).click();
    await expect(page).toHaveURL(/\/invoices$/);

    await expectMenuClosed(page);
    // The page underneath is on screen, not hidden behind the overlay.
    const heading = page.getByTestId('invoice-list-heading');
    await expect(heading).toBeVisible();
    await expect(heading).toBeInViewport();
    await shot(page, '02-invoices-after-nav-tap');
  });

  test('tapping Help shows the help page, not the drawer', async ({ page }) => {
    await openDashboard(page);
    await openMenu(page);

    await page.getByRole('link', { name: 'Help', exact: true }).click();
    await expect(page).toHaveURL(/\/help$/);

    await expectMenuClosed(page);
    // The drawer covered this link; a real tap now reaches it.
    await expect(page.getByTestId('help-open-new-tab')).toBeInViewport();
    await shot(page, '03-help-after-nav-tap');
  });

  test('tapping Reports, then a report inside it, closes the drawer both times', async ({
    page,
  }) => {
    await openDashboard(page);
    await openMenu(page);

    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expectMenuClosed(page);
    await shot(page, '04-reports-after-nav-tap');

    // Reports is active now, so reopening the menu shows its sub-items.
    await openMenu(page);
    await shot(page, '05-drawer-reopened-with-report-links');
    const allReports = page.getByRole('link', { name: 'All Reports', exact: true });
    await expect(allReports).toBeVisible();
    // A tap on the current page's link still navigates (a replace), and that
    // must close the drawer too — the path alone does not change here.
    await allReports.click();
    await expect(page).toHaveURL(/\/reports$/);
    await expectMenuClosed(page);
  });

  test('tapping the link for the page already open closes the drawer', async ({ page }) => {
    await openDashboard(page);
    await openMenu(page);

    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await expectMenuClosed(page);
    await expect(page.getByTestId('dashboard-page')).toBeInViewport();
    await shot(page, '06-dashboard-same-route-tap');
  });

  test('opening the menu without tapping a link keeps it open', async ({ page }) => {
    // Guards the fix from closing the drawer the moment it opens.
    await openDashboard(page);
    await openMenu(page);
    await page.waitForTimeout(600);
    await expect(page.locator(OVERLAY)).toBeVisible();
    await expect(page.locator('aside')).toBeInViewport({ ratio: 1 });

    // The overlay still dismisses it, as before.
    await page.locator(OVERLAY).click({ position: { x: 360, y: 400 } });
    await expectMenuClosed(page);
  });

  test('the drawer closes on every tap across many navigations in a row', async ({ page }) => {
    await openDashboard(page);
    const route: Array<[label: string, url: RegExp]> = [
      ['Invoices', /\/invoices$/],
      ['Help', /\/help$/],
      ['Dashboard', /\/dashboard$/],
    ];
    for (let lap = 0; lap < 4; lap++) {
      for (const [label, url] of route) {
        await openMenu(page);
        await page.getByRole('link', { name: label, exact: true }).click();
        await expect(page).toHaveURL(url);
        await expectMenuClosed(page);
      }
    }
    await shot(page, '07-after-twelve-nav-taps');
  });
});
