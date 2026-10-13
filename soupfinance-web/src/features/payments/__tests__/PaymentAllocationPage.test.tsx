/**
 * SOUPFIN-178: receive one payment against several invoices / pay several bills.
 *
 * The allocation maths is the real module; only the HTTP layer is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentAllocationPage } from '../PaymentAllocationPage';
import type { Bill, Client, Invoice } from '../../../types';

vi.mock('../../../api/endpoints/clients', () => ({ listClients: vi.fn(), getClient: vi.fn() }));
vi.mock('../../../api/endpoints/vendors', () => ({ listVendors: vi.fn() }));
vi.mock('../../../api/endpoints/paymentAllocations', () => ({
  createPaymentAllocation: vi.fn(),
  listOpenBillsForVendor: vi.fn(),
  listOpenInvoicesForAccountServices: vi.fn(),
  resolveClientAccountServicesIds: vi.fn(),
}));
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) =>
    `$${(amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  useCurrencySymbol: () => '$',
}));
vi.mock('../../../api/endpoints/ledger', () => ({
  listAllLedgerAccounts: vi.fn(async () => [
    { id: 'acc-1000', code: '1000', name: 'Cash at Bank', ledgerGroup: 'ASSET' },
    { id: 'acc-2000', code: '2000', name: 'Accounts Payable', ledgerGroup: 'LIABILITY' },
  ]),
  ledgerGroupMatches: (a: string, b: string) => a === b,
}));
vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: [{ id: 'pm-1', name: 'Bank Transfer' }] }),
}));
const showToast = vi.fn();
vi.mock('../../../components/feedback', () => ({ useToast: () => ({ showToast }) }));

import { listClients, getClient } from '../../../api/endpoints/clients';
import { listVendors } from '../../../api/endpoints/vendors';
import {
  createPaymentAllocation,
  listOpenBillsForVendor,
  listOpenInvoicesForAccountServices,
  resolveClientAccountServicesIds,
} from '../../../api/endpoints/paymentAllocations';

const client = { id: 'client-1', name: 'Zenith Retail Ltd', portfolioList: [{ id: 'port-1' }] } as unknown as Client;

function invoice(id: string, number: number, dueDate: string, amountDue: number): Invoice {
  return {
    id,
    number,
    paymentDate: dueDate,
    accountServices: { id: 'as-1' },
    totalAmount: amountDue,
    amountDue,
    status: 'SENT',
  } as Invoice;
}

// Listed newest first on purpose: the page must still fill the oldest first.
const openInvoices = [
  invoice('inv-3', 103, '2099-02-01', 1000),
  invoice('inv-1', 101, '2026-01-15', 3000),
  invoice('inv-2', 102, '2026-01-20', 2500),
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="landed">{location.pathname + location.search}</div>;
}

function renderPage(direction: 'RECEIPT' | 'PAYMENT', url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const path = direction === 'RECEIPT' ? '/payments/receive' : '/payments/make';
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={path} element={<PaymentAllocationPage direction={direction} />} />
          <Route path="/payments" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const user = () => userEvent.setup();

async function openReceipt(url = '/payments/receive?clientId=client-1') {
  renderPage('RECEIPT', url);
  await screen.findByTestId('allocation-table');
  await screen.findByRole('option', { name: '1000 - Cash at Bank' });
}

function input(id: string) {
  return screen.getByTestId(`allocation-input-${id}`) as HTMLInputElement;
}

describe('PaymentAllocationPage — receive payment (SOUPFIN-178)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listClients).mockResolvedValue([client]);
    vi.mocked(resolveClientAccountServicesIds).mockResolvedValue(['as-1']);
    vi.mocked(listOpenInvoicesForAccountServices).mockResolvedValue({ documents: openInvoices, truncated: false });
  });

  it('preselects the client from the URL and lists their open invoices oldest due first', async () => {
    await openReceipt();

    expect(screen.queryByRole('option', { name: '2000 - Accounts Payable' })).not.toBeInTheDocument();
    expect(screen.getByTestId('allocation-party-select')).toHaveValue('client-1');
    expect(screen.getByTestId('payment-allocation-heading')).toHaveTextContent('Receive payment from Zenith Retail Ltd');
    expect(listOpenInvoicesForAccountServices).toHaveBeenCalledWith(['as-1']);
    const rows = within(screen.getByTestId('allocation-table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'allocation-row-inv-1',
      'allocation-row-inv-2',
      'allocation-row-inv-3',
    ]);
  });

  it('fills the oldest invoices first as soon as an amount is entered', async () => {
    await openReceipt();
    await user().type(screen.getByTestId('allocation-amount-input'), '5000');

    expect(input('inv-1').value).toBe('3000.00');
    expect(input('inv-2').value).toBe('2000.00');
    expect(input('inv-3').value).toBe('');
    expect(screen.getByTestId('allocation-check-inv-3')).not.toBeChecked();
    expect(screen.getByTestId('allocation-summary-allocated')).toHaveTextContent('$5,000.00');
    expect(screen.getByTestId('allocation-summary-unapplied')).toHaveTextContent('$0.00');
    expect(screen.getByTestId('allocation-summary-remaining')).toHaveTextContent('$1,500.00');
    expect(screen.getByTestId('allocation-strategy')).toHaveTextContent('oldest due date first');
  });

  it('lets a line be lowered by hand, shows the unapplied amount, and Auto-allocate restores FIFO', async () => {
    const u = user();
    await openReceipt();
    await u.type(screen.getByTestId('allocation-amount-input'), '5000');

    await u.clear(input('inv-2'));
    await u.type(input('inv-2'), '1000');

    expect(screen.getByTestId('allocation-strategy')).toHaveTextContent('set by hand');
    expect(input('inv-1').value).toBe('3000.00');
    expect(screen.getByTestId('allocation-summary-unapplied')).toHaveTextContent('$1,000.00');
    expect(screen.getByTestId('allocation-unapplied-note')).toHaveTextContent('Apply it to another invoice');

    await u.click(screen.getByTestId('allocation-auto-button'));
    // React may keep "2000" in a number input whose new value "2000.00" is numerically equal
    expect(Number(input('inv-2').value)).toBe(2000);
    expect(screen.getByTestId('allocation-summary-unapplied')).toHaveTextContent('$0.00');
  });

  it('ticking an invoice applies what the payment has left', async () => {
    const u = user();
    await openReceipt();
    await u.type(screen.getByTestId('allocation-amount-input'), '5000');
    await u.click(screen.getByTestId('allocation-check-inv-1')); // untick: frees 3000

    await u.click(screen.getByTestId('allocation-check-inv-3'));

    expect(input('inv-1').value).toBe('0');
    expect(input('inv-3').value).toBe('1000.00');
    expect(screen.getByTestId('allocation-summary-unapplied')).toHaveTextContent('$2,000.00');
  });

  it('blocks a payment whose lines add up to more than the amount received', async () => {
    const u = user();
    await openReceipt();
    await u.type(screen.getByTestId('allocation-amount-input'), '5000');
    await u.type(input('inv-3'), '1000');

    expect(screen.getByTestId('allocation-over-error')).toHaveTextContent('$1,000.00 more than the amount received');
    expect(screen.getByTestId('allocation-submit')).toBeDisabled();
    expect(createPaymentAllocation).not.toHaveBeenCalled();
  });

  it('refuses a line above its balance', async () => {
    const u = user();
    await openReceipt();
    await u.type(screen.getByTestId('allocation-amount-input'), '9000');
    await u.selectOptions(screen.getByTestId('allocation-bank-select'), 'acc-1000');
    await u.clear(input('inv-3'));
    await u.type(input('inv-3'), '1200');

    expect(screen.getByTestId('allocation-line-error-inv-3')).toHaveTextContent('More than the balance due');
    await u.click(screen.getByTestId('allocation-submit'));
    expect(screen.getByTestId('allocation-form-error')).toHaveTextContent('Fix the highlighted lines first.');
    expect(createPaymentAllocation).not.toHaveBeenCalled();
  });

  it('asks for the bank account before saving', async () => {
    const u = user();
    await openReceipt();
    await u.type(screen.getByTestId('allocation-amount-input'), '100');
    await u.click(screen.getByTestId('allocation-submit'));

    expect(screen.getByTestId('allocation-form-error')).toHaveTextContent('Choose the bank or cash account the money went into.');
    expect(createPaymentAllocation).not.toHaveBeenCalled();
  });

  it('asks for an amount before saving', async () => {
    const u = user();
    await openReceipt();
    await u.click(screen.getByTestId('allocation-submit'));
    expect(screen.getByTestId('allocation-form-error')).toHaveTextContent('Enter the amount received.');
  });

  it('records one receipt across the allocated invoices and returns to Payments', async () => {
    const u = user();
    vi.mocked(createPaymentAllocation).mockResolvedValue({ id: 'grp-1' } as never);
    await openReceipt();
    await u.type(screen.getByTestId('allocation-amount-input'), '5000');
    await u.selectOptions(screen.getByTestId('allocation-bank-select'), 'acc-1000');
    await u.selectOptions(screen.getByTestId('allocation-method-select'), 'pm-1');
    await u.type(screen.getByTestId('allocation-reference-input'), 'TRF-1');
    await u.clear(screen.getByTestId('allocation-date-input'));
    await u.type(screen.getByTestId('allocation-date-input'), '2026-10-13');

    await u.click(screen.getByTestId('allocation-submit'));

    await waitFor(() => expect(createPaymentAllocation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPaymentAllocation).mock.calls[0][0]).toEqual({
      direction: 'RECEIPT',
      strategy: 'FIFO',
      totalAmount: 5000,
      paymentDate: '2026-10-13',
      paymentMethod: { id: 'pm-1' },
      reference: 'TRF-1',
      accountServicesId: 'as-1',
      cashAccountId: 'acc-1000',
      allocations: [
        { invoiceId: 'inv-1', amount: 3000 },
        { invoiceId: 'inv-2', amount: 2000 },
      ],
    });
    expect(await screen.findByTestId('landed')).toHaveTextContent('/payments');
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success', message: 'Payment of $5,000.00 applied to 2 invoices.' })
    );
  });

  it('sends MANUAL and keeps an unapplied remainder when the user lowered a line', async () => {
    const u = user();
    vi.mocked(createPaymentAllocation).mockResolvedValue({ id: 'grp-2' } as never);
    await openReceipt();
    await u.type(screen.getByTestId('allocation-amount-input'), '5000');
    await u.selectOptions(screen.getByTestId('allocation-bank-select'), 'acc-1000');
    await u.clear(input('inv-2'));
    await u.type(input('inv-2'), '500.5');
    await u.click(screen.getByTestId('allocation-submit'));

    await waitFor(() => expect(createPaymentAllocation).toHaveBeenCalled());
    const sent = vi.mocked(createPaymentAllocation).mock.calls[0][0];
    expect(sent.strategy).toBe('MANUAL');
    expect(sent.totalAmount).toBe(5000);
    expect(sent.allocations).toEqual([
      { invoiceId: 'inv-1', amount: 3000 },
      { invoiceId: 'inv-2', amount: 500.5 },
    ]);
  });

  it("shows the backend's refusal and stays on the page", async () => {
    const u = user();
    vi.mocked(createPaymentAllocation).mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'Allocation 3000 exceeds amount due 2500 for invoice #102.' } },
    });
    await openReceipt();
    await u.type(screen.getByTestId('allocation-amount-input'), '100');
    await u.selectOptions(screen.getByTestId('allocation-bank-select'), 'acc-1000');
    await u.click(screen.getByTestId('allocation-submit'));

    expect(await screen.findByTestId('allocation-form-error')).toHaveTextContent('exceeds amount due 2500');
    expect(screen.queryByTestId('landed')).not.toBeInTheDocument();
  });

  it('asks for a client first when none is chosen', async () => {
    renderPage('RECEIPT', '/payments/receive');
    expect(await screen.findByTestId('allocation-no-party')).toHaveTextContent('Choose a client');
    expect(listOpenInvoicesForAccountServices).not.toHaveBeenCalled();
  });

  it('says so when the client owes nothing', async () => {
    vi.mocked(listOpenInvoicesForAccountServices).mockResolvedValue({ documents: [], truncated: false });
    renderPage('RECEIPT', '/payments/receive?clientId=client-1');
    expect(await screen.findByTestId('allocation-empty')).toHaveTextContent('no unpaid invoices');
  });

  it('says so when the client has no account to invoice', async () => {
    vi.mocked(resolveClientAccountServicesIds).mockResolvedValue([]);
    renderPage('RECEIPT', '/payments/receive?clientId=client-1');
    expect(await screen.findByTestId('allocation-no-account')).toBeInTheDocument();
  });

  it('loads a preselected client that is not in the first page of clients', async () => {
    vi.mocked(listClients).mockResolvedValue([]);
    vi.mocked(getClient).mockResolvedValue(client);
    await openReceipt();
    expect(getClient).toHaveBeenCalledWith('client-1');
    expect(screen.getByTestId('allocation-party-select')).toHaveValue('client-1');
  });

  it('warns when older invoices may be missing', async () => {
    vi.mocked(listOpenInvoicesForAccountServices).mockResolvedValue({ documents: openInvoices, truncated: true });
    await openReceipt();
    expect(screen.getByTestId('allocation-truncated')).toBeInTheDocument();
  });

  it('explains a disabled Finance module and will not save', async () => {
    vi.mocked(listOpenInvoicesForAccountServices).mockRejectedValue({
      isAxiosError: true,
      config: { url: '/invoice/index.json' },
      response: { status: 403, data: { error: 'Finance module is not enabled for this tenant' } },
    });
    renderPage('RECEIPT', '/payments/receive?clientId=client-1');
    expect(await screen.findByTestId('allocation-module-disabled')).toBeInTheDocument();
    expect(screen.getByTestId('allocation-submit')).toBeDisabled();
  });

  it('offers Try again on a server error', async () => {
    vi.mocked(listOpenInvoicesForAccountServices)
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } })
      .mockResolvedValue({ documents: openInvoices, truncated: false });
    renderPage('RECEIPT', '/payments/receive?clientId=client-1');
    await user().click(await screen.findByTestId('allocation-docs-retry'));
    expect(await screen.findByTestId('allocation-table')).toBeInTheDocument();
  });
});

describe('PaymentAllocationPage — pay bills (SOUPFIN-178)', () => {
  const openBills = [
    { id: 'bill-2', billNumber: 'BILL-2', vendor: { id: 'v-1' }, paymentDate: '2026-03-01', amountDue: 800, totalAmount: 800, status: 'PENDING' },
    { id: 'bill-1', billNumber: 'BILL-1', vendor: { id: 'v-1' }, paymentDate: '2026-02-01', amountDue: 400, totalAmount: 400, status: 'PARTIAL' },
  ] as unknown as Bill[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listVendors).mockResolvedValue([{ id: 'v-1', name: 'Accra Office Supplies Ltd' }] as never);
    vi.mocked(listOpenBillsForVendor).mockResolvedValue({ documents: openBills, truncated: false });
  });

  it("pays the vendor's oldest bills first and posts a PAYMENT with bill ids", async () => {
    const u = user();
    vi.mocked(createPaymentAllocation).mockResolvedValue({ id: 'grp-3' } as never);
    renderPage('PAYMENT', '/payments/make?vendorId=v-1');
    await screen.findByTestId('allocation-table');
    await screen.findByRole('option', { name: '1000 - Cash at Bank' });
    expect(screen.getByTestId('payment-allocation-heading')).toHaveTextContent('Pay bills from Accra Office Supplies Ltd');

    await u.type(screen.getByTestId('allocation-amount-input'), '1000');
    expect(input('bill-1').value).toBe('400.00');
    expect(input('bill-2').value).toBe('600.00');

    await u.selectOptions(screen.getByTestId('allocation-bank-select'), 'acc-1000');
    await u.click(screen.getByTestId('allocation-submit'));

    await waitFor(() => expect(createPaymentAllocation).toHaveBeenCalled());
    const sent = vi.mocked(createPaymentAllocation).mock.calls[0][0];
    expect(sent).toMatchObject({ direction: 'PAYMENT', vendorId: 'v-1', cashAccountId: 'acc-1000', totalAmount: 1000 });
    expect(sent).not.toHaveProperty('accountServicesId');
    expect(sent.allocations).toEqual([
      { billId: 'bill-1', amount: 400 },
      { billId: 'bill-2', amount: 600 },
    ]);
    expect(await screen.findByTestId('landed')).toHaveTextContent('/payments?tab=outgoing');
  });

  it('switching vendor resets the hand-set lines', async () => {
    const u = user();
    vi.mocked(listVendors).mockResolvedValue([
      { id: 'v-1', name: 'Accra Office Supplies Ltd' },
      { id: 'v-2', name: 'Volta Power Services' },
    ] as never);
    renderPage('PAYMENT', '/payments/make?vendorId=v-1');
    await screen.findByTestId('allocation-table');
    await u.type(input('bill-1'), '10');
    expect(screen.getByTestId('allocation-strategy')).toHaveTextContent('set by hand');

    await u.selectOptions(screen.getByTestId('allocation-party-select'), 'v-2');
    await waitFor(() => expect(listOpenBillsForVendor).toHaveBeenLastCalledWith('v-2'));
    expect(screen.getByTestId('allocation-strategy')).toHaveTextContent('oldest due date first');
  });
});
