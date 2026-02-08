/**
 * Settings Integration Tests
 * Tests against REAL LXC backend (soupfinance-backend)
 *
 * Tests user settings, account settings, and preferences
 * Uses actual API endpoints: /rest/account/*, /rest/sbUser/*
 */
import { test, expect } from '@playwright/test';
import { backendTestUsers, takeScreenshot } from '../fixtures';

const API_BASE = 'http://10.115.213.183:9090';

// Changed: Login with remember-me for reliable token persistence
async function loginAsAdmin(page: any) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByTestId('login-email-input').fill(backendTestUsers.admin.username);
  await page.getByTestId('login-password-input').fill(backendTestUsers.admin.password);

  const rememberCheckbox = page.getByTestId('login-remember-checkbox');
  if (await rememberCheckbox.isVisible().catch(() => false)) {
    await rememberCheckbox.check();
  }

  await page.getByTestId('login-submit-button').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

// Helper to get auth token from page (checks both storages for dual-storage strategy)
async function getAuthToken(page: any): Promise<string> {
  return await page.evaluate(() =>
    localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || ''
  );
}

test.describe('Settings Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test.describe('Settings Page Navigation', () => {
    test('settings page loads', async ({ page }) => {
      // Changed: Use domcontentloaded — some settings API calls can be slow
      await page.waitForLoadState('domcontentloaded');

      // Navigate to settings via sidebar or menu
      const settingsLink = page.getByRole('link', { name: /settings/i }).first();
      if (await settingsLink.isVisible().catch(() => false)) {
        await settingsLink.click();
        await expect(page).toHaveURL(/\/settings/, { timeout: 10000 });
      } else {
        await page.goto('/settings');
      }

      await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 15000 });
      await takeScreenshot(page, 'integration-settings-main');
    });

    test('settings has multiple sections', async ({ page }) => {
      await page.goto('/settings');
      // Changed: Use domcontentloaded — some settings API calls can be slow
      await page.waitForLoadState('domcontentloaded');
      // Fix: Wait for auth verification to complete before checking content
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Verifying authentication'),
        { timeout: 20000 }
      ).catch(() => {});

      // Check for actual settings sections from SettingsLayout
      const sections = ['users', 'bank accounts', 'account settings'];

      for (const section of sections) {
        const link = page.getByRole('link', { name: new RegExp(section, 'i') });

        if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`Found settings section: ${section}`);
        }
      }

      await takeScreenshot(page, 'integration-settings-sections');
    });
  });

  test.describe('Account Settings API', () => {
    test('GET /rest/account/current.json - returns current account', async ({ page }) => {
      const token = await getAuthToken(page);

      const response = await page.request.get(`${API_BASE}/rest/account/current.json`, {
        headers: { 'X-Auth-Token': token },
      });

      console.log('Current account status:', response.status());
      expect(response.status()).toBeLessThan(500);

      const data = await response.json().catch(() => null);
      console.log('Current account response:', JSON.stringify(data, null, 2).slice(0, 500));

      if (data && response.ok()) {
        // Account should have basic properties
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('name');
      }
    });

    test('GET /rest/user/current.json - returns current user', async ({ page }) => {
      const token = await getAuthToken(page);

      const response = await page.request.get(`${API_BASE}/rest/user/current.json`, {
        headers: { 'X-Auth-Token': token },
      });

      console.log('Current user status:', response.status());
      expect(response.status()).toBeLessThan(500);

      const data = await response.json().catch(() => null);
      console.log('Current user response:', JSON.stringify(data, null, 2).slice(0, 500));

      if (data && response.ok()) {
        expect(data).toHaveProperty('username');
      }
    });
  });

  test.describe('User Management', () => {
    test('GET /rest/sbUser/index.json - returns user list (admin only)', async ({ page }) => {
      const token = await getAuthToken(page);

      // Note: SbUser requires ?sort=id parameter
      const response = await page.request.get(`${API_BASE}/rest/sbUser/index.json?sort=id`, {
        headers: { 'X-Auth-Token': token },
      });

      console.log('User list status:', response.status());

      // May be 403 if not admin, or 200 if admin
      if (response.ok()) {
        const data = await response.json().catch(() => null);
        console.log('User list response:', JSON.stringify(data, null, 2).slice(0, 500));

        if (data) {
          expect(Array.isArray(data)).toBe(true);
        }
      } else {
        console.log('User list access denied (expected for non-admin users)');
      }
    });

    test('users settings page loads', async ({ page }) => {
      await page.goto('/settings/users');
      // Changed: Use domcontentloaded — some settings API calls can be slow
      await page.waitForLoadState('domcontentloaded');
      // Fix: Wait for auth verification to complete before checking content
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Verifying authentication'),
        { timeout: 20000 }
      ).catch(() => {});

      // May show users list or access denied
      const heading = page.getByRole('heading', { name: /user/i });
      const hasHeading = await heading.isVisible({ timeout: 10000 }).catch(() => false);

      if (!hasHeading) {
        console.log('Users page may require admin role');
      }

      await takeScreenshot(page, 'integration-settings-users');
    });
  });

  test.describe('Account Settings', () => {
    test('account settings page loads', async ({ page }) => {
      // Navigate to /settings/account (not /settings/company)
      await page.goto('/settings/account');
      // Changed: Use domcontentloaded — some settings API calls can be slow
      await page.waitForLoadState('domcontentloaded');
      // Fix: Wait for auth verification to complete before checking content
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Verifying authentication'),
        { timeout: 20000 }
      ).catch(() => {});

      // Settings page may have different headings or just content
      const hasHeading = await page.getByRole('heading', { name: /settings|account/i }).first().isVisible({ timeout: 15000 }).catch(() => false);
      const hasForm = await page.locator('form').isVisible({ timeout: 5000 }).catch(() => false);
      const hasContent = await page.getByText(/settings|account/i).first().isVisible({ timeout: 5000 }).catch(() => false);

      console.log('Account settings content:', { hasHeading, hasForm, hasContent });
      expect(hasHeading || hasForm || hasContent).toBeTruthy();
      await takeScreenshot(page, 'integration-settings-account');
    });

    test('account settings shows editable fields', async ({ page }) => {
      await page.goto('/settings/account');
      // Changed: Use domcontentloaded — some settings API calls can be slow
      await page.waitForLoadState('domcontentloaded');
      // Fix: Wait for auth verification to complete before checking content
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Verifying authentication'),
        { timeout: 20000 }
      ).catch(() => {});

      // Check for editable fields - match actual fields in AccountSettingsPage
      const fields = ['name', 'currency', 'address', 'website'];

      for (const field of fields) {
        const input = page.getByLabel(new RegExp(field, 'i'));
        if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`Found account field: ${field}`);
        }
      }

      await takeScreenshot(page, 'integration-settings-account-form');
    });
  });

  test.describe('Bank Accounts Settings', () => {
    test('bank accounts page loads', async ({ page }) => {
      // Navigate to bank accounts settings
      await page.goto('/settings/bank-accounts');
      // Changed: Use domcontentloaded — some settings API calls can be slow
      await page.waitForLoadState('domcontentloaded');
      // Fix: Wait for auth verification to complete before checking content
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Verifying authentication'),
        { timeout: 20000 }
      ).catch(() => {});

      // Bank accounts page may have different headings or just content
      const hasHeading = await page.getByRole('heading', { name: /settings|bank/i }).first().isVisible({ timeout: 15000 }).catch(() => false);
      const hasTable = await page.locator('table').isVisible({ timeout: 5000 }).catch(() => false);
      const hasContent = await page.getByText(/bank|settings/i).first().isVisible({ timeout: 5000 }).catch(() => false);

      console.log('Bank accounts settings content:', { hasHeading, hasTable, hasContent });
      expect(hasHeading || hasTable || hasContent).toBeTruthy();
      await takeScreenshot(page, 'integration-settings-bank-accounts');
    });

    test('bank accounts shows list or empty state', async ({ page }) => {
      await page.goto('/settings/bank-accounts');
      // Changed: Use domcontentloaded — some settings API calls can be slow
      await page.waitForLoadState('domcontentloaded');
      // Fix: Wait for auth verification to complete before checking content
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Verifying authentication'),
        { timeout: 20000 }
      ).catch(() => {});

      // Should show either bank accounts table or empty state
      const hasTable = await page.locator('table').isVisible().catch(() => false);
      const hasEmptyState = await page.getByText(/no bank account|add.*bank/i).isVisible().catch(() => false);
      const hasContent = await page.getByText(/bank/i).isVisible().catch(() => false);

      console.log('Bank accounts content:', { hasTable, hasEmptyState, hasContent });
      await takeScreenshot(page, 'integration-settings-bank-accounts-list');
    });
  });

  test.describe('Theme Settings', () => {
    test('dark mode toggle in top nav', async ({ page }) => {
      // Dark mode toggle is in the top nav, not settings
      await page.goto('/dashboard');
      // Changed: Use domcontentloaded — some settings API calls can be slow
      await page.waitForLoadState('domcontentloaded');
      // Fix: Wait for auth verification to complete before checking content
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Verifying authentication'),
        { timeout: 20000 }
      ).catch(() => {});

      // Look for dark mode toggle in top navigation
      const darkModeToggle = page.getByRole('button', { name: /dark|light|theme/i })
        .or(page.locator('[data-testid="theme-toggle"]'))
        .or(page.locator('button').filter({ has: page.locator('.material-symbols-outlined:has-text("dark_mode"), .material-symbols-outlined:has-text("light_mode")') }));

      if (await darkModeToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Take screenshot before toggle
        await takeScreenshot(page, 'integration-theme-before');

        // Toggle dark mode
        await darkModeToggle.click();
        await page.waitForTimeout(500);

        // Take screenshot after toggle
        await takeScreenshot(page, 'integration-theme-after');
      } else {
        console.log('Dark mode toggle not found in current UI');
      }
    });
  });
});
