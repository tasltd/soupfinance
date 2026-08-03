/**
 * Unit tests for UserListPage email / role / status display (SOUPFIN-2 bug 10).
 *
 * Pre-fix, rows for users without `emailContacts` and `authorities` rendered
 * "-" for both columns. These tests pin down the new fallback behaviour:
 *  - email column shows "@username" when no emailContacts but userAccess exists
 *  - role column shows a "No role" pill (not a dash) when authorities is empty
 *  - completely missing contact info shows an italicized placeholder
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserListPage from '../UserListPage';
import type { Agent } from '../../../types/settings';

vi.mock('../../../api/endpoints/settings', () => ({
  agentApi: {
    list: vi.fn(),
    delete: vi.fn(),
  },
}));

import { agentApi } from '../../../api/endpoints/settings';

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    ...overrides,
  } as Agent;
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UserListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UserListPage row display (SOUPFIN-2 bug 10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Changed (SOUPFIN-33 #5): the secondary "No email on file" line contradicted the
  // identifier rendered right above it. Once the column resolves a username the row
  // must show ONLY that — no conflicting "missing" note.
  it('renders @username alone (no "No email on file") when emailContacts is missing', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({
        userAccess: { id: 1, username: 'ada', enabled: true },
      }),
    ]);

    renderPage();

    expect(await screen.findByText('@ada')).toBeInTheDocument();
    expect(screen.queryByText('No email on file')).not.toBeInTheDocument();
  });

  it('recovers the username from simpleID and still omits the "No email" note', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({ simpleID: 'Ada Lovelace, Access:ada.lovelace' }),
    ]);

    renderPage();

    expect(await screen.findByText('@ada.lovelace')).toBeInTheDocument();
    expect(screen.queryByText('No email on file')).not.toBeInTheDocument();
  });

  it('still reports missing contact info when there is NO email AND no username', async () => {
    // Regression guard: dropping the secondary note must not swallow the genuinely
    // empty case, which has no identifier to show at all.
    vi.mocked(agentApi.list).mockResolvedValue([makeAgent()]);

    renderPage();

    expect(await screen.findByText('No contact info')).toBeInTheDocument();
    expect(screen.queryByText('No email on file')).not.toBeInTheDocument();
  });

  it('renders email when emailContacts is present and hides username when same', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({
        emailContacts: [{ id: 'ec-1', email: 'ada@example.com' }],
        userAccess: { id: 1, username: 'ada@example.com', enabled: true },
      }),
    ]);

    renderPage();

    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
    // Secondary @username line should NOT appear when it would duplicate email
    expect(screen.queryByText('@ada@example.com')).not.toBeInTheDocument();
  });

  it('renders email + @username as secondary when they differ', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({
        emailContacts: [{ id: 'ec-1', email: 'ada@example.com' }],
        userAccess: { id: 1, username: 'alovelace', enabled: true },
      }),
    ]);

    renderPage();

    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('@alovelace')).toBeInTheDocument();
  });

  // Fix (SOUPFIN-30 #9): the backend serialises userAccess as a shallow FK
  // ({ id, class }) with NO username on the agent list response — the username
  // is only recoverable from `simpleID` ("First Last, Access:username"). The
  // column must show that username, never the job title (designation).
  it('recovers @username from simpleID when userAccess has no username', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({
        designation: 'Compliance Officer',
        userAccess: { id: 9 }, // shallow FK — no username
        simpleID: 'Ada Lovelace, Access:ada.lovelace',
      }),
    ]);

    renderPage();

    expect(await screen.findByText('@ada.lovelace')).toBeInTheDocument();
    // The designation must NOT be used as the contact value.
    expect(screen.queryByText('Compliance Officer')?.textContent).not.toBe('@ada.lovelace');
  });

  it('renders italic "No contact info" when nothing is available', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([makeAgent({})]);

    renderPage();

    const placeholder = await screen.findByText('No contact info');
    expect(placeholder).toBeInTheDocument();
    // Should be italicized — visual cue that data is missing not just empty
    expect(placeholder.className).toContain('italic');
  });

  it('shows a "No role" warning pill when authorities is empty', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({
        userAccess: { id: 1, username: 'ada', enabled: true },
        authorities: [],
      }),
    ]);

    renderPage();

    const noRole = await screen.findByText('No role');
    expect(noRole).toBeInTheDocument();
  });

  it('lists role labels when authorities exist', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({
        userAccess: { id: 1, username: 'ada', enabled: true },
        authorities: [
          { id: 1, authority: 'ROLE_ADMIN' },
          { id: 2, authority: 'ROLE_USER' },
        ],
      }),
    ]);

    renderPage();

    expect(await screen.findByText(/Administrator/)).toBeInTheDocument();
    expect(screen.queryByText('No role')).not.toBeInTheDocument();
  });

  // Regression tests for SOUPFIN-24: the page crashed with
  // "Cannot read properties of undefined (reading 'replace')" when the backend
  // returned role objects without an `authority` field, only `serialised`.
  it('does not crash and resolves roles from `serialised` when authority is absent', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({
        userAccess: { id: 1, username: 'ada', enabled: true },
        // Shape the backend actually returns: no `authority`, only `serialised`
        authorities: [
          { id: 4, serialised: 'SbRole(authority:ROLE_USER)' },
          { id: 5, serialised: 'SbRole(authority:ROLE_ADMIN)' },
        ] as Agent['authorities'],
      }),
    ]);

    renderPage();

    // Renders the friendly labels parsed out of `serialised` (joined in one cell)
    // — and no "No role" pill
    expect(await screen.findByText('User, Administrator')).toBeInTheDocument();
    expect(screen.queryByText('No role')).not.toBeInTheDocument();
  });

  it('falls back to the "No role" pill when a role has neither authority nor serialised', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({
        userAccess: { id: 1, username: 'ada', enabled: true },
        // Malformed role object — must not crash, must render "No role"
        authorities: [{ id: 9 }] as Agent['authorities'],
      }),
    ]);

    renderPage();

    // Row still renders (name visible) and the role column shows the warning pill
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('No role')).toBeInTheDocument();
  });

  it('handles a mix of resolvable and unresolvable roles without crashing', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({
        userAccess: { id: 1, username: 'ada', enabled: true },
        authorities: [
          { id: 1, authority: 'ROLE_ADMIN' },
          { id: 9 }, // unresolvable — should be skipped, not crash
          { id: 4, serialised: 'SbRole(authority:ROLE_USER)' },
        ] as Agent['authorities'],
      }),
    ]);

    renderPage();

    // Unresolvable role is skipped; resolvable ones still render (joined in one cell)
    expect(await screen.findByText('Administrator, User')).toBeInTheDocument();
    expect(screen.queryByText('No role')).not.toBeInTheDocument();
  });

  it('surfaces the backend error message in the error state', async () => {
    const err = Object.assign(new Error('Backend failure'), {
      isAxiosError: true,
      response: { status: 500, data: { message: 'Backend tenant unresolved' } },
    });
    vi.mocked(agentApi.list).mockRejectedValue(err);

    renderPage();

    const errorBlock = await screen.findByTestId('user-list-error');
    expect(within(errorBlock).getByText(/Backend tenant unresolved/i)).toBeInTheDocument();
  });
});
