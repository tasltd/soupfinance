/**
 * SOUPFIN-183: the Bills and Vendors pages, and the bill PDF, speak four languages.
 *
 * Before this fix none of the bill or vendor pages called useTranslation: every
 * heading, label, badge, dialog and message was English whatever language the
 * user picked, and the status badge printed the raw enum ("PAID").
 *
 * Each test signs in, switches language with the top-bar language picker, and
 * reaches every page by sidebar and page clicks, never page.goto on the target.
 *
 * Mock-only: it asserts on exact translated copy against the guide fixtures.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession, bills } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-183';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

/** Screenshots go to a git-tracked directory, not the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

function json(body: unknown) {
  return (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

// The guide fixture's first bill carries "APPROVED", which the backend's
// PaymentStatus never sends, and no billNumber, which bill/_bill.gson always
// does. Use the real shape: PENDING, PARTIAL, PAID, with billNumber.
const BILLS = [
  { ...bills[0], billNumber: 'BILL-2026-014', status: 'PENDING' },
  { ...bills[1], billNumber: 'BILL-2026-015', status: 'PAID' },
  {
    ...bills[0],
    id: 'bill-003',
    number: 'BILL-2026-016',
    billNumber: 'BILL-2026-016',
    status: 'PARTIAL',
    paidAmount: 1000,
    amountDue: 3830,
  },
];

async function openApp(page: Page) {
  await installGuideMocks(page);
  // Registered after the guide mocks, so these win
  await page.route('**/rest/bill/index.json*', json(BILLS));
  await page.route('**/rest/bill/show/*.json*', (route) => {
    const id = route.request().url().match(/bill\/show\/([^.]+)\.json/)?.[1];
    return json(BILLS.find((b) => b.id === id) ?? BILLS[0])(route);
  });
  await seedAuthenticatedSession(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
}

/** Picks a language from the top bar, the way a user does. */
async function chooseLanguage(page: Page, nativeName: 'Deutsch' | 'Français' | 'Nederlands') {
  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByTitle(nativeName).click();
}

async function openFromSidebar(page: Page, path: '/bills' | '/vendors', pageTestId: string) {
  await page.locator('aside').locator(`a[href="${path}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByTestId(pageTestId)).toBeVisible();
}

/**
 * No English copy left in the page body (data values such as names are allowed).
 * Scoped to <main>: the sidebar and the shared "Need Help?" link are outside
 * SOUPFIN-183 and still English (tracked separately).
 */
async function expectNoEnglishChrome(page: Page, phrases: string[]) {
  const main = page.locator('main');
  for (const phrase of phrases) {
    await expect(main.getByText(phrase, { exact: true })).toHaveCount(0);
  }
}

let apiGuard: UnmockedApiGuard;

test.describe('SOUPFIN-183: bills and vendors in four languages', () => {
  test.skip(isLxcMode(), 'Mock-only spec: asserts exact translated copy against fixtures');

  test.beforeEach(async ({ page }) => {
    apiGuard = await installUnmockedApiGuard(page);
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('bills list, detail, send dialog and form in German', async ({ page }) => {
    await openApp(page);
    await chooseLanguage(page, 'Deutsch');
    await openFromSidebar(page, '/bills', 'bill-list-page');

    await expect(page.getByTestId('bill-list-heading')).toHaveText('Eingangsrechnungen');
    await expect(page.getByTestId('bill-status-bill-001')).toHaveText('Ausstehend');
    await expect(page.getByTestId('bill-status-bill-002')).toHaveText('Bezahlt');
    await expect(page.getByTestId('bill-status-bill-003')).toHaveText('Teilweise bezahlt');
    await expect(page.getByRole('columnheader', { name: 'Offener Betrag' })).toBeVisible();
    await expectNoEnglishChrome(page, ['Bills', 'Balance Due', 'PAID', 'PARTIAL', 'PENDING', 'Edit']);
    await shot(page, 'bill-list-german');

    await page.getByTestId('bill-link-bill-003').click();
    await expect(page.getByTestId('bill-detail-heading')).toHaveText('Eingangsrechnung BILL-2026-016');
    await expect(page.getByTestId('bill-detail-status')).toHaveText('Teilweise bezahlt');
    await expect(page.getByTestId('bill-amount-card')).toContainText('Betragsübersicht');
    await expect(page.getByTestId('bill-amount-card')).toContainText('Offener Betrag');
    await expect(page.getByTestId('bill-payments-card')).toContainText('Zahlungsverlauf');
    await expectNoEnglishChrome(page, ['Bill Information', 'Amount Summary', 'Line Items', 'Payment History']);
    await shot(page, 'bill-detail-german');

    await page.getByTestId('bill-send-button').click();
    const dialog = page.getByTestId('send-bill-dialog');
    await expect(dialog).toContainText('Eingangsrechnung BILL-2026-016 mit einem im Browser erstellten PDF-Anhang senden.');
    await expect(dialog.locator('strong')).toHaveText('BILL-2026-016');
    await expect(page.getByTestId('send-confirm-button')).toHaveText(/Eingangsrechnung senden/);
    await shot(page, 'bill-send-dialog-german');
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dialog).toHaveCount(0);

    // A new bill saved without a vendor is refused in German
    await openFromSidebar(page, '/bills', 'bill-list-page');
    await page.getByTestId('bill-new-button').click();
    await expect(page.getByTestId('bill-form-heading')).toHaveText('Neue Eingangsrechnung');
    await page.getByTestId('bill-advanced-toggle').click();
    await expect(page.getByTestId('bill-advanced-section')).toContainText('Bestellnummer');
    await expect(page.getByTestId('bill-item-taxRate-0').locator('option').first()).toHaveText('Keine Steuer');
    await page.getByTestId('bill-form-save-button').click();
    await expect(page.getByTestId('bill-form-error-message')).toHaveText('Bitte wählen Sie einen Lieferanten aus');
    await expectNoEnglishChrome(page, ['Bill Details', 'Line Items', 'Save Bill', 'Please select a vendor']);
    await shot(page, 'bill-form-german-validation');
  });

  test('the bill PDF prints its labels in Dutch', async ({ page }) => {
    // The PDF pages are images; read the HTML handed to the renderer instead
    await page.addInitScript(() => {
      const w = window as unknown as { __pdfText: string[] };
      w.__pdfText = [];
      new MutationObserver((records) => {
        for (const record of records) {
          record.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement && node.querySelector('.document-title')) {
              w.__pdfText.push(node.textContent || '');
            }
          });
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await openApp(page);
    await chooseLanguage(page, 'Nederlands');
    await openFromSidebar(page, '/bills', 'bill-list-page');
    await page.getByTestId('bill-link-bill-003').click();
    await expect(page.getByTestId('bill-detail-heading')).toHaveText('Inkoopfactuur BILL-2026-016');
    await shot(page, 'bill-detail-dutch');

    const download = page.waitForEvent('download');
    await page.getByTestId('bill-download-pdf-button').click();
    expect((await download).suggestedFilename()).toBe('Bill-BILL-2026-016.pdf');

    const text = (await page.evaluate(() => (window as unknown as { __pdfText: string[] }).__pdfText)).join('\n');
    for (const label of ['INKOOPFACTUUR', 'Van leverancier', 'Te betalen', 'Subtotaal', 'Openstaand saldo',
      'Gedeeltelijk betaald', 'Gemaakt met SoupFinance']) {
      expect(text).toContain(label);
    }
    expect(text).not.toMatch(/\b(BILL|Subtotal|Balance Due|From Vendor|PARTIAL|Generated by)\b(?!-)/);
  });

  test('vendors list, detail, delete dialog and form in French', async ({ page }) => {
    await openApp(page);
    await chooseLanguage(page, 'Français');
    await openFromSidebar(page, '/vendors', 'vendor-list-page');

    await expect(page.getByTestId('vendor-list-heading')).toHaveText('Fournisseurs');
    await expect(page.getByRole('tab', { name: 'Actifs' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('searchbox', { name: 'Rechercher des fournisseurs' })).toBeVisible();
    await expect(page.getByTestId('vendor-pagination-range')).toHaveText('1 à 3 sur 3 fournisseurs');
    await expectNoEnglishChrome(page, ['Vendors', 'Active', 'Archived', 'Payment Terms']);
    await shot(page, 'vendor-list-french');

    await page.getByTestId('vendor-delete-vendor-002').click();
    const modal = page.getByTestId('delete-confirmation-modal');
    await expect(modal).toContainText('Voulez-vous vraiment supprimer Volta Power Services ?');
    await expect(modal.locator('.font-semibold')).toHaveText('Volta Power Services');
    await shot(page, 'vendor-delete-dialog-french');
    await page.getByTestId('delete-cancel-button').click();
    await expect(modal).toHaveCount(0);

    await page.getByTestId('vendor-link-vendor-001').click();
    await expect(page.getByTestId('vendor-detail-page')).toContainText('Informations générales');
    await expect(page.getByTestId('vendor-detail-page')).toContainText('Non précisé');
    await expect(page.getByTestId('vendor-pay-bills')).toHaveText(/Payer des factures/);
    await shot(page, 'vendor-detail-french');

    await page.getByTestId('vendor-detail-edit').click();
    await expect(page.getByTestId('vendor-form-heading')).toHaveText('Modifier le fournisseur');
    await page.getByTestId('vendor-form-name').fill('');
    await page.getByTestId('vendor-form-save').click();
    await expect(page.getByText('Le nom du fournisseur est obligatoire')).toBeVisible();
    await expectNoEnglishChrome(page, ['Basic Information', 'Vendor Name', 'Update Vendor', 'Vendor name is required']);
    await shot(page, 'vendor-form-french-validation');
  });

  test('English is unchanged for a user who never picks a language', async ({ page }) => {
    await openApp(page);
    await openFromSidebar(page, '/bills', 'bill-list-page');
    await expect(page.getByTestId('bill-list-heading')).toHaveText('Bills');
    await expect(page.getByTestId('bill-status-bill-003')).toHaveText('Partially Paid');
    await shot(page, 'bill-list-english');

    await openFromSidebar(page, '/vendors', 'vendor-list-page');
    await expect(page.getByTestId('vendor-pagination-range')).toHaveText('Showing 1 to 3 of 3 vendors');
  });
});
