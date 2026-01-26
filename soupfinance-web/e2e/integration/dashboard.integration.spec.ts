/**
 * Dashboard Integration Tests
 * Tests against REAL LXC backend (soupfinance-backend)
 */
import { test, expect } from '@playwright/test';
import { backendTestUsers, takeScreenshot } from '../fixtures';

// Helper to login before each test
async function loginAsAdmin(page: any) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

test.describe('Dashboard Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('dashboard loads with real data', async ({ page }) => {
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();
    await takeScreenshot(page, 'integration-dashboard-loaded');
  });

  test('financial summary cards display data', async ({ page }) => {
    // Check that financial cards are visible
    const totalRevenueCard = page.locator('[data-testid="total-revenue-card"], .kpi-card').first();
    await expect(totalRevenueCard).toBeVisible({ timeout: 10000 });
    await takeScreenshot(page, 'integration-dashboard-kpi-cards');
  });

  test('recent invoices table loads', async ({ page }) => {
    // Wait for invoices table or empty state
    const invoicesTable = page.getByTestId('recent-invoices-table');
    const emptyState = page.getByTestId('invoices-empty-state');

    // Either table or empty state should be visible
    await expect(invoicesTable.or(emptyState)).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, 'integration-dashboard-invoices');
  });

  test('can navigate to invoices from dashboard', async ({ page }) => {
    // Click on invoices link in sidebar
    await page.getByRole('link', { name: /invoices/i }).first().click();
    await expect(page).toHaveURL(/\/invoices/, { timeout: 10000 });
    await takeScreenshot(page, 'integration-navigate-to-invoices');
  });
});
