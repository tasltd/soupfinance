/**
 * Tenant Registration E2E Tests
 * Tests registration form rendering, validation, and submission flows
 *
 * Updated (2026-02-01): Tests now match new tenant registration form with:
 * - Company name
 * - Business type buttons (TRADING/SERVICES)
 * - Admin first/last name
 * - Email (no phone - password set during email confirmation)
 */
import { test, expect } from '@playwright/test';
import { takeScreenshot, setupResponseValidation } from './fixtures';

// Mock tenant registration data
// Changed (2026-05-22): Added testPassword for single-step registration flow
const mockTenantRegistration = {
  companyName: 'Test Company LLC',
  businessType: 'SERVICES' as const,
  adminFirstName: 'John',
  adminLastName: 'Doe',
  email: 'john.doe@testcompany.com',
  password: 'TestPass1',
};

/**
 * Mock tenant registration API
 * POST /account/register.json
 *
 * Changed (2026-05-22): `confirmation` param controls the response shape:
 *  - 'skip' → success + requiresConfirmation: false (single-step flow)
 *  - 'require' → success + requiresConfirmation: true (legacy flow, "Check Your Email")
 *  - 'fail' → 400 with email-already-registered error
 */
async function mockTenantRegistrationApi(
  page: Awaited<ReturnType<typeof test.page>>,
  confirmation: 'skip' | 'require' | 'fail' = 'skip',
) {
  await page.route('**/account/register.json', (route) => {
    if (confirmation === 'fail') {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Email already registered',
          message: 'An account with this email already exists.',
        }),
      });
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: confirmation === 'require'
          ? 'Registration successful. Please check your email to confirm your account.'
          : 'Registration successful. Your account is ready.',
        accountId: 'mock-account-id',
        agentId: 'mock-agent-id',
        email: mockTenantRegistration.email,
        requiresConfirmation: confirmation === 'require',
      }),
    });
  });
}

test.describe('Tenant Registration', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.addInitScript(() => {
      localStorage.clear();
    });
    // Added: Validate API response shapes at runtime
    await setupResponseValidation(page);
  });

  test.describe('Registration Form Rendering', () => {
    test('registration form renders with all required fields', async ({ page }) => {
      await page.goto('/register');
      await takeScreenshot(page, 'registration-page-initial');

      // Verify page elements
      await expect(page.getByTestId('registration-page')).toBeVisible();
      await expect(page.getByTestId('registration-heading')).toHaveText('Create Your Account');

      // Verify all form fields are present
      await expect(page.getByTestId('registration-form')).toBeVisible();
      await expect(page.getByTestId('registration-company-name-input')).toBeVisible();
      await expect(page.getByTestId('registration-business-type-trading')).toBeVisible();
      await expect(page.getByTestId('registration-business-type-services')).toBeVisible();
      await expect(page.getByTestId('registration-admin-first-name')).toBeVisible();
      await expect(page.getByTestId('registration-admin-last-name')).toBeVisible();
      await expect(page.getByTestId('registration-email-input')).toBeVisible();
      await expect(page.getByTestId('registration-submit-button')).toBeVisible();

      await takeScreenshot(page, 'registration-form-verified');
    });

    test('registration form has correct placeholders', async ({ page }) => {
      await page.goto('/register');

      // Verify placeholders
      await expect(page.getByTestId('registration-company-name-input')).toHaveAttribute(
        'placeholder',
        'Enter your company name'
      );
      await expect(page.getByTestId('registration-admin-first-name')).toHaveAttribute(
        'placeholder',
        'First name'
      );
      await expect(page.getByTestId('registration-admin-last-name')).toHaveAttribute(
        'placeholder',
        'Last name'
      );
      await expect(page.getByTestId('registration-email-input')).toHaveAttribute(
        'placeholder',
        'Enter your email address'
      );
    });

    test('business type buttons show TRADING and SERVICES options', async ({ page }) => {
      await page.goto('/register');

      // Verify business type buttons
      const tradingButton = page.getByTestId('registration-business-type-trading');
      const servicesButton = page.getByTestId('registration-business-type-services');

      await expect(tradingButton).toBeVisible();
      await expect(servicesButton).toBeVisible();
      await expect(tradingButton).toContainText('Trading');
      await expect(servicesButton).toContainText('Services');
    });

    test('SERVICES is selected by default', async ({ page }) => {
      await page.goto('/register');

      // SERVICES should be selected by default (has primary styling)
      const servicesButton = page.getByTestId('registration-business-type-services');
      // Check it has the selected class (border-primary)
      await expect(servicesButton).toHaveClass(/border-primary/);
    });

    test('shows login link for existing users', async ({ page }) => {
      await page.goto('/register');

      await expect(page.getByTestId('registration-login-link')).toBeVisible();
      await expect(page.getByTestId('registration-login-link')).toHaveText('Sign in');
    });
  });

  test.describe('Form Validation', () => {
    test('shows validation errors for missing required fields', async ({ page }) => {
      await page.goto('/register');
      await takeScreenshot(page, 'registration-validation-before');

      // Submit empty form
      await page.getByTestId('registration-submit-button').click();

      // Wait for validation errors
      await expect(page.getByTestId('registration-company-name-error')).toBeVisible();
      await expect(page.getByTestId('registration-company-name-error')).toHaveText(
        'Company name is required'
      );

      await expect(page.getByTestId('registration-email-error')).toBeVisible();

      await takeScreenshot(page, 'registration-validation-errors');
    });

    test('shows email validation error for invalid format', async ({ page }) => {
      await page.goto('/register');

      // Fill all required fields with valid data except email
      await page.getByTestId('registration-company-name-input').fill('Test Company');
      await page.getByTestId('registration-admin-first-name').fill('John');
      await page.getByTestId('registration-admin-last-name').fill('Doe');

      // Use an invalid email format (has @ but no domain - passes HTML5 pattern but fails our validation)
      const emailInput = page.getByTestId('registration-email-input');
      await emailInput.fill('test@invalid');

      // Click submit to trigger validation
      await page.getByTestId('registration-submit-button').click();

      // Should show email validation error (our custom validation catches incomplete emails)
      await expect(page.getByTestId('registration-email-error')).toBeVisible();
      await expect(page.getByTestId('registration-email-error')).toHaveText(
        'Please enter a valid email address'
      );

      await takeScreenshot(page, 'registration-email-validation-error');
    });

    test('clears validation error when user corrects input', async ({ page }) => {
      await page.goto('/register');

      // Submit empty form to trigger errors
      await page.getByTestId('registration-submit-button').click();

      // Verify error is shown
      await expect(page.getByTestId('registration-company-name-error')).toBeVisible();

      // Now fill in the company name
      await page.getByTestId('registration-company-name-input').fill('Test Company');

      // Error should be cleared
      await expect(page.getByTestId('registration-company-name-error')).not.toBeVisible();

      await takeScreenshot(page, 'registration-error-cleared');
    });
  });

  // Helper (2026-05-22): Fill the full registration form including password
  async function fillRegistrationForm(
    page: Awaited<ReturnType<typeof test.page>>,
    overrides: Partial<typeof mockTenantRegistration> = {},
  ) {
    const data = { ...mockTenantRegistration, ...overrides };
    await page.getByTestId('registration-company-name-input').fill(data.companyName);
    await page.getByTestId('registration-business-type-services').click();
    await page.getByTestId('registration-country-select').selectOption('GH');
    await page.getByTestId('registration-admin-first-name').fill(data.adminFirstName);
    await page.getByTestId('registration-admin-last-name').fill(data.adminLastName);
    await page.getByTestId('registration-email-input').fill(data.email);
    await page.getByTestId('registration-password-input').fill(data.password);
    await page.getByTestId('registration-confirm-password-input').fill(data.password);
  }

  test.describe('Successful Registration', () => {
    // Changed (2026-05-22): Single-step flow — redirects to /login with success banner
    test('redirects to login when backend skips email confirmation', async ({ page }) => {
      await mockTenantRegistrationApi(page, 'skip');

      await page.goto('/register');
      await takeScreenshot(page, 'registration-success-before-fill');

      await fillRegistrationForm(page);
      await takeScreenshot(page, 'registration-success-form-filled');

      await page.getByTestId('registration-submit-button').click();

      // Should land on /login with the post-registration banner
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByTestId('login-registration-success')).toBeVisible();
      await takeScreenshot(page, 'registration-success-redirect-to-login');
    });

    // Kept for backwards-compat: legacy flow when backend still requires email confirmation
    test('shows "Check Your Email" screen when backend requires confirmation', async ({ page }) => {
      await mockTenantRegistrationApi(page, 'require');

      await page.goto('/register');
      await fillRegistrationForm(page);
      await page.getByTestId('registration-submit-button').click();

      await expect(page.getByTestId('registration-success')).toBeVisible();
      await expect(page.getByTestId('registration-success-heading')).toHaveText('Check Your Email');
      await takeScreenshot(page, 'registration-success-confirmation');
    });

    test('submit button shows loading state during registration', async ({ page }) => {
      // Set up delayed API response
      await page.route('**/account/register.json', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Registration successful',
            requiresConfirmation: false,
          }),
        });
      });

      await page.goto('/register');
      await fillRegistrationForm(page);

      await page.getByTestId('registration-submit-button').click();

      await expect(page.getByTestId('registration-submit-button')).toContainText('Creating Account');
      await takeScreenshot(page, 'registration-loading-state');

      // Single-step flow lands on /login
      await expect(page).toHaveURL(/\/login$/);
    });
  });

  test.describe('Registration Failures', () => {
    test('shows error message when registration fails', async ({ page }) => {
      await mockTenantRegistrationApi(page, 'fail');

      await page.goto('/register');

      // Fill in form (existing email scenario — backend rejects)
      await fillRegistrationForm(page, {
        companyName: 'Existing Company',
        adminFirstName: 'Jane',
        adminLastName: 'Smith',
        email: 'existing@company.com',
      });

      // Submit form
      await page.getByTestId('registration-submit-button').click();

      // Should show form-level error
      await expect(page.getByTestId('registration-form-error')).toBeVisible();

      await takeScreenshot(page, 'registration-api-error');

      // Should still be on registration page (not showing success)
      await expect(page.getByTestId('registration-page')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('can navigate from registration to login', async ({ page }) => {
      await page.goto('/register');

      // Click login link
      await page.getByTestId('registration-login-link').click();

      // Should be on login page
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByTestId('login-page')).toBeVisible();

      await takeScreenshot(page, 'registration-to-login');
    });
  });

  test.describe('Form Interactions', () => {
    test('can select different business types', async ({ page }) => {
      await page.goto('/register');

      const tradingButton = page.getByTestId('registration-business-type-trading');
      const servicesButton = page.getByTestId('registration-business-type-services');

      // Select Trading
      await tradingButton.click();
      await expect(tradingButton).toHaveClass(/border-primary/);

      // Select Services
      await servicesButton.click();
      await expect(servicesButton).toHaveClass(/border-primary/);

      await takeScreenshot(page, 'registration-business-type-changed');
    });

    test('form fields maintain state when validation fails', async ({ page }) => {
      await page.goto('/register');

      // Fill in some fields but leave email empty
      await page.getByTestId('registration-company-name-input').fill('Test Company');
      await page.getByTestId('registration-admin-first-name').fill('John');
      await page.getByTestId('registration-admin-last-name').fill('Doe');
      // Leave email empty

      // Submit form
      await page.getByTestId('registration-submit-button').click();

      // Validation should fail
      await expect(page.getByTestId('registration-email-error')).toBeVisible();

      // But filled fields should retain their values
      await expect(page.getByTestId('registration-company-name-input')).toHaveValue('Test Company');
      await expect(page.getByTestId('registration-admin-first-name')).toHaveValue('John');
      await expect(page.getByTestId('registration-admin-last-name')).toHaveValue('Doe');

      await takeScreenshot(page, 'registration-state-preserved');
    });
  });
});
