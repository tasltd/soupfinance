/**
 * SOUPFIN-179: receipt upload on the payment form.
 *
 * BillPayment.paymentReceipt is a SoupBrokerFile; the form sends it as a
 * base64 data URI in the JSON body. InvoicePayment has no receipt field, so
 * the Incoming tab offers no dropzone and never sends one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentFormPage } from '../PaymentFormPage';
import { RECEIPT_MAX_BYTES } from '../receipt';

vi.mock('../../../api/endpoints/invoices', () => ({
  listInvoices: vi.fn(),
  recordInvoicePayment: vi.fn(),
}));
vi.mock('../../../api/endpoints/bills', () => ({
  listBills: vi.fn(),
  recordBillPayment: vi.fn(),
}));
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => `$${(amount ?? 0).toFixed(2)}`,
  useCurrencySymbol: () => '$',
}));
vi.mock('../../../hooks/useLedgerAccounts', () => ({
  useLedgerAccounts: () => ({ data: [], isLoading: false }),
}));
vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: [], isLoading: false }),
}));

import { listInvoices, recordInvoicePayment } from '../../../api/endpoints/invoices';
import { listBills, recordBillPayment } from '../../../api/endpoints/bills';

const bill = { id: 'bill-1', billNumber: 'BILL-001', vendor: { name: 'Acme' }, amountDue: 500, status: 'PENDING' };
const invoice = { id: 'inv-1', number: 7, accountServices: { serialised: 'Client A' }, amountDue: 300, status: 'SENT' };

function renderPage(path = '/payments/new?billId=bill-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <PaymentFormPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function fillBill(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByTestId('select-document')).toHaveValue('bill-1'));
  await user.type(screen.getByTestId('amount-input'), '125');
}

describe('PaymentFormPage receipt (SOUPFIN-179)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBills).mockResolvedValue([bill] as never);
    vi.mocked(listInvoices).mockResolvedValue([invoice] as never);
    vi.mocked(recordBillPayment).mockResolvedValue({ id: 'bp-1' } as never);
    vi.mocked(recordInvoicePayment).mockResolvedValue({ id: 'ip-1' } as never);
  });

  it('sends the picked PDF as a base64 data URI with the bill payment', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillBill(user);

    const content = '%PDF-1.4 SOUPFIN-179';
    await user.upload(screen.getByTestId('receipt-input'), new File([content], 'proof.pdf', { type: 'application/pdf' }));
    expect(screen.getByTestId('receipt-file-name')).toHaveTextContent('proof.pdf');

    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => expect(recordBillPayment).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(recordBillPayment).mock.calls[0][0] as Record<string, unknown>;
    expect(payload['bill.id']).toBe('bill-1');
    expect(payload.amount).toBe(125);
    const receipt = payload.paymentReceipt as string;
    expect(receipt.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(atob(receipt.split(',')[1])).toBe(content);
  });

  it('sends no paymentReceipt key when no file is picked', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillBill(user);
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => expect(recordBillPayment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(recordBillPayment).mock.calls[0][0]).not.toHaveProperty('paymentReceipt');
  });

  it('drops a removed file from the payload', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillBill(user);
    await user.upload(screen.getByTestId('receipt-input'), new File(['x'], 'proof.png', { type: 'image/png' }));
    await user.click(screen.getByTestId('receipt-remove'));
    expect(screen.getByTestId('receipt-dropzone')).toBeInTheDocument();

    await user.click(screen.getByTestId('submit-button'));
    await waitFor(() => expect(recordBillPayment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(recordBillPayment).mock.calls[0][0]).not.toHaveProperty('paymentReceipt');
  });

  it('rejects a file over 5 MB with a message and keeps the dropzone empty', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillBill(user);
    const big = new File([new Uint8Array(RECEIPT_MAX_BYTES + 1)], 'scan.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByTestId('receipt-input'), big);

    expect(screen.getByTestId('receipt-error')).toHaveTextContent('scan.pdf is 5.0 MB. Receipts must be 5 MB or smaller.');
    expect(screen.queryByTestId('receipt-selected')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('submit-button'));
    await waitFor(() => expect(recordBillPayment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(recordBillPayment).mock.calls[0][0]).not.toHaveProperty('paymentReceipt');
  });

  it('rejects a file type outside PDF, PNG and JPG', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await fillBill(user);
    await user.upload(screen.getByTestId('receipt-input'), new File(['hi'], 'notes.txt', { type: 'text/plain' }));

    expect(screen.getByTestId('receipt-error')).toHaveTextContent('notes.txt is not a PDF, PNG or JPG file.');
    expect(screen.queryByTestId('receipt-selected')).not.toBeInTheDocument();
  });

  it('a valid file after a rejected one clears the error', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await fillBill(user);
    await user.upload(screen.getByTestId('receipt-input'), new File(['hi'], 'notes.txt', { type: 'text/plain' }));
    await user.upload(screen.getByTestId('receipt-input'), new File(['ok'], 'ok.jpg', { type: 'image/jpeg' }));

    expect(screen.queryByTestId('receipt-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('receipt-file-name')).toHaveTextContent('ok.jpg');
  });

  it('offers no dropzone on the Incoming tab and sends no receipt with an invoice payment', async () => {
    const user = userEvent.setup();
    renderPage('/payments/new?billId=bill-1');
    await fillBill(user);
    await user.upload(screen.getByTestId('receipt-input'), new File(['x'], 'proof.pdf', { type: 'application/pdf' }));

    await user.click(screen.getByTestId('type-invoice'));
    expect(screen.queryByTestId('receipt-field')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('option', { name: /7 - Client A/ })).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('select-document'), 'inv-1');
    await user.clear(screen.getByTestId('amount-input'));
    await user.type(screen.getByTestId('amount-input'), '50');
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => expect(recordInvoicePayment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(recordInvoicePayment).mock.calls[0][0]).not.toHaveProperty('paymentReceipt');

    // Back on Outgoing, the earlier file is gone rather than silently re-sent.
    await user.click(screen.getByTestId('type-bill'));
    expect(screen.getByTestId('receipt-dropzone')).toBeInTheDocument();
  });
});
