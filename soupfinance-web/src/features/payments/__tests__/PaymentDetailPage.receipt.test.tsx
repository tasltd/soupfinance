/**
 * SOUPFIN-179: the payment detail page shows and downloads BillPayment.paymentReceipt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentDetailPage } from '../PaymentDetailPage';

vi.mock('../../../api/endpoints/invoices', () => ({
  getInvoicePayment: vi.fn(),
  deleteInvoicePayment: vi.fn(),
}));
vi.mock('../../../api/endpoints/bills', () => ({
  getBillPayment: vi.fn(),
  deleteBillPayment: vi.fn(),
  downloadPaymentReceipt: vi.fn(),
}));
vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: [] }),
}));
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => `$${(amount ?? 0).toFixed(2)}`,
}));
vi.mock('../../../components/feedback/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn(), hideToast: vi.fn(), hideAllToasts: vi.fn() }),
}));

import { getInvoicePayment } from '../../../api/endpoints/invoices';
import { getBillPayment, downloadPaymentReceipt } from '../../../api/endpoints/bills';

const billPayment = {
  id: 'bp-1',
  bill: { id: 'bill-4', serialised: 'Bill((805 Restaurant)[PROVIDER], 43)' },
  payOutAccount: { id: 'la-2', name: 'Cash on Hand', code: '1010' },
  amount: 1.22,
  paymentDate: '2026-10-13',
  quickReference: '08FF1C9C7D',
};

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/payments/:type/:id" element={<PaymentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PaymentDetailPage receipt (SOUPFIN-179)', () => {
  const createObjectURL = vi.fn(() => 'blob:receipt');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads the attached receipt by its SoupBrokerFile id', async () => {
    vi.mocked(getBillPayment).mockResolvedValue({
      ...billPayment,
      paymentReceipt: { id: 'file-77', class: 'soupbroker.tools.SoupBrokerFile' },
    } as never);
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    vi.mocked(downloadPaymentReceipt).mockResolvedValue(blob);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderAt('/payments/bill/bp-1');
    const button = await screen.findByTestId('payment-detail-receipt-download');
    await userEvent.click(button);

    await waitFor(() => expect(downloadPaymentReceipt).toHaveBeenCalledWith('file-77'));
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('payment-receipt-08FF1C9C7D.pdf');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:receipt');
  });

  it('shows the error when the download fails', async () => {
    vi.mocked(getBillPayment).mockResolvedValue({ ...billPayment, paymentReceipt: { id: 'file-77' } } as never);
    vi.mocked(downloadPaymentReceipt).mockRejectedValue(new Error('Network Error'));

    renderAt('/payments/bill/bp-1');
    await userEvent.click(await screen.findByTestId('payment-detail-receipt-download'));

    expect(await screen.findByTestId('payment-detail-receipt-error')).toBeInTheDocument();
    expect(screen.getByTestId('payment-detail-receipt-download')).toHaveTextContent('Download receipt');
  });

  it.each([undefined, null])('says "None attached" when paymentReceipt is %s', async (paymentReceipt) => {
    vi.mocked(getBillPayment).mockResolvedValue({ ...billPayment, paymentReceipt } as never);
    renderAt('/payments/bill/bp-1');
    expect(await screen.findByTestId('payment-detail-receipt')).toHaveTextContent('None attached');
    expect(screen.queryByTestId('payment-detail-receipt-download')).not.toBeInTheDocument();
  });

  it('has no receipt row for an invoice payment', async () => {
    vi.mocked(getInvoicePayment).mockResolvedValue({
      id: 'ip-1',
      invoice: { id: 'inv-9', serialised: 'Invoice(number:2025001)' },
      amount: 10,
      paymentDate: '2026-10-13',
    } as never);
    renderAt('/payments/invoice/ip-1');
    await screen.findByTestId('payment-detail-amount');
    expect(screen.queryByTestId('payment-detail-receipt')).not.toBeInTheDocument();
  });
});
