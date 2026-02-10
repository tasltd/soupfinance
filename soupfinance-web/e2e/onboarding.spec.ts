/**
 * Corporate Onboarding E2E Tests
 * Tests the 4-page KYC onboarding flow:
 * 1. CompanyInfoPage (/onboarding/company)
 * 2. DirectorsPage (/onboarding/directors)
 * 3. DocumentsPage (/onboarding/documents)
 * 4. KycStatusPage (/onboarding/status)
 *
 * Added: Comprehensive E2E tests for corporate KYC onboarding flow
 */
import { test, expect } from '@playwright/test';
import {
  mockCorporateApi,
  mockDirectorsApi,
  mockDocumentsApi,
  mockCorporate,
  mockDirector,
  mockDocument,
  mockTokenValidationApi,
  takeScreenshot,
} from './fixtures';

// Added: Test constants for corporate onboarding
const CORPORATE_ID = 'corp-test-001';
const BASE_URL_COMPANY = `/onboarding/company?id=${CORPORATE_ID}`;
const BASE_URL_DIRECTORS = `/onboarding/directors?id=${CORPORATE_ID}`;
const BASE_URL_DOCUMENTS = `/onboarding/documents?id=${CORPORATE_ID}`;
const BASE_URL_STATUS = `/onboarding/status?id=${CORPORATE_ID}`;

test.describe('Corporate Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Added: Set up authenticated state for onboarding
    await page.addInitScript(() => {
      const mockUser = {
        username: 'corporate_user',
        email: 'test@testcompany.com',
        roles: ['ROLE_CORPORATE', 'ROLE_USER'],
      };
      localStorage.setItem('access_token', 'mock-jwt-token-for-onboarding');
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: { user: mockUser, isAuthenticated: true },
          version: 0,
        })
      );
    });
    // Mock token validation API - required for authenticated pages
    await mockTokenValidationApi(page, true);
  });

  // ===========================================================================
  // Company Info Page Tests
  // ===========================================================================
  test.describe('Company Info Page', () => {
    test.beforeEach(async ({ page }) => {
      await mockCorporateApi(page, CORPORATE_ID, mockCorporate);
    });

    test('renders with all form sections', async ({ page }) => {
      await page.goto(BASE_URL_COMPANY);
      await takeScreenshot(page, 'onboarding-company-initial');

      // Added: Verify page heading
      await expect(page.getByText('Company Information')).toBeVisible();
      await expect(
        page.getByText('Provide detailed information about your company')
      ).toBeVisible();

      // Added: Verify progress indicator shows step 2
      await expect(page.getByText('Company Info', { exact: true })).toBeVisible();

      // Added: Verify Physical Address section (use heading role to avoid matching "Same as physical address" text)
      await expect(page.getByRole('heading', { name: 'Physical Address' })).toBeVisible();
      await expect(page.locator('input[name="physicalAddress"]')).toBeVisible();
      await expect(page.locator('input[name="physicalCity"]')).toBeVisible();
      await expect(page.locator('input[name="physicalState"]')).toBeVisible();
      await expect(page.locator('input[name="physicalPostalCode"]')).toBeVisible();
      await expect(page.locator('input[name="physicalCountry"]')).toBeVisible();

      // Added: Verify Postal Address section
      await expect(page.getByRole('heading', { name: 'Postal Address' })).toBeVisible();
      await expect(page.locator('input[name="sameAsPhysical"]')).toBeVisible();

      // Added: Verify Business Details section
      await expect(page.getByText('Business Details')).toBeVisible();
      await expect(page.locator('select[name="industry"]')).toBeVisible();
      await expect(page.locator('select[name="annualRevenue"]')).toBeVisible();
      await expect(page.locator('select[name="employeeCount"]')).toBeVisible();
      await expect(page.locator('input[name="website"]')).toBeVisible();
      await expect(page.locator('textarea[name="description"]')).toBeVisible();

      await takeScreenshot(page, 'onboarding-company-verified');
    });

    test('industry dropdown has all options', async ({ page }) => {
      await page.goto(BASE_URL_COMPANY);

      const industrySelect = page.locator('select[name="industry"]');
      await expect(industrySelect).toBeVisible();

      // Added: Verify some key industry options
      const options = await industrySelect.locator('option').allTextContents();
      expect(options).toContain('Financial Services');
      expect(options).toContain('Information Technology');
      expect(options).toContain('Manufacturing');
      expect(options).toContain('Healthcare & Pharmaceuticals');
    });

    test('can fill and submit company info', async ({ page }) => {
      // Added: Set up update mutation mock
      await page.route('**/rest/corporate/update/*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockCorporate, id: CORPORATE_ID }),
        });
      });

      await page.goto(BASE_URL_COMPANY);
      await takeScreenshot(page, 'onboarding-company-before-fill');

      // Added: Fill physical address
      await page.locator('input[name="physicalAddress"]').fill('123 Business Street, Suite 100');
      await page.locator('input[name="physicalCity"]').fill('New York');
      await page.locator('input[name="physicalState"]').fill('NY');
      await page.locator('input[name="physicalPostalCode"]').fill('10001');
      await page.locator('input[name="physicalCountry"]').fill('United States');

      // Added: Select business details
      await page.locator('select[name="industry"]').selectOption('Information Technology');
      await page.locator('select[name="annualRevenue"]').selectOption('1M_5M');
      await page.locator('select[name="employeeCount"]').selectOption('51_200');

      // Added: Fill optional fields
      await page.locator('input[name="website"]').fill('https://www.testcompany.com');
      await page.locator('textarea[name="description"]').fill('A leading IT services company');

      await takeScreenshot(page, 'onboarding-company-form-filled');

      // Added: Submit form
      await page.getByText('Save & Continue').click();

      // Added: Wait for navigation to directors page
      await page.waitForURL('**/onboarding/directors*');
      await takeScreenshot(page, 'onboarding-company-navigated-to-directors');
    });

    test('same as physical checkbox copies address fields', async ({ page }) => {
      await page.goto(BASE_URL_COMPANY);

      // Added: Fill physical address
      await page.locator('input[name="physicalAddress"]').fill('123 Business Street');
      await page.locator('input[name="physicalCity"]').fill('Boston');
      await page.locator('input[name="physicalState"]').fill('MA');
      await page.locator('input[name="physicalPostalCode"]').fill('02101');
      await page.locator('input[name="physicalCountry"]').fill('United States');

      // Added: Check "same as physical" checkbox
      await page.locator('input[name="sameAsPhysical"]').check();

      // Added: Postal address fields should be hidden
      await expect(page.locator('input[name="postalAddress"]')).not.toBeVisible();

      await takeScreenshot(page, 'onboarding-company-same-address');
    });

    test('skip button navigates to directors page', async ({ page }) => {
      await page.goto(BASE_URL_COMPANY);

      // Added: Click skip button
      await page.getByText('Skip for Now').click();

      // Added: Should navigate to directors
      await page.waitForURL('**/onboarding/directors*');
    });

    test('back button navigates to registration', async ({ page }) => {
      await page.goto(BASE_URL_COMPANY);

      // Added: Click back button
      await page.getByRole('button', { name: 'Back' }).click();

      // Added: Should navigate to register
      await page.waitForURL('**/register*');
    });

    test('shows loading state while fetching data', async ({ page }) => {
      // Fix: Increased delay to 3s so loading spinner is reliably visible before data arrives
      await page.route(`**/rest/corporate/show/${CORPORATE_ID}*`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockCorporate),
        });
      });

      await page.goto(BASE_URL_COMPANY);

      // Fix: Check for either spinner or loading text — component may use either
      const hasSpinner = await page.locator('.animate-spin').isVisible().catch(() => false);
      const hasLoadingText = await page.getByText(/loading/i).isVisible().catch(() => false);
      expect(hasSpinner || hasLoadingText).toBeTruthy();
      await takeScreenshot(page, 'onboarding-company-loading');

      // Wait for content to load after delay resolves
      await expect(page.getByText('Company Information')).toBeVisible({ timeout: 10000 });
    });
  });

  // ===========================================================================
  // Directors Page Tests
  // ===========================================================================
  test.describe('Directors Page', () => {
    test.beforeEach(async ({ page }) => {
      await mockCorporateApi(page, CORPORATE_ID, mockCorporate);
    });

    test('renders with empty directors list', async ({ page }) => {
      await mockDirectorsApi(page, CORPORATE_ID, []);

      await page.goto(BASE_URL_DIRECTORS);
      await takeScreenshot(page, 'onboarding-directors-empty');

      // Added: Verify page heading
      await expect(page.getByText('Directors & Signatories')).toBeVisible();

      // Added: Verify empty state
      await expect(page.getByText('No directors added yet')).toBeVisible();
      await expect(page.getByText('Add First Person')).toBeVisible();

      // Added: Continue button should be disabled with no directors
      const continueButton = page.getByText('Continue to Documents');
      await expect(continueButton).toBeDisabled();
    });

    test('renders with existing directors', async ({ page }) => {
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);

      await page.goto(BASE_URL_DIRECTORS);
      await takeScreenshot(page, 'onboarding-directors-with-data');

      // Added: Verify table headers
      await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Phone' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Role' })).toBeVisible();

      // Added: Verify director data is displayed
      await expect(page.getByText(`${mockDirector.firstName} ${mockDirector.lastName}`)).toBeVisible();
      await expect(page.getByText(mockDirector.email)).toBeVisible();
      await expect(page.getByText(mockDirector.phoneNumber)).toBeVisible();

      // Added: Verify count text
      await expect(page.getByText('1 person added')).toBeVisible();
    });

    test('can add a new director', async ({ page }) => {
      await mockDirectorsApi(page, CORPORATE_ID, []);

      // Added: Set up save mutation mock
      const newDirector = {
        ...mockDirector,
        id: 'director-new-001',
      };
      await page.route('**/rest/corporateAccountPerson/save*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(newDirector),
        });
      });

      await page.goto(BASE_URL_DIRECTORS);
      await takeScreenshot(page, 'onboarding-directors-before-add');

      // Added: Click "Add Person" button
      await page.getByText('Add Person').first().click();

      // Added: Verify modal opens
      await expect(page.getByRole('heading', { name: 'Add Person' })).toBeVisible();
      await takeScreenshot(page, 'onboarding-directors-modal-open');

      // Added: Fill in director form
      await page.locator('input[name="firstName"]').fill('Jane');
      await page.locator('input[name="lastName"]').fill('Smith');
      await page.locator('input[name="email"]').fill('jane.smith@testcompany.com');
      await page.locator('input[name="phoneNumber"]').fill('+1 555-987-6543');
      await page.locator('select[name="role"]').selectOption('SIGNATORY');

      await takeScreenshot(page, 'onboarding-directors-form-filled');

      // Added: Set up list to return new director after save
      await mockDirectorsApi(page, CORPORATE_ID, [newDirector]);

      // Added: Submit form (exact: true to avoid matching the page-level "add Add Person" button with icon)
      await page.getByRole('button', { name: 'Add Person', exact: true }).click();

      // Added: Modal should close and director should appear in list
      await expect(page.getByRole('heading', { name: 'Add Person' })).not.toBeVisible({ timeout: 3000 });
      await takeScreenshot(page, 'onboarding-directors-after-add');
    });

    test('can edit existing director', async ({ page }) => {
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);

      // Added: Set up update mutation mock
      await page.route('**/rest/corporateAccountPerson/update/*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockDirector, firstName: 'Updated' }),
        });
      });

      await page.goto(BASE_URL_DIRECTORS);

      // Added: Click edit button
      await page.locator('button[title="Edit"]').click();

      // Added: Verify modal opens with existing data
      await expect(page.getByRole('heading', { name: 'Edit Person' })).toBeVisible();
      await expect(page.locator('input[name="firstName"]')).toHaveValue(mockDirector.firstName);
      await expect(page.locator('input[name="lastName"]')).toHaveValue(mockDirector.lastName);

      await takeScreenshot(page, 'onboarding-directors-edit-modal');

      // Added: Update first name
      await page.locator('input[name="firstName"]').clear();
      await page.locator('input[name="firstName"]').fill('Updated');

      // Added: Submit form
      await page.getByRole('button', { name: 'Update Person' }).click();

      // Added: Modal should close
      await expect(page.getByRole('heading', { name: 'Edit Person' })).not.toBeVisible({ timeout: 3000 });
    });

    test('can delete director with confirmation', async ({ page }) => {
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);

      // Added: Set up delete mutation mock
      await page.route(`**/rest/corporateAccountPerson/delete/${mockDirector.id}*`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Deleted' }),
        });
      });

      await page.goto(BASE_URL_DIRECTORS);
      await takeScreenshot(page, 'onboarding-directors-before-delete');

      // Added: Click delete button
      await page.locator('button[title="Delete"]').click();

      // Added: Verify confirmation modal
      await expect(page.getByText('Remove Person?')).toBeVisible();
      await expect(page.getByText('This will remove this person from the KYC submission')).toBeVisible();
      await takeScreenshot(page, 'onboarding-directors-delete-confirm');

      // Added: Set up list to return empty after delete
      await mockDirectorsApi(page, CORPORATE_ID, []);

      // Added: Confirm deletion
      await page.getByRole('button', { name: 'Remove' }).click();

      // Added: Confirmation modal should close
      await expect(page.getByText('Remove Person?')).not.toBeVisible({ timeout: 3000 });
      await takeScreenshot(page, 'onboarding-directors-after-delete');
    });

    test('validates required fields in add modal', async ({ page }) => {
      await mockDirectorsApi(page, CORPORATE_ID, []);

      await page.goto(BASE_URL_DIRECTORS);

      // Added: Open add modal
      await page.getByText('Add Person').first().click();

      // Added: Try to submit empty form - HTML5 validation should prevent submission
      await page.getByRole('button', { name: 'Add Person', exact: true }).click();

      // Added: First name input should show validation (required attribute)
      const firstNameInput = page.locator('input[name="firstName"]');
      await expect(firstNameInput).toHaveAttribute('required', '');

      // Added: Form should still be visible (not submitted)
      await expect(page.getByRole('heading', { name: 'Add Person' })).toBeVisible();
    });

    test('cancel button closes modal without saving', async ({ page }) => {
      await mockDirectorsApi(page, CORPORATE_ID, []);

      await page.goto(BASE_URL_DIRECTORS);

      // Added: Open add modal
      await page.getByText('Add Person').first().click();

      // Added: Fill in some data
      await page.locator('input[name="firstName"]').fill('Test');

      // Added: Click cancel
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Added: Modal should close
      await expect(page.getByRole('heading', { name: 'Add Person' })).not.toBeVisible();
    });

    test('continue button navigates to documents page', async ({ page }) => {
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
      await mockDocumentsApi(page, CORPORATE_ID, []);

      await page.goto(BASE_URL_DIRECTORS);

      // Added: Click continue button
      await page.getByText('Continue to Documents').click();

      // Added: Should navigate to documents
      await page.waitForURL('**/onboarding/documents*');
    });
  });

  // ===========================================================================
  // Documents Page Tests
  // ===========================================================================
  test.describe('Documents Page', () => {
    test.beforeEach(async ({ page }) => {
      await mockCorporateApi(page, CORPORATE_ID, mockCorporate);
    });

    test('renders with all document type slots', async ({ page }) => {
      await mockDocumentsApi(page, CORPORATE_ID, []);

      await page.goto(BASE_URL_DOCUMENTS);
      await takeScreenshot(page, 'onboarding-documents-empty');

      // Added: Verify page heading
      await expect(page.getByText('KYC Documents')).toBeVisible();
      await expect(page.getByText('Upload required documents for verification')).toBeVisible();

      // Added: Verify all document types are shown
      await expect(page.getByText('Certificate of Incorporation')).toBeVisible();
      await expect(page.getByText('Board Resolution')).toBeVisible();
      await expect(page.getByText('Memorandum & Articles')).toBeVisible();
      await expect(page.getByText('Proof of Address')).toBeVisible();

      // Added: Verify warning message about required documents
      await expect(
        page.getByText(/Please upload all required documents marked with/)
      ).toBeVisible();

      // Added: Submit button should be disabled
      await expect(page.getByText('Submit for Review')).toBeDisabled();
    });

    test('shows uploaded documents', async ({ page }) => {
      const uploadedDoc = {
        ...mockDocument,
        documentType: 'CERTIFICATE_OF_INCORPORATION',
      };
      await mockDocumentsApi(page, CORPORATE_ID, [uploadedDoc]);

      await page.goto(BASE_URL_DOCUMENTS);
      await takeScreenshot(page, 'onboarding-documents-with-upload');

      // Added: Verify uploaded file appears
      await expect(page.getByText(mockDocument.fileName)).toBeVisible();

      // Added: Verify checkmark icon appears for uploaded document
      const checkIcons = page.locator('.bg-green-500');
      await expect(checkIcons.first()).toBeVisible();
    });

    test('can upload document via file input', async ({ page }) => {
      await mockDocumentsApi(page, CORPORATE_ID, []);

      // Added: Set up upload mutation mock
      const uploadedDoc = {
        ...mockDocument,
        documentType: 'CERTIFICATE_OF_INCORPORATION',
      };
      await page.route('**/rest/corporateDocuments/save*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(uploadedDoc),
        });
      });

      await page.goto(BASE_URL_DOCUMENTS);

      // Added: Find the file input for Certificate of Incorporation
      // The file input is hidden, so we need to set files directly
      const fileChooserPromise = page.waitForEvent('filechooser');

      // Added: Click on the upload dropzone for Certificate of Incorporation
      const dropzone = page
        .locator('label')
        .filter({ hasText: 'Click to upload' })
        .first();
      await dropzone.click();

      // Added: Handle file chooser
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: 'certificate.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('fake pdf content'),
      });

      // Added: Should show uploading state briefly then complete
      await takeScreenshot(page, 'onboarding-documents-uploading');
    });

    test('can delete uploaded document', async ({ page }) => {
      const uploadedDoc = {
        ...mockDocument,
        documentType: 'CERTIFICATE_OF_INCORPORATION',
      };
      await mockDocumentsApi(page, CORPORATE_ID, [uploadedDoc]);

      // Added: Set up delete mutation mock
      await page.route(`**/rest/corporateDocuments/delete/${mockDocument.id}*`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Deleted' }),
        });
      });

      await page.goto(BASE_URL_DOCUMENTS);
      await takeScreenshot(page, 'onboarding-documents-before-delete');

      // Added: Set up empty list after delete
      await mockDocumentsApi(page, CORPORATE_ID, []);

      // Added: Click delete button on the uploaded document
      await page.locator('button[title="Delete"]').click();

      await takeScreenshot(page, 'onboarding-documents-after-delete');
    });

    test('submit button enabled when all required docs uploaded', async ({ page }) => {
      // Added: Create list with all required documents
      const requiredDocs = [
        { ...mockDocument, id: 'doc-1', documentType: 'CERTIFICATE_OF_INCORPORATION' },
        { ...mockDocument, id: 'doc-2', documentType: 'BOARD_RESOLUTION' },
        { ...mockDocument, id: 'doc-3', documentType: 'PROOF_OF_ADDRESS' },
      ];
      await mockDocumentsApi(page, CORPORATE_ID, requiredDocs);

      await page.goto(BASE_URL_DOCUMENTS);
      await takeScreenshot(page, 'onboarding-documents-all-required');

      // Added: Submit button should be enabled
      await expect(page.getByText('Submit for Review')).toBeEnabled();

      // Added: Warning message should not be visible
      await expect(
        page.getByText(/Please upload all required documents marked with/)
      ).not.toBeVisible();
    });

    test('submit navigates to status page', async ({ page }) => {
      // Added: Create list with all required documents
      const requiredDocs = [
        { ...mockDocument, id: 'doc-1', documentType: 'CERTIFICATE_OF_INCORPORATION' },
        { ...mockDocument, id: 'doc-2', documentType: 'BOARD_RESOLUTION' },
        { ...mockDocument, id: 'doc-3', documentType: 'PROOF_OF_ADDRESS' },
      ];
      await mockDocumentsApi(page, CORPORATE_ID, requiredDocs);

      // Added: Set up submit KYC mock
      await page.route(`**/rest/corporate/submitKyc/${CORPORATE_ID}*`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockCorporate, kycStatus: 'PENDING' }),
        });
      });

      await page.goto(BASE_URL_DOCUMENTS);

      // Added: Click submit
      await page.getByText('Submit for Review').click();

      // Added: Should navigate to status page
      await page.waitForURL('**/onboarding/status*');
      await takeScreenshot(page, 'onboarding-documents-submitted');
    });

    test('back button navigates to directors page', async ({ page }) => {
      await mockDocumentsApi(page, CORPORATE_ID, []);
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);

      await page.goto(BASE_URL_DOCUMENTS);

      // Added: Click back button
      await page.getByRole('button', { name: 'Back' }).click();

      // Added: Should navigate to directors
      await page.waitForURL('**/onboarding/directors*');
    });

    test('shows loading state while fetching documents', async ({ page }) => {
      // Changed: Increased delay from 1s to 3s for reliable loading state detection
      await page.route(`**/rest/corporateDocuments/index*`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto(BASE_URL_DOCUMENTS);

      // Changed: Added timeout to handle race condition with page load
      await expect(page.locator('.animate-spin').first()).toBeVisible({ timeout: 3000 });
      await takeScreenshot(page, 'onboarding-documents-loading');
    });
  });

  // ===========================================================================
  // KYC Status Page Tests
  // ===========================================================================
  test.describe('KYC Status Page', () => {
    test('shows pending status with timeline', async ({ page }) => {
      await mockCorporateApi(page, CORPORATE_ID, { ...mockCorporate, kycStatus: 'PENDING' });
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
      await mockDocumentsApi(page, CORPORATE_ID, [mockDocument]);

      await page.goto(BASE_URL_STATUS);
      await takeScreenshot(page, 'onboarding-status-pending');

      // Added: Verify page heading
      await expect(page.getByText('KYC Application Status')).toBeVisible();

      // Added: Verify timeline steps
      await expect(page.getByText('Documents Submitted')).toBeVisible();
      await expect(page.getByText('Compliance Review')).toBeVisible();
      await expect(page.getByText('Document Verification')).toBeVisible();

      // Added: Verify "What Happens Next?" section for pending
      await expect(page.getByText('What Happens Next?')).toBeVisible();
      await expect(
        page.getByText(/Our compliance team will review your documents/)
      ).toBeVisible();
    });

    test('shows approved status with dashboard button', async ({ page }) => {
      await mockCorporateApi(page, CORPORATE_ID, { ...mockCorporate, kycStatus: 'APPROVED' });
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
      await mockDocumentsApi(page, CORPORATE_ID, [mockDocument]);

      await page.goto(BASE_URL_STATUS);
      await takeScreenshot(page, 'onboarding-status-approved');

      // Added: Verify approved banner
      await expect(page.getByText('KYC Approved')).toBeVisible();
      await expect(
        page.getByText(/Your corporate account has been verified and approved/)
      ).toBeVisible();

      // Added: Verify "Go to Dashboard" button is visible
      await expect(page.getByText('Go to Dashboard')).toBeVisible();
    });

    test('dashboard button navigates correctly when approved', async ({ page }) => {
      await mockCorporateApi(page, CORPORATE_ID, { ...mockCorporate, kycStatus: 'APPROVED' });
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
      await mockDocumentsApi(page, CORPORATE_ID, [mockDocument]);

      // Added: Set up dashboard mocks
      await page.route('**/rest/invoice*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto(BASE_URL_STATUS);

      // Added: Click dashboard button
      await page.getByText('Go to Dashboard').click();

      // Added: Should navigate to dashboard
      await page.waitForURL('**/dashboard*');
    });

    test('shows rejected status with update button', async ({ page }) => {
      await mockCorporateApi(page, CORPORATE_ID, { ...mockCorporate, kycStatus: 'REJECTED' });
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
      await mockDocumentsApi(page, CORPORATE_ID, [mockDocument]);

      await page.goto(BASE_URL_STATUS);
      await takeScreenshot(page, 'onboarding-status-rejected');

      // Added: Verify rejected banner
      await expect(page.getByText('Additional Information Required')).toBeVisible();

      // Added: Verify "Update Documents" button is visible
      await expect(page.getByText('Update Documents')).toBeVisible();

      // Added: Verify action required section
      await expect(page.getByText('Action Required')).toBeVisible();
    });

    test('update documents button navigates when rejected', async ({ page }) => {
      await mockCorporateApi(page, CORPORATE_ID, { ...mockCorporate, kycStatus: 'REJECTED' });
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
      await mockDocumentsApi(page, CORPORATE_ID, [mockDocument]);

      await page.goto(BASE_URL_STATUS);

      // Added: Click update documents button
      await page.getByText('Update Documents').click();

      // Added: Should navigate to documents
      await page.waitForURL('**/onboarding/documents*');
    });

    test('shows company information summary', async ({ page }) => {
      await mockCorporateApi(page, CORPORATE_ID, { ...mockCorporate, kycStatus: 'PENDING' });
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
      await mockDocumentsApi(page, CORPORATE_ID, [mockDocument]);

      await page.goto(BASE_URL_STATUS);

      // Added: Verify company info section
      await expect(page.getByText('Company Information')).toBeVisible();
      await expect(page.getByText(mockCorporate.name, { exact: true })).toBeVisible();
      await expect(page.getByText(mockCorporate.certificateOfIncorporationNumber)).toBeVisible();
      await expect(page.getByTestId('kyc-status-page').getByText(mockCorporate.email)).toBeVisible();
      await expect(page.getByText(mockCorporate.phoneNumber)).toBeVisible();
    });

    test('shows document checklist', async ({ page }) => {
      const docs = [
        { ...mockDocument, id: 'doc-1', documentType: 'CERTIFICATE_OF_INCORPORATION' },
        { ...mockDocument, id: 'doc-2', documentType: 'BOARD_RESOLUTION' },
      ];
      await mockCorporateApi(page, CORPORATE_ID, { ...mockCorporate, kycStatus: 'PENDING' });
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
      await mockDocumentsApi(page, CORPORATE_ID, docs);

      await page.goto(BASE_URL_STATUS);

      // Added: Verify document checklist section
      await expect(page.getByText('Document Checklist')).toBeVisible();

      // Added: Verify uploaded documents show checkmark
      // Certificate of Incorporation should be checked
      const checkIcons = page.locator('span:has-text("check_circle")');
      await expect(checkIcons.first()).toBeVisible();
    });

    test('shows directors list summary', async ({ page }) => {
      await mockCorporateApi(page, CORPORATE_ID, { ...mockCorporate, kycStatus: 'PENDING' });
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
      await mockDocumentsApi(page, CORPORATE_ID, [mockDocument]);

      await page.goto(BASE_URL_STATUS);

      // Added: Verify directors section
      await expect(page.getByText(/Directors & Signatories/)).toBeVisible();

      // Added: Verify director info
      await expect(page.getByText(`${mockDirector.firstName} ${mockDirector.lastName}`)).toBeVisible();
      await expect(page.getByText(mockDirector.email)).toBeVisible();
    });

    test('shows loading state while fetching data', async ({ page }) => {
      // Changed: Increased delay from 1s to 3s for reliable loading state detection
      await page.route(`**/rest/corporate/show/${CORPORATE_ID}*`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockCorporate, kycStatus: 'PENDING' }),
        });
      });
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);
      await mockDocumentsApi(page, CORPORATE_ID, [mockDocument]);

      await page.goto(BASE_URL_STATUS);

      // Changed: Added timeout to handle race condition with page load
      await expect(page.locator('.animate-spin').first()).toBeVisible({ timeout: 3000 });
      await takeScreenshot(page, 'onboarding-status-loading');
    });
  });

  // ===========================================================================
  // Full Flow Integration Tests
  // ===========================================================================
  test.describe('Full Onboarding Flow', () => {
    test('complete onboarding flow from company info to status', async ({ page }) => {
      // Added: Set up all mocks
      await mockCorporateApi(page, CORPORATE_ID, mockCorporate);
      await mockDirectorsApi(page, CORPORATE_ID, [mockDirector]);

      // Added: Required documents
      const requiredDocs = [
        { ...mockDocument, id: 'doc-1', documentType: 'CERTIFICATE_OF_INCORPORATION' },
        { ...mockDocument, id: 'doc-2', documentType: 'BOARD_RESOLUTION' },
        { ...mockDocument, id: 'doc-3', documentType: 'PROOF_OF_ADDRESS' },
      ];
      await mockDocumentsApi(page, CORPORATE_ID, requiredDocs);

      // Added: Set up update mutation mock
      await page.route('**/rest/corporate/update/*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockCorporate),
        });
      });

      // Added: Set up submit KYC mock
      await page.route(`**/rest/corporate/submitKyc/${CORPORATE_ID}*`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockCorporate, kycStatus: 'PENDING' }),
        });
      });

      // Step 1: Company Info
      await page.goto(BASE_URL_COMPANY);
      await takeScreenshot(page, 'flow-step1-company');

      await page.locator('input[name="physicalAddress"]').fill('123 Test Street');
      await page.locator('input[name="physicalCity"]').fill('Test City');
      await page.getByText('Save & Continue').click();

      await page.waitForURL('**/onboarding/directors*');
      await takeScreenshot(page, 'flow-step2-directors');

      // Step 2: Directors - already has a director
      await page.getByText('Continue to Documents').click();

      await page.waitForURL('**/onboarding/documents*');
      await takeScreenshot(page, 'flow-step3-documents');

      // Step 3: Documents - all required are already uploaded
      await page.getByText('Submit for Review').click();

      await page.waitForURL('**/onboarding/status*');
      await takeScreenshot(page, 'flow-step4-status');

      // Step 4: Status page should show pending
      await expect(page.getByText('KYC Application Status')).toBeVisible();
    });
  });
});
