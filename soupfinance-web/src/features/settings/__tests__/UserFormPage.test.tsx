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


// ---------------------------------------------------------------------------
// SOUPFIN-45: the "Update User" button on /settings/users/:id fired NO request.
//
// Root cause, verified against the live LXC backend (50/50 agents): the backend
// serialises `Agent.userAccess` as a SHALLOW FK — `{ id, class }` with no
// `username`. The form seeded `username` from `userAccess.username`, so it was
// ALWAYS ''. Zod's `username: z.string().min(3)` then failed, react-hook-form
// refused to call onSubmit, and no HTTP request was ever sent.
//
// The login username is only recoverable from `simpleID`
// ("First Last, Access:the.username") — the recovery UserListPage has done since
// SOUPFIN-30 #9 and UserFormPage was missing.
//
// Fixtures below use the REAL backend shape. Using `{ username }` here would mask
// the bug entirely, which is how it survived the existing suite.
// ---------------------------------------------------------------------------

/** Renders the form on the EDIT route so `useParams().id` is populated. */
function renderEditForm(id = 'agent-1') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/settings/users/${id}`]}>
        <Routes>
          <Route path="/settings/users/:id" element={<UserFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const ROLES_FIXTURE = [
  { id: 1, authority: 'ROLE_ADMIN' },
  { id: 2, authority: 'ROLE_USER' },
];

/**
 * Mirrors an actual /rest/agent/show/{id}.json response: shallow userAccess FK,
 * null contact collections, username only present inside simpleID.
 */
function backendAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    firstName: 'Ama',
    lastName: 'Mensah',
    otherNames: null,
    designation: null,
    address: null,
    emailContacts: null,
    phoneContacts: null,
    accountPerson: null,
    archived: null,
    disabled: null,
    userAccess: { id: 1715, class: 'soupbroker.security.SbUser' },
    simpleID: 'Ama Mensah, Access:ama.mensah',
    authorities: [{ id: 2, tenantId: 't1', authority: 'ROLE_USER' }],
    ...overrides,
  };
}

/** Waits for the edit form to finish loading the user into its fields. */
async function waitForLoadedEditForm() {
  const button = await screen.findByTestId('user-form-submit-button');
  await waitFor(() => expect(button).toBeEnabled());
  await screen.findByDisplayValue('Ama');
  return button;
}

describe('UserFormPage update submission (SOUPFIN-45)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rolesApi.list).mockResolvedValue(ROLES_FIXTURE as never);
    vi.mocked(agentApi.update).mockResolvedValue({ id: 'agent-1' } as never);
  });

  it('fires the update request for a real backend payload (shallow userAccess FK)', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(backendAgent() as never);

    const user = userEvent.setup();
    renderEditForm();
    await user.click(await waitForLoadedEditForm());

    // Full round-trip: request sent AND carrying the recovered username + roles
    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    const [sentId, sentData] = vi.mocked(agentApi.update).mock.calls[0];
    expect(sentId).toBe('agent-1');
    expect(sentData.username).toBe('ama.mensah');
    expect(sentData.firstName).toBe('Ama');
    expect(sentData.lastName).toBe('Mensah');
    expect(sentData.roles).toEqual(['ROLE_USER']);
  });

  it('displays the recovered username in the form field', async () => {
    // The user must be able to SEE which login they are editing — a blank box was
    // the visible symptom of the same defect.
    vi.mocked(agentApi.get).mockResolvedValue(backendAgent() as never);

    renderEditForm();
    await waitForLoadedEditForm();

    expect(screen.getByDisplayValue('ama.mensah')).toBeInTheDocument();
  });

  it('prefers an explicit userAccess.username when the backend does send one', async () => {
    // Must not regress the shape the code originally expected.
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({
        userAccess: { id: 1715, username: 'explicit.name' },
        simpleID: 'Ama Mensah, Access:stale.simpleid',
      }) as never
    );

    const user = userEvent.setup();
    renderEditForm();
    await user.click(await waitForLoadedEditForm());

    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(agentApi.update).mock.calls[0][1].username).toBe('explicit.name');
  });

  it('submits edited values, not the values the form loaded with', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(backendAgent() as never);

    const user = userEvent.setup();
    renderEditForm();
    const button = await waitForLoadedEditForm();

    const firstName = screen.getByDisplayValue('Ama');
    await user.clear(firstName);
    await user.type(firstName, 'Akosua');
    await user.click(screen.getByRole('checkbox', { name: /Administrator/ }));
    await user.click(button);

    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(agentApi.update).mock.calls[0][1];
    expect(sent.firstName).toBe('Akosua');
    expect(sent.roles).toEqual(expect.arrayContaining(['ROLE_USER', 'ROLE_ADMIN']));
    expect(sent.roles).toHaveLength(2);
  });

  it('resolves roles that arrive serialised-only, with no `authority` field', async () => {
    // EDGE: the SbRole shape recorded in SOUPFIN-24. The reset() mapping read
    // `role.authority` raw, which would seed `[undefined]` and block submit for the
    // same reason — the one raw `.authority` read left in the app.
    vi.mocked(rolesApi.list).mockResolvedValue([
      { id: 1, serialised: 'SbRole(authority:ROLE_ADMIN)' },
      { id: 2, serialised: 'SbRole(authority:ROLE_USER)' },
    ] as never);
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({ authorities: [{ id: 2, serialised: 'SbRole(authority:ROLE_USER)' }] }) as never
    );

    const user = userEvent.setup();
    renderEditForm();
    const button = await waitForLoadedEditForm();

    // Assert the pre-checked box BEFORE submitting — a successful save navigates
    // away and unmounts the form.
    expect(
      (screen.getByRole('checkbox', { name: /^User/ }) as HTMLInputElement).checked
    ).toBe(true);

    await user.click(button);

    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(agentApi.update).mock.calls[0][1].roles).toEqual(['ROLE_USER']);
  });

  it('drops unresolvable authorities instead of poisoning the roles array', async () => {
    // EDGE: a role object with neither `authority` nor a parseable `serialised`.
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({
        authorities: [{ id: 9, serialised: 'SbRole(id:9)' }, { id: 2, authority: 'ROLE_USER' }],
      }) as never
    );

    const user = userEvent.setup();
    renderEditForm();
    await user.click(await waitForLoadedEditForm());

    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(agentApi.update).mock.calls[0][1].roles).toEqual(['ROLE_USER']);
  });

  it('handles a very long username without truncating what it submits', async () => {
    // EDGE (excess): usernames are unbounded on the backend side.
    const long = `${'a'.repeat(150)}.user`;
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({ simpleID: `Ama Mensah, Access:${long}` }) as never
    );

    const user = userEvent.setup();
    renderEditForm();
    await user.click(await waitForLoadedEditForm());

    await waitFor(() => expect(agentApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(agentApi.update).mock.calls[0][1].username).toBe(long);
  });

  it('explains a blocked submit instead of silently doing nothing', async () => {
    // EDGE + regression guard: when the username genuinely cannot be recovered the
    // form must still REFUSE loudly. A silent refusal is the bug being fixed.
    vi.mocked(agentApi.get).mockResolvedValue(
      backendAgent({ userAccess: { id: 1715 }, simpleID: 'Ama Mensah' }) as never
    );

    const user = userEvent.setup();
    renderEditForm();
    await user.click(await waitForLoadedEditForm());

    const banner = await screen.findByTestId('user-form-submit-error');
    expect(banner.textContent).toMatch(/Username/i);
    expect(banner.textContent).toMatch(/at least 3 characters/i);
    expect(agentApi.update).not.toHaveBeenCalled();
  });

  it('shows a visible roles message when the user deselects every role', async () => {
    // EDGE (absence): the old renderer printed an EMPTY paragraph for element-level
    // errors, so a blocked submit looked like a dead button.
    vi.mocked(agentApi.get).mockResolvedValue(backendAgent() as never);

    const user = userEvent.setup();
    renderEditForm();
    const button = await waitForLoadedEditForm();

    await user.click(screen.getByRole('checkbox', { name: /^User/ })); // uncheck
    await user.click(button);

    const message = await screen.findByTestId('user-form-roles-validation-error');
    expect(message.textContent?.trim()).toBeTruthy();
    expect(message.textContent).toMatch(/at least one role/i);
    expect(agentApi.update).not.toHaveBeenCalled();
  });

  it('handles a user with no authorities at all without crashing', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(backendAgent({ authorities: null }) as never);

    const user = userEvent.setup();
    renderEditForm();
    await user.click(await waitForLoadedEditForm());

    const message = await screen.findByTestId('user-form-roles-validation-error');
    expect(message.textContent).toMatch(/at least one role/i);
    expect(agentApi.update).not.toHaveBeenCalled();
  });

  it('surfaces the backend error when the update request itself fails', async () => {
    vi.mocked(agentApi.get).mockResolvedValue(backendAgent() as never);
    vi.mocked(agentApi.update).mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { message: 'Agent update failed: tenant mismatch' } },
      message: 'Server Error',
    });

    const user = userEvent.setup();
    renderEditForm();
    await user.click(await waitForLoadedEditForm());

    const banner = await screen.findByTestId('user-form-submit-error');
    expect(banner.textContent).toMatch(/Failed to update user/);
    expect(banner.textContent).toMatch(/tenant mismatch/);
  });
});
