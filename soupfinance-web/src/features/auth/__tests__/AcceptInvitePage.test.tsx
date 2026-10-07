/**
 * SOUPFIN-101 — the page an invited accountant lands on from the email link.
 *
 * New login: sets a password, which goes to the backend with the token.
 * Existing login: accepts in one click, and no password is sent (it stays unchanged).
 * Spent, cancelled, expired, unknown, or missing token: a clear "no longer valid" page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AcceptInvitePage } from '../AcceptInvitePage';

vi.mock('../../../api/endpoints/registration', () => ({
  getAccountantInvite: vi.fn(),
  acceptAccountantInvite: vi.fn(),
}));

import { getAccountantInvite, acceptAccountantInvite } from '../../../api/endpoints/registration';

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const pendingNew = {
  status: 'PENDING' as const,
  email: 'ama@ledgerworks.example',
  firstName: 'Ama',
  companyName: 'Acme Trading Ltd',
  existingUser: false,
};

describe('AcceptInvitePage (SOUPFIN-101)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('new accountant: names the company, requires a strong matching password, then accepts', async () => {
    vi.mocked(getAccountantInvite).mockResolvedValue(pendingNew);
    vi.mocked(acceptAccountantInvite).mockResolvedValue({ success: true, username: 'ama@ledgerworks.example' });
    renderAt('/accept-invite?token=tok-123');

    expect(await screen.findByText('Join Acme Trading Ltd on SoupFinance')).toBeInTheDocument();
    expect(getAccountantInvite).toHaveBeenCalledWith('tok-123');
    expect(screen.getByTestId('accept-invite-intro')).toHaveTextContent('Set a password to create your login.');
    expect(screen.getByLabelText('Email')).toHaveValue('ama@ledgerworks.example');

    const submit = screen.getByRole('button', { name: 'Accept and create login' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId('accept-invite-password-input'), { target: { value: 'weak' } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId('accept-invite-password-input'), { target: { value: 'Ledger2026' } });
    fireEvent.change(screen.getByTestId('accept-invite-confirm-password-input'), { target: { value: 'Ledger2027' } });
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId('accept-invite-confirm-password-input'), { target: { value: 'Ledger2026' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(acceptAccountantInvite).toHaveBeenCalledWith({
        token: 'tok-123',
        password: 'Ledger2026',
        confirmPassword: 'Ledger2026',
      })
    );
    expect(await screen.findByTestId('accept-invite-success')).toHaveTextContent(
      'Sign in with ama@ledgerworks.example to start working on Acme Trading Ltd’s books.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
  });

  it('existing login: no password fields, and only the token is sent', async () => {
    vi.mocked(getAccountantInvite).mockResolvedValue({ ...pendingNew, existingUser: true });
    vi.mocked(acceptAccountantInvite).mockResolvedValue({ success: true, username: 'ama@ledgerworks.example' });
    renderAt('/accept-invite?token=tok-9');

    expect(await screen.findByTestId('accept-invite-intro')).toHaveTextContent(
      'You already have a SoupFinance login (ama@ledgerworks.example). Accept to add Acme Trading Ltd to it.'
    );
    expect(screen.queryByTestId('accept-invite-password-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() => expect(acceptAccountantInvite).toHaveBeenCalledWith({ token: 'tok-9' }));
    expect(await screen.findByTestId('accept-invite-success')).toBeInTheDocument();
  });

  it('shows the backend refusal and stays on the form', async () => {
    vi.mocked(getAccountantInvite).mockResolvedValue({ ...pendingNew, existingUser: true });
    vi.mocked(acceptAccountantInvite).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: 'Switching companies is coming soon.' } },
    });
    renderAt('/accept-invite?token=tok');
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByTestId('accept-invite-error')).toHaveTextContent('Switching companies is coming soon.');
    expect(screen.queryByTestId('accept-invite-success')).not.toBeInTheDocument();
  });

  it('a success:false body is treated as a failure, not a success', async () => {
    vi.mocked(getAccountantInvite).mockResolvedValue({ ...pendingNew, existingUser: true });
    vi.mocked(acceptAccountantInvite).mockResolvedValue({ success: false, message: 'Invitation already used.' });
    renderAt('/accept-invite?token=tok');
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByTestId('accept-invite-error')).toHaveTextContent('Invitation already used.');
  });

  it.each([
    ['REVOKED', 'Acme Trading Ltd cancelled this invitation. Ask them to send a new one.'],
    ['EXPIRED', 'This invitation has expired. Ask Acme Trading Ltd to send it again.'],
    ['ACCEPTED', 'You’ve already accepted this invitation. Sign in to continue.'],
  ] as const)('invite %s: explains why the link no longer works', async (status, reason) => {
    vi.mocked(getAccountantInvite).mockResolvedValue({ ...pendingNew, status });
    renderAt('/accept-invite?token=tok');
    expect(await screen.findByText('This invitation is no longer valid')).toBeInTheDocument();
    expect(screen.getByTestId('accept-invite-invalid-reason')).toHaveTextContent(reason);
    expect(screen.queryByTestId('accept-invite-form')).not.toBeInTheDocument();
  });

  it('a 410 carrying the status reads the reason from the error body', async () => {
    vi.mocked(getAccountantInvite).mockRejectedValue({
      isAxiosError: true,
      response: { status: 410, data: { status: 'REVOKED', message: 'Gone' } },
    });
    renderAt('/accept-invite?token=tok');
    expect(await screen.findByTestId('accept-invite-invalid-reason')).toHaveTextContent(/cancelled this invitation/);
  });

  it('an unknown token (404) gets the generic invalid-link message', async () => {
    vi.mocked(getAccountantInvite).mockRejectedValue({ isAxiosError: true, response: { status: 404, data: {} } });
    renderAt('/accept-invite?token=nope');
    expect(await screen.findByTestId('accept-invite-invalid-reason')).toHaveTextContent(/isn’t valid/);
  });

  it('no token at all: never calls the backend', async () => {
    renderAt('/accept-invite');
    expect(await screen.findByTestId('accept-invite-invalid')).toBeInTheDocument();
    expect(getAccountantInvite).not.toHaveBeenCalled();
  });

  it('a very long company name and email wrap instead of overflowing', async () => {
    const longName = 'Very Long Company Name '.repeat(10).trim();
    vi.mocked(getAccountantInvite).mockResolvedValue({
      ...pendingNew,
      companyName: longName,
      email: `${'x'.repeat(200)}@firm.example`,
      existingUser: true,
    });
    renderAt('/accept-invite?token=tok');
    const heading = await screen.findByTestId('accept-invite-heading');
    expect(heading).toHaveTextContent(longName);
    expect(heading).toHaveClass('break-words');
    expect(screen.getByTestId('accept-invite-intro')).toHaveClass('break-words');
  });
});
