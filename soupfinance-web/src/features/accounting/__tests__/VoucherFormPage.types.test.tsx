/**
 * Unit tests for the four voucher types on the voucher form (SOUPFIN-157).
 *
 * Covers, for each of PAYMENT / RECEIPT / CONTRA / JOURNAL:
 *   - the route opens the right type
 *   - the debit and credit dropdowns offer only the accounts the type allows
 *   - saving sends the chosen accounts as debitAccountId / creditAccountId
 * plus the contra's hidden party section and the same-account refusal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoucherFormPage } from '../VoucherFormPage';
import { createVoucher } from '../../../api/endpoints/ledger';

vi.mock('../../../api/endpoints/ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/endpoints/ledger')>();
  return { ...actual, getVoucher: vi.fn(), updateVoucher: vi.fn(), createVoucher: vi.fn() };
});

vi.mock('../../../hooks/useLedgerAccounts', () => ({
  useLedgerAccounts: () => ({
    data: [
      { id: 'acc-bank', code: '1010', name: 'Bank', ledgerGroup: 'ASSET', isActive: true, balance: 0 },
      { id: 'acc-petty', code: '1020', name: 'Petty Cash', ledgerGroup: 'ASSET', isActive: true, balance: 0 },
      { id: 'acc-payable', code: '2010', name: 'Accounts Payable', ledgerGroup: 'LIABILITY', isActive: true, balance: 0 },
      { id: 'acc-fees', code: '4010', name: 'Consulting Fees', ledgerGroup: 'REVENUE', isActive: true, balance: 0 },
      { id: 'acc-rent', code: '5010', name: 'Rent', ledgerGroup: 'EXPENSE', isActive: true, balance: 0 },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: [] }),
}));

const mockedCreateVoucher = vi.mocked(createVoucher);

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/accounting/voucher/:type" element={<VoucherFormPage />} />
          <Route path="/accounting/transactions" element={<div>Transaction Register</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const optionValues = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value)
    .filter(Boolean);

const CASES = [
  { type: 'PAYMENT', path: 'payment', debitIds: ['acc-rent'], creditIds: ['acc-bank', 'acc-petty'], debit: 'acc-rent', credit: 'acc-bank' },
  { type: 'RECEIPT', path: 'receipt', debitIds: ['acc-bank', 'acc-petty'], creditIds: ['acc-fees'], debit: 'acc-bank', credit: 'acc-fees' },
  { type: 'CONTRA', path: 'contra', debitIds: ['acc-bank', 'acc-petty'], creditIds: ['acc-bank', 'acc-petty'], debit: 'acc-petty', credit: 'acc-bank' },
  {
    type: 'JOURNAL',
    path: 'journal',
    debitIds: ['acc-bank', 'acc-petty', 'acc-payable', 'acc-fees', 'acc-rent'],
    creditIds: ['acc-bank', 'acc-petty', 'acc-payable', 'acc-fees', 'acc-rent'],
    debit: 'acc-payable',
    credit: 'acc-rent',
  },
] as const;

describe('VoucherFormPage — voucher types (SOUPFIN-157)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateVoucher.mockResolvedValue({ id: 'v-new' } as never);
  });

  it('offers exactly four type tabs and no deposit tab', async () => {
    renderAt('/accounting/voucher/payment');
    const tabs = within(await screen.findByTestId('voucher-type-tabs')).getAllByRole('button');
    // Each tab is an icon ligature followed by the label.
    expect(tabs).toHaveLength(4);
    ['Payment Voucher', 'Receipt Voucher', 'Contra Voucher', 'Journal Voucher'].forEach((label, i) => {
      expect(tabs[i].textContent).toContain(label);
    });
    expect(screen.queryByTestId('voucher-type-deposit')).not.toBeInTheDocument();
  });

  it.each(CASES)('$type: filters both sides and saves Dr $debit / Cr $credit', async (c) => {
    const user = userEvent.setup();
    renderAt(`/accounting/voucher/${c.path}`);

    expect(await screen.findByTestId('voucher-form-heading')).toHaveTextContent(`New ${c.type[0]}${c.type.slice(1).toLowerCase()} Voucher`);
    expect(optionValues('voucher-debit-account-select')).toEqual(c.debitIds);
    expect(optionValues('voucher-credit-account-select')).toEqual(c.creditIds);

    await user.type(screen.getByTestId('voucher-notes-input'), `${c.type} voucher`);
    await user.selectOptions(screen.getByTestId('voucher-debit-account-select'), c.debit);
    await user.selectOptions(screen.getByTestId('voucher-credit-account-select'), c.credit);
    const amount = screen.getByTestId('voucher-amount-input');
    await user.clear(amount);
    await user.type(amount, '1250');

    // The preview debits the first account and credits the second.
    expect(screen.getByTestId('voucher-preview-debit-row')).toHaveTextContent(c.debit === 'acc-payable' ? 'Accounts Payable' : /\d{4} - /);
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    await waitFor(() => expect(mockedCreateVoucher).toHaveBeenCalledTimes(1));
    expect(mockedCreateVoucher.mock.calls[0][0]).toMatchObject({
      voucherType: c.type,
      notes: `${c.type} voucher`,
      amount: 1250,
      debitAccountId: c.debit,
      creditAccountId: c.credit,
    });
    expect(await screen.findByText('Transaction Register')).toBeInTheDocument();
  });

  it('CONTRA hides the party section and saves with no outside party', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/voucher/contra');
    await screen.findByTestId('voucher-form-heading');
    expect(screen.queryByTestId('voucher-beneficiary-section')).not.toBeInTheDocument();

    await user.type(screen.getByTestId('voucher-notes-input'), 'Float top-up');
    await user.selectOptions(screen.getByTestId('voucher-debit-account-select'), 'acc-petty');
    await user.selectOptions(screen.getByTestId('voucher-credit-account-select'), 'acc-bank');
    await user.clear(screen.getByTestId('voucher-amount-input'));
    await user.type(screen.getByTestId('voucher-amount-input'), '200');
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    await waitFor(() => expect(mockedCreateVoucher).toHaveBeenCalledTimes(1));
    const request = mockedCreateVoucher.mock.calls[0][0];
    expect(request.voucherTo).toBe('OTHER');
    expect(request.vendorId).toBeUndefined();
    expect(request.clientId).toBeUndefined();
  });

  it('refuses the same account on both sides of a contra', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/voucher/contra');
    await screen.findByTestId('voucher-form-heading');

    await user.type(screen.getByTestId('voucher-notes-input'), 'Nowhere');
    await user.selectOptions(screen.getByTestId('voucher-debit-account-select'), 'acc-bank');
    await user.selectOptions(screen.getByTestId('voucher-credit-account-select'), 'acc-bank');
    await user.clear(screen.getByTestId('voucher-amount-input'));
    await user.type(screen.getByTestId('voucher-amount-input'), '10');
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    expect(await screen.findByText('Debit and credit accounts must be different')).toBeInTheDocument();
    expect(mockedCreateVoucher).not.toHaveBeenCalled();
  });

  it('switching type clears both accounts, since the allowed accounts change', async () => {
    const user = userEvent.setup();
    renderAt('/accounting/voucher/journal');
    await screen.findByTestId('voucher-form-heading');
    await user.selectOptions(screen.getByTestId('voucher-debit-account-select'), 'acc-payable');
    await user.selectOptions(screen.getByTestId('voucher-credit-account-select'), 'acc-rent');

    await user.click(screen.getByTestId('voucher-type-contra'));
    expect(screen.getByTestId('voucher-form-heading')).toHaveTextContent('New Contra Voucher');
    expect(screen.getByTestId('voucher-debit-account-select')).toHaveValue('');
    expect(screen.getByTestId('voucher-credit-account-select')).toHaveValue('');
    expect(optionValues('voucher-debit-account-select')).toEqual(['acc-bank', 'acc-petty']);
  });

  it('a legacy /voucher/deposit link opens a receipt', async () => {
    renderAt('/accounting/voucher/deposit');
    expect(await screen.findByTestId('voucher-form-heading')).toHaveTextContent('New Receipt Voucher');
  });
});
