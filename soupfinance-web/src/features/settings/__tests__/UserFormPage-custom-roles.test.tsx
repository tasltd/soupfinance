/**
 * SOUPFIN-102: assigning a custom role (SbRoleGroup) to a user.
 *
 * The picker lists only custom roles. It sends `roleGroupIds` (→ Agent.groupAuthorities)
 * ONLY when the admin changed it, so saving a user whose groups were never loaded
 * cannot wipe them, and built-in groups the user already holds are kept.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserFormPage from '../UserFormPage';

vi.mock('../../../api/endpoints/settings', () => ({
  agentApi: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
  accountPersonApi: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
  rolesApi: { list: vi.fn() },
  roleGroupApi: { list: vi.fn() },
}));
vi.mock('../../../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), api: vi.fn(), auth: vi.fn() },
}));

import { agentApi, rolesApi, roleGroupApi } from '../../../api/endpoints/settings';

const BUILT_IN = { id: 1, name: 'Administrators', tenantId: null };
const SALES = { id: 7, name: 'Sales', tenantId: 't1' };
const PURCHASING = { id: 8, name: 'Purchasing', tenantId: 't1' };

const agent = (over: Record<string, unknown> = {}) => ({
  id: 'agent-1',
  firstName: 'Ama',
  lastName: 'Mensah',
  simpleID: 'Ama Mensah, Access:ama.mensah',
  userAccess: { id: 1 },
  authorities: [{ id: 2, authority: 'ROLE_USER' }],
  ...over,
});

function renderEdit() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/settings/users/agent-1']}>
        <Routes>
          <Route path="/settings/users/:id" element={<UserFormPage />} />
          <Route path="/settings/users" element={<div>User list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function submit() {
  await userEvent.click(await screen.findByRole('button', { name: /update user/i }));
  await waitFor(() => expect(agentApi.update).toHaveBeenCalled());
  return vi.mocked(agentApi.update).mock.calls[0][1];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rolesApi.list).mockResolvedValue([
    { id: 2, authority: 'ROLE_USER' },
    { id: 3, authority: 'ROLE_ADMIN' },
  ]);
  vi.mocked(roleGroupApi.list).mockResolvedValue([BUILT_IN, SALES, PURCHASING]);
  vi.mocked(agentApi.update).mockResolvedValue(agent() as never);
});

describe('UserFormPage custom roles (SOUPFIN-102)', () => {
  it('offers only custom roles and pre-ticks the ones the user holds', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(agent({ groupAuthorities: [SALES] }) as never);
    renderEdit();
    expect(await screen.findByTestId('user-form-custom-roles')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('user-form-custom-role-7')).toBeChecked());
    expect(screen.getByTestId('user-form-custom-role-8')).not.toBeChecked();
    expect(screen.queryByTestId('user-form-custom-role-1')).not.toBeInTheDocument();
  });

  it('assigns a custom role and keeps a built-in group the user already had', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(agent({ groupAuthorities: [BUILT_IN] }) as never);
    renderEdit();
    await userEvent.click(await screen.findByTestId('user-form-custom-role-7'));
    const payload = await submit();
    expect(payload.roleGroupIds?.sort()).toEqual([1, 7]);
  });

  it('removes a custom role when unticked', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(agent({ groupAuthorities: SALES }) as never); // single object
    renderEdit();
    const box = await screen.findByTestId('user-form-custom-role-7');
    await waitFor(() => expect(box).toBeChecked());
    await userEvent.click(box);
    const payload = await submit();
    expect(payload.roleGroupIds).toEqual([]);
  });

  it('does not send roleGroupIds when the admin never touched custom roles', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(agent() as never); // groupAuthorities not serialised
    renderEdit();
    await screen.findByTestId('user-form-custom-roles');
    const payload = await submit();
    expect(payload).not.toHaveProperty('roleGroupIds');
  });

  it('hides the section when the tenant has no custom roles', async () => {
    vi.mocked(roleGroupApi.list).mockResolvedValue([BUILT_IN]);
    vi.mocked(agentApi.get).mockResolvedValue(agent() as never);
    renderEdit();
    await screen.findByRole('button', { name: /update user/i });
    expect(screen.queryByTestId('user-form-custom-roles')).not.toBeInTheDocument();
  });
});
