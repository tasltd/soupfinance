/**
 * Authentication Integration Tests
 * Tests against REAL LXC backend (soupfinance-backend)
 *
 * Run with: npx playwright test --config=playwright.integration.config.ts e2e/integration/
 */
import { test, expect } from '@playwright/test';
import { backendTestUsers, takeScreenshot } from '../fixtures';

test.describe('Authentication Integration Tests', () => {
  test.describe('Login with Real Backend', () => {
    test('can login with test.admin credentials', async ({ page }) => {
      await page.goto('/login');

      // Fill login form - use email format since frontend validates email
      await page.getByTestId('login-email-input').fill(backendTestUsers.admin.email);
      await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);

      // Submit
      await page.getByTestId('login-submit-button').click();

      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
      await expect(page.getByTestId('dashboard-page')).toBeVisible();

      await takeScreenshot(page, 'integration-login-success');
    });

    test('can login with test.finance credentials', async ({ page }) => {
      await page.goto('/login');

      await page.getByTestId('login-email-input').fill(backendTestUsers.finance.email);
      await page.getByTestId('login-password-input').fill(backendTestUsers.finance.password);
      await page.getByTestId('login-submit-button').click();

      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
      await takeScreenshot(page, 'integration-login-finance');
    });

    test('shows error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.getByTestId('login-email-input').fill('invalid@user.com');
      await page.getByTestId('login-password-input').fill('wrongpassword');
      await page.getByTestId('login-submit-button').click();

      // Should show error message
      await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 10000 });
      await takeScreenshot(page, 'integration-login-error');
    });

    test('legacy admin (soup.support) can login', async ({ page }) => {
      await page.goto('/login');

      await page.getByTestId('login-email-input').fill(backendTestUsers.legacyAdmin.email);
      await page.getByTestId('login-password-input').fill(backendTestUsers.legacyAdmin.password);
      await page.getByTestId('login-submit-button').click();

      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
      await takeScreenshot(page, 'integration-login-legacy');
    });
  });

  test.describe('Logout', () => {
    test('can logout after login', async ({ page }) => {
      // Login first
      await page.goto('/login');
      await page.getByTestId('login-email-input').fill(backendTestUsers.admin.email);
      await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);
      await page.getByTestId('login-submit-button').click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

      // Click logout
      await page.getByTestId('logout-button').click();

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
      await takeScreenshot(page, 'integration-logout-success');
    });
  });
});
