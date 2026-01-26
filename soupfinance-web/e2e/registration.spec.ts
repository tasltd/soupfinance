/**
 * Corporate Registration E2E Tests
 * Tests registration form rendering, validation, and submission flows
 */
import { test, expect } from '@playwright/test';
import {
  mockCorporateRegistrationApi,
  mockCorporate,
  takeScreenshot,
} from './fixtures';

test.describe('Corporate Registration', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test.describe('Registration Form Rendering', () => {
    test('registration form renders with all required fields', async ({ page }) => {
      await page.goto('/register');
      await takeScreenshot(page, 'registration-page-initial');

      // Verify page elements
      await expect(page.getByTestId('registration-page')).toBeVisible();
      await expect(page.getByTestId('registration-heading')).toHaveText('Register Your Company');

      // Verify all form fields are present
      await expect(page.getByTestId('registration-form')).toBeVisible();
      await expect(page.getByTestId('registration-company-name-input')).toBeVisible();
      await expect(page.getByTestId('registration-reg-number-input')).toBeVisible();
      await expect(page.getByTestId('registration-business-type-select')).toBeVisible();
      await expect(page.getByTestId('registration-email-input')).toBeVisible();
      await expect(page.getByTestId('registration-phone-input')).toBeVisible();
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
      await expect(page.getByTestId('registration-reg-number-input')).toHaveAttribute(
        'placeholder',
        'e.g., C-123456'
      );
      await expect(page.getByTestId('registration-email-input')).toHaveAttribute(
        'placeholder',
        'finance@yourcompany.com'
      );
      await expect(page.getByTestId('registration-phone-input')).toHaveAttribute(
        'placeholder',
        '+1 (555) 123-4567'
      );
    });

    test('business type dropdown has all options', async ({ page }) => {
      await page.goto('/register');

      const select = page.getByTestId('registration-business-type-select');

      // Verify the select has options
      const options = await select.locator('option').allTextContents();
      expect(options).toContain('Limited Liability Company (LLC)');
      expect(options).toContain('Public Limited Company (PLC)');
      expect(options).toContain('Partnership');
      expect(options).toContain('Sole Proprietorship');
      expect(options).toContain('Non-Profit Organization');
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

      await expect(page.getByTestId('registration-reg-number-error')).toBeVisible();
      await expect(page.getByTestId('registration-reg-number-error')).toHaveText(
        'Registration number is required'
      );

      await expect(page.getByTestId('registration-email-error')).toBeVisible();
      await expect(page.getByTestId('registration-phone-error')).toBeVisible();

      await takeScreenshot(page, 'registration-validation-errors');
    });

    test('shows email validation error for invalid format', async ({ page }) => {
      await page.goto('/register');

      // Fill all required fields with valid data except email
      // Note: Using an email that passes HTML5 validation but may fail custom validation
      await page.getByTestId('registration-company-name-input').fill('Test Company');
      await page.getByTestId('registration-reg-number-input').fill('C-123456');

      // Use an email that triggers HTML5 native validation (no @ sign)
      const emailInput = page.getByTestId('registration-email-input');
      await emailInput.fill('invalid-email');
      await page.getByTestId('registration-phone-input').fill('+1 555-123-4567');

      // Click submit to trigger validation
      await page.getByTestId('registration-submit-button').click();

      // HTML5 validation shows browser-native error for invalid email format
      // Check that the input has :invalid pseudo-class (browser validation failed)
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
      expect(isInvalid).toBe(true);

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

  test.describe('Successful Registration', () => {
    test('successful registration navigates to onboarding', async ({ page }) => {
      await mockCorporateRegistrationApi(page, true, mockCorporate);

      await page.goto('/register');
      await takeScreenshot(page, 'registration-success-before-fill');

      // Fill in all required fields
      await page.getByTestId('registration-company-name-input').fill(mockCorporate.name);
      await page.getByTestId('registration-reg-number-input').fill(
        mockCorporate.certificateOfIncorporationNumber
      );
      await page.getByTestId('registration-business-type-select').selectOption(
        mockCorporate.businessCategory
      );
      await page.getByTestId('registration-email-input').fill(mockCorporate.email);
      await page.getByTestId('registration-phone-input').fill(mockCorporate.phoneNumber);

      await takeScreenshot(page, 'registration-success-form-filled');

      // Submit form
      await page.getByTestId('registration-submit-button').click();

      // Wait for navigation to onboarding
      await page.waitForURL('**/onboarding/company*');

      await takeScreenshot(page, 'registration-success-onboarding');
    });

    test('submit button shows loading state during registration', async ({ page }) => {
      // Set up delayed API response
      await page.route('**/rest/corporate/save*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockCorporate),
        });
      });

      await page.goto('/register');

      // Fill in form
      await page.getByTestId('registration-company-name-input').fill(mockCorporate.name);
      await page.getByTestId('registration-reg-number-input').fill(
        mockCorporate.certificateOfIncorporationNumber
      );
      await page.getByTestId('registration-email-input').fill(mockCorporate.email);
      await page.getByTestId('registration-phone-input').fill(mockCorporate.phoneNumber);

      // Submit and check loading state
      await page.getByTestId('registration-submit-button').click();

      // Button should show loading text
      await expect(page.getByTestId('registration-submit-button')).toContainText('Registering');
      await takeScreenshot(page, 'registration-loading-state');

      // Wait for completion
      await page.waitForURL('**/onboarding/company*');
    });
  });

  test.describe('Registration Failures', () => {
    test('shows error message when registration fails', async ({ page }) => {
      await mockCorporateRegistrationApi(page, false);

      await page.goto('/register');

      // Fill in form
      await page.getByTestId('registration-company-name-input').fill('Existing Company');
      await page.getByTestId('registration-reg-number-input').fill('C-EXISTING');
      await page.getByTestId('registration-email-input').fill('existing@company.com');
      await page.getByTestId('registration-phone-input').fill('+1 555-999-9999');

      // Submit form
      await page.getByTestId('registration-submit-button').click();

      // Should show form-level error
      await expect(page.getByTestId('registration-form-error')).toBeVisible();

      await takeScreenshot(page, 'registration-api-error');

      // Should still be on registration page
      await expect(page).toHaveURL(/\/register/);
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

      const select = page.getByTestId('registration-business-type-select');

      // Select Partnership
      await select.selectOption('PARTNERSHIP');
      await expect(select).toHaveValue('PARTNERSHIP');

      // Select Public Limited
      await select.selectOption('PUBLIC_LIMITED');
      await expect(select).toHaveValue('PUBLIC_LIMITED');

      // Select Non-Profit
      await select.selectOption('NON_PROFIT');
      await expect(select).toHaveValue('NON_PROFIT');

      await takeScreenshot(page, 'registration-business-type-changed');
    });

    test('form fields maintain state when validation fails', async ({ page }) => {
      await page.goto('/register');

      // Fill in some fields but leave email empty
      await page.getByTestId('registration-company-name-input').fill('Test Company');
      await page.getByTestId('registration-reg-number-input').fill('C-123456');
      await page.getByTestId('registration-phone-input').fill('+1 555-123-4567');
      // Leave email empty

      // Submit form
      await page.getByTestId('registration-submit-button').click();

      // Validation should fail
      await expect(page.getByTestId('registration-email-error')).toBeVisible();

      // But filled fields should retain their values
      await expect(page.getByTestId('registration-company-name-input')).toHaveValue('Test Company');
      await expect(page.getByTestId('registration-reg-number-input')).toHaveValue('C-123456');
      await expect(page.getByTestId('registration-phone-input')).toHaveValue('+1 555-123-4567');

      await takeScreenshot(page, 'registration-state-preserved');
    });
  });
});
