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

  it('renders @username + "No email on file" when emailContacts is missing', async () => {
    vi.mocked(agentApi.list).mockResolvedValue([
      makeAgent({
        userAccess: { id: 1, username: 'ada', enabled: true },
      }),
    ]);

    renderPage();

    expect(await screen.findByText('@ada')).toBeInTheDocument();
    expect(screen.getByText('No email on file')).toBeInTheDocument();
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
