/**
 * Added (SOUPFIN-158): a journal entry or voucher dated in a closed period.
 *
 * The backend refuses the save with PERIOD_LOCKED. The form must keep the user
 * on the page and put the reason under the date field, not in a generic banner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JournalEntryPage } from '../JournalEntryPage';
import { VoucherFormPage } from '../VoucherFormPage';
import { getTransactionGroup, getVoucher, updateJournalEntry, updateVoucher } from '../../../api/endpoints/ledger';
import type { LedgerTransactionGroup, Voucher } from '../../../types';

vi.mock('../../../api/endpoints/ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/endpoints/ledger')>();
  return {
    ...actual,
    getVoucher: vi.fn(),
    updateVoucher: vi.fn(),
    getTransactionGroup: vi.fn(),
    updateJournalEntry: vi.fn(),
  };
});

vi.mock('../../../hooks/useLedgerAccounts', () => ({
  useLedgerAccounts: () => ({
    data: [
      { id: 'acc-cash', code: '1001', name: 'Cash', ledgerGroup: 'ASSET', isActive: true, balance: 0 },
      { id: 'acc-expense', code: '5001', name: 'Office Expenses', ledgerGroup: 'EXPENSE', isActive: true, balance: 0 },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: [{ id: 'pm-bank', name: 'Bank Transfer' }] }),
}));

const LOCKED = Object.assign(new Error('Request failed with status code 422'), {
  isAxiosError: true,
  config: { url: '/rest/x.json' },
  response: {
    status: 422,
    data: { code: 'PERIOD_LOCKED', error: 'The books are closed up to 31 Dec 2025. Choose a later date.', lockDate: '2025-12-31' },
  },
});

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/accounting/journal-entry/:id/edit" element={<JournalEntryPage />} />
          <Route path="/accounting/vouchers/:id/edit" element={<VoucherFormPage />} />
          <Route path="*" element={<div />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(updateJournalEntry).mockRejectedValue(LOCKED);
  vi.mocked(updateVoucher).mockRejectedValue(LOCKED);
});

describe('locked period on the accounting forms (SOUPFIN-158)', () => {
  it('a journal entry shows the lock under Entry Date and stays on the form', async () => {
    vi.mocked(getTransactionGroup).mockResolvedValue({
      id: 'jg-1',
      groupDate: '2025-11-30',
      description: 'November accrual',
      status: 'DRAFT',
      ledgerTransactionList: [
        { id: 't1', ledgerAccount: { id: 'acc-expense', name: 'Office Expenses' }, amount: 250, transactionState: 'DEBIT' },
        { id: 't2', ledgerAccount: { id: 'acc-cash', name: 'Cash' }, amount: 250, transactionState: 'CREDIT' },
      ],
    } as unknown as LedgerTransactionGroup);
    const user = userEvent.setup();
    renderAt('/accounting/journal-entry/jg-1/edit');

    await waitFor(() => expect(screen.getByTestId('journal-entry-date-input')).toHaveValue('2025-11-30'));
    await user.click(screen.getByTestId('journal-entry-save-draft-button'));

    await waitFor(() => expect(updateJournalEntry).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('The books are closed up to 31 Dec 2025. Choose a later date.')).toBeInTheDocument();
    expect(screen.queryByTestId('journal-entry-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/accounting/journal-entry/jg-1/edit');
  });

  it('a voucher shows the lock under Transaction Date and stays on the form', async () => {
    vi.mocked(getVoucher).mockResolvedValue({
      id: 'voucher-001',
      voucherDate: '2025-11-30',
      voucherType: 'PAYMENT',
      voucherTo: 'OTHER',
      beneficiaryName: 'Landlord',
      description: 'Rent',
      amount: 450,
      status: 'PENDING',
      cashAccount: { id: 'acc-cash' },
      expenseAccount: { id: 'acc-expense' },
    } as unknown as Voucher);
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/voucher-001/edit');

    await waitFor(() => expect(screen.getByTestId('voucher-notes-input')).toHaveValue('Rent'));
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('The books are closed up to 31 Dec 2025. Choose a later date.')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/accounting/vouchers/voucher-001/edit');
  });
});
