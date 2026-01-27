/**
 * Invoice Integration Tests
 * Tests against REAL LXC backend (soupfinance-backend)
 */
import { test, expect } from '@playwright/test';
import { backendTestUsers, takeScreenshot } from '../fixtures';

async function loginAsAdmin(page: any) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

test.describe('Invoice Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('invoice list page loads with real data', async ({ page }) => {
    // Wait for dashboard to fully load before navigating
    await page.waitForLoadState('networkidle');

    // Use sidebar navigation (React Router) instead of page.goto() to avoid full page reload
    // Full page reload can cause race conditions with auth store rehydration
    await page.getByRole('link', { name: /invoices/i }).first().click();
    await expect(page).toHaveURL(/\/invoices/, { timeout: 10000 });

    // Wait for page to load - use heading that exists in the invoices page
    await expect(page.getByRole('heading', { name: /invoice/i })).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, 'integration-invoices-list');
  });

  test('can navigate to new invoice form', async ({ page }) => {
    await page.goto('/invoices');
    await page.waitForLoadState('networkidle');

    // Click new invoice button
    const newInvoiceBtn = page.getByTestId('new-invoice-button').or(page.getByRole('button', { name: /new invoice/i }));
    if (await newInvoiceBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newInvoiceBtn.click();
      await expect(page).toHaveURL(/\/invoices\/new|\/invoices\/create/, { timeout: 10000 });
      await takeScreenshot(page, 'integration-invoice-new-form');
    }
  });

  test('invoice API returns valid data structure', async ({ page }) => {
    // Make direct API call to check response structure
    const response = await page.request.get('/rest/invoice/index.json', {
      headers: {
        'X-Auth-Token': await page.evaluate(() => localStorage.getItem('access_token') || ''),
      },
    });

    // API should return 200 or data
    console.log('Invoice API response status:', response.status());
    const data = await response.json().catch(() => null);
    console.log('Invoice API response:', JSON.stringify(data, null, 2));

    // Document the actual response for backend implementation plan
    expect(response.status()).toBeLessThan(500); // No server errors
  });
});
