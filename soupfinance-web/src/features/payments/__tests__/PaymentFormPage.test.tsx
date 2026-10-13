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
  getInvoice: vi.fn(),
  recordInvoicePayment: vi.fn(),
}));
vi.mock('../../../api/endpoints/bills', () => ({
  listBills: vi.fn(),
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
// Changed (SOUPFIN-176): dropdown data is controllable per test so the submit
// tests can pick a payment method and a bank account.
const mockLedgerAccounts = vi.hoisted(() => ({ data: [] as unknown[] }));
const mockPaymentMethods = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('../../../hooks/useLedgerAccounts', () => ({
  useLedgerAccounts: () => ({ data: mockLedgerAccounts.data, isLoading: false }),
}));
vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: mockPaymentMethods.data, isLoading: false }),
}));

import { listInvoices, getInvoice, recordInvoicePayment } from '../../../api/endpoints/invoices';
import { listBills, getBill, recordBillPayment } from '../../../api/endpoints/bills';
import type { Invoice, Bill } from '../../../types';

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
    mockLedgerAccounts.data = [];
    mockPaymentMethods.data = [];
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

  // Added (SOUPFIN-176): the save body must carry every FK as a nested object.
  // Grails JSON binding ignores dotted keys ('invoice.id'), so the old body was
  // rejected with 422 "invoice cannot be null" and never bound the payment method
  // or the bank account.
  describe('submit payload — FKs as nested objects (SOUPFIN-176)', () => {
    const INVOICE_ID = 'inv-0001';
    const BILL_ID = 'bill-0001';
    const METHOD_ID = 'pm-bank-transfer';
    const BANK_ID = 'la-main-bank';
    // Headroom for a loaded CI box: the default 1 s waitFor flaked under load.
    const WAIT = { timeout: 5000 };

    function setUpDropdowns() {
      mockPaymentMethods.data = [
        { id: METHOD_ID, name: 'Bank Transfer' },
        { id: 'pm-cash', name: 'Cash' },
      ];
      mockLedgerAccounts.data = [
        { id: BANK_ID, code: '1010', name: 'Main Bank', ledgerGroup: 'ASSET' },
        { id: 'la-sales', code: '4000', name: 'Sales', ledgerGroup: 'INCOME' },
      ];
      vi.mocked(listInvoices).mockResolvedValue([
        { id: INVOICE_ID, number: 1001, status: 'PENDING', amountDue: 500 } as unknown as Invoice,
      ]);
      vi.mocked(listBills).mockResolvedValue([
        { id: BILL_ID, billNumber: 'BILL-1', status: 'PENDING', amountDue: 300 } as unknown as Bill,
      ]);
      vi.mocked(recordInvoicePayment).mockResolvedValue({ id: 'ip-1' } as never);
      vi.mocked(recordBillPayment).mockResolvedValue({ id: 'bp-1' } as never);
    }

    function change(testId: string, value: string) {
      fireEvent.change(screen.getByTestId(testId), { target: { value } });
    }

    async function chooseDocument(id: string) {
      await waitFor(() => {
        expect(screen.getByRole('option', { name: new RegExp(id === INVOICE_ID ? '^1001' : '^BILL-1') })).toBeInTheDocument();
      }, WAIT);
      change('select-document', id);
    }

    it('sends invoice, paymentMethod and payInAccount as nested objects', async () => {
      setUpDropdowns();
      renderPage();
      await chooseDocument(INVOICE_ID);
      change('amount-input', '125.50');
      change('date-input', '2026-10-13');
      change('method-select', METHOD_ID);
      change('bank-account-select', BANK_ID);
      change('reference-input', 'CHK-42');
      change('notes-input', 'Part payment');
      fireEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => expect(recordInvoicePayment).toHaveBeenCalledTimes(1), WAIT);
      expect(vi.mocked(recordInvoicePayment).mock.calls[0][0]).toEqual({
        invoice: { id: INVOICE_ID },
        amount: 125.5,
        paymentDate: '2026-10-13',
        paymentMethod: { id: METHOD_ID },
        reference: 'CHK-42',
        notes: 'Part payment',
        payInAccount: { id: BANK_ID },
      });
      expect(recordBillPayment).not.toHaveBeenCalled();
    });

    it('sends bill, paymentMethod and payOutAccount as nested objects', async () => {
      setUpDropdowns();
      renderPage();
      fireEvent.click(screen.getByTestId('type-bill'));
      await chooseDocument(BILL_ID);
      change('amount-input', '300');
      change('date-input', '2026-10-13');
      change('method-select', METHOD_ID);
      change('bank-account-select', BANK_ID);
      fireEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => expect(recordBillPayment).toHaveBeenCalledTimes(1), WAIT);
      expect(vi.mocked(recordBillPayment).mock.calls[0][0]).toEqual({
        bill: { id: BILL_ID },
        amount: 300,
        paymentDate: '2026-10-13',
        paymentMethod: { id: METHOD_ID },
        reference: undefined,
        notes: undefined,
        payOutAccount: { id: BANK_ID },
      });
      expect(recordInvoicePayment).not.toHaveBeenCalled();
    });

    it('never sends a dotted FK key', async () => {
      setUpDropdowns();
      renderPage();
      await chooseDocument(INVOICE_ID);
      change('amount-input', '10');
      change('method-select', METHOD_ID);
      change('bank-account-select', BANK_ID);
      fireEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => expect(recordInvoicePayment).toHaveBeenCalledTimes(1), WAIT);
      const body = vi.mocked(recordInvoicePayment).mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(body).filter((key) => key.includes('.'))).toEqual([]);
    });

    it('omits paymentMethod and payInAccount when none is chosen', async () => {
      setUpDropdowns();
      renderPage();
      await chooseDocument(INVOICE_ID);
      change('amount-input', '500');
      fireEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => expect(recordInvoicePayment).toHaveBeenCalledTimes(1), WAIT);
      const body = vi.mocked(recordInvoicePayment).mock.calls[0][0];
      expect(body).toMatchObject({ invoice: { id: INVOICE_ID }, amount: 500 });
      expect(body).not.toHaveProperty('paymentMethod');
      expect(body).not.toHaveProperty('payInAccount');
    });

    it('does not submit an amount above the balance due', async () => {
      setUpDropdowns();
      renderPage();
      await chooseDocument(INVOICE_ID);
      change('amount-input', '5000000');
      change('method-select', METHOD_ID);
      change('bank-account-select', BANK_ID);
      // The native max= constraint stops the browser submitting the form.
      const amountInput = screen.getByTestId('amount-input') as HTMLInputElement;
      expect(amountInput.validity.rangeOverflow).toBe(true);

      // The JS guard still refuses if the form is submitted regardless.
      fireEvent.submit(amountInput.closest('form') as HTMLFormElement);
      expect(await screen.findByTestId('form-error', {}, WAIT)).toHaveTextContent(/cannot exceed balance due/i);
      expect(recordInvoicePayment).not.toHaveBeenCalled();
    });
  });

  // Added (SOUPFIN-176): "Record Payment" on a detail page preselects the document.
  // bill/index.json reports amountDue 0 for bills that have a balance, so the list
  // may not offer it; the required <select> then blocked the browser from submitting.
  describe('preselected document missing from the list (SOUPFIN-176)', () => {
    const WAIT = { timeout: 5000 };

    beforeEach(() => {
      mockPaymentMethods.data = [{ id: 'pm-1', name: 'Bank Transfer' }];
      mockLedgerAccounts.data = [{ id: 'bank-1', code: '1010', name: 'Main Bank', ledgerGroup: 'ASSET' }];
      vi.mocked(recordBillPayment).mockResolvedValue({ id: 'bp-1' } as never);
      vi.mocked(recordInvoicePayment).mockResolvedValue({ id: 'ip-1' } as never);
    });

    it('loads the bill by id, offers it, and pays it', async () => {
      // The list carries the bill with the backend's wrong amountDue of 0.
      vi.mocked(listBills).mockResolvedValue([
        { id: 'bill-9', billNumber: 'BILL-9', status: 'PENDING', amountDue: 0 } as unknown as Bill,
      ]);
      vi.mocked(getBill).mockResolvedValue(
        { id: 'bill-9', billNumber: 'BILL-9', status: 'PENDING', amountDue: 250 } as unknown as Bill
      );
      renderPage('/payments/new?billId=bill-9');

      await waitFor(() => expect(getBill).toHaveBeenCalledWith('bill-9'), WAIT);
      await waitFor(
        () => expect((screen.getByTestId('select-document') as HTMLSelectElement).value).toBe('bill-9'),
        WAIT
      );
      expect(screen.getByRole('option', { name: /^BILL-9/ })).toBeInTheDocument();
      // Balance from show.json drives the max, not the list's 0.
      expect(screen.getByTestId('amount-input')).toHaveAttribute('max', '250');

      fireEvent.change(screen.getByTestId('amount-input'), { target: { value: '100' } });
      fireEvent.change(screen.getByTestId('method-select'), { target: { value: 'pm-1' } });
      fireEvent.change(screen.getByTestId('bank-account-select'), { target: { value: 'bank-1' } });
      fireEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => expect(recordBillPayment).toHaveBeenCalledTimes(1), WAIT);
      expect(vi.mocked(recordBillPayment).mock.calls[0][0]).toMatchObject({
        bill: { id: 'bill-9' },
        amount: 100,
        paymentMethod: { id: 'pm-1' },
        payOutAccount: { id: 'bank-1' },
      });
    });

    it('loads an invoice that is outside the first 100 listed', async () => {
      vi.mocked(listInvoices).mockResolvedValue([
        { id: 'inv-1', number: 1, status: 'PENDING', amountDue: 10 } as unknown as Invoice,
      ]);
      vi.mocked(getInvoice).mockResolvedValue(
        { id: 'inv-old', number: 7, status: 'PENDING', amountDue: 80 } as unknown as Invoice
      );
      renderPage('/payments/new?invoiceId=inv-old');

      await waitFor(() => expect(getInvoice).toHaveBeenCalledWith('inv-old'), WAIT);
      await waitFor(
        () => expect((screen.getByTestId('select-document') as HTMLSelectElement).value).toBe('inv-old'),
        WAIT
      );
      // The listed invoice is still offered alongside it.
      expect(screen.getByRole('option', { name: /^1 -/ })).toBeInTheDocument();
    });

    it('does not fetch the document again when the list already offers it', async () => {
      vi.mocked(listBills).mockResolvedValue([
        { id: 'bill-9', billNumber: 'BILL-9', status: 'PENDING', amountDue: 250 } as unknown as Bill,
      ]);
      renderPage('/payments/new?billId=bill-9');

      await waitFor(
        () => expect((screen.getByTestId('select-document') as HTMLSelectElement).value).toBe('bill-9'),
        WAIT
      );
      expect(getBill).not.toHaveBeenCalled();
    });

    it('does not offer a preselected bill that is already paid', async () => {
      vi.mocked(listBills).mockResolvedValue([]);
      vi.mocked(getBill).mockResolvedValue(
        { id: 'bill-paid', billNumber: 'BILL-P', status: 'PAID', amountDue: 0 } as unknown as Bill
      );
      renderPage('/payments/new?billId=bill-paid');

      await waitFor(() => expect(getBill).toHaveBeenCalledWith('bill-paid'), WAIT);
      expect(screen.queryByRole('option', { name: /^BILL-P/ })).not.toBeInTheDocument();
    });
  });
});
