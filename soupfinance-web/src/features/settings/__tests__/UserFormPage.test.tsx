/**
 * Unit tests for UserFormPage roles section behaviour (SOUPFIN-2 bugs 5, 6, 7, 12).
 *
 * Verifies:
 *  - Loading spinner while roles are being fetched
 *  - Error state + retry button when /rest/sbRole/index.json fails
 *  - No silent ROLE_USER default in the form (Zod still requires ≥1 role)
 *  - Backend error messages surface in the submit-error banner
 *
 * Plus SOUPFIN-45: the Edit form must prefill the username the backend actually
 * sends (inside `simpleID`, never on the shallow `userAccess` FK) so the Update
 * button is not silently blocked by Zod, and any blocked submit must be visible.
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

// ===========================================================================
// SOUPFIN-45 — "Update button on settings/users is not working"
// ===========================================================================

/**
 * Verbatim shape returned by /rest/agent/show/{id}.json on the LXC backend.
 * Measured across 100 agents: `userAccess.username` present 0/100, username
 * recoverable from `simpleID` 100/100, `authorities[].authority` populated 100/100.
 */
const backendAgent = (over: Record<string, unknown> = {}) => ({
  id: 'agent-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  simpleID: 'Ada Lovelace, Access:ada.lovelace',
  userAccess: { id: 1715 }, // shallow Grails FK — NO username
  authorities: [{ id: 3, authority: 'ROLE_ADMIN' }],
  ...over,
});

function renderEditForm(agentId = 'agent-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/settings/users/${agentId}`]}>
        <Routes>
          <Route path="/settings/users/:id" element={<UserFormPage />} />
          <Route path="/settings/users" element={<div>User list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const usernameInput = () => screen.getByPlaceholderText('Login username') as HTMLInputElement;

describe('UserFormPage edit mode (SOUPFIN-45)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rolesApi.list).mockResolvedValue([
      { id: 3, authority: 'ROLE_ADMIN' },
      { id: 2, authority: 'ROLE_USER' },
    ]);
    vi.mocked(agentApi.update).mockResolvedValue(backendAgent() as never);
  });

  it('prefills the username from simpleID when userAccess carries no username', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(backendAgent() as never);

    renderEditForm();

    await screen.findByDisplayValue('Ada');
    // Before the fix this was '' — which failed Zod min(3) and blocked submit.
    expect(usernameInput().value).toBe('ada.lovelace');
  });

  it('fires the update request and sends the recovered username (full round-trip)', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(backendAgent() as never);
    const user = userEvent.setup();

    renderEditForm();
    await screen.findByDisplayValue('Ada');

    await user.click(screen.getByTestId('user-form-submit-button'));

    // The regression this ticket is about: the request must actually be sent...
    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    // ...and carry the right id and payload, not merely have been called.
    const [sentId, payload] = vi.mocked(agentApi.update).mock.calls[0];
    expect(sentId).toBe('agent-1');
    expect(payload).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada.lovelace',
      roles: ['ROLE_ADMIN'],
    });
  });

  it('prefers userAccess.username when the backend does supply it', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({ userAccess: { id: 1715, username: 'direct.name' } }) as never
    );

    renderEditForm();
    await screen.findByDisplayValue('Ada');
    expect(usernameInput().value).toBe('direct.name');
  });

  it('resolves roles that arrive as `serialised` only (SOUPFIN-24 shape)', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({ authorities: [{ id: 3, serialised: 'SbRole(authority:ROLE_ADMIN)' }] }) as never
    );
    const user = userEvent.setup();

    renderEditForm();
    await screen.findByDisplayValue('Ada');

    // The Administrator box must come back checked, and submit must still go through
    // — an unresolved role would leave `[undefined]` and fail Zod on an ARRAY ELEMENT.
    expect((screen.getByRole('checkbox', { name: /Administrator/ }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByTestId('user-form-submit-button'));
    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(agentApi.update).mock.calls[0][1]).toMatchObject({ roles: ['ROLE_ADMIN'] });
  });

  // --- the blocked-submit must never be silent again ----------------------
  it('shows a banner naming the blocking field when the username is unrecoverable', async () => {
    // Neither userAccess.username nor a parsable simpleID — genuinely un-submittable.
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({ simpleID: 'Ada Lovelace', userAccess: { id: 1715 } }) as never
    );
    const user = userEvent.setup();

    renderEditForm();
    await screen.findByDisplayValue('Ada');
    expect(usernameInput().value).toBe('');

    await user.click(screen.getByTestId('user-form-submit-button'));

    // No request — correct, the data really is invalid...
    expect(agentApi.update).not.toHaveBeenCalled();
    // ...but the user MUST be told why, next to the button they pressed.
    const banner = await screen.findByTestId('user-form-submit-error');
    expect(banner.textContent).toMatch(/Username/i);
    expect(banner.textContent).toMatch(/at least 3 characters/i);
  });

  it('reports every blocking field at once, not just the first', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({ simpleID: 'Ada Lovelace', firstName: '', authorities: [] }) as never
    );
    const user = userEvent.setup();

    renderEditForm();
    await screen.findByDisplayValue('Lovelace');

    await user.click(screen.getByTestId('user-form-submit-button'));

    const banner = await screen.findByTestId('user-form-submit-error');
    expect(banner.textContent).toMatch(/First name/i);
    expect(banner.textContent).toMatch(/Username/i);
    expect(banner.textContent).toMatch(/Roles/i);
  });

  it('clears the blocked-submit banner once the form is corrected and submits', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({ simpleID: 'Ada Lovelace', userAccess: { id: 1715 } }) as never
    );
    const user = userEvent.setup();

    renderEditForm();
    await screen.findByDisplayValue('Ada');

    await user.click(screen.getByTestId('user-form-submit-button'));
    await screen.findByTestId('user-form-submit-error');

    await user.type(usernameInput(), 'ada.lovelace');
    await user.click(screen.getByTestId('user-form-submit-button'));

    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(agentApi.update).mock.calls[0][1]).toMatchObject({ username: 'ada.lovelace' });
  });

  // --- EXCESS end ---------------------------------------------------------
  it('submits an unusually long username without truncating it', async () => {
    const long = `a${'x'.repeat(200)}`;
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({ simpleID: `Ada Lovelace, Access:${long}` }) as never
    );
    const user = userEvent.setup();

    renderEditForm();
    await screen.findByDisplayValue('Ada');
    expect(usernameInput().value).toBe(long);

    await user.click(screen.getByTestId('user-form-submit-button'));
    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(agentApi.update).mock.calls[0][1]).toMatchObject({ username: long });
  });

  it('submits every selected role when the agent holds many at once', async () => {
    vi.mocked(rolesApi.list).mockResolvedValue([
      { id: 3, authority: 'ROLE_ADMIN' },
      { id: 2, authority: 'ROLE_USER' },
      { id: 4, authority: 'ROLE_INVOICE' },
      { id: 5, authority: 'ROLE_BILL' },
      { id: 6, authority: 'ROLE_VENDOR' },
    ]);
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({
        authorities: [
          { id: 3, authority: 'ROLE_ADMIN' },
          { id: 2, authority: 'ROLE_USER' },
          { id: 4, authority: 'ROLE_INVOICE' },
          { id: 5, authority: 'ROLE_BILL' },
          { id: 6, authority: 'ROLE_VENDOR' },
        ],
      }) as never
    );
    const user = userEvent.setup();

    renderEditForm();
    await screen.findByDisplayValue('Ada');

    await user.click(screen.getByTestId('user-form-submit-button'));
    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(agentApi.update).mock.calls[0][1]).toMatchObject({
      roles: ['ROLE_ADMIN', 'ROLE_USER', 'ROLE_INVOICE', 'ROLE_BILL', 'ROLE_VENDOR'],
    });
  });

  it('surfaces a backend failure on update instead of failing silently', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(backendAgent() as never);
    vi.mocked(agentApi.update).mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { message: 'Agent update failed on the server' } },
      message: 'Server Error',
    });
    const user = userEvent.setup();

    renderEditForm();
    await screen.findByDisplayValue('Ada');

    await user.click(screen.getByTestId('user-form-submit-button'));

    const banner = await screen.findByTestId('user-form-submit-error');
    expect(banner.textContent).toMatch(/Agent update failed on the server/);
  });
});
