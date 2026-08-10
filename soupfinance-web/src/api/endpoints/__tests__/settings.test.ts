/**
 * Unit tests for settings API — accountSettingsApi
 *
 * Focus: SOUPFIN-10 race-condition fix.
 *
 * Background: AccountSettings page loads before authStore.validateToken() has
 * enriched user.tenantId from /rest/user/current.json. accountSettingsApi.get()
 * must:
 *   1. Use tenantId from auth store when available (happy path).
 *   2. Fall back to fetching /rest/user/current.json on-demand when tenantId is
 *      missing, then enrich the auth store and proceed (race-condition fix).
 *   3. Only throw "No tenant ID found" when the fallback also fails to produce
 *      a tenantId (e.g. backend response has no tenantId at all).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { accountSettingsApi, banksApi, dedupeBanksByName, isValidAccountSettings } from '../settings';
import { useAuthStore } from '../../../stores/authStore';
import apiClient, { accountClient } from '../../client';

vi.mock('../../client', () => {
  const apiGet = vi.fn();
  const accountGet = vi.fn();
  return {
    default: {
      get: apiGet,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    accountClient: {
      get: accountGet,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    toQueryString: vi.fn(),
    getCsrfToken: vi.fn(),
    getCsrfTokenForEdit: vi.fn(),
    csrfQueryString: vi.fn(),
  };
});

describe('accountSettingsApi.get() — SOUPFIN-10 race condition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,
    });
  });

  it('uses tenantId from auth store when available (happy path)', async () => {
    // Arrange: auth store already has tenantId
    useAuthStore.setState({
      user: {
        username: 'demo',
        email: 'demo@test.com',
        roles: ['ROLE_USER'],
        tenantId: 'tenant-123',
      },
      isAuthenticated: true,
      isInitialized: true,
    });
    const mockSettings = { id: 'tenant-123', name: 'Acme', currency: 'USD' };
    vi.mocked(accountClient.get).mockResolvedValue({ data: mockSettings });

    // Act
    const result = await accountSettingsApi.get();

    // Assert: fetched from /account/show/{tenantId}.json; no fallback call
    expect(accountClient.get).toHaveBeenCalledWith('/account/show/tenant-123.json');
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(result).toEqual(mockSettings);
  });

  it('falls back to /user/current.json when tenantId is missing, then loads settings', async () => {
    // Arrange: auth store user exists but tenantId is missing (race condition)
    useAuthStore.setState({
      user: {
        username: 'demo',
        email: 'demo@test.com',
        roles: ['ROLE_USER'],
        // tenantId intentionally omitted
      },
      isAuthenticated: true,
      isInitialized: false,
    });
    const mockSettings = { id: 'tenant-late', name: 'LateTenant', currency: 'GHS' };
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { username: 'demo', tenantId: 'tenant-late' },
    });
    vi.mocked(accountClient.get).mockResolvedValue({ data: mockSettings });

    // Act
    const result = await accountSettingsApi.get();

    // Assert: fallback fetch happened, settings loaded with resolved tenantId
    expect(apiClient.get).toHaveBeenCalledWith('/user/current.json');
    expect(accountClient.get).toHaveBeenCalledWith('/account/show/tenant-late.json');
    expect(result).toEqual(mockSettings);

    // Assert: auth store enriched with tenantId for subsequent callers
    expect(useAuthStore.getState().user?.tenantId).toBe('tenant-late');
  });

  it('throws when neither store nor /user/current.json provides tenantId', async () => {
    // Arrange: no user in store and backend doesn't return tenantId either
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isInitialized: true,
    });
    vi.mocked(apiClient.get).mockResolvedValue({ data: { username: 'demo' } });

    // Act & Assert
    await expect(accountSettingsApi.get()).rejects.toThrow(
      'No tenant ID found. User session may not be fully initialized.'
    );
    // No settings fetch attempted when tenantId can't be resolved
    expect(accountClient.get).not.toHaveBeenCalled();
  });

  it('does not enrich auth store when user is null after fallback', async () => {
    // Arrange: no user but tenantId comes back — should not crash trying to spread null
    useAuthStore.setState({ user: null, isAuthenticated: false, isInitialized: false });
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { username: 'demo', tenantId: 'tenant-z' },
    });
    vi.mocked(accountClient.get).mockResolvedValue({
      data: { id: 'tenant-z', name: 'Z' },
    });

    // Act
    await accountSettingsApi.get();

    // Assert: settings still load; store user remains null (no spread on null)
    expect(useAuthStore.getState().user).toBeNull();
    expect(accountClient.get).toHaveBeenCalledWith('/account/show/tenant-z.json');
  });
});

/**
 * SOUPFIN-23: A backend session expiry makes /account/show return a 302 redirect to
 * the TAS login page. The browser follows it and the request resolves 200 with the
 * login HTML (a string) or a non-account object. accountSettingsApi.get() must treat
 * that as a load failure (throw) so the page can surface the error banner and lock the
 * form — instead of rendering a blank, editable form the user could Save over.
 */
describe('accountSettingsApi.get() — SOUPFIN-23 redirect-to-login detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        username: 'demo',
        email: 'demo@test.com',
        roles: ['ROLE_USER'],
        tenantId: 'tenant-123',
      },
      isAuthenticated: true,
      isInitialized: true,
      error: null,
    });
  });

  it('throws when the response is the login page HTML (a string, not an Account)', async () => {
    // A followed 302 to /login returns an HTML document as the body.
    vi.mocked(accountClient.get).mockResolvedValue({
      data: '<!DOCTYPE html><html><body>Sign in</body></html>',
    });

    await expect(accountSettingsApi.get()).rejects.toThrow(/session may have expired/i);
  });

  it('throws when the response is an object with no account id', async () => {
    // Some proxies return an empty/marker object rather than HTML on redirect.
    vi.mocked(accountClient.get).mockResolvedValue({ data: {} });

    await expect(accountSettingsApi.get()).rejects.toThrow(/could not be loaded/i);
  });

  it('throws when the response is null', async () => {
    vi.mocked(accountClient.get).mockResolvedValue({ data: null });

    await expect(accountSettingsApi.get()).rejects.toThrow(/could not be loaded/i);
  });

  it('returns the settings unchanged for a valid Account payload', async () => {
    const mockSettings = { id: 'tenant-123', name: 'Acme', currency: 'USD' };
    vi.mocked(accountClient.get).mockResolvedValue({ data: mockSettings });

    const result = await accountSettingsApi.get();
    expect(result).toEqual(mockSettings);
  });
});

/**
 * SOUPFIN-23: direct coverage for the isValidAccountSettings type guard so the
 * redirect-detection rule is pinned independent of the network layer.
 */
describe('isValidAccountSettings (SOUPFIN-23 type guard)', () => {
  it('accepts an object with a non-empty string id', () => {
    expect(isValidAccountSettings({ id: 'abc', name: 'X' })).toBe(true);
  });

  it('rejects HTML strings, null, arrays, and id-less / empty-id objects', () => {
    expect(isValidAccountSettings('<html></html>')).toBe(false);
    expect(isValidAccountSettings(null)).toBe(false);
    expect(isValidAccountSettings(undefined)).toBe(false);
    expect(isValidAccountSettings([])).toBe(false);
    expect(isValidAccountSettings([{ id: 'abc' }])).toBe(false);
    expect(isValidAccountSettings({ name: 'no-id' })).toBe(false);
    expect(isValidAccountSettings({ id: '' })).toBe(false);
    expect(isValidAccountSettings({ id: 123 })).toBe(false);
  });
});

// Fix (SOUPFIN-30 #10): the Add Bank Account form's bank dropdown was empty.
// banksApi.list() must yield the bank array whether the backend returns a bare
// array or a wrapped envelope, and drop malformed rows.
describe('banksApi.list() — SOUPFIN-30 #10 resilient parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a bare array of banks (with ids) unchanged', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        { id: 'b1', name: 'Absa Bank Ghana Limited' },
        { id: 'b2', name: 'GCB Bank' },
      ],
    });
    const banks = await banksApi.list();
    expect(banks.map((b) => b.name)).toEqual(['Absa Bank Ghana Limited', 'GCB Bank']);
  });

  it('unwraps a { bankList } / { resultList } envelope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { bankList: [{ id: 'b1', name: 'GCB' }] } });
    expect((await banksApi.list()).map((b) => b.id)).toEqual(['b1']);

    vi.mocked(apiClient.get).mockResolvedValue({ data: { resultList: [{ id: 'b9', name: 'Fidelity' }] } });
    expect((await banksApi.list()).map((b) => b.id)).toEqual(['b9']);
  });

  it('drops malformed rows and returns [] for an unexpected shape', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: 'b1', name: 'Ok' }, { name: 'No id' }, null] });
    expect((await banksApi.list()).map((b) => b.id)).toEqual(['b1']);

    vi.mocked(apiClient.get).mockResolvedValue({ data: { unexpected: true } });
    expect(await banksApi.list()).toEqual([]);
  });
});

/**
 * Fix (SOUPFIN-33 #3): the Edit Bank Account form's bank dropdown listed roughly 15
 * copies of every bank. The backend `/rest/bank/index.json` seed table genuinely
 * contains those duplicate rows — each with a DISTINCT id — so de-duplicating by id
 * changes nothing. The dropdown is keyed on what the user reads, so the frontend
 * collapses on the normalised NAME instead.
 *
 * Deliberately conservative: no name-shape heuristics. Near-miss spellings that are
 * plausibly different institutions are kept rather than silently dropped — hiding a
 * real bank is a worse failure than showing one extra option.
 */
describe('dedupeBanksByName() — SOUPFIN-33 #3 duplicate bank options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collapses ~15 duplicates per bank down to one option each, first occurrence wins', () => {
    // Reproduces the reported shape: the same two banks repeated 15x with unique ids.
    const banks = Array.from({ length: 15 }, (_, i) => [
      { id: `gcb-${i}`, name: 'GCB Bank' },
      { id: `absa-${i}`, name: 'Absa Bank Ghana Limited' },
    ]).flat();
    expect(banks).toHaveLength(30);

    const result = dedupeBanksByName(banks);

    expect(result.map((b) => b.name)).toEqual(['GCB Bank', 'Absa Bank Ghana Limited']);
    // First-occurrence-wins keeps the ordering stable across reloads.
    expect(result.map((b) => b.id)).toEqual(['gcb-0', 'absa-0']);
  });

  it('matches case-insensitively and ignores surrounding / repeated whitespace', () => {
    const result = dedupeBanksByName([
      { id: '1', name: 'GCB Bank' },
      { id: '2', name: '  gcb bank  ' },
      { id: '3', name: 'GCB   Bank' },
      { id: '4', name: 'gCb BaNk' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('KEEPS genuinely distinct names that merely look similar', () => {
    // "Access" and "Access Bank (Ghana) Plc" may be different records; dropping
    // either would hide a selectable bank from the user.
    const result = dedupeBanksByName([
      { id: '1', name: 'Access' },
      { id: '2', name: 'Access Bank (Ghana) Plc' },
      { id: '3', name: 'GCB Bank' },
      { id: '4', name: 'GCB Bank Limited' },
    ]);

    expect(result.map((b) => b.name)).toEqual([
      'Access',
      'Access Bank (Ghana) Plc',
      'GCB Bank',
      'GCB Bank Limited',
    ]);
  });

  it('drops rows with a blank, whitespace-only, or missing name', () => {
    const result = dedupeBanksByName([
      { id: '1', name: 'GCB Bank' },
      { id: '2', name: '' },
      { id: '3', name: '   ' },
      { id: '4' } as Parameters<typeof dedupeBanksByName>[0][number],
    ]);

    expect(result.map((b) => b.id)).toEqual(['1']);
  });

  it('passes an empty list and an already-unique list straight through', () => {
    expect(dedupeBanksByName([])).toEqual([]);

    const unique = [
      { id: '1', name: 'GCB Bank' },
      { id: '2', name: 'Fidelity Bank' },
    ];
    expect(dedupeBanksByName(unique)).toEqual(unique);
  });

  it('banksApi.list() de-duplicates a bare array end to end', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        { id: 'b1', name: 'GCB Bank' },
        { id: 'b2', name: 'GCB Bank' },
        { id: 'b3', name: 'Fidelity Bank' },
      ],
    });

    const banks = await banksApi.list();
    expect(banks.map((b) => b.name)).toEqual(['GCB Bank', 'Fidelity Bank']);
  });

  it('banksApi.list() de-duplicates inside a { bankList } envelope too', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        bankList: [
          { id: 'b1', name: 'Absa Bank Ghana Limited' },
          { id: 'b2', name: 'absa bank ghana limited' },
          { id: 'b3', name: '' },
        ],
      },
    });

    const banks = await banksApi.list();
    expect(banks.map((b) => b.id)).toEqual(['b1']);
  });
});
