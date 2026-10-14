/**
 * SOUPFIN-185 — the sign-in, registration and password pages speak four languages
 *
 * Before this fix none of the public auth pages called useTranslation, and
 * AuthLayout had no language picker, so a visitor saw English until after they
 * signed in. Now AuthLayout carries the LanguageSwitcher, every string on these
 * pages comes from the `auth` namespace, and a switch applies live, including to
 * validation messages already on screen.
 *
 * The journey starts at /login (the app's entry URL) and reaches every other page
 * by clicking its link. Mock mode only: these pages make no backend call until a
 * form is submitted, and the one submit here is a client-side validation refusal.
 *
 * Run: npx playwright test e2e/soupfin-185-auth-i18n.spec.ts --project=firefox
 */
import { test, expect, type Page } from '@playwright/test';
import { installUnmockedApiGuard, isLxcMode, type UnmockedApiGuard } from './fixtures';

const SHOT_DIR = 'e2e/playwright/screenshots/soupfin-185';

test.use({ viewport: { width: 1440, height: 900 } });

/** Screenshots go to a git-tracked directory, not the wiped test-results/. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

/** Opens the picker in the top-right corner of the form panel and picks a language. */
async function pickLanguage(page: Page, nativeName: string) {
  const picker = page.getByTestId('auth-language-switcher');
  await picker.getByRole('button').first().click();
  await picker.getByRole('option', { name: new RegExp(nativeName) }).click();
}

test.describe('SOUPFIN-185 auth pages i18n', () => {
  test.skip(isLxcMode(), 'Mock-mode spec: no backend data is involved');

  let guard: UnmockedApiGuard;

  test.beforeEach(async ({ page }) => {
    guard = await installUnmockedApiGuard(page);
    // frontendLogger flushes console output on unload; the reload below triggers it.
    // Its only content here is i18next's dev-mode banner, so answer it like mockAmbientApi does.
    await page.route('**/rest/frontendLog/batch.json*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"received":0}' }),
    );
  });

  test.afterEach(() => {
    guard.assertNone('SOUPFIN-185');
  });

  test('the picker on the sign-in page switches every auth page live', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-heading')).toHaveText('Welcome back');
    await shot(page, '01-login-english');

    // German, live: no reload, no navigation
    await pickLanguage(page, 'Deutsch');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-heading')).toHaveText('Willkommen zurück');
    await expect(page.getByTestId('login-submit-button')).toHaveText('Anmelden');
    await expect(page.getByTestId('login-email-input')).toHaveAttribute('placeholder', 'Benutzernamen eingeben');
    await expect(page.getByText('Sicherheit auf Bankniveau')).toBeVisible();
    await shot(page, '02-login-german');

    // Forgot password, by its link
    await page.getByTestId('login-forgot-password-link').click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByTestId('forgot-password-heading')).toHaveText('Passwort vergessen?');
    await expect(page.getByTestId('forgot-password-submit-button')).toHaveText('Link zum Zurücksetzen senden');
    await shot(page, '03-forgot-password-german');

    // Register, by its link
    await page.getByTestId('forgot-password-register-link').click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByTestId('registration-heading')).toHaveText('Konto erstellen');
    await shot(page, '04-register-german');

    // An empty submit is refused with German messages
    await page.getByTestId('registration-submit-button').click();
    await expect(page.getByTestId('registration-company-name-error')).toHaveText('Firmenname ist erforderlich');
    await expect(page.getByTestId('registration-email-error')).toHaveText('E-Mail ist erforderlich');
    await expect(page.getByTestId('registration-password-error')).toHaveText('Passwort ist erforderlich');
    await shot(page, '05-register-errors-german');

    // The messages already on screen follow a switch to French
    await pickLanguage(page, 'Français');
    await expect(page.getByTestId('registration-heading')).toHaveText('Créer votre compte');
    await expect(page.getByTestId('registration-company-name-error')).toHaveText("Le nom de l'entreprise est obligatoire");
    await expect(page.getByTestId('registration-password-error')).toHaveText('Le mot de passe est obligatoire');
    await shot(page, '06-register-errors-french');

    // A weak password gets the French rule, not the English one
    await page.getByTestId('registration-password-input').fill('lowercase1');
    await page.getByTestId('registration-submit-button').click();
    await expect(page.getByTestId('registration-password-error')).toHaveText(
      'Le mot de passe doit contenir une lettre majuscule',
    );
    await shot(page, '07-register-password-rule-french');

    // Back to sign in, by its link, in Dutch
    await pickLanguage(page, 'Nederlands');
    // A plain <a href>, so a full page load: the stored language must carry over
    await page.getByTestId('registration-login-link').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-heading')).toHaveText('Welkom terug', { timeout: 15_000 });
    await shot(page, '08-login-dutch');

    // The choice survives a reload (stored under soupfinance_language)
    await page.reload();
    await expect(page.getByTestId('login-heading')).toHaveText('Welkom terug', { timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem('soupfinance_language'))).toBe('nl');

    // And English comes back
    await pickLanguage(page, 'English');
    await expect(page.getByTestId('login-heading')).toHaveText('Welcome back');
    await shot(page, '09-login-english-again');
  });

  // The picker sits in the form panel's top-right corner. The register form is
  // taller than the viewport, so its heading rises to the top edge too: check the
  // two never overlap from phone width up to a small laptop.
  for (const width of [390, 768, 1024, 1280]) {
    test(`the picker never covers the heading at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/login');
      await pickLanguage(page, 'Deutsch');
      // Close the menu again so only the trigger is measured
      await expect(page.getByTestId('login-heading')).toHaveText('Willkommen zurück');

      for (const [link, heading] of [
        [null, 'login-heading'],
        ['login-register-link', 'registration-heading'],
      ] as const) {
        // The register link is a plain <a href>: a full page load, slow on a cold dev server
        if (link) await page.getByTestId(link).click();
        await expect(page.getByTestId(heading)).toBeVisible({ timeout: 15_000 });
        const picker = await page.getByTestId('auth-language-switcher').boundingBox();
        const title = await page.getByTestId(heading).locator('xpath=..').boundingBox();
        expect(picker, 'picker box').not.toBeNull();
        expect(title, 'heading box').not.toBeNull();
        const overlaps =
          picker!.x < title!.x + title!.width &&
          title!.x < picker!.x + picker!.width &&
          picker!.y < title!.y + title!.height &&
          title!.y < picker!.y + picker!.height;
        expect(overlaps, `${heading} at ${width}px`).toBe(false);
      }
      await shot(page, `10-register-german-${width}`);
    });
  }
});
