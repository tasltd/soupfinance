/**
 * SOUPFIN-102: usePermission() reads `user.roles`. The copy stored at login goes
 * stale when an admin edits the user's role, so validateToken() must replace it
 * with the list /rest/user/current.json returns — and must leave it alone when an
 * older backend omits `roles`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '../authStore';

vi.mock('../../api/auth', () => ({ login: vi.fn(), logout: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock('../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

import apiClient from '../../api/client';

const LOGIN_ROLES = ['ROLE_USER', 'ROLE_PERM_INVOICES_VIEW', 'ROLE_PERM_INVOICES_CREATE'];

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem('access_token', 'tok');
  useAuthStore.setState({
    user: { username: 'sales.rep', email: 's@test.com', roles: [...LOGIN_ROLES], tenantId: 't1' },
    isAuthenticated: true,
    isInitialized: true,
  });
});

describe('validateToken refreshes roles (SOUPFIN-102)', () => {
  it('replaces stale roles with the server list after an admin changes the role', async () => {
    const serverRoles = ['ROLE_USER', 'ROLE_PERM_BILLS_VIEW'];
    vi.mocked(apiClient.get).mockResolvedValue({ data: { username: 'sales.rep', roles: serverRoles, tenantId: 't1' } });

    await expect(useAuthStore.getState().validateToken()).resolves.toBe(true);

    expect(apiClient.get).toHaveBeenCalledWith('/user/current.json');
    expect(useAuthStore.getState().user?.roles).toEqual(serverRoles);
    // Other fields are untouched
    expect(useAuthStore.getState().user?.email).toBe('s@test.com');
  });

  it('removes every permission when the server says the user now has none (zero)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { roles: [] } });
    await useAuthStore.getState().validateToken();
    expect(useAuthStore.getState().user?.roles).toEqual([]);
  });

  it('keeps the stored roles when the backend omits `roles`', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { username: 'sales.rep', tenantId: 't1' } });
    await useAuthStore.getState().validateToken();
    expect(useAuthStore.getState().user?.roles).toEqual(LOGIN_ROLES);
  });

  it('does not rewrite the store when the roles are unchanged (order-insensitive)', async () => {
    const before = useAuthStore.getState().user;
    vi.mocked(apiClient.get).mockResolvedValue({ data: { roles: [...LOGIN_ROLES].reverse() } });
    await useAuthStore.getState().validateToken();
    expect(useAuthStore.getState().user).toBe(before);
  });

  it('copies a large role list without sharing the response array (overflow)', async () => {
    const serverRoles = Array.from({ length: 500 }, (_, i) => `ROLE_X_${i}`);
    vi.mocked(apiClient.get).mockResolvedValue({ data: { roles: serverRoles } });
    await useAuthStore.getState().validateToken();
    const stored = useAuthStore.getState().user?.roles;
    expect(stored).toEqual(serverRoles);
    expect(stored).not.toBe(serverRoles);
  });
});
