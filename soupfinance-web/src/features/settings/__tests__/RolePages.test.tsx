/**
 * SOUPFIN-102: Settings → Roles (list + permission-matrix editor).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RoleListPage from '../RoleListPage';
import RoleFormPage from '../RoleFormPage';
import { useAuthStore } from '../../../stores/authStore';
import { allPermissionAuthorities } from '../../../permissions/catalog';
import type { SbRole, SbRoleGroup } from '../../../types/settings';

vi.mock('../../../api/endpoints/settings', () => ({
  roleGroupApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  rolesApi: { list: vi.fn() },
}));
vi.mock('../../../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { roleGroupApi, rolesApi } from '../../../api/endpoints/settings';

// Every catalogued permission seeded on the "server", ids 100+
const SEEDED_ROLES: SbRole[] = [
  { id: 1, authority: 'ROLE_ADMIN' },
  { id: 2, authority: 'ROLE_USER' },
  ...allPermissionAuthorities().map((authority, i) => ({ id: 100 + i, authority })),
];
const idOf = (authority: string) => SEEDED_ROLES.find((r) => r.authority === authority)!.id;

const ADMINISTRATORS: SbRoleGroup = { id: 1, name: 'Administrators', tenantId: null, authorities: [SEEDED_ROLES[0]] };
const SALES: SbRoleGroup = {
  id: 7,
  name: 'Sales',
  tenantId: 'tenant-1',
  builtIn: false,
  authorities: [
    { id: idOf('ROLE_PERM_INVOICES_VIEW'), authority: 'ROLE_PERM_INVOICES_VIEW' },
    { id: idOf('ROLE_PERM_INVOICES_CREATE'), authority: 'ROLE_PERM_INVOICES_CREATE' },
  ],
};

function signInAs(roles: string[]) {
  useAuthStore.setState({
    user: { username: 'u', email: 'u@test.com', roles, tenantId: 'tenant-1' },
    isAuthenticated: true,
    isInitialized: true,
  });
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings/roles" element={<RoleListPage />} />
          <Route path="/settings/roles/new" element={<RoleFormPage />} />
          <Route path="/settings/roles/:id" element={<RoleFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function makeAxiosError(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    config: { url: '/sbRoleGroup/save.json' },
    response: { status, data },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(['ROLE_ADMIN']);
  vi.mocked(rolesApi.list).mockResolvedValue(SEEDED_ROLES);
});

describe('RoleListPage', () => {
  it('lists built-in and custom roles; only custom ones can be deleted', async () => {
    vi.mocked(roleGroupApi.list).mockResolvedValue([ADMINISTRATORS, SALES]);
    renderAt('/settings/roles');

    expect(await screen.findByTestId('role-row-7')).toBeInTheDocument();
    expect(screen.getByTestId('role-builtin-badge-1')).toHaveTextContent('Built-in');
    expect(screen.queryByTestId('role-delete-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('role-delete-7')).toBeInTheDocument();
    expect(screen.getByTestId('role-permission-count-7')).toHaveTextContent('2 permissions');
    expect(screen.getByTestId('role-list-new-button')).toBeInTheDocument();
  });

  it('deletes a custom role after confirmation and refreshes the list', async () => {
    vi.mocked(roleGroupApi.list).mockResolvedValueOnce([ADMINISTRATORS, SALES]).mockResolvedValueOnce([ADMINISTRATORS]);
    vi.mocked(roleGroupApi.delete).mockResolvedValue(undefined);
    renderAt('/settings/roles');

    await userEvent.click(await screen.findByTestId('role-delete-7'));
    expect(screen.getByTestId('role-delete-dialog')).toHaveTextContent('Delete the Sales role?');
    await userEvent.click(screen.getByTestId('role-delete-confirm'));

    await waitFor(() => expect(screen.queryByTestId('role-row-7')).not.toBeInTheDocument());
    expect(vi.mocked(roleGroupApi.delete).mock.calls[0][0]).toMatchObject({ id: 7 });
    expect(screen.queryByTestId('role-delete-dialog')).not.toBeInTheDocument();
  });

  it('shows the permission message when the server refuses a delete', async () => {
    vi.mocked(roleGroupApi.list).mockResolvedValue([ADMINISTRATORS, SALES]);
    vi.mocked(roleGroupApi.delete).mockRejectedValue(
      makeAxiosError(403, { code: 'PERMISSION_DENIED', error: 'Your role does not allow you to delete roles.' })
    );
    renderAt('/settings/roles');
    await userEvent.click(await screen.findByTestId('role-delete-7'));
    await userEvent.click(screen.getByTestId('role-delete-confirm'));
    expect(await screen.findByTestId('role-delete-error')).toHaveTextContent('Your role does not allow you to delete roles.');
  });

  it('hides New and Delete from a user whose role only lets them view settings', async () => {
    signInAs(['ROLE_USER', 'ROLE_PERM_SETTINGS_VIEW']);
    vi.mocked(roleGroupApi.list).mockResolvedValue([ADMINISTRATORS, SALES]);
    renderAt('/settings/roles');
    expect(await screen.findByTestId('role-row-7')).toBeInTheDocument();
    expect(screen.queryByTestId('role-list-new-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('role-delete-7')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no roles', async () => {
    vi.mocked(roleGroupApi.list).mockResolvedValue([]);
    renderAt('/settings/roles');
    expect(await screen.findByTestId('role-list-empty')).toHaveTextContent('No roles yet');
  });

  it('renders a 403 list failure as a permission error, not an empty list', async () => {
    vi.mocked(roleGroupApi.list).mockRejectedValue(
      makeAxiosError(403, { timestamp: 1, status: 403, error: 'Forbidden', path: '/rest/sbRoleGroup/index.json' })
    );
    renderAt('/settings/roles');
    const error = await screen.findByTestId('role-list-error');
    expect(error).toHaveAttribute('data-error-kind', 'forbidden');
    expect(screen.getByTestId('role-list-error-title')).toHaveTextContent('You do not have permission');
  });

  it('renders 200 roles without dropping any (overflow)', async () => {
    const many: SbRoleGroup[] = Array.from({ length: 200 }, (_, i) => ({
      id: 1000 + i,
      name: `Team ${i} with a deliberately long role name to stress the table layout`,
      tenantId: 'tenant-1',
    }));
    vi.mocked(roleGroupApi.list).mockResolvedValue(many);
    renderAt('/settings/roles');
    await screen.findByTestId('role-row-1199');
    expect(within(screen.getByTestId('role-table')).getAllByRole('row')).toHaveLength(201);
  });
});

describe('RoleFormPage — permission matrix', () => {
  it('creates "Sales: create invoices, no bills" and sends the matching SbRole ids', async () => {
    vi.mocked(roleGroupApi.create).mockResolvedValue({ id: 9, name: 'Sales' });
    vi.mocked(roleGroupApi.list).mockResolvedValue([]);
    renderAt('/settings/roles/new');

    await userEvent.type(await screen.findByTestId('role-form-name'), 'Sales');
    // Ticking Create also ticks View
    await userEvent.click(screen.getByTestId('permission-invoices-create'));
    expect(screen.getByTestId('permission-invoices-view')).toBeChecked();
    expect(screen.getByTestId('permission-bills-view')).not.toBeChecked();
    await userEvent.click(screen.getByTestId('role-form-submit'));

    await waitFor(() => expect(roleGroupApi.create).toHaveBeenCalled());
    const payload = vi.mocked(roleGroupApi.create).mock.calls[0][0];
    expect(payload.name).toBe('Sales');
    expect(payload.authorityIds.sort()).toEqual(
      [idOf('ROLE_PERM_INVOICES_VIEW'), idOf('ROLE_PERM_INVOICES_CREATE')].sort()
    );
    // Back on the list after saving
    expect(await screen.findByTestId('role-list-page')).toBeInTheDocument();
  });

  it('clearing View clears the row', async () => {
    renderAt('/settings/roles/new');
    await userEvent.click(await screen.findByTestId('permission-bills-approve'));
    expect(screen.getByTestId('permission-bills-view')).toBeChecked();
    await userEvent.click(screen.getByTestId('permission-bills-view'));
    expect(screen.getByTestId('permission-bills-approve')).not.toBeChecked();
  });

  it('refuses to save with no name and no permissions (zero)', async () => {
    renderAt('/settings/roles/new');
    await userEvent.click(await screen.findByTestId('role-form-submit'));
    expect(await screen.findByTestId('role-form-name-error')).toHaveTextContent('Enter a name for this role');
    expect(screen.getByTestId('role-form-permissions-error')).toHaveTextContent('Tick at least one permission');
    expect(roleGroupApi.create).not.toHaveBeenCalled();
  });

  it('refuses a name over 100 characters (overflow)', async () => {
    renderAt('/settings/roles/new');
    await userEvent.type(await screen.findByTestId('role-form-name'), 'x'.repeat(101));
    await userEvent.click(screen.getByTestId('permission-reports-view'));
    await userEvent.click(screen.getByTestId('role-form-submit'));
    expect(await screen.findByTestId('role-form-name-error')).toHaveTextContent('100 characters or fewer');
    expect(roleGroupApi.create).not.toHaveBeenCalled();
  });

  it('grants every cell at once and sends all 33 ids', async () => {
    vi.mocked(roleGroupApi.create).mockResolvedValue({ id: 9, name: 'Everything' });
    renderAt('/settings/roles/new');
    await userEvent.type(await screen.findByTestId('role-form-name'), 'Everything');
    for (const box of screen.getAllByRole('checkbox')) {
      if (!(box as HTMLInputElement).checked) await userEvent.click(box);
    }
    await userEvent.click(screen.getByTestId('role-form-submit'));
    await waitFor(() => expect(roleGroupApi.create).toHaveBeenCalled());
    expect(vi.mocked(roleGroupApi.create).mock.calls[0][0].authorityIds).toHaveLength(33);
  });

  it('loads an existing role into the matrix and updates it', async () => {
    vi.mocked(roleGroupApi.get).mockResolvedValue(SALES);
    vi.mocked(roleGroupApi.update).mockResolvedValue(SALES);
    vi.mocked(roleGroupApi.list).mockResolvedValue([SALES]);
    renderAt('/settings/roles/7');

    expect(await screen.findByDisplayValue('Sales')).toBeInTheDocument();
    expect(screen.getByTestId('permission-invoices-create')).toBeChecked();
    await userEvent.click(screen.getByTestId('permission-invoices-edit'));
    await userEvent.click(screen.getByTestId('role-form-submit'));

    await waitFor(() => expect(roleGroupApi.update).toHaveBeenCalled());
    const [id, payload] = vi.mocked(roleGroupApi.update).mock.calls[0];
    expect(id).toBe('7');
    expect(payload.authorityIds).toContain(idOf('ROLE_PERM_INVOICES_EDIT'));
  });

  it('opens a built-in role read-only with no save button', async () => {
    vi.mocked(roleGroupApi.get).mockResolvedValue(ADMINISTRATORS);
    renderAt('/settings/roles/1');
    expect(await screen.findByTestId('role-form-builtin-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('role-form-submit')).not.toBeInTheDocument();
    expect(screen.getByTestId('permission-invoices-view')).toBeDisabled();
    expect(screen.getByTestId('role-form-name')).toHaveAttribute('readonly');
  });

  it('disables cells the server has no SbRole for and says so (empty backend)', async () => {
    vi.mocked(rolesApi.list).mockResolvedValue([{ id: 1, authority: 'ROLE_ADMIN' }]);
    renderAt('/settings/roles/new');
    expect(await screen.findByTestId('role-form-missing-permissions')).toHaveTextContent('33 permissions are not set up');
    expect(screen.getByTestId('permission-invoices-view')).toBeDisabled();
  });

  it('shows "You do not have permission" — not "module disabled" — when the save is refused', async () => {
    vi.mocked(roleGroupApi.create).mockRejectedValue(
      makeAxiosError(403, { timestamp: 1, status: 403, error: 'Forbidden', path: '/rest/sbRoleGroup/save.json' })
    );
    renderAt('/settings/roles/new');
    await userEvent.type(await screen.findByTestId('role-form-name'), 'Sales');
    await userEvent.click(screen.getByTestId('permission-invoices-view'));
    await userEvent.click(screen.getByTestId('role-form-submit'));
    const banner = await screen.findByTestId('role-form-save-error');
    expect(banner).toHaveAttribute('data-error-kind', 'forbidden');
    expect(banner).toHaveTextContent('You do not have permission');
    expect(banner).not.toHaveTextContent(/module/i);
  });
});
