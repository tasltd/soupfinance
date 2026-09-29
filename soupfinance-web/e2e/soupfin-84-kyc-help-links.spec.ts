/**
 * SOUPFIN-84 — "Need Help?" links on the company verification (KYC) wizard
 *
 * SOUPFIN-81 put a "Need Help?" link on every page header, but skipped the four
 * /onboarding/* steps: the user guide had no section on company verification to
 * point at. The guide now has one, and each step links to its own part of it.
 *
 * The walk starts on the dashboard and reaches every step by clicking, the way
 * a user does: the KYC banner, then each step's own continue button. On two
 * steps it follows the link into the new tab and checks the guide opened on
 * the right heading, not at the top of the page.
 *
 * Run: npx playwright test e2e/soupfin-84-kyc-help-links.spec.ts --project=firefox
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import {
  installGuideMocks,
  installKycGuideMocks,
  seedAuthenticatedSession,
  kycCorporate,
} from './user-guide/guide-mocks';
import { installUnmockedApiGuard, type UnmockedApiGuard } from './fixtures';

// Git-tracked, unlike test-results/, which Playwright wipes on every run.
const SHOTS = 'e2e/playwright/screenshots/soupfin-84';
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string, fullPage = true) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);

let apiGuard: UnmockedApiGuard;

test.beforeEach(async ({ page }) => {
  apiGuard = await installUnmockedApiGuard(page);
  await installGuideMocks(page);
  await installKycGuideMocks(page);
  await seedAuthenticatedSession(page);
});

test.afterEach(() => {
  apiGuard?.assertNone();
});

/** Land on the dashboard and follow the KYC banner into step 1. */
async function openWizardFromDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('kyc-onboarding-banner-cta').click();
  await expect(page).toHaveURL(new RegExp(`/onboarding/company\\?id=${kycCorporate.id}$`));
  await expect(page.getByTestId('company-info-page')).toBeVisible();
}

/** The step's header link: right target, new tab, under the page heading. */
async function expectHelpLink(page: Page, pageTestId: string, section: string) {
  const link = page.getByTestId(`help-link-${section}`);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `/user-guide/index.html#${section}`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAccessibleName(/^Need Help\? *\(opens the user guide in a new tab\)$/);

  // One link per step, and it sits below the <h1>, not somewhere further down.
  const container = page.getByTestId(pageTestId);
  await expect(container.getByRole('link', { name: /Need Help\?/ })).toHaveCount(1);
  const heading = await container.locator('h1').boundingBox();
  const linkBox = await link.boundingBox();
  expect(heading && linkBox && linkBox.y > heading.y).toBeTruthy();
  return link;
}

/** Click the link and check the guide tab opened on that section's heading. */
async function followToGuide(page: Page, section: string, heading: string, name: string) {
  const [guide] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByTestId(`help-link-${section}`).click(),
  ]);
  await guide.waitForLoadState('load');
  expect(new URL(guide.url()).pathname).toBe('/user-guide/index.html');
  expect(new URL(guide.url()).hash).toBe(`#${section}`);

  const target = guide.locator(`#${section}`);
  await expect(target).toHaveText(heading);
  await expect(target).toBeInViewport();
  // Viewport only: that is what the user sees on arrival (and the whole guide
  // is taller than Firefox can capture in one shot).
  await shot(guide, name, false);
  await guide.close();
}

test.describe('SOUPFIN-84: KYC wizard "Need Help?" links', () => {
  test('every step links to its own part of the guide', async ({ page }) => {
    await openWizardFromDashboard(page);
    await expectHelpLink(page, 'company-info-page', 'kyc-company-details');
    await shot(page, 'step-1-company-details');
    await followToGuide(page, 'kyc-company-details', 'Step 1: company details', 'guide-step-1');

    await page.getByRole('button', { name: /Save & Continue/ }).click();
    await expect(page.getByTestId('directors-page')).toBeVisible();
    await expectHelpLink(page, 'directors-page', 'kyc-directors');
    await shot(page, 'step-2-directors');

    await page.getByRole('button', { name: /Continue to Documents/ }).click();
    await expect(page.getByTestId('documents-page')).toBeVisible();
    await expectHelpLink(page, 'documents-page', 'kyc-documents');
    await shot(page, 'step-3-documents');

    await page.getByRole('button', { name: /Submit for Review/ }).click();
    await expect(page.getByTestId('kyc-status-page')).toBeVisible();
    await expectHelpLink(page, 'kyc-status-page', 'kyc-status');
    await shot(page, 'step-4-status');
    await followToGuide(page, 'kyc-status', 'Step 4: track the review', 'guide-step-4');
  });

  test('the links are there before anything is filled in', async ({ page }) => {
    // Zero end: a brand new application with nobody named yet.
    await page.route('**/rest/corporateAccountPerson/index.json*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );

    await openWizardFromDashboard(page);
    await page.getByRole('button', { name: /Skip for Now/ }).click();
    await expect(page.getByTestId('directors-page')).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue to Documents/ })).toBeDisabled();
    await expectHelpLink(page, 'directors-page', 'kyc-directors');
    await shot(page, 'empty-directors');

    // With nobody named the user cannot move on, so this is where they most
    // need the guide: it must open on the part that explains the grey button.
    await followToGuide(page, 'kyc-directors', 'Step 2: directors and signatories', 'guide-step-2');
  });
});
