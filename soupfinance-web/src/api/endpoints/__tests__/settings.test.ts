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
import { accountSettingsApi, isValidAccountSettings } from '../settings';
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
