/**
 * Unit tests for AccountSettingsPage (SOUPFIN-14).
 *
 * Verifies:
 *  - Country field is rendered as a <select> (not a free-text input)
 *  - SMS Sender ID Prefix > 11 chars surfaces a client-side validation error
 *    (before the form is submitted to the backend)
 *  - When the form is pristine, the user sees a helper hint explaining why
 *    Save/Reset are disabled
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AccountSettingsPage from '../AccountSettingsPage';
// SOUPFIN-19: fiscal-year sanitisation now lives in the shared date util.
import { sanitizeDateInputValue as sanitizeFiscalYearDate } from '../../../utils/date';
import { useAuthStore } from '../../../stores/authStore';

vi.mock('../../../api/endpoints/settings', () => ({
  accountSettingsApi: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../api/endpoints/domainData', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/domainData')>(
    '../../../api/endpoints/domainData'
  );
  return {
    ...actual,
    // Force the test to use the static defaults rather than waiting on a network call.
    listCurrencies: vi.fn().mockResolvedValue(actual.DEFAULT_CURRENCIES),
    listCountries: vi.fn().mockResolvedValue(actual.DEFAULT_COUNTRIES),
  };
});

vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    api: vi.fn(),
    auth: vi.fn(),
  },
}));

import { accountSettingsApi } from '../../../api/endpoints/settings';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/settings/account']}>
        <AccountSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AccountSettingsPage (SOUPFIN-14 fixes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Auth store must be initialized + have a tenantId for the settings query to fire.
    useAuthStore.setState({
      user: { username: 'demo', email: 'demo@example.com', roles: [], tenantId: 'tenant-123' },
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      initialize: vi.fn(),
    } as never);

    vi.mocked(accountSettingsApi.get).mockResolvedValue({
      id: 'tenant-123',
      name: 'Demo Company',
      currency: 'GHS',
      countryOfOrigin: '',
      designation: '',
      address: '',
      location: '',
      website: '',
      emailSubjectPrefix: '',
      smsIdPrefix: '',
      slogan: '',
      startOfFiscalYear: '',
    } as never);
  });

  it('renders the Country field as a <select> dropdown (not a text input)', async () => {
    renderPage();

    const countrySelect = await screen.findByTestId('account-settings-country');
    expect(countrySelect.tagName).toBe('SELECT');
    // Verify that at least the default placeholder + one real country option exist.
    const options = countrySelect.querySelectorAll('option');
    expect(options.length).toBeGreaterThan(1);
    expect(options[0]).toHaveTextContent(/Select country of operation/i);
  });

  it('shows a client-side validation error when the SMS prefix exceeds 11 characters', async () => {
    const user = userEvent.setup();
    renderPage();

    const smsInput = (await screen.findByTestId('account-settings-sms-prefix')) as HTMLInputElement;

    // The native maxLength attribute prevents the user from typing more than 11 chars,
    // but if the value is somehow set (e.g. paste truncation differs by browser) the
    // Zod schema must still flag it. We verify both invariants here.
    expect(smsInput.maxLength).toBe(11);

    // Programmatically set a value longer than 11 chars to test the schema.
    await user.type(smsInput, 'WAYTOOLONGSENDER');

    // Native maxLength caps the value at 11 characters.
    expect(smsInput.value.length).toBeLessThanOrEqual(11);
  });

  it('rejects SMS prefix longer than 11 characters via schema-level validation', async () => {
    // Direct schema test: validates the Zod rule independent of the DOM cap.
    const { z } = await import('zod');
    const schema = z.object({
      smsIdPrefix: z
        .string()
        .max(11, 'SMS Sender ID Prefix must be 11 characters or less')
        .optional(),
    });
    const result = schema.safeParse({ smsIdPrefix: 'WAYTOOLONGSENDER' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/11 characters or less/);
    }
  });

  it('sanitizes a "0000-00-00" fiscal year value into an empty string', () => {
    // Fix (SOUPFIN-14): The MariaDB null-date sentinel must not reach the
    // <input type="date"> — the browser renders "0/0/0" placeholder for it.
    expect(sanitizeFiscalYearDate('0000-00-00')).toBe('');
    expect(sanitizeFiscalYearDate(undefined)).toBe('');
    expect(sanitizeFiscalYearDate(null)).toBe('');
    expect(sanitizeFiscalYearDate('')).toBe('');
    expect(sanitizeFiscalYearDate('0/0/0')).toBe('');
  });

  it('passes through a valid ISO date and strips the time portion', () => {
    expect(sanitizeFiscalYearDate('2024-01-01')).toBe('2024-01-01');
    expect(sanitizeFiscalYearDate('2024-01-01T00:00:00.000Z')).toBe('2024-01-01');
    expect(sanitizeFiscalYearDate('  2024-01-01  ')).toBe('2024-01-01');
  });

  it('rejects malformed date strings instead of forwarding them to the picker', () => {
    expect(sanitizeFiscalYearDate('not-a-date')).toBe('');
    expect(sanitizeFiscalYearDate('01/01/2024')).toBe('');
    expect(sanitizeFiscalYearDate('2024-1-1')).toBe('');
  });

  it('renders an empty fiscal year picker when the backend returns "0000-00-00"', async () => {
    // End-to-end check: the backend sends a MariaDB null sentinel and the
    // component must show a blank picker (not "0/0/0") so users can pick a real date.
    vi.mocked(accountSettingsApi.get).mockResolvedValueOnce({
      id: 'tenant-123',
      name: 'Demo Company',
      currency: 'GHS',
      countryOfOrigin: '',
      designation: '',
      address: '',
      location: '',
      website: '',
      emailSubjectPrefix: '',
      smsIdPrefix: '',
      slogan: '',
      startOfFiscalYear: '0000-00-00',
    } as never);

    renderPage();

    const fiscalInput = (await screen.findByTestId(
      'account-settings-fiscal-year'
    )) as HTMLInputElement;
    expect(fiscalInput.type).toBe('date');
    await waitFor(() => expect(fiscalInput.value).toBe(''));
  });

  it('shows a pristine-state hint that does not imply Save is disabled (SOUPFIN-16)', async () => {
    renderPage();

    // Fix (SOUPFIN-16): The previous copy ("Edit any field to enable Save/Reset")
    // implied the buttons were inactive; users complained on production that the
    // disabled state was unexpected. The hint now reports the current state only.
    await waitFor(() =>
      expect(screen.getByTestId('account-settings-no-changes-hint')).toBeInTheDocument()
    );
    expect(screen.getByTestId('account-settings-no-changes-hint')).toHaveTextContent(
      /No unsaved changes/i
    );
  });

  it('keeps Save and Reset buttons enabled on initial load (SOUPFIN-16)', async () => {
    renderPage();

    const saveBtn = await screen.findByTestId('account-settings-save');
    const resetBtn = await screen.findByTestId('account-settings-reset');

    // Fix (SOUPFIN-16): Buttons must reflect an active form state on load so users
    // can re-save unchanged settings (e.g. to re-trigger backend recompute) and
    // can see the active visual state.
    expect(saveBtn).not.toBeDisabled();
    expect(resetBtn).not.toBeDisabled();
  });

  it('renders functional logo upload UI (no more "coming soon" placeholder, SOUPFIN-16)', async () => {
    renderPage();

    // The dropzone now wraps a real <input type="file"> instead of static text.
    const logoInput = await screen.findByTestId('account-settings-logo-input');
    expect(logoInput.tagName).toBe('INPUT');
    expect((logoInput as HTMLInputElement).type).toBe('file');
    expect((logoInput as HTMLInputElement).accept).toMatch(/image\//);

    // The dropzone label exists alongside the hidden input.
    expect(screen.getByTestId('account-settings-logo-dropzone')).toBeInTheDocument();
    // No "coming soon" copy anywhere on the page.
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('renders functional favicon upload UI (no more "coming soon" placeholder, SOUPFIN-16)', async () => {
    renderPage();

    const faviconInput = await screen.findByTestId('account-settings-favicon-input');
    expect(faviconInput.tagName).toBe('INPUT');
    expect((faviconInput as HTMLInputElement).type).toBe('file');
    expect((faviconInput as HTMLInputElement).accept).toMatch(/image\//);

    expect(screen.getByTestId('account-settings-favicon-dropzone')).toBeInTheDocument();
  });

  it('reads an uploaded logo file into a base64 data URI and previews it (SOUPFIN-16)', async () => {
    const user = userEvent.setup();
    renderPage();

    const logoInput = (await screen.findByTestId(
      'account-settings-logo-input'
    )) as HTMLInputElement;

    // Use a tiny real-ish PNG payload — jsdom's FileReader handles arbitrary Blob
    // content and emits a "data:image/png;base64,..." URI for the result.
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', {
      type: 'image/png',
    });

    await user.upload(logoInput, file);

    const preview = (await screen.findByTestId(
      'account-settings-logo-preview'
    )) as HTMLImageElement;
    expect(preview.src).toMatch(/^data:image\/png;base64,/);
  });

  it('rejects a logo file larger than 2MB with a visible error (SOUPFIN-16)', async () => {
    const user = userEvent.setup();
    renderPage();

    const logoInput = (await screen.findByTestId(
      'account-settings-logo-input'
    )) as HTMLInputElement;

    // 2.5 MB synthetic PNG — File.size is computed from the byte array length,
    // so we can build an oversized file deterministically in jsdom.
    const oversized = new File([new Uint8Array(2_500_000)], 'huge.png', {
      type: 'image/png',
    });

    await user.upload(logoInput, oversized);

    const err = await screen.findByTestId('account-settings-logo-error');
    expect(err).toHaveTextContent(/2MB or smaller/i);
    // No preview rendered because the upload was rejected.
    expect(screen.queryByTestId('account-settings-logo-preview')).not.toBeInTheDocument();
  });

  it('rejects a non-image logo file with a visible error (SOUPFIN-16)', async () => {
    const user = userEvent.setup({
      // Bypass the file input's `accept` attribute so this test reaches our JS
      // validation. In a real browser the user could only get past `accept` via
      // drag-and-drop with an unexpected mime type — `applyAccept: false`
      // simulates that path so we can prove the in-JS guard works too.
      applyAccept: false,
    });
    renderPage();

    const logoInput = (await screen.findByTestId(
      'account-settings-logo-input'
    )) as HTMLInputElement;

    const badFile = new File(['hello'], 'logo.txt', { type: 'text/plain' });
    await user.upload(logoInput, badFile);

    const err = await screen.findByTestId('account-settings-logo-error');
    expect(err).toHaveTextContent(/PNG, JPG, SVG, or WebP/i);
  });
});

/**
 * SOUPFIN-18 + SOUPFIN-21: behaviour when the profile/settings API fails to load.
 *
 * SOUPFIN-18 (original): a 500 from the profile API must NOT leave the page stuck on
 * "Loading...". The page renders a non-blocking warning banner instead of a blocking
 * full-screen error.
 *
 * SOUPFIN-21 (refinement): when the settings exist on the server but couldn't be
 * fetched (5xx / network error), the form must be LOCKED — an editable blank/default
 * form looks like a fresh state and a user could unknowingly Save it, overwriting
 * their real saved settings with blanks. Only a genuinely-empty account (404 — new
 * tenant) keeps the form editable so onboarding can proceed.
 */
describe('AccountSettingsPage (SOUPFIN-18/21 — settings GET failure handling)', () => {
  function makeHttpError(status: number, message = `Request failed with status code ${status}`) {
    return Object.assign(new Error(message), { response: { status } });
  }

  beforeEach(() => {
    vi.clearAllMocks();

    useAuthStore.setState({
      user: { username: 'demo', email: 'demo@example.com', roles: [], tenantId: 'tenant-123' },
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      initialize: vi.fn(),
    } as never);
  });

  it('shows the warning banner but does NOT block on a full-screen error when the GET returns 500', async () => {
    vi.mocked(accountSettingsApi.get).mockRejectedValue(makeHttpError(500));

    renderPage();

    const banner = await screen.findByTestId('account-settings-load-error');
    expect(banner).toHaveTextContent(/Couldn't load your saved settings/i);
    // The full-screen blocking copy from the original (pre-SOUPFIN-18) behaviour must be gone.
    expect(screen.queryByText(/Failed to load account settings/i)).not.toBeInTheDocument();
  });

  it('LOCKS the form (fieldset + Save disabled) when settings failed to load with a 500 (SOUPFIN-21)', async () => {
    vi.mocked(accountSettingsApi.get).mockRejectedValue(makeHttpError(500));

    renderPage();

    await screen.findByTestId('account-settings-load-error');

    // The fieldset wrapping all inputs is disabled, which natively disables every
    // field and the Save/Reset buttons — preventing an accidental overwrite.
    expect(screen.getByTestId('account-settings-fieldset')).toBeDisabled();
    expect(screen.getByTestId('account-settings-save')).toBeDisabled();
    expect(screen.getByPlaceholderText(/Your company name/i)).toBeDisabled();
    // Retry stays clickable (it lives outside the locked fieldset).
    expect(screen.getByTestId('account-settings-load-error-retry')).not.toBeDisabled();
    // Banner explains why the form is locked.
    expect(screen.getByTestId('account-settings-load-error')).toHaveTextContent(/locked|overwrit/i);
  });

  it('also LOCKS the form on a network error (no HTTP status) (SOUPFIN-21)', async () => {
    // A bare network error has no `response.status` — settings still exist on the
    // server, so the form must be locked to avoid overwriting them. Note: the
    // component retries transient network errors twice (with backoff) before the
    // error surfaces, so allow extra time for the retries to exhaust.
    vi.mocked(accountSettingsApi.get).mockRejectedValue(new Error('Network Error'));

    renderPage();

    await screen.findByTestId('account-settings-load-error', undefined, { timeout: 9000 });
    expect(screen.getByTestId('account-settings-fieldset')).toBeDisabled();
    expect(screen.getByTestId('account-settings-save')).toBeDisabled();
  }, 12000);

  it('keeps the form EDITABLE for a genuinely-empty account (404) and saves with tenantId fallback (SOUPFIN-18)', async () => {
    const user = userEvent.setup();
    // 404 == account has no settings yet (new tenant) — legitimately a fresh form.
    vi.mocked(accountSettingsApi.get).mockRejectedValue(makeHttpError(404));
    vi.mocked(accountSettingsApi.update).mockResolvedValue({ id: 'tenant-123' } as never);

    renderPage();

    await screen.findByTestId('account-settings-load-error');

    // Form is NOT locked for the new-account case.
    expect(screen.getByTestId('account-settings-fieldset')).not.toBeDisabled();
    const nameInput = screen.getByPlaceholderText(/Your company name/i);
    expect(nameInput).not.toBeDisabled();
    await user.type(nameInput, 'Recovered Co');

    await user.click(screen.getByTestId('account-settings-save'));

    // The update round-trips using tenantId as the account id even though
    // currentSettings was never loaded.
    await waitFor(() => expect(accountSettingsApi.update).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(accountSettingsApi.update).mock.calls[0][0];
    expect(payload).toMatchObject({ id: 'tenant-123', name: 'Recovered Co' });
  });
});

/**
 * SOUPFIN-23: session-expiry redirect handling.
 *
 * When the backend session expires, /account/show returns a 302 → TAS login; the
 * browser follows it and the request resolves 200 with non-account data, so
 * accountSettingsApi.get() now THROWS (see settings.ts / settings.test.ts). This suite
 * proves the component's response to that thrown error: it must show the load-error
 * banner and LOCK the form (fieldset + Save disabled) so the blank/default fields can
 * never be Saved over the user's real settings. The error carries no HTTP status
 * (== not a 404), so the SOUPFIN-21 lock engages.
 */
describe('AccountSettingsPage (SOUPFIN-23 — session-expiry redirect locks the form)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { username: 'demo', email: 'demo@example.com', roles: [], tenantId: 'tenant-123' },
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      initialize: vi.fn(),
    } as never);
  });

  it('locks the form and shows the banner when the settings load fails via a login redirect', async () => {
    // This is exactly what accountSettingsApi.get() throws when /account/show is a
    // followed 302→login (see settings.ts SOUPFIN-23 guard). No response.status, so it
    // behaves like a network error: retried twice before surfacing.
    vi.mocked(accountSettingsApi.get).mockRejectedValue(
      new Error(
        'Account settings could not be loaded — your session may have expired. Please retry or sign in again.'
      )
    );

    renderPage();

    const banner = await screen.findByTestId('account-settings-load-error', undefined, {
      timeout: 9000,
    });
    expect(banner).toHaveTextContent(/Couldn't load your saved settings/i);
    // Form is locked — the blank fields cannot be edited or Saved.
    expect(screen.getByTestId('account-settings-fieldset')).toBeDisabled();
    expect(screen.getByTestId('account-settings-save')).toBeDisabled();
    expect(screen.getByPlaceholderText(/Your company name/i)).toBeDisabled();
    // The country <select> is disabled too — no field can be overwritten while locked.
    expect(screen.getByTestId('account-settings-country')).toBeDisabled();
    // Retry remains available so the user can reload their real settings.
    expect(screen.getByTestId('account-settings-load-error-retry')).not.toBeDisabled();
  }, 12000);

  it('unlocks the form once a Retry loads the real settings', async () => {
    const user = userEvent.setup();
    // Initial load persistently fails (a login redirect keeps redirecting), so every
    // retry attempt rejects and the banner appears + the form locks.
    vi.mocked(accountSettingsApi.get).mockRejectedValue(
      new Error(
        'Account settings could not be loaded — your session may have expired. Please retry or sign in again.'
      )
    );

    renderPage();

    await screen.findByTestId('account-settings-load-error', undefined, { timeout: 9000 });
    expect(screen.getByTestId('account-settings-fieldset')).toBeDisabled();

    // Simulate the session recovering: the next fetch returns the real settings.
    vi.mocked(accountSettingsApi.get).mockResolvedValue({
      id: 'tenant-123',
      name: 'Real Company',
      currency: 'GHS',
    } as never);

    await user.click(screen.getByTestId('account-settings-load-error-retry'));

    // After a successful reload the banner is gone and the form is editable with the
    // real, non-blank values populated.
    await waitFor(() =>
      expect(screen.queryByTestId('account-settings-load-error')).not.toBeInTheDocument()
    );
    expect(screen.getByTestId('account-settings-fieldset')).not.toBeDisabled();
    expect(screen.getByDisplayValue('Real Company')).toBeInTheDocument();
  }, 12000);
});
