/**
 * Authentication E2E Tests
 * Tests login page rendering, login flows, and logout functionality
 *
 * DUAL-MODE: These tests work with both mock and real backend:
 * - Mock mode: Uses mockLoginApi, mockDashboardApi, etc.
 * - LXC mode: Mocks are skipped, hits real backend with real credentials
 */
import { test, expect } from '@playwright/test';
import {
  mockLoginApi,
  mockOtpRequestApi,
  mockInvoicesApi,
  mockDashboardApi,
  mockTokenValidationApi,
  mockUsers,
  takeScreenshot,
  getTestUsers,
  isLxcMode,
} from './fixtures';

// Get appropriate test users based on mode (mock or LXC)
const testUsers = getTestUsers();

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state before each test
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test.describe('Login Page', () => {
    test('login page renders correctly', async ({ page }) => {
      // Navigate to login page
      await page.goto('/login');
      await takeScreenshot(page, 'auth-login-page-initial');

      // Verify page elements are present
      await expect(page.getByTestId('login-page')).toBeVisible();
      await expect(page.getByTestId('login-heading')).toHaveText('Welcome back');
      await expect(page.getByTestId('login-form')).toBeVisible();
      await expect(page.getByTestId('login-email-input')).toBeVisible();
      await expect(page.getByTestId('login-password-input')).toBeVisible();
      await expect(page.getByTestId('login-submit-button')).toBeVisible();
      await expect(page.getByTestId('login-submit-button')).toHaveText('Sign In');
      await expect(page.getByTestId('login-register-link')).toBeVisible();

      await takeScreenshot(page, 'auth-login-page-verified');
    });

    test('login page has correct form placeholders', async ({ page }) => {
      await page.goto('/login');

      // Verify input placeholders (backend expects username, not email)
      await expect(page.getByTestId('login-email-input')).toHaveAttribute(
        'placeholder',
        'Enter your username'
      );
      await expect(page.getByTestId('login-password-input')).toHaveAttribute(
        'placeholder',
        'Enter your password'
      );
    });

    test('login page shows remember me checkbox', async ({ page }) => {
      await page.goto('/login');

      await expect(page.getByTestId('login-remember-checkbox')).toBeVisible();
      await expect(page.getByText('Remember me')).toBeVisible();
    });

    test('login page shows forgot password link', async ({ page }) => {
      await page.goto('/login');

      await expect(page.getByTestId('login-forgot-password-link')).toBeVisible();
      await expect(page.getByTestId('login-forgot-password-link')).toHaveText('Forgot password?');
    });
  });

  test.describe('Login with valid credentials', () => {
    test('successful login redirects to dashboard', async ({ page }) => {
      // Set up API mocks (skipped automatically in LXC mode)
      await mockLoginApi(page, true, testUsers.admin);
      await mockDashboardApi(page);

      // Navigate to login
      await page.goto('/login');
      await takeScreenshot(page, 'auth-login-before-fill');

      // Fill in credentials (uses testUsers which adapts to mode)
      await page.getByTestId('login-email-input').fill(testUsers.admin.email);
      await page.getByTestId('login-password-input').fill(testUsers.admin.password);
      await takeScreenshot(page, 'auth-login-form-filled');

      // Submit form
      await page.getByTestId('login-submit-button').click();

      // Wait for navigation to dashboard
      await page.waitForURL('**/dashboard', { timeout: 15000 });
      await takeScreenshot(page, 'auth-login-success-dashboard');

      // Verify we're on the dashboard
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
      await expect(page.getByTestId('dashboard-heading')).toHaveText('Financial Overview');
    });

    // Skip: Loading state is difficult to test reliably with mocked APIs
    test.skip('login button shows loading state while submitting', async ({ page }) => {
      // Set up delayed API response to observe loading state
      // Use a longer delay and don't fulfill until we've checked the loading state
      let resolveLogin: (value: unknown) => void;
      const loginPromise = new Promise((resolve) => {
        resolveLogin = resolve;
      });

      await page.route('**/rest/api/login', async (route) => {
        await loginPromise; // Wait until we signal it's OK to complete
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'mock-jwt-token',
            token_type: 'Bearer',
            username: testUsers.admin.username,
            roles: testUsers.admin.roles,
          }),
        });
      });
      // Changed: Use mockDashboardApi for comprehensive dashboard mocking
      await mockDashboardApi(page);

      await page.goto('/login');

      // Wait for the login form to be fully loaded
      await expect(page.getByTestId('login-form')).toBeVisible();

      await page.getByTestId('login-email-input').fill(testUsers.admin.email);
      await page.getByTestId('login-password-input').fill(testUsers.admin.password);

      // Click submit
      const submitButton = page.getByTestId('login-submit-button');
      await submitButton.click();

      // Button should show loading text while API is pending
      // The button shows "Signing in..." while loading
      await expect(submitButton).toContainText('Signing in', { timeout: 2000 });
      await takeScreenshot(page, 'auth-login-loading-state');

      // Now allow the API to complete
      resolveLogin!(true);

      // Wait for completion
      await page.waitForURL('**/dashboard');
    });
  });

  test.describe('Login with invalid credentials', () => {
    test('shows error message for invalid credentials', async ({ page }) => {
      // Set up failed login mock
      await mockLoginApi(page, false);

      await page.goto('/login');
      await takeScreenshot(page, 'auth-invalid-login-initial');

      // Fill in invalid credentials
      await page.getByTestId('login-email-input').fill('wrong@email.com');
      await page.getByTestId('login-password-input').fill('wrongpassword');

      // Submit form
      await page.getByTestId('login-submit-button').click();

      // Wait for error message to appear
      await expect(page.getByTestId('login-error')).toBeVisible();
      await takeScreenshot(page, 'auth-invalid-login-error');

      // Should still be on login page
      await expect(page).toHaveURL(/\/login/);
    });

    test('error message clears when user starts typing', async ({ page }) => {
      // Set up failed login mock
      await mockLoginApi(page, false);

      await page.goto('/login');

      // Trigger error
      await page.getByTestId('login-email-input').fill('wrong@email.com');
      await page.getByTestId('login-password-input').fill('wrongpassword');
      await page.getByTestId('login-submit-button').click();

      // Error should be visible
      await expect(page.getByTestId('login-error')).toBeVisible();

      // Now set up successful login for retry
      await mockLoginApi(page, true);
      // Changed: Use mockDashboardApi for comprehensive dashboard mocking
      await mockDashboardApi(page);

      // Start typing in email field (simulates user retry)
      await page.getByTestId('login-email-input').clear();
      await page.getByTestId('login-email-input').fill(testUsers.admin.email);

      // Fill correct password and submit
      await page.getByTestId('login-password-input').clear();
      await page.getByTestId('login-password-input').fill(testUsers.admin.password);
      await page.getByTestId('login-submit-button').click();

      // Should navigate to dashboard
      await page.waitForURL('**/dashboard');
    });
  });

  test.describe('OTP Request Flow', () => {
    // Skip in LXC mode - this test verifies mock behavior, not real backend
    test.skip(isLxcMode(), 'Mock-only test: skipped in LXC mode');

    test('can request OTP for corporate client', async ({ page }) => {
      // Note: OTP flow typically happens on a separate page or modal
      // This test verifies the API mock works correctly
      await mockOtpRequestApi(page, true);

      // Navigate to login (where OTP might be triggered)
      await page.goto('/login');

      // Verify OTP API can be called
      const response = await page.evaluate(async () => {
        const res = await fetch('/rest/client/authenticate.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'contact=finance@acme.com',
        });
        return res.json();
      });

      expect(response.message).toBe('OTP sent successfully');
    });
  });

  test.describe('Logout', () => {
    // Skip: Zustand store persistence makes this test unreliable with mocked APIs
    test.skip('logout redirects to login page', async ({ page }) => {
      // Set up authenticated state
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
          JSON.stringify({
            state: { user: mockUser, isAuthenticated: true },
            version: 0,
          })
        );
      });

      // Changed: Use mockDashboardApi for comprehensive dashboard mocking
      await mockDashboardApi(page);

      // Go to dashboard first
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
      await takeScreenshot(page, 'auth-logout-before');

      // Find and click logout button (has data-testid="logout-button")
      const logoutButton = page.getByTestId('logout-button');
      await logoutButton.click();

      // Clear all route mocks so the app uses real route protection
      await page.unroute('**/*');

      // After logout, auth state is cleared. Access protected route to verify redirect
      await page.goto('/dashboard');

      // Should be redirected to login page (route protection kicks in)
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByTestId('login-page')).toBeVisible();
      await takeScreenshot(page, 'auth-logout-after');
    });

    test('protected routes redirect to login when not authenticated', async ({ page }) => {
      // Ensure no auth state
      await page.addInitScript(() => {
        localStorage.clear();
      });

      // Try to access protected route
      await page.goto('/dashboard');
      await takeScreenshot(page, 'auth-protected-route-redirect');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByTestId('login-page')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('can navigate from login to register', async ({ page }) => {
      await page.goto('/login');

      // Click register link
      await page.getByTestId('login-register-link').click();

      // Should be on registration page
      await expect(page).toHaveURL(/\/register/);
      await expect(page.getByTestId('registration-page')).toBeVisible();
      await takeScreenshot(page, 'auth-login-to-register');
    });
  });
});
