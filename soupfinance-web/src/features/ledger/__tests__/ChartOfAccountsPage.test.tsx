/**
 * Unit tests for ChartOfAccountsPage account actions (SOUPFIN-149).
 *
 * Verifies:
 *  - "New Account" links to /ledger/accounts/new
 *  - Edit / Delete are hidden for system accounts and when editable/deletable is false
 *  - Delete on an account with no transactions hard-deletes it
 *  - Delete on an account with transactions offers Deactivate (archive) instead
 *  - A failed transaction check only offers Deactivate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChartOfAccountsPage } from '../ChartOfAccountsPage';
import type { LedgerAccount } from '../../../types';

vi.mock('../../../api/endpoints/ledger', async () => {
  const actual = await vi.importActual<typeof import('../../../api/endpoints/ledger')>(
    '../../../api/endpoints/ledger'
  );
  return {
    ...actual,
    listLedgerAccounts: vi.fn(),
    ledgerAccountHasTransactions: vi.fn(),
    deleteLedgerAccount: vi.fn(),
    deactivateLedgerAccount: vi.fn(),
  };
});

import {
  listLedgerAccounts,
  ledgerAccountHasTransactions,
  deleteLedgerAccount,
  deactivateLedgerAccount,
} from '../../../api/endpoints/ledger';

const account = (over: Partial<LedgerAccount>): LedgerAccount => ({
  id: 'x',
  code: '0',
  name: 'X',
  ledgerGroup: 'ASSET',
  isActive: true,
  balance: 0,
  ...over,
});

const accounts: LedgerAccount[] = [
  account({ id: 'plain', code: '1000', name: 'Cash' }),
  account({ id: 'legacy', code: '1010', name: 'Old Bank', editable: null, deletable: null, systemAccount: null }),
  account({ id: 'system', code: '1100', name: 'Accounts Receivable', systemAccount: true }),
  account({ id: 'locked', code: '1200', name: 'Inventory', editable: false, deletable: false }),
  account({ id: 'keep', code: '2000', name: 'Accounts Payable', ledgerGroup: 'LIABILITY', deletable: false }),
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/ledger/accounts']}>
        <Routes>
          <Route path="/ledger/accounts" element={<ChartOfAccountsPage />} />
          <Route path="/ledger/accounts/new" element={<div data-testid="new-route" />} />
          <Route path="/ledger/accounts/:id/edit" element={<div data-testid="edit-route" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ChartOfAccountsPage account actions (SOUPFIN-149)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listLedgerAccounts).mockResolvedValue(accounts);
  });

  it('links New Account to the create form', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('coa-new-account'));
    expect(await screen.findByTestId('new-route')).toBeInTheDocument();
  });

  it('shows actions only where the system flags allow them', async () => {
    renderPage();
    await screen.findByTestId('coa-account-plain');

    expect(screen.getByTestId('coa-edit-plain')).toHaveAttribute('href', '/ledger/accounts/plain/edit');
    expect(screen.getByTestId('coa-delete-plain')).toBeInTheDocument();
    // Null flags on older rows mean the domain defaults: editable and deletable.
    expect(screen.getByTestId('coa-edit-legacy')).toBeInTheDocument();
    expect(screen.getByTestId('coa-delete-legacy')).toBeInTheDocument();

    expect(screen.queryByTestId('coa-edit-system')).not.toBeInTheDocument();
    expect(screen.queryByTestId('coa-delete-system')).not.toBeInTheDocument();
    expect(screen.getByTestId('coa-system-system')).toHaveTextContent('System');

    expect(screen.queryByTestId('coa-edit-locked')).not.toBeInTheDocument();
    expect(screen.queryByTestId('coa-delete-locked')).not.toBeInTheDocument();

    expect(screen.getByTestId('coa-edit-keep')).toBeInTheDocument();
    expect(screen.queryByTestId('coa-delete-keep')).not.toBeInTheDocument();
  });

  it('hard-deletes an account with no transactions', async () => {
    const user = userEvent.setup();
    vi.mocked(ledgerAccountHasTransactions).mockResolvedValue(false);
    vi.mocked(deleteLedgerAccount).mockResolvedValue(undefined);
    renderPage();

    await user.click(await screen.findByTestId('coa-delete-plain'));
    expect(await screen.findByText('Delete Cash?')).toBeInTheDocument();
    expect(ledgerAccountHasTransactions).toHaveBeenCalledWith('plain');

    vi.mocked(listLedgerAccounts).mockResolvedValue(accounts.filter((a) => a.id !== 'plain'));
    await user.click(screen.getByTestId('coa-remove-confirm'));

    await waitFor(() => expect(deleteLedgerAccount).toHaveBeenCalledWith('plain'));
    expect(deactivateLedgerAccount).not.toHaveBeenCalled();
    expect(await screen.findByTestId('coa-notice')).toHaveTextContent('Cash was deleted.');
    await waitFor(() => expect(screen.queryByTestId('coa-account-plain')).not.toBeInTheDocument());
    expect(screen.queryByTestId('coa-remove-dialog')).not.toBeInTheDocument();
  });

  it('deactivates instead of deleting when the account has transactions', async () => {
    const user = userEvent.setup();
    vi.mocked(ledgerAccountHasTransactions).mockResolvedValue(true);
    vi.mocked(deactivateLedgerAccount).mockResolvedValue(account({ id: 'plain', archived: true }));
    renderPage();

    await user.click(await screen.findByTestId('coa-delete-plain'));
    expect(await screen.findByText('Deactivate Cash?')).toBeInTheDocument();
    expect(screen.getByTestId('coa-remove-message')).toHaveTextContent("has transactions, so it can't be deleted");
    expect(screen.getByTestId('coa-remove-confirm')).toHaveTextContent('Deactivate');

    await user.click(screen.getByTestId('coa-remove-confirm'));

    await waitFor(() => expect(deactivateLedgerAccount).toHaveBeenCalledWith('plain'));
    expect(deleteLedgerAccount).not.toHaveBeenCalled();
    expect(await screen.findByTestId('coa-notice')).toHaveTextContent('Cash was deactivated');
  });

  it('only offers Deactivate when the transaction check fails', async () => {
    const user = userEvent.setup();
    vi.mocked(ledgerAccountHasTransactions).mockRejectedValue(
      Object.assign(new Error('boom'), { isAxiosError: true, response: { status: 500, data: {} } })
    );
    renderPage();

    await user.click(await screen.findByTestId('coa-delete-plain'));
    expect(await screen.findByText('Deactivate Cash?')).toBeInTheDocument();
    expect(screen.getByTestId('coa-remove-message')).toHaveTextContent("couldn't check this account");
    expect(deleteLedgerAccount).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the error when the action fails, and Cancel closes it', async () => {
    const user = userEvent.setup();
    vi.mocked(ledgerAccountHasTransactions).mockResolvedValue(false);
    vi.mocked(deleteLedgerAccount).mockRejectedValue(
      Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status: 500, data: {} } })
    );
    renderPage();

    await user.click(await screen.findByTestId('coa-delete-plain'));
    await screen.findByText('Delete Cash?');
    await user.click(screen.getByTestId('coa-remove-confirm'));

    expect(await screen.findByTestId('coa-remove-error')).toBeInTheDocument();
    expect(screen.queryByTestId('coa-notice')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('coa-remove-cancel'));
    expect(screen.queryByTestId('coa-remove-dialog')).not.toBeInTheDocument();
  });

  it('renders actions for every row of a large chart', async () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      account({ id: `a${i}`, code: String(1000 + i), name: `Account ${i}`, systemAccount: i % 3 === 0 })
    );
    vi.mocked(listLedgerAccounts).mockResolvedValue(many);
    renderPage();

    await screen.findByTestId('coa-account-a299');
    expect(screen.getAllByTestId(/^coa-edit-/)).toHaveLength(200);
    expect(screen.getAllByTestId(/^coa-delete-/)).toHaveLength(200);
  });
});
