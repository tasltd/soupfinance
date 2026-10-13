/**
 * SOUPFIN-167: the Invoices and Clients pages follow the chosen language.
 *
 * Before this fix the invoice and client pages hard-coded English, so a user
 * who picked Deutsch in the top bar still read "Invoice Date", "PAID" and
 * "Delete Client". This spec picks Deutsch from the language menu, reaches every
 * page by clicking the sidebar and in-page links (never page.goto for an
 * internal route), and checks on each one that:
 *   - the German copy is shown, including dialogs and validation messages
 *   - none of the old English copy is left on the page
 *   - dates and amounts are formatted for a German reader
 * It then switches to Français and spot-checks the same list.
 *
 * Display only: no screen here writes data. The one save attempted (a client
 * with an invalid email) must be refused in the browser, so the spec asserts
 * that no create or update request reached the backend.
 */
import { test, expect, type Page } from '@playwright/test';
import { installGuideMocks, seedAuthenticatedSession, invoices } from './user-guide/guide-mocks';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-167';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage });
}

/** Fail if any of these English strings is still a whole line of text on the page. */
async function expectNoEnglish(page: Page, english: string[]) {
  const lines = await page.locator('main').evaluate((main) =>
    (main as HTMLElement).innerText.split('\n').map((l) => l.trim()).filter(Boolean)
  );
  for (const phrase of english) {
    expect(lines, `English "${phrase}" is still on the page`).not.toContain(phrase);
  }
}

async function chooseLanguage(page: Page, language: 'de' | 'fr') {
  // The top bar renders the compact switcher: open it, then click the flag
  const flag = { de: '🇩🇪', fr: '🇫🇷' }[language];
  await page.locator('header').getByRole('button', { name: /language|sprache|langue|taal/i }).click();
  await page.locator('header').getByRole('button', { name: flag, exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('soupfinance_language'))).toBe(language);
}

async function openFromSidebar(page: Page, path: '/invoices' | '/clients') {
  await page.locator('aside').locator(`a[href="${path}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

let apiGuard: UnmockedApiGuard;
let writes: string[];

test.describe('SOUPFIN-167: invoices and clients in the chosen language', () => {
  test.skip(isLxcMode(), 'Mock-only spec: it checks rendered copy, not backend behaviour');

  test.beforeEach(async ({ page }) => {
    // FIRST, so every explicit mock below takes precedence over it.
    apiGuard = await installUnmockedApiGuard(page);
    await installGuideMocks(page);
    await seedAuthenticatedSession(page);
    // Start in English whatever the browser says, so the switch is visible
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('soupfin-167-seeded')) {
        localStorage.setItem('soupfinance_language', 'en');
        sessionStorage.setItem('soupfin-167-seeded', '1');
      }
    });
    // The detail page only offers "Send" for a draft; serve one draft invoice
    await page.route('**/rest/invoice/show/inv-002.json*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...invoices[1], status: 'DRAFT' }),
      })
    );
    writes = [];
    page.on('request', (req) => {
      if (['POST', 'PUT', 'DELETE'].includes(req.method()) && /\/rest\/(client|invoice)\//.test(req.url())) {
        writes.push(`${req.method()} ${req.url()}`);
      }
    });
  });

  test.afterEach(() => {
    apiGuard?.assertNone();
  });

  test('Deutsch: invoice list, detail, send dialog and form', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
    await chooseLanguage(page, 'de');

    // 1. List: headings, columns, translated badges, German dates and amounts
    await openFromSidebar(page, '/invoices');
    await expect(page.getByTestId('invoice-list-heading')).toHaveText('Rechnungen');
    await expect(page.getByTestId('invoice-new-button')).toContainText('Neue Rechnung');
    await expect(page.getByTestId('invoice-list-table').locator('thead th')).toHaveText([
      'Rechnung Nr.', 'Kunde', 'Rechnungsdatum', 'Fälligkeitsdatum', 'Betrag', 'Status', 'Aktionen',
    ]);
    await expect(page.getByTestId('invoice-status-inv-001')).toHaveText('Bezahlt');
    await expect(page.getByTestId('invoice-status-inv-002')).toHaveText('Gesendet');
    await expect(page.getByTestId('invoice-status-inv-003')).toHaveText('Überfällig');
    const row = page.getByTestId('invoice-row-inv-001');
    await expect(row).toContainText('2. Feb. 2026');
    await expect(row).toContainText('20.700,00');
    await expectNoEnglish(page, ['Invoices', 'New Invoice', 'PAID', 'SENT', 'OVERDUE', 'Edit', '2026-02-02']);
    await shot(page, 'soupfin-167-01-invoice-list-de');

    // 2. Detail of a draft, reached by clicking its number
    await page.getByTestId('invoice-link-inv-002').click();
    await expect(page).toHaveURL(/\/invoices\/inv-002$/);
    await expect(page.getByTestId('invoice-detail-status')).toHaveText('Entwurf');
    await expect(page.getByTestId('invoice-info-card')).toContainText('Rechnungsinformationen');
    await expect(page.getByTestId('invoice-amount-card')).toContainText('Offener Saldo');
    await expect(page.getByTestId('invoice-download-pdf-button')).toContainText('PDF herunterladen');
    await expect(page.getByTestId('invoice-payments-card')).toContainText('Zahlungsverlauf');
    await expectNoEnglish(page, ['Invoice Information', 'Amount Summary', 'Balance Due', 'Payment History', 'Download PDF', 'DRAFT']);
    await shot(page, 'soupfin-167-02-invoice-detail-de', true);

    // 3. The send dialog
    await page.getByTestId('invoice-send-button').click();
    const dialog = page.getByTestId('send-invoice-dialog');
    await expect(dialog).toContainText('Rechnung senden');
    await expect(dialog).toContainText('per E-Mail mit PDF-Anhang senden.');
    await expect(page.getByTestId('send-recipient-email')).toHaveAttribute('placeholder', 'kunde@beispiel.de');
    await expect(page.getByTestId('send-confirm-button')).toBeDisabled();
    await shot(page, 'soupfin-167-03-send-dialog-de');
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dialog).toHaveCount(0);

    // 4. New invoice form, reached from the list, and its validation message
    await openFromSidebar(page, '/invoices');
    await page.getByTestId('invoice-new-button').click();
    await expect(page).toHaveURL(/\/invoices\/new$/);
    await expect(page.getByTestId('invoice-form-heading')).toHaveText('Neue Rechnung');
    await expect(page.getByTestId('invoice-details-card')).toContainText('Rechnungsdetails');
    await expect(page.getByTestId('invoice-items-card')).toContainText('Positionen');
    await page.getByTestId('invoice-form-save-draft-button').click();
    await expect(page.getByTestId('invoice-form-error-message')).toHaveText('Bitte wählen Sie einen Kunden aus');
    await expectNoEnglish(page, ['New Invoice', 'Save Draft', 'Invoice Details', 'Line Items', 'Add Item', 'Subtotal', 'Please select a client']);
    await shot(page, 'soupfin-167-04-invoice-form-validation-de', true);

    expect(writes).toEqual([]);
  });

  test('Deutsch: client list, delete dialog, detail and form validation', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
    await chooseLanguage(page, 'de');

    // 1. List
    await openFromSidebar(page, '/clients');
    await expect(page.getByTestId('client-list-heading')).toHaveText('Kunden');
    await expect(page.getByTestId('client-list-table').locator('thead th')).toHaveText([
      'Name', 'Typ', 'E-Mail', 'Telefon', 'Aktionen',
    ]);
    await expect(page.getByTestId('client-row-client-001')).toContainText('Unternehmen');
    await expect(page.getByTestId('client-row-client-002')).toContainText('Privatperson');
    await expect(page.getByTestId('client-type-filter').locator('option')).toHaveText(['Alle Typen', 'Privatperson', 'Unternehmen']);
    await expectNoEnglish(page, ['Clients', 'New Client', 'Individual', 'Corporate', 'Email', 'Phone']);
    await shot(page, 'soupfin-167-05-client-list-de');

    // 2. Delete dialog, then back out without deleting
    await page.getByTestId('client-delete-client-001').click();
    const modal = page.getByTestId('delete-confirmation-modal');
    await expect(modal).toContainText('Kunde löschen');
    await expect(modal).toContainText('Möchten Sie Zenith Retail Ltd wirklich löschen?');
    await shot(page, 'soupfin-167-06-client-delete-dialog-de');
    await page.getByTestId('delete-cancel-button').click();
    await expect(modal).toHaveCount(0);

    // 3. Detail, reached by clicking the client's name
    await page.getByTestId('client-link-client-001').click();
    await expect(page).toHaveURL(/\/clients\/client-001$/);
    await expect(page.getByTestId('client-detail-page')).toContainText('Firmenangaben');
    await expect(page.getByTestId('client-detail-page')).toContainText('Kontaktdaten');
    await expect(page.getByTestId('client-create-invoice')).toContainText('Rechnung erstellen');
    await expectNoEnglish(page, ['Company Information', 'Contact Information', 'Billing Address', 'Quick Actions', 'Back to Clients']);
    await shot(page, 'soupfin-167-07-client-detail-de', true);

    // 4. Edit form: an invalid email is refused in German and nothing is sent
    await page.getByTestId('client-detail-edit').click();
    await expect(page).toHaveURL(/\/clients\/client-001\/edit$/);
    await expect(page.getByTestId('client-form-heading')).toHaveText('Kunde bearbeiten');
    const email = page.getByTestId('client-form-email');
    await email.fill('keine-email');
    await page.getByTestId('client-form-save').click();
    await expect(page.getByText('Ungültige E-Mail-Adresse')).toBeVisible();
    await expectNoEnglish(page, ['Edit Client', 'Update Client', 'Invalid email address', 'Company Information']);
    await shot(page, 'soupfin-167-08-client-form-validation-de', true);

    // Display-only change: the refused save never reached the backend
    expect(writes).toEqual([]);
  });

  test('Français: the invoice list follows a second language switch', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 20_000 });
    await chooseLanguage(page, 'fr');
    await openFromSidebar(page, '/invoices');
    await expect(page.getByTestId('invoice-list-heading')).toHaveText('Factures');
    await expect(page.getByTestId('invoice-status-inv-001')).toHaveText('Payée');
    await expect(page.getByTestId('invoice-row-inv-001')).toContainText('2 févr. 2026');
    // French groups thousands with a narrow no-break space
    expect(await page.getByTestId('invoice-row-inv-001').innerText()).toContain('20 700,00');
    await shot(page, 'soupfin-167-09-invoice-list-fr');
  });
});
