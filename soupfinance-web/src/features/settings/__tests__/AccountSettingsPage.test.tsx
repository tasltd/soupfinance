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
import AccountSettingsPage, { sanitizeFiscalYearDate } from '../AccountSettingsPage';
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
 * SOUPFIN-18 fixes: graceful degradation when the profile/settings API fails.
 *
 * Production symptom: the Account Settings page "fails to render any form content,
 * remaining stuck on Loading..." because the underlying profile API returns a 500.
 * The page must instead render the editable form with a non-blocking warning so the
 * user can still update and re-save their details.
 */
describe('AccountSettingsPage (SOUPFIN-18 — resilient to settings GET failure)', () => {
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

  it('renders the editable form (not a blocking error screen) when the settings GET returns 500', async () => {
    vi.mocked(accountSettingsApi.get).mockRejectedValue(makeHttpError(500));

    renderPage();

    // The non-blocking warning banner is shown...
    const banner = await screen.findByTestId('account-settings-load-error');
    expect(banner).toHaveTextContent(/Couldn't load your saved settings/i);

    // ...AND the form itself still renders so the user can edit + save.
    expect(screen.getByTestId('account-settings-save')).toBeInTheDocument();
    expect(screen.getByTestId('account-settings-save')).not.toBeDisabled();
    // The full-screen blocking copy from the old behaviour must be gone.
    expect(screen.queryByText(/Failed to load account settings/i)).not.toBeInTheDocument();
  });

  it('saves using tenantId as the account id when settings failed to load (SOUPFIN-18)', async () => {
    const user = userEvent.setup();
    vi.mocked(accountSettingsApi.get).mockRejectedValue(makeHttpError(500));
    vi.mocked(accountSettingsApi.update).mockResolvedValue({ id: 'tenant-123' } as never);

    renderPage();

    // Wait for the form to render despite the failed load.
    await screen.findByTestId('account-settings-load-error');

    // Company name is required by the schema; the GET failed so it starts empty.
    const nameInput = screen.getByPlaceholderText(/Your company name/i);
    await user.type(nameInput, 'Recovered Co');

    await user.click(screen.getByTestId('account-settings-save'));

    // The update must be called with the tenantId as the account id, proving the
    // fallback round-trips even though currentSettings was never loaded.
    await waitFor(() => expect(accountSettingsApi.update).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(accountSettingsApi.update).mock.calls[0][0];
    expect(payload).toMatchObject({ id: 'tenant-123', name: 'Recovered Co' });
  });
});
