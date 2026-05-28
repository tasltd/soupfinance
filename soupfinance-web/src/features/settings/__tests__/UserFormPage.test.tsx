/**
 * Unit tests for UserFormPage roles section behaviour (SOUPFIN-2 bugs 5, 6, 7, 12).
 *
 * Verifies:
 *  - Loading spinner while roles are being fetched
 *  - Error state + retry button when /rest/sbRole/index.json fails
 *  - No silent ROLE_USER default in the form (Zod still requires ≥1 role)
 *  - Backend error messages surface in the submit-error banner
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserFormPage from '../UserFormPage';

vi.mock('../../../api/endpoints/settings', () => ({
  agentApi: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
  accountPersonApi: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
  rolesApi: { list: vi.fn() },
}));

// Block the logger so test output is quiet
vi.mock('../../../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), api: vi.fn(), auth: vi.fn() },
}));

import { agentApi, rolesApi } from '../../../api/endpoints/settings';

function renderForm() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/settings/users/new']}>
        <UserFormPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UserFormPage roles section (SOUPFIN-2 bugs 5, 6, 12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading indicator while roles are being fetched', async () => {
    vi.mocked(rolesApi.list).mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves — keeps the query in pending state */
        })
    );

    renderForm();

    expect(await screen.findByTestId('user-form-roles-loading')).toBeInTheDocument();
  });

  it('shows the backend error and a retry button when /sbRole/index.json fails', async () => {
    vi.mocked(rolesApi.list).mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { message: 'Model variable sbRoleList rendering failure' } },
      message: 'Server Error',
    });

    renderForm();

    // Allow the hook's retry: 1 to play out before the error state appears
    const errorBlock = await screen.findByTestId('user-form-roles-error', {}, { timeout: 5000 });
    expect(errorBlock).toBeInTheDocument();
    expect(errorBlock.textContent).toMatch(/Model variable sbRoleList rendering failure/);
    expect(screen.getByTestId('user-form-roles-retry')).toBeInTheDocument();
    // Submit must be disabled when roles can't load — saving would 500 server-side
    expect(screen.getByTestId('user-form-submit-button')).toBeDisabled();
  });

  it('renders role checkboxes when /sbRole/index.json succeeds', async () => {
    vi.mocked(rolesApi.list).mockResolvedValue([
      { id: 1, authority: 'ROLE_ADMIN' },
      { id: 2, authority: 'ROLE_USER' },
      { id: 3, authority: 'ROLE_ACCOUNT' },
    ]);

    renderForm();

    expect(await screen.findByText(/Administrator/)).toBeInTheDocument();
    expect(screen.getByText(/^User$/)).toBeInTheDocument();
    // ROLE_ACCOUNT is not in SoupFinance's RELEVANT_ROLES — filtered out
    expect(screen.queryByText(/^Account$/)).not.toBeInTheDocument();
    // Submit is enabled now that roles loaded successfully
    expect(screen.getByTestId('user-form-submit-button')).not.toBeDisabled();
  });

  it('does NOT pre-check ROLE_USER for new users (bug 12)', async () => {
    vi.mocked(rolesApi.list).mockResolvedValue([
      { id: 1, authority: 'ROLE_ADMIN' },
      { id: 2, authority: 'ROLE_USER' },
    ]);

    renderForm();
    await screen.findByText(/^User$/);

    const checkboxes = screen.getAllByRole('checkbox');
    // None of the role checkboxes should start checked — user must consciously pick
    checkboxes.forEach((cb) => {
      expect((cb as HTMLInputElement).checked).toBe(false);
    });
  });

  it('shows the backend error message in the submit-error banner', async () => {
    vi.mocked(rolesApi.list).mockResolvedValue([
      { id: 2, authority: 'ROLE_USER' },
    ]);
    vi.mocked(agentApi.create).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          message:
            "No signature of method: soupbroker.security.SbUserSbRole.exists() is applicable for argument types: (null, Long) values: [null, 4]",
        },
      },
      message: 'Server Error',
    });

    const user = userEvent.setup();
    renderForm();

    await screen.findByText(/^User$/);

    // Fill required fields
    await user.type(screen.getByPlaceholderText('Enter first name'), 'Ada');
    await user.type(screen.getByPlaceholderText('Enter last name'), 'Lovelace');
    await user.type(screen.getByPlaceholderText('Login username'), 'alovelace');
    await user.type(screen.getByPlaceholderText('Enter password'), 'secret123');
    // Pick the User role
    await user.click(screen.getByRole('checkbox', { name: /User/ }));

    await user.click(screen.getByTestId('user-form-submit-button'));

    const banner = await screen.findByTestId('user-form-submit-error');
    expect(banner.textContent).toMatch(/SbUserSbRole\.exists\(\)/);
  });
});
