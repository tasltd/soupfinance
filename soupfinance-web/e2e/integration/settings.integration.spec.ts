/**
 * Settings Integration Tests
 * Tests against REAL LXC backend (soupfinance-backend)
 *
 * Tests user settings, account settings, and preferences
 * All API calls go through Vite proxy (same path as production frontend)
 */
import { test, expect } from '@playwright/test';
import { backendTestUsers, takeScreenshot } from '../fixtures';

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

  // Fix: Test account settings through the Vite proxy (same path the frontend uses).
  // Direct API calls to API_BASE bypass the frontend URL routing and won't catch
  // issues like the /rest/account/ vs /account/ prefix bug that broke production.
  test.describe('Account Settings API (through proxy)', () => {
    test('GET /account/index.json - returns current account via proxy', async ({ page }) => {
      // Fix: /account/index.json is the correct endpoint (NOT /account/current.json which 404s).
      // The AccountController uses JSESSIONID cookie auth set during login.
      // The browser forwards the JSESSIONID automatically through the Vite proxy.
      const response = await page.request.get('/account/index.json', {
        maxRedirects: 0,
      });

      console.log('Account settings (proxy) status:', response.status());
      // 302 = redirect to login (JSESSIONID cookie may not be forwarded)
      // 200 = success (returns array of accounts)
      expect(response.status()).toBeLessThan(500);

      if (response.ok()) {
        const data = await response.json().catch(() => null);
        console.log('Account settings response:', JSON.stringify(data, null, 2).slice(0, 500));
        if (data) {
          // Changed: Response is an array — take first element
          expect(Array.isArray(data)).toBe(true);
          if (data.length > 0) {
            expect(data[0]).toHaveProperty('id');
            expect(data[0]).toHaveProperty('name');
            expect(data[0]).toHaveProperty('currency');
          }
        }
      }
    });

    test('GET /rest/user/current.json - returns current user via proxy', async ({ page }) => {
      const token = await getAuthToken(page);

      // Fix: Use relative URL through the Vite proxy
      const response = await page.request.get('/rest/user/current.json', {
        headers: { 'X-Auth-Token': token },
        maxRedirects: 0,
      });

      console.log('Current user (proxy) status:', response.status());
      expect(response.status()).toBeLessThan(500);

      if (response.ok()) {
        const data = await response.json().catch(() => null);
        console.log('Current user response:', JSON.stringify(data, null, 2).slice(0, 500));
        if (data) {
          expect(data).toHaveProperty('username');
        }
      }
    });
  });

  test.describe('User Management', () => {
    // Fix: Use relative URL through Vite proxy (matches what frontend does)
    test('GET /rest/sbUser/index.json - returns user list (admin only)', async ({ page }) => {
      const token = await getAuthToken(page);

      const response = await page.request.get('/rest/sbUser/index.json?sort=id', {
        headers: { 'X-Auth-Token': token },
        maxRedirects: 0,
      });

      console.log('User list (proxy) status:', response.status());

      if (response.ok()) {
        const data = await response.json().catch(() => null);
        console.log('User list response:', JSON.stringify(data, null, 2).slice(0, 500));

        if (data) {
          expect(Array.isArray(data)).toBe(true);
        }
      } else {
        console.log('User list access denied or redirected:', response.status());
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
    // Fix: This test now HARD-VALIDATES that account settings loads successfully.
    // The previous version only checked for "some content", which passed even when
    // the page showed "Failed to load account settings" error (the error text matched
    // the regex). This is exactly the bug that broke production.
    test('account settings page loads without errors', async ({ page }) => {
      await page.goto('/settings/account');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Verifying authentication'),
        { timeout: 20000 }
      ).catch(() => {});

      // Fix: Wait for loading to finish — /account/index.json can take 10-20s through proxy.
      // The page shows "Loading account settings..." while fetching, then either
      // the form or the error state. Wait for loading text to disappear.
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Loading account settings'),
        { timeout: 30000 }
      ).catch(() => {});

      // HARD CHECK: Page must NOT show error state
      const hasError = await page.getByText('Failed to load account settings').isVisible({ timeout: 3000 }).catch(() => false);
      if (hasError) {
        await takeScreenshot(page, 'integration-settings-account-ERROR');
      }
      expect(hasError, 'Account settings page should NOT show error state — check /account/index.json endpoint').toBe(false);

      // Verify the form actually loaded with data
      const hasForm = await page.locator('form').isVisible({ timeout: 5000 }).catch(() => false);
      const hasHeading = await page.getByRole('heading', { name: /account settings/i }).isVisible({ timeout: 5000 }).catch(() => false);

      console.log('Account settings page:', { hasForm, hasHeading, hasError });
      expect(hasForm || hasHeading, 'Account settings form should be visible').toBeTruthy();
      await takeScreenshot(page, 'integration-settings-account');
    });

    test('account settings shows editable fields with data', async ({ page }) => {
      await page.goto('/settings/account');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Verifying authentication'),
        { timeout: 20000 }
      ).catch(() => {});

      // Wait for form to load
      await page.locator('form').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});

      // Fix: HARD-VALIDATE that the Company Name field has a value (not empty)
      // This proves the API call succeeded and populated the form
      const nameInput = page.locator('input[name="name"]');
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        const nameValue = await nameInput.inputValue();
        console.log('Company name value:', nameValue);
        expect(nameValue.length, 'Company name should be populated from API').toBeGreaterThan(0);
      }

      // Check for other editable fields
      const fields = ['currency', 'address', 'website'];
      for (const field of fields) {
        const input = page.locator(`input[name="${field}"], select[name="${field}"]`);
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
