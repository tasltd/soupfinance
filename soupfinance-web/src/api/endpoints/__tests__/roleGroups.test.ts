/**
 * SOUPFIN-102: roleGroupApi (custom roles) and the agent payload's custom-role binding.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { roleGroupApi, agentApi } from '../settings';
import apiClient, { getCsrfToken, csrfQueryString } from '../../client';

vi.mock('../../client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  accountClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toQueryString: vi.fn(() => ''),
  getCsrfToken: vi.fn(),
  getCsrfTokenForEdit: vi.fn(),
  csrfQueryString: vi.fn(),
  normalizeToArray: (v: unknown) => (v == null ? [] : Array.isArray(v) ? v : [v]),
}));

const csrf = { SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/sbRoleGroup/create' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCsrfToken).mockResolvedValue(csrf);
  vi.mocked(csrfQueryString).mockReturnValue('SYNCHRONIZER_TOKEN=tok&SYNCHRONIZER_URI=%2FsbRoleGroup%2Fcreate');
});

describe('roleGroupApi', () => {
  it('lists every role group sorted by name', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: 1, name: 'Sales', tenantId: 't1' }] });
    const groups = await roleGroupApi.list();
    expect(apiClient.get).toHaveBeenCalledWith('/sbRoleGroup/index.json?max=1000&sort=name&order=asc');
    expect(groups).toEqual([{ id: 1, name: 'Sales', tenantId: 't1' }]);
  });

  it('creates with a CSRF token and FK references for authorities', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 7, name: 'Sales' } });
    const created = await roleGroupApi.create({ name: '  Sales  ', authorityIds: [10, 11] });
    expect(getCsrfToken).toHaveBeenCalledWith('sbRoleGroup');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/sbRoleGroup/save.json?SYNCHRONIZER_TOKEN=tok&SYNCHRONIZER_URI=%2FsbRoleGroup%2Fcreate',
      { name: 'Sales', authorities: [{ id: 10 }, { id: 11 }] }
    );
    expect(created).toEqual({ id: 7, name: 'Sales' });
  });

  it('updates with PUT to /update/{id} and no CSRF token', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 7, name: 'Sales team' } });
    await roleGroupApi.update(7, { name: 'Sales team', authorityIds: [] });
    expect(getCsrfToken).not.toHaveBeenCalled();
    expect(apiClient.put).toHaveBeenCalledWith('/sbRoleGroup/update/7.json', {
      id: 7,
      name: 'Sales team',
      authorities: [],
    });
  });

  it('deletes a custom role', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: null });
    await roleGroupApi.delete({ id: 7, tenantId: 't1', builtIn: false });
    expect(apiClient.delete).toHaveBeenCalledWith('/sbRoleGroup/delete/7.json');
  });

  it.each([
    ['flagged built in', { id: 1, tenantId: 't1', builtIn: true }],
    ['system-wide (no tenant)', { id: 2, tenantId: null }],
    ['tenant unknown', { id: 3 }],
  ])('refuses to delete a built-in role (%s) without sending a request', async (_label, group) => {
    await expect(roleGroupApi.delete(group)).rejects.toThrow('Built-in roles cannot be deleted.');
    expect(apiClient.delete).not.toHaveBeenCalled();
  });
});

describe('agentApi custom-role binding (SOUPFIN-102)', () => {
  const base = { firstName: 'Ama', lastName: 'Mensah', username: 'ama', roles: ['ROLE_USER'] };

  it('sends groupAuthorities when roleGroupIds is set', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    vi.mocked(getCsrfToken).mockResolvedValue(csrf);
    await agentApi.update('a1', { ...base, roleGroupIds: [7, 8] });
    const payload = vi.mocked(apiClient.put).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.groupAuthorities).toEqual([{ id: 7 }, { id: 8 }]);
  });

  it('sends an empty list when every custom role was removed', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    await agentApi.update('a1', { ...base, roleGroupIds: [] });
    const payload = vi.mocked(apiClient.put).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.groupAuthorities).toEqual([]);
  });

  it('omits groupAuthorities entirely when roleGroupIds is not set, so existing groups survive', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    await agentApi.update('a1', base);
    const payload = vi.mocked(apiClient.put).mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('groupAuthorities');
  });
});
