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
import { accountSettingsApi } from '../settings';
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
