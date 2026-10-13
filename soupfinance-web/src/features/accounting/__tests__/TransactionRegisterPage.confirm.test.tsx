/**
 * TransactionRegisterPage — confirmation modal for Delete, batch Delete and Reverse (SOUPFIN-164).
 *
 * window.confirm was replaced by the shared ConfirmDialog. Each test drives the full
 * round trip: open the action → the dialog states what will happen → Cancel sends
 * nothing, Confirm calls the endpoint, refreshes the list and shows the toast.
 * window.confirm is spied on and must never be called.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../i18n';
import { ToastProvider } from '../../../components/feedback';
import { TransactionRegisterPage } from '../TransactionRegisterPage';
import { useTransactions, type UnifiedTransaction } from '../../../hooks/useTransactions';
import {
  deleteTransactionGroup,
  deleteVoucher,
  reverseTransactionGroup,
  cancelVoucher,
} from '../../../api/endpoints/ledger';

vi.mock('../../../hooks/useTransactions', () => ({
  useTransactions: vi.fn(),
}));

vi.mock('../../../api/endpoints/ledger', () => ({
  postTransactionGroup: vi.fn(),
  reverseTransactionGroup: vi.fn(),
  deleteTransactionGroup: vi.fn(),
  postVoucher: vi.fn(),
  cancelVoucher: vi.fn(),
  deleteVoucher: vi.fn(),
}));

const tx = (over: Partial<UnifiedTransaction>): UnifiedTransaction => ({
  id: 'tx-1',
  date: '2026-10-01',
  transactionId: 'JE-00001',
  description: 'Office supplies',
  accountCode: '6010',
  accountName: 'Office Expenses',
  debitAmount: 150,
  creditAmount: 0,
  status: 'DRAFT',
  type: 'JOURNAL_ENTRY',
  sourceId: 'grp-1',
  ...over,
});

const DRAFT_JE = tx({});
const DRAFT_VOUCHER = tx({ id: 'tx-2', transactionId: 'PV-00002', type: 'PAYMENT', sourceId: 'v-2' });
const POSTED_JE = tx({ id: 'tx-3', transactionId: 'JE-00003', status: 'POSTED', sourceId: 'grp-3' });

let invalidateSpy: ReturnType<typeof vi.spyOn>;

function renderPage(rows: UnifiedTransaction[]) {
  vi.mocked(useTransactions).mockReturnValue({
    data: rows,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTransactions>);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/accounting/transactions']}>
          <TransactionRegisterPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

async function openRowAction(user: ReturnType<typeof userEvent.setup>, row: UnifiedTransaction, action: RegExp) {
  await user.click(screen.getByTestId(`transaction-actions-${row.id}`));
  await user.click(within(screen.getByTestId(`transaction-dropdown-${row.id}`)).getByRole('button', { name: action }));
}

describe('TransactionRegisterPage confirmation modal (SOUPFIN-164)', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(deleteTransactionGroup).mockResolvedValue(undefined as never);
    vi.mocked(deleteVoucher).mockResolvedValue(undefined as never);
    vi.mocked(reverseTransactionGroup).mockResolvedValue(undefined as never);
    vi.mocked(cancelVoucher).mockResolvedValue(undefined as never);
    confirmSpy = vi.spyOn(window, 'confirm');
  });

  afterEach(() => {
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('Delete asks first, and Cancel deletes nothing', async () => {
    const user = userEvent.setup();
    renderPage([DRAFT_JE]);

    await openRowAction(user, DRAFT_JE, /delete$/i);
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByTestId('transaction-confirm-dialog-title')).toHaveTextContent('Delete transaction JE-00001?');
    expect(within(dialog).getByTestId('transaction-confirm-dialog-message')).toHaveTextContent('You cannot undo this.');
    // Focus starts on Cancel so a stray Enter never deletes
    expect(within(dialog).getByTestId('transaction-confirm-dialog-cancel')).toHaveFocus();

    await user.click(within(dialog).getByTestId('transaction-confirm-dialog-cancel'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteTransactionGroup).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('Escape closes the Delete dialog without deleting', async () => {
    const user = userEvent.setup();
    renderPage([DRAFT_JE]);

    await openRowAction(user, DRAFT_JE, /delete$/i);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteTransactionGroup).not.toHaveBeenCalled();
  });

  it('confirming Delete calls the endpoint for the row type, refreshes the list and reports it', async () => {
    const user = userEvent.setup();
    renderPage([DRAFT_JE, DRAFT_VOUCHER]);

    await openRowAction(user, DRAFT_VOUCHER, /delete$/i);
    await user.click(screen.getByTestId('transaction-confirm-dialog-confirm'));

    await waitFor(() => expect(deleteVoucher).toHaveBeenCalledWith('v-2'));
    expect(deleteTransactionGroup).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
    expect(await screen.findByText('Transaction PV-00002 deleted.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Reverse now asks too, with the warning tone, then reverses the entry', async () => {
    const user = userEvent.setup();
    renderPage([POSTED_JE]);

    await openRowAction(user, POSTED_JE, /reverse$/i);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Reverse transaction JE-00003?');
    expect(within(dialog).getByTestId('transaction-confirm-dialog-confirm')).toHaveTextContent('Reverse');
    expect(reverseTransactionGroup).not.toHaveBeenCalled();

    await user.click(within(dialog).getByTestId('transaction-confirm-dialog-confirm'));
    await waitFor(() => expect(reverseTransactionGroup).toHaveBeenCalledWith('grp-3'));
    expect(await screen.findByText('Transaction JE-00003 reversed.')).toBeInTheDocument();
  });

  it('batch Delete names the count, and confirming deletes every selected row', async () => {
    const user = userEvent.setup();
    renderPage([DRAFT_JE, DRAFT_VOUCHER]);

    await user.click(screen.getByTestId('select-all-checkbox'));
    await user.click(screen.getByTestId('batch-delete-button'));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete 2 transactions?');
    expect(dialog).toHaveTextContent('The 2 selected transactions will be deleted for good.');

    await user.click(within(dialog).getByTestId('transaction-confirm-dialog-confirm'));
    await waitFor(() => expect(deleteTransactionGroup).toHaveBeenCalledWith('grp-1'));
    expect(deleteVoucher).toHaveBeenCalledWith('v-2');
    expect(await screen.findByText('2 transaction(s) deleted.')).toBeInTheDocument();
    expect(screen.queryByTestId('batch-action-bar')).not.toBeInTheDocument();
  });

  it('batch Delete of a single row uses the singular wording', async () => {
    const user = userEvent.setup();
    renderPage([DRAFT_JE]);

    await user.click(screen.getByTestId(`transaction-checkbox-${DRAFT_JE.id}`));
    await user.click(screen.getByTestId('batch-delete-button'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete 1 transaction?');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('The selected transaction will be deleted for good.');
  });

  it('batch Delete across 250 selected rows deletes all of them once (overflow)', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 250 }, (_, i) =>
      tx({ id: `row-${i}`, transactionId: `JE-${String(i).padStart(5, '0')}`, sourceId: `grp-${i}` })
    );
    renderPage(rows);

    // The page shows 10 rows a page; select all on every page
    for (let page = 0; page < 25; page += 1) {
      await user.click(screen.getByTestId('select-all-checkbox'));
      if (page < 24) await user.click(screen.getByTestId('pagination-next'));
    }
    await user.click(screen.getByTestId('batch-delete-button'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete 250 transactions?');

    await user.click(screen.getByTestId('transaction-confirm-dialog-confirm'));
    await waitFor(() => expect(deleteTransactionGroup).toHaveBeenCalledTimes(250));
    expect(new Set(vi.mocked(deleteTransactionGroup).mock.calls.map(([id]) => id)).size).toBe(250);
    expect(await screen.findByText('250 transaction(s) deleted.')).toBeInTheDocument();
  }, 30_000);

  it('a failed delete closes the dialog and explains the cause', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteTransactionGroup).mockRejectedValue({
      isAxiosError: true,
      config: { url: '/ledgerTransactionGroup/delete/grp-1.json' },
      response: { status: 403, data: { error: 'Finance module is not enabled for this tenant' } },
    });
    renderPage([DRAFT_JE]);

    await openRowAction(user, DRAFT_JE, /delete$/i);
    await user.click(screen.getByTestId('transaction-confirm-dialog-confirm'));

    expect(await screen.findByText(/does not have access to the Ledger module/)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the dialog in German when German is selected', async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage('de');
    renderPage([DRAFT_JE]);

    await openRowAction(user, DRAFT_JE, /löschen$/i);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Transaktion JE-00001 löschen?');
    expect(within(dialog).getByTestId('transaction-confirm-dialog-cancel')).toHaveTextContent('Abbrechen');
    expect(within(dialog).getByTestId('transaction-confirm-dialog-confirm')).toHaveTextContent('Löschen');
  });
});
