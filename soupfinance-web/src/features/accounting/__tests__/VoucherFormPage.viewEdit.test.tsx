/**
 * Unit tests for opening an existing voucher (SOUPFIN-154).
 *
 * Before the fix VoucherFormPage ignored the :id in /accounting/vouchers/:id,
 * so View and Edit both showed a blank PAYMENT create form, and saving sent
 * the user to /accounting/vouchers, which was another blank form.
 *
 * These render the page under real routes and assert the round trip:
 * URL -> voucher fetched -> form filled -> save -> update call -> register.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoucherFormPage } from '../VoucherFormPage';
import { createVoucher, getVoucher, updateVoucher } from '../../../api/endpoints/ledger';
import type { Voucher } from '../../../types';

vi.mock('../../../api/endpoints/ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/endpoints/ledger')>();
  return {
    ...actual,
    getVoucher: vi.fn(),
    updateVoucher: vi.fn(),
    createVoucher: vi.fn(),
  };
});

vi.mock('../../../hooks/useLedgerAccounts', () => ({
  useLedgerAccounts: () => ({
    data: [
      { id: 'acc-cash', code: '1001', name: 'Cash', ledgerGroup: 'ASSET', isActive: true, balance: 0 },
      { id: 'acc-expense', code: '5001', name: 'Office Expenses', ledgerGroup: 'EXPENSE', isActive: true, balance: 0 },
      { id: 'acc-revenue', code: '4001', name: 'Service Revenue', ledgerGroup: 'REVENUE', isActive: true, balance: 0 },
    ],
    isLoading: false,
    error: null,
  }),
}));

// Added (SOUPFIN-162): the party fields are selects over these lists.
vi.mock('../../../api/endpoints/vendors', () => ({
  listVendors: vi.fn().mockResolvedValue([{ id: 'vendor-001', name: 'Office Depot' }]),
}));
vi.mock('../../../api/endpoints/clients', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/endpoints/clients')>();
  return {
    ...actual,
    listClients: vi.fn().mockResolvedValue([
      { id: 'client-9', name: 'Ada Ventures', portfolioList: [{ id: 'cp-9', accountServices: { id: 'as-9' } }] },
    ]),
  };
});
vi.mock('../../../api/endpoints/settings', () => ({
  agentApi: { list: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: [{ id: 'pm-bank', name: 'Bank Transfer' }] }),
}));

const mockedGetVoucher = vi.mocked(getVoucher);
const mockedUpdateVoucher = vi.mocked(updateVoucher);
const mockedCreateVoucher = vi.mocked(createVoucher);

const PENDING_PAYMENT = {
  id: 'voucher-001',
  voucherNumber: 'PMT-2024-001',
  voucherDate: '2024-10-21',
  voucherType: 'PAYMENT',
  voucherTo: 'VENDOR',
  vendor: { id: 'vendor-001' },
  description: 'Office supplies payment',
  amount: 450,
  status: 'PENDING',
  cashAccount: { id: 'acc-cash', code: '1001', name: 'Cash' },
  expenseAccount: { id: 'acc-expense', code: '5001', name: 'Office Expenses' },
} as unknown as Voucher;

const POSTED_RECEIPT = {
  id: 'voucher-002',
  voucherNumber: 'RCP-2024-001',
  voucherDate: '2024-10-22',
  voucherType: 'RECEIPT',
  voucherTo: 'CLIENT',
  description: 'Client payment received',
  amount: 5000,
  status: 'POSTED',
  cashAccount: { id: 'acc-cash' },
  incomeAccount: { id: 'acc-revenue' },
} as unknown as Voucher;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/accounting/vouchers/new" element={<VoucherFormPage />} />
          <Route path="/accounting/vouchers/:id" element={<VoucherFormPage />} />
          <Route path="/accounting/vouchers/:id/edit" element={<VoucherFormPage />} />
          <Route path="/accounting/transactions" element={<div>Transaction Register</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('VoucherFormPage — existing voucher (SOUPFIN-154)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('View shows the voucher read-only with its values, titled by type', async () => {
    mockedGetVoucher.mockResolvedValue(PENDING_PAYMENT);
    renderAt('/accounting/vouchers/voucher-001');

    expect(await screen.findByTestId('voucher-form-heading')).toHaveTextContent(/^Payment Voucher$/);
    expect(mockedGetVoucher).toHaveBeenCalledWith('voucher-001');
    expect(screen.getByText(/PMT-2024-001/)).toBeInTheDocument();

    const notes = screen.getByTestId('voucher-notes-input');
    await waitFor(() => expect(notes).toHaveValue('Office supplies payment'));
    expect(screen.getByTestId('voucher-form-fields')).toBeDisabled();
    expect(screen.getByTestId('voucher-cash-account-select')).toHaveValue('acc-cash');
    expect(screen.getByTestId('voucher-expense-account-select')).toHaveValue('acc-expense');
    await waitFor(() => expect(screen.getByTestId('voucher-vendor-select')).toHaveValue('vendor-001'));

    // No save buttons in view mode; an editable voucher offers Edit instead.
    expect(screen.queryByTestId('voucher-form-save-draft-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('voucher-form-approve-post-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('voucher-form-edit-button')).toHaveAttribute(
      'href',
      '/accounting/vouchers/voucher-001/edit'
    );
  });

  it('Edit fills the form, saves through updateVoucher and returns to the register', async () => {
    mockedGetVoucher.mockResolvedValue(PENDING_PAYMENT);
    mockedUpdateVoucher.mockResolvedValue(PENDING_PAYMENT);
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/voucher-001/edit');

    expect(await screen.findByTestId('voucher-form-heading')).toHaveTextContent('Edit Payment Voucher');
    const notes = screen.getByTestId('voucher-notes-input');
    await waitFor(() => expect(notes).toHaveValue('Office supplies payment'));
    expect(screen.getByTestId('voucher-form-fields')).not.toBeDisabled();
    expect(screen.queryByTestId('voucher-form-approve-post-button')).not.toBeInTheDocument();

    await user.clear(notes);
    await user.type(notes, 'Office supplies, corrected');
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    await waitFor(() => expect(mockedUpdateVoucher).toHaveBeenCalledTimes(1));
    const [id, request] = mockedUpdateVoucher.mock.calls[0];
    expect(id).toBe('voucher-001');
    expect(request).toMatchObject({
      voucherType: 'PAYMENT',
      voucherTo: 'VENDOR',
      transactionDate: '2024-10-21',
      notes: 'Office supplies, corrected',
      amount: 450,
      vendorId: 'vendor-001',
      cashAccountId: 'acc-cash',
      expenseAccountId: 'acc-expense',
    });
    expect(mockedCreateVoucher).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions'));
  });

  it('Edit of a client voucher shows the owning client and saves its AccountServices (SOUPFIN-162)', async () => {
    mockedGetVoucher.mockResolvedValue({
      ...PENDING_PAYMENT,
      voucherTo: 'CLIENT',
      vendor: undefined,
      accountServices: { id: 'as-9', serialised: 'Direct Account : Corporate(Ada Ventures)' },
    } as unknown as Voucher);
    mockedUpdateVoucher.mockResolvedValue(PENDING_PAYMENT);
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/voucher-001/edit');

    await waitFor(() => expect(screen.getByTestId('voucher-client-select')).toHaveValue('client-9'));
    await user.click(screen.getByTestId('voucher-form-save-draft-button'));

    await waitFor(() => expect(mockedUpdateVoucher).toHaveBeenCalledTimes(1));
    const request = mockedUpdateVoucher.mock.calls[0][1];
    expect(request).toMatchObject({ voucherTo: 'CLIENT', accountServicesId: 'as-9' });
    expect(request.vendorId).toBeUndefined();
  });

  it('a posted voucher stays read-only on the /edit URL and explains why', async () => {
    mockedGetVoucher.mockResolvedValue(POSTED_RECEIPT);
    renderAt('/accounting/vouchers/voucher-002/edit');

    expect(await screen.findByTestId('voucher-form-heading')).toHaveTextContent(/^Receipt Voucher$/);
    expect(screen.getByTestId('voucher-form-readonly-banner')).toHaveTextContent('posted');
    expect(screen.getByTestId('voucher-form-fields')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('voucher-income-account-select')).toHaveValue('acc-revenue'));
    expect(screen.queryByTestId('voucher-form-edit-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('voucher-form-save-draft-button')).not.toBeInTheDocument();
  });

  it('shows an error instead of a blank form when the voucher cannot be loaded', async () => {
    mockedGetVoucher.mockRejectedValue(new Error('Voucher not found'));
    renderAt('/accounting/vouchers/missing');

    expect(await screen.findByTestId('voucher-form-load-error')).toHaveTextContent('could not be loaded');
    expect(screen.getByTestId('voucher-form-fields')).toBeDisabled();
    expect(screen.queryByTestId('voucher-form-save-draft-button')).not.toBeInTheDocument();
  });

  it('Back from a voucher returns to the Transaction Register', async () => {
    mockedGetVoucher.mockResolvedValue(PENDING_PAYMENT);
    const user = userEvent.setup();
    renderAt('/accounting/vouchers/voucher-001');

    await user.click(await screen.findByTestId('voucher-form-cancel-button'));
    expect(screen.getByTestId('location')).toHaveTextContent('/accounting/transactions');
  });

  it('a new voucher still creates, and does not fetch anything', async () => {
    renderAt('/accounting/vouchers/new');
    expect(await screen.findByTestId('voucher-form-heading')).toHaveTextContent('New Payment Voucher');
    expect(mockedGetVoucher).not.toHaveBeenCalled();
    expect(screen.getByTestId('voucher-form-approve-post-button')).toBeInTheDocument();
    expect(screen.getByTestId('voucher-form-fields')).not.toBeDisabled();
  });
});
