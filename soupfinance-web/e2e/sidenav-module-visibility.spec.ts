/**
 * SideNav module-gated visibility E2E (SOUPFIN-25)
 *
 * Validates that the "Vendors" sidebar item is hidden for SERVICES tenants (which have no
 * TRADING module and would get a 403 from the backend) and shown for TRADING tenants.
 *
 * Approach: authenticate, mock the account/show response with a specific
 * businessLicenceCategory, land on /dashboard (the SideNav is part of the authenticated
 * layout), and assert the Vendors nav link presence/absence. Screenshots captured at each
 * assertion point under test-results/screenshots/.
 */
import { test, expect } from '@playwright/test';
import { mockDashboardApi, setupResponseValidation, takeScreenshot } from './fixtures';

// Register an account/show mock that returns a specific businessLicenceCategory.
// Registered AFTER mockDashboardApi so it takes precedence (Playwright routes are LIFO).
async function mockAccountCategory(page: any, category: string) {
  await page.route('**/account/show/*.json*', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'account-001',
        name: 'Test Company',
        currency: 'USD',
        businessLicenceCategory: category,
        dateCreated: '2024-01-01T00:00:00Z',
      }),
    });
  });
}

test.describe('SideNav module-gated visibility (SOUPFIN-25)', () => {
  test.beforeEach(async ({ page }) => {
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
    await setupResponseValidation(page);
  });

  test('hides Vendors nav for a SERVICES tenant', async ({ page }) => {
    await mockDashboardApi(page);
    await mockAccountCategory(page, 'SERVICES');

    await page.goto('/dashboard');

    const nav = page.locator('nav');
    // Sibling item confirms the sidebar rendered before asserting absence.
    await expect(nav.getByText('Invoices', { exact: true })).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, 'soupfin25-services-sidebar');

    // Vendors must NOT be present for SERVICES tenants.
    await expect(nav.getByText('Vendors', { exact: true })).toHaveCount(0);
  });

  test('shows Vendors nav for a TRADING tenant', async ({ page }) => {
    await mockDashboardApi(page);
    await mockAccountCategory(page, 'TRADING');

    await page.goto('/dashboard');

    const nav = page.locator('nav');
    await expect(nav.getByText('Invoices', { exact: true })).toBeVisible({ timeout: 15000 });
    // Vendors IS present for TRADING tenants.
    await expect(nav.getByText('Vendors', { exact: true })).toBeVisible();
    await takeScreenshot(page, 'soupfin25-trading-sidebar');
  });
});
