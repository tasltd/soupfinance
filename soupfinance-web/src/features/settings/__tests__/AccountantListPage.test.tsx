/**
 * SOUPFIN-101 — Settings → Users → Accountants tab.
 *
 * Covers the invite / resend / revoke round trips against a mocked API module, the
 * states the list can be in (loading, empty, not-yet-available 404, server error,
 * mixed statuses, 200 rows), and the client-side guards that stop a duplicate invite.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../components/feedback/ToastProvider';
import AccountantListPage from '../AccountantListPage';
import type { AccountantInvite } from '../../../types/settings';
import {
  getAccountantInviteStatus,
  canResendAccountantInvite,
  canRevokeAccountantInvite,
  accountantDisplayName,
} from '../../../types/settings';

vi.mock('../../../api/endpoints/settings', () => ({
  accountantInviteApi: {
    list: vi.fn(),
    invite: vi.fn(),
    resend: vi.fn(),
    revoke: vi.fn(),
  },
}));

import { accountantInviteApi } from '../../../api/endpoints/settings';

const FUTURE = '2999-01-01T00:00:00Z';
const PAST = '2000-01-01T00:00:00Z';

function invite(overrides: Partial<AccountantInvite> = {}): AccountantInvite {
  return {
    id: 'inv-1',
    email: 'ama@ledgerworks.example',
    firstName: 'Ama',
    lastName: 'Owusu',
    status: 'PENDING',
    dateCreated: '2026-10-01T09:00:00Z',
    lastSentAt: '2026-10-01T09:00:00Z',
    expiresAt: FUTURE,
    ...overrides,
  };
}

function axiosError(status: number, data: Record<string, unknown> = {}) {
  return { isAxiosError: true, response: { status, data }, config: { url: '/accountantInvite/index.json' } };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/settings/users/accountants']}>
          <AccountantListPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('AccountantListPage (SOUPFIN-101)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list states', () => {
    it('shows both sub-tabs with Accountants as the current one', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValue([]);
      renderPage();
      const accountantsTab = screen.getByRole('link', { name: 'Accountants' });
      expect(accountantsTab).toHaveAttribute('href', '/settings/users/accountants');
      expect(accountantsTab).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Team members' })).not.toHaveAttribute('aria-current');
      await screen.findByTestId('accountant-list-empty');
    });

    it('zero invites: shows the empty state with a way to invite', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValue([]);
      renderPage();
      const empty = await screen.findByTestId('accountant-list-empty');
      expect(within(empty).getByText('No accountants yet')).toBeInTheDocument();
      fireEvent.click(within(empty).getByRole('button', { name: 'Invite accountant' }));
      expect(screen.getByTestId('accountant-invite-dialog')).toBeInTheDocument();
    });

    it('404 (backend not shipped): says the feature is not available and hides Invite', async () => {
      vi.mocked(accountantInviteApi.list).mockRejectedValue(axiosError(404));
      renderPage();
      const unavailable = await screen.findByTestId('accountant-list-unavailable');
      expect(within(unavailable).getByText('Accountant access isn’t available yet')).toBeInTheDocument();
      expect(screen.queryByTestId('accountant-invite-button')).not.toBeInTheDocument();
      expect(screen.queryByText(/status code/i)).not.toBeInTheDocument();
    });

    it('500: shows the shared error card with Retry, not an empty table', async () => {
      vi.mocked(accountantInviteApi.list).mockRejectedValue(axiosError(500, { message: 'Database is down' }));
      renderPage();
      const errorCard = await screen.findByTestId('accountant-list-error');
      expect(within(errorCard).getByText('Database is down')).toBeInTheDocument();
      expect(screen.queryByTestId('accountant-list-empty')).not.toBeInTheDocument();
      vi.mocked(accountantInviteApi.list).mockResolvedValue([]);
      fireEvent.click(within(errorCard).getByRole('button', { name: /retry/i }));
      await screen.findByTestId('accountant-list-empty');
    });

    it('shows each status with the actions that make sense for it', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValue([
        invite({ id: 'p', status: 'PENDING' }),
        invite({ id: 'a', status: 'ACCEPTED', email: 'kofi@firm.example', firstName: 'Kofi', lastName: 'Boateng' }),
        invite({ id: 'r', status: 'REVOKED', email: 'old@firm.example', firstName: null, lastName: null }),
        invite({ id: 'e', status: 'PENDING', expiresAt: PAST, email: 'late@firm.example' }),
      ]);
      renderPage();
      await screen.findByTestId('accountant-table');

      expect(screen.getByTestId('accountant-status-p')).toHaveTextContent('Pending');
      expect(screen.getByTestId('accountant-resend-p')).toBeInTheDocument();
      expect(screen.getByTestId('accountant-revoke-p')).toHaveTextContent('Cancel');

      expect(screen.getByTestId('accountant-status-a')).toHaveTextContent('Active');
      expect(screen.queryByTestId('accountant-resend-a')).not.toBeInTheDocument();
      expect(screen.getByTestId('accountant-revoke-a')).toHaveTextContent('Remove access');

      expect(screen.getByTestId('accountant-status-r')).toHaveTextContent('Revoked');
      expect(screen.queryByTestId('accountant-resend-r')).not.toBeInTheDocument();
      expect(screen.queryByTestId('accountant-revoke-r')).not.toBeInTheDocument();
      // No name given: the email stands in, once.
      expect(within(screen.getByTestId('accountant-row-r')).getAllByText('old@firm.example')).toHaveLength(1);

      // Expired on the client clock even though the row still says PENDING.
      expect(screen.getByTestId('accountant-status-e')).toHaveTextContent('Expired');
      expect(screen.getByTestId('accountant-resend-e')).toBeInTheDocument();
    });

    it('renders 200 invites and truncates a very long address instead of widening the table', async () => {
      const longEmail = `${'a'.repeat(200)}@firm.example`;
      vi.mocked(accountantInviteApi.list).mockResolvedValue(
        Array.from({ length: 200 }, (_, i) =>
          invite({ id: `inv-${i}`, email: i === 0 ? longEmail : `acct${i}@firm.example`, firstName: null, lastName: null })
        )
      );
      renderPage();
      const table = await screen.findByTestId('accountant-table');
      expect(within(table).getAllByRole('row')).toHaveLength(201); // header + 200
      expect(screen.getByText(longEmail)).toHaveClass('truncate');
    });
  });

  describe('invite', () => {
    it('sends the invite, closes the dialog, toasts, and reloads the list', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValueOnce([]).mockResolvedValue([invite()]);
      vi.mocked(accountantInviteApi.invite).mockResolvedValue(invite());
      renderPage();
      fireEvent.click(await screen.findByTestId('accountant-invite-button'));

      fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ama@ledgerworks.example' } });
      fireEvent.change(screen.getByLabelText('First name (optional)'), { target: { value: 'Ama' } });
      fireEvent.change(screen.getByLabelText('Last name (optional)'), { target: { value: 'Owusu' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

      await waitFor(() =>
        expect(accountantInviteApi.invite).toHaveBeenCalledWith({
          email: 'ama@ledgerworks.example',
          firstName: 'Ama',
          lastName: 'Owusu',
        })
      );
      expect(await screen.findByText('Invitation sent to ama@ledgerworks.example.')).toBeInTheDocument();
      expect(screen.queryByTestId('accountant-invite-dialog')).not.toBeInTheDocument();
      expect(await screen.findByTestId('accountant-row-inv-1')).toBeInTheDocument();
      expect(accountantInviteApi.list).toHaveBeenCalledTimes(2);
    });

    it('blocks an empty or malformed email without calling the API', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValue([]);
      renderPage();
      fireEvent.click(await screen.findByTestId('accountant-invite-button'));

      fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
      expect(screen.getByTestId('accountant-email-error')).toHaveTextContent('Enter the accountant’s email address.');

      fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'not-an-email' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
      expect(screen.getByTestId('accountant-email-error')).toHaveTextContent(/valid email address/);
      expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');
      expect(accountantInviteApi.invite).not.toHaveBeenCalled();

      // Editing the address clears the stale message.
      fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ama@ledgerworks.example' } });
      expect(screen.queryByTestId('accountant-email-error')).not.toBeInTheDocument();
    });

    it('blocks a second invite to someone already pending or active (case-insensitive)', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValue([
        invite({ id: 'p', email: 'ama@ledgerworks.example' }),
        invite({ id: 'a', status: 'ACCEPTED', email: 'kofi@firm.example' }),
      ]);
      renderPage();
      fireEvent.click(await screen.findByTestId('accountant-invite-button'));

      fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'AMA@LedgerWorks.example' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
      expect(screen.getByTestId('accountant-email-error')).toHaveTextContent(/already has a pending invitation/);

      fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'kofi@firm.example' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
      expect(screen.getByTestId('accountant-email-error')).toHaveTextContent('This accountant already has access.');
      expect(accountantInviteApi.invite).not.toHaveBeenCalled();
    });

    it('allows re-inviting someone whose access was revoked', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValue([invite({ id: 'r', status: 'REVOKED' })]);
      vi.mocked(accountantInviteApi.invite).mockResolvedValue(invite({ id: 'new' }));
      renderPage();
      fireEvent.click(await screen.findByTestId('accountant-invite-button'));
      fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ama@ledgerworks.example' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
      await waitFor(() => expect(accountantInviteApi.invite).toHaveBeenCalled());
    });

    it('keeps the dialog open and shows the backend message when the invite is refused', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValue([]);
      vi.mocked(accountantInviteApi.invite).mockRejectedValue(
        axiosError(409, { message: 'This email belongs to one of your team members.' })
      );
      renderPage();
      fireEvent.click(await screen.findByTestId('accountant-invite-button'));
      fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'staff@co.example' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

      expect(await screen.findByTestId('accountant-invite-error')).toHaveTextContent(
        'This email belongs to one of your team members.'
      );
      expect(screen.getByTestId('accountant-invite-dialog')).toBeInTheDocument();
    });
  });

  describe('resend and revoke', () => {
    it('resend calls the API for that row and toasts', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValue([invite()]);
      vi.mocked(accountantInviteApi.resend).mockResolvedValue(invite({ sendCount: 2 }));
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Resend invitation to ama@ledgerworks.example' }));

      await waitFor(() => expect(accountantInviteApi.resend).toHaveBeenCalledWith('inv-1'));
      expect(await screen.findByText('Invitation sent again to ama@ledgerworks.example.')).toBeInTheDocument();
    });

    it('resend failure is reported, not swallowed', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValue([invite()]);
      vi.mocked(accountantInviteApi.resend).mockRejectedValue(axiosError(429, { message: 'Too many emails today.' }));
      renderPage();
      fireEvent.click(await screen.findByTestId('accountant-resend-inv-1'));
      expect(await screen.findByText('Too many emails today.')).toBeInTheDocument();
    });

    it('removing an active accountant asks first, names them, then revokes', async () => {
      vi.mocked(accountantInviteApi.list)
        .mockResolvedValueOnce([invite({ status: 'ACCEPTED' })])
        .mockResolvedValue([invite({ status: 'REVOKED' })]);
      vi.mocked(accountantInviteApi.revoke).mockResolvedValue(invite({ status: 'REVOKED' }));
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Remove access for ama@ledgerworks.example' }));

      const dialog = screen.getByTestId('accountant-revoke-dialog');
      expect(within(dialog).getByText('Remove Ama Owusu’s access?')).toBeInTheDocument();
      expect(within(dialog).getByText(/signed out straight away/)).toBeInTheDocument();
      expect(accountantInviteApi.revoke).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove access' }));
      await waitFor(() => expect(accountantInviteApi.revoke).toHaveBeenCalledWith('inv-1'));
      expect(await screen.findByText('Access removed for ama@ledgerworks.example.')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('accountant-status-inv-1')).toHaveTextContent('Revoked'));
    });

    it('cancelling a pending invite uses invitation wording; "Keep invitation" does nothing', async () => {
      vi.mocked(accountantInviteApi.list).mockResolvedValue([invite()]);
      vi.mocked(accountantInviteApi.revoke).mockResolvedValue(invite({ status: 'REVOKED' }));
      renderPage();
      fireEvent.click(await screen.findByTestId('accountant-revoke-inv-1'));
      let dialog = screen.getByTestId('accountant-revoke-dialog');
      expect(within(dialog).getByText('Cancel the invitation to ama@ledgerworks.example?')).toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Keep invitation' }));
      expect(screen.queryByTestId('accountant-revoke-dialog')).not.toBeInTheDocument();
      expect(accountantInviteApi.revoke).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('accountant-revoke-inv-1'));
      dialog = screen.getByTestId('accountant-revoke-dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel invitation' }));
      expect(await screen.findByText('Invitation to ama@ledgerworks.example cancelled.')).toBeInTheDocument();
    });
  });
});

describe('accountant invite helpers (SOUPFIN-101)', () => {
  const now = new Date('2026-10-07T12:00:00Z');

  it('derives EXPIRED only for a pending invite past its expiry', () => {
    expect(getAccountantInviteStatus(invite({ expiresAt: '2026-10-07T11:59:59Z' }), now)).toBe('EXPIRED');
    expect(getAccountantInviteStatus(invite({ expiresAt: '2026-10-07T12:00:01Z' }), now)).toBe('PENDING');
    expect(getAccountantInviteStatus(invite({ expiresAt: null }), now)).toBe('PENDING');
    expect(getAccountantInviteStatus(invite({ expiresAt: 'garbage' }), now)).toBe('PENDING');
    expect(getAccountantInviteStatus(invite({ status: 'ACCEPTED', expiresAt: PAST }), now)).toBe('ACCEPTED');
  });

  it('offers resend for unaccepted invites and revoke for anything still live', () => {
    expect(['PENDING', 'EXPIRED'].every((s) => canResendAccountantInvite(s as never))).toBe(true);
    expect(['ACCEPTED', 'REVOKED'].some((s) => canResendAccountantInvite(s as never))).toBe(false);
    expect(['PENDING', 'ACCEPTED', 'EXPIRED'].every((s) => canRevokeAccountantInvite(s as never))).toBe(true);
    expect(canRevokeAccountantInvite('REVOKED')).toBe(false);
  });

  it('names an accountant by full name, partial name, or email', () => {
    expect(accountantDisplayName(invite())).toBe('Ama Owusu');
    expect(accountantDisplayName(invite({ lastName: null }))).toBe('Ama');
    expect(accountantDisplayName(invite({ firstName: '', lastName: '' }))).toBe('ama@ledgerworks.example');
  });
});
