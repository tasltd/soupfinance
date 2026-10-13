/**
 * Unit tests for PaymentFormPage.
 *
 * Focus: graceful handling of the 403-on-source-list scenario that occurs
 * when the Finance module is not enabled (SOUPFIN-8). The form must NOT
 * render with empty dropdowns when the underlying invoice/bill list endpoint
 * is forbidden — it should render a clear "module not available" page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentFormPage } from '../PaymentFormPage';

vi.mock('../../../api/endpoints/invoices', () => ({
  listInvoices: vi.fn(),
  recordInvoicePayment: vi.fn(),
}));
vi.mock('../../../api/endpoints/bills', () => ({
  listBills: vi.fn(),
  // Added (SOUPFIN-175): the bill opened from its detail page is read by id
  getBill: vi.fn(),
  recordBillPayment: vi.fn(),
}));
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => {
    const value = amount ?? 0;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
  useCurrencySymbol: () => '$',
}));
// Changed (SOUPFIN-175): per-test accounts, for the payment payload tests
const ledgerAccounts = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));
vi.mock('../../../hooks/useLedgerAccounts', () => ({
  useLedgerAccounts: () => ({ data: ledgerAccounts.current, isLoading: false }),
}));
vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: [], isLoading: false }),
}));

import { listInvoices, recordInvoicePayment } from '../../../api/endpoints/invoices';
import { listBills, getBill, recordBillPayment } from '../../../api/endpoints/bills';
import type { Bill } from '../../../types';

function buildAxiosError(status: number) {
  return {
    name: 'AxiosError',
    message: `Request failed with status code ${status}`,
    response: { status },
  };
}

function renderPage(path = '/payments/new') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <PaymentFormPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PaymentFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledgerAccounts.current = [];
  });

  describe('happy path — module enabled', () => {
    it('renders the form when invoices load successfully', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);
      vi.mocked(listBills).mockResolvedValue([]);

      renderPage();

      expect(await screen.findByTestId('payment-form-page')).toBeInTheDocument();
      // The actual form is rendered (not the module-disabled banner)
      await waitFor(() => expect(screen.getByTestId('payment-type-toggle')).toBeInTheDocument());
      expect(screen.queryByTestId('payment-form-module-disabled')).not.toBeInTheDocument();
    });
  });

  describe('module disabled — 403 on invoice list (SOUPFIN-8)', () => {
    beforeEach(() => {
      vi.mocked(listInvoices).mockRejectedValue(buildAxiosError(403));
      vi.mocked(listBills).mockRejectedValue(buildAxiosError(403));
    });

    it('renders the module-disabled banner instead of the form', async () => {
      renderPage();
      const banner = await screen.findByTestId('payment-form-module-disabled');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/Finance module not available/i);
    });

    it('does NOT render the broken form with empty dropdowns', async () => {
      renderPage();
      await screen.findByTestId('payment-form-module-disabled');
      // The form's selectors must not be present when the module is disabled,
      // otherwise users see empty dropdowns (the original SOUPFIN-8 UX failure).
      expect(screen.queryByTestId('payment-type-toggle')).not.toBeInTheDocument();
      expect(screen.queryByTestId('select-document')).not.toBeInTheDocument();
      expect(screen.queryByTestId('submit-button')).not.toBeInTheDocument();
    });

    it('explains the cause to the user', async () => {
      renderPage();
      const banner = await screen.findByTestId('payment-form-module-disabled');
      expect(banner).toHaveTextContent(/not enabled for your account/i);
      expect(banner).toHaveTextContent(/contact your administrator/i);
    });

    it('offers a Back to Payments escape hatch', async () => {
      renderPage();
      await screen.findByTestId('payment-form-module-disabled');
      const backLink = screen.getByTestId('payment-form-module-disabled-back');
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/payments');
    });

    it('offers a Contact Support mailto link', async () => {
      renderPage();
      await screen.findByTestId('payment-form-module-disabled');
      const contactLink = screen.getByTestId('payment-form-module-disabled-contact');
      expect(contactLink).toBeInTheDocument();
      expect(contactLink.getAttribute('href')).toMatch(/^mailto:/);
    });
  });

  describe('non-403 errors', () => {
    it('still renders the form for 500 errors (the dropdown is empty but the page works)', async () => {
      vi.mocked(listInvoices).mockRejectedValue(buildAxiosError(500));
      vi.mocked(listBills).mockRejectedValue(buildAxiosError(500));

      renderPage();

      // 500 is NOT a module-disabled signal — it's a transient backend error.
      // The form still renders; user can retry. (No fallback banner.)
      await screen.findByTestId('payment-form-page');
      await waitFor(() => expect(screen.getByTestId('payment-type-toggle')).toBeInTheDocument());
      expect(screen.queryByTestId('payment-form-module-disabled')).not.toBeInTheDocument();
    });
  });

  // Added (SOUPFIN-175): bill/index.json reports every amount as 0, so the balance-due
  // filter used to drop every bill and "Record Payment" opened an empty bill picker.
  describe('bill opened from its detail page (SOUPFIN-175)', () => {
    const bill = (id: string, amountDue: number, status: Bill['status'] = 'PENDING') =>
      ({
        id,
        billNumber: `B-${id}`,
        vendor: { id: 'v-1', name: 'Acme Supplies' },
        status,
        totalAmount: 4725,
        amountPaid: 4725 - amountDue,
        amountDue,
      }) as Bill;

    const options = () =>
      Array.from(screen.getByTestId('select-document').querySelectorAll('option')).map(
        (o) => o.value
      );

    beforeEach(() => {
      vi.mocked(listInvoices).mockResolvedValue([]);
    });

    it('offers and selects the bill, with its real balance, though the list reports 0', async () => {
      vi.mocked(listBills).mockResolvedValue([bill('bill-1', 0), bill('bill-2', 0)]);
      vi.mocked(getBill).mockResolvedValue(bill('bill-1', 4725));

      renderPage('/payments/new?billId=bill-1');

      await waitFor(() => expect(screen.getByTestId('select-document')).toHaveValue('bill-1'));
      expect(options()).toEqual(['', 'bill-1']);
      expect(getBill).toHaveBeenCalledWith('bill-1');
      expect(screen.getByTestId('select-document')).toHaveTextContent('Due: $4,725.00');
      expect(screen.getByText('Balance due:')).toHaveTextContent('$4,725.00');
    });

    it('does not fetch a bill when none was preselected', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderPage('/payments/new');

      await screen.findByTestId('payment-type-toggle');
      expect(getBill).not.toHaveBeenCalled();
    });

    it('does not offer a preselected bill that is already paid', async () => {
      vi.mocked(listBills).mockResolvedValue([bill('bill-1', 0, 'PAID')]);
      vi.mocked(getBill).mockResolvedValue(bill('bill-1', 0, 'PAID'));

      renderPage('/payments/new?billId=bill-1');

      await waitFor(() => expect(getBill).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByTestId('select-document')).toBeInTheDocument());
      expect(options()).toEqual(['']);
    });

    it('still renders the picker from the list when the bill fetch fails', async () => {
      vi.mocked(listBills).mockResolvedValue([bill('bill-9', 120)]);
      vi.mocked(getBill).mockRejectedValue(buildAxiosError(500));

      renderPage('/payments/new?billId=bill-1');

      await waitFor(() => expect(options()).toEqual(['', 'bill-9']));
      expect(screen.queryByTestId('payment-form-module-disabled')).not.toBeInTheDocument();
    });

    it('lists the preselected bill once, first, among 500 unpaid bills', async () => {
      const many = Array.from({ length: 500 }, (_, i) => bill(`bill-${i}`, 1_000_000 + i));
      vi.mocked(listBills).mockResolvedValue(many);
      vi.mocked(getBill).mockResolvedValue(bill('bill-250', 9_999_999));

      renderPage('/payments/new?billId=bill-250');

      await waitFor(() => expect(screen.getByTestId('select-document')).toHaveValue('bill-250'));
      const values = options();
      expect(values).toHaveLength(501);
      expect(values[1]).toBe('bill-250');
      expect(values.filter((v) => v === 'bill-250')).toHaveLength(1);
      expect(screen.getByText('Balance due:')).toHaveTextContent('$9,999,999.00');
    });
  });

  // Added (SOUPFIN-175): dot-notation keys ('bill.id') do not bind in a JSON body, and the
  // backend requires the bank/cash account, so every payment was refused 422.
  describe('payment payload (SOUPFIN-175)', () => {
    const bank = { id: 'acct-bank', code: '1010', name: 'Main Bank', ledgerGroup: 'ASSET' };
    const unpaidBill = {
      id: 'bill-1', billNumber: 'B-1', vendor: { id: 'v-1', name: 'Acme' },
      status: 'PENDING', totalAmount: 4725, amountPaid: 0, amountDue: 4725,
    } as Bill;

    function fillAndSubmit(amount: string, withAccount = true) {
      fireEvent.change(screen.getByTestId('amount-input'), { target: { value: amount } });
      if (withAccount) {
        fireEvent.change(screen.getByTestId('bank-account-select'), { target: { value: bank.id } });
      }
      fireEvent.click(screen.getByTestId('submit-button'));
    }

    it('sends the bill, method and account as nested objects', async () => {
      ledgerAccounts.current = [bank];
      vi.mocked(listBills).mockResolvedValue([unpaidBill]);
      vi.mocked(getBill).mockResolvedValue(unpaidBill);
      vi.mocked(recordBillPayment).mockResolvedValue({} as never);

      renderPage('/payments/new?billId=bill-1');
      await waitFor(() => expect(screen.getByTestId('select-document')).toHaveValue('bill-1'));
      fillAndSubmit('1000');

      await waitFor(() => expect(recordBillPayment).toHaveBeenCalledTimes(1));
      const sent = vi.mocked(recordBillPayment).mock.calls[0][0] as Record<string, unknown>;
      expect(sent).toMatchObject({
        bill: { id: 'bill-1' },
        amount: 1000,
        payOutAccount: { id: 'acct-bank' },
      });
      expect(Object.keys(sent).filter((k) => k.includes('.'))).toEqual([]);
      expect(sent).not.toHaveProperty('paymentMethod');
    });

    it('sends an invoice payment with nested invoice and deposit account', async () => {
      ledgerAccounts.current = [bank];
      vi.mocked(listInvoices).mockResolvedValue([
        { id: 'inv-1', number: 7, status: 'SENT', amountDue: 500 } as never,
      ]);
      vi.mocked(recordInvoicePayment).mockResolvedValue({} as never);

      renderPage('/payments/new?invoiceId=inv-1');
      await waitFor(() => expect(screen.getByTestId('select-document')).toHaveValue('inv-1'));
      fillAndSubmit('500');

      await waitFor(() => expect(recordInvoicePayment).toHaveBeenCalledTimes(1));
      const sent = vi.mocked(recordInvoicePayment).mock.calls[0][0] as Record<string, unknown>;
      expect(sent).toMatchObject({ invoice: { id: 'inv-1' }, amount: 500, payInAccount: { id: 'acct-bank' } });
      expect(Object.keys(sent).filter((k) => k.includes('.'))).toEqual([]);
    });

    it('asks for the account instead of sending a payment the backend will refuse', async () => {
      ledgerAccounts.current = [bank];
      vi.mocked(listBills).mockResolvedValue([unpaidBill]);
      vi.mocked(getBill).mockResolvedValue(unpaidBill);

      renderPage('/payments/new?billId=bill-1');
      await waitFor(() => expect(screen.getByTestId('select-document')).toHaveValue('bill-1'));
      fillAndSubmit('1000', false);

      expect(await screen.findByTestId('form-error')).toHaveTextContent(
        'Please select the bank or cash account the payment comes from'
      );
      expect(recordBillPayment).not.toHaveBeenCalled();
    });

    it('offers every bank account from a long chart of accounts', async () => {
      ledgerAccounts.current = [
        ...Array.from({ length: 300 }, (_, i) => ({
          id: `exp-${i}`, code: `5${i}`, name: `Vendor ${i}`, ledgerGroup: 'EXPENSE',
        })),
        ...Array.from({ length: 263 }, (_, i) => ({
          id: `bank-${i}`, code: `1${i}`, name: `Bank ${i}`, ledgerGroup: 'ASSET',
        })),
      ];
      vi.mocked(listBills).mockResolvedValue([unpaidBill]);
      vi.mocked(getBill).mockResolvedValue(unpaidBill);

      renderPage('/payments/new?billId=bill-1');
      await waitFor(() => expect(screen.getByTestId('select-document')).toHaveValue('bill-1'));
      const offered = screen.getByTestId('bank-account-select').querySelectorAll('option');
      expect(offered).toHaveLength(264);
    });
  });
});
