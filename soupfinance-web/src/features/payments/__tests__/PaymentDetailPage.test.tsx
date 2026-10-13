/**
 * SOUPFIN-177: payment detail page and the "Void payment" action.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentDetailPage } from '../PaymentDetailPage';
import { DeleteBlockedError, DeletePendingApprovalError } from '../../../api/endpoints/deleteOutcome';
import i18n from '../../../i18n';
import enPayments from '../../../i18n/locales/en/payments.json';
import dePayments from '../../../i18n/locales/de/payments.json';
import frPayments from '../../../i18n/locales/fr/payments.json';
import nlPayments from '../../../i18n/locales/nl/payments.json';

vi.mock('../../../api/endpoints/invoices', () => ({
  getInvoicePayment: vi.fn(),
  deleteInvoicePayment: vi.fn(),
}));
vi.mock('../../../api/endpoints/bills', () => ({
  getBillPayment: vi.fn(),
  deleteBillPayment: vi.fn(),
}));
vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: [{ id: 'pm-momo', name: 'MTN Mobile Money' }] }),
}));
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) =>
    `$${(amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
}));
const showToast = vi.fn();
vi.mock('../../../components/feedback/ToastProvider', () => ({
  useToast: () => ({ showToast, hideToast: vi.fn(), hideAllToasts: vi.fn() }),
}));

import { getInvoicePayment, deleteInvoicePayment } from '../../../api/endpoints/invoices';
import { getBillPayment, deleteBillPayment } from '../../../api/endpoints/bills';

const invoicePayment = {
  id: 'ip-1',
  invoice: {
    id: 'inv-9',
    serialised: 'Invoice(number:2025001, accountServices:Direct Account : Corporate(Pan African Developers Pte Ltd), currency:USD, total:6095.00)',
  },
  paymentMethod: { id: 'pm-momo', serialised: 'stale' },
  payInAccount: { id: 'la-1', serialised: 'GT Bank USD Account' },
  amount: 1990,
  paymentDate: '2025-09-17',
  currency: 'USD',
  quickReference: '03E4211FE7',
  notes: 'Part payment',
  dateCreated: '2026-09-30T00:46:26Z',
};

const billPayment = {
  id: 'bp-1',
  bill: { id: 'bill-4', serialised: 'Bill((805 Restaurant)[PROVIDER], 43)' },
  paymentMethod: { id: 'pm-x', serialised: 'Cheque' },
  payOutAccount: { id: 'la-2', name: 'Cash on Hand', code: '1010' },
  amount: 1.22,
  paymentDate: '2026-10-13',
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/payments/:type/:id" element={<PaymentDetailPage />} />
          <Route path="/payments" element={<div data-testid="payment-list-page" />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { invalidate };
}

/** Every key invalidateQueries was called with, as JSON for easy matching. */
function invalidatedKeys(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((c: unknown[]) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
}

describe('PaymentDetailPage (SOUPFIN-177)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInvoicePayment).mockResolvedValue(invoicePayment as never);
    vi.mocked(getBillPayment).mockResolvedValue(billPayment as never);
  });

  it('shows the invoice, amount, method, account, reference and date', async () => {
    renderAt('/payments/invoice/ip-1');

    expect(await screen.findByTestId('payment-detail-amount')).toHaveTextContent('+$1,990.00');
    expect(getInvoicePayment).toHaveBeenCalledWith('ip-1');
    expect(screen.getByTestId('payment-detail-heading')).toHaveTextContent('Payment received');
    expect(screen.getByTestId('payment-detail-document-link')).toHaveTextContent('Invoice #2025001');
    expect(screen.getByTestId('payment-detail-document-link')).toHaveAttribute('href', '/invoices/inv-9');
    expect(screen.getByTestId('payment-detail-party')).toHaveTextContent('Pan African Developers Pte Ltd');
    expect(screen.getByTestId('payment-detail-method')).toHaveTextContent('MTN Mobile Money');
    expect(screen.getByTestId('payment-detail-account')).toHaveTextContent('GT Bank USD Account');
    expect(screen.getByTestId('payment-detail-reference')).toHaveTextContent('03E4211FE7');
    expect(screen.getByTestId('payment-detail-date')).toHaveTextContent('2025-09-17');
    expect(screen.getByTestId('payment-detail-recorded')).toHaveTextContent('2026-09-30');
    expect(screen.getByTestId('payment-detail-notes')).toHaveTextContent('Part payment');
  });

  it('shows a bill payment with its paid-from account', async () => {
    renderAt('/payments/bill/bp-1');

    expect(await screen.findByTestId('payment-detail-amount')).toHaveTextContent('-$1.22');
    expect(getBillPayment).toHaveBeenCalledWith('bp-1');
    expect(getInvoicePayment).not.toHaveBeenCalled();
    expect(screen.getByTestId('payment-detail-heading')).toHaveTextContent('Payment made');
    expect(screen.getByTestId('payment-detail-document-link')).toHaveAttribute('href', '/bills/bill-4');
    expect(screen.getByTestId('payment-detail-account')).toHaveTextContent('1010 · Cash on Hand');
    expect(screen.getByTestId('payment-detail-method')).toHaveTextContent('Cheque');
    expect(screen.getByTestId('payment-detail-back')).toHaveAttribute('href', '/payments?tab=outgoing');
  });

  it('an unknown :type is a not-found page and fetches nothing', async () => {
    renderAt('/payments/voucher/x');

    expect(await screen.findByTestId('payment-detail-not-found')).toBeInTheDocument();
    expect(getInvoicePayment).not.toHaveBeenCalled();
    expect(getBillPayment).not.toHaveBeenCalled();
  });

  it('a payment that cannot be loaded shows the error state', async () => {
    vi.mocked(getInvoicePayment).mockRejectedValue({ response: { status: 404 } });

    renderAt('/payments/invoice/gone');

    expect(await screen.findByTestId('payment-detail-error')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-void-button')).not.toBeInTheDocument();
  });

  it('Keep payment closes the dialog without deleting', async () => {
    renderAt('/payments/invoice/ip-1');
    await userEvent.click(await screen.findByTestId('payment-void-button'));

    expect(screen.getByTestId('payment-void-dialog')).toHaveTextContent('Void this payment?');
    expect(screen.getByTestId('payment-void-cancel')).toHaveFocus();
    await userEvent.click(screen.getByTestId('payment-void-cancel'));

    expect(screen.queryByTestId('payment-void-dialog')).not.toBeInTheDocument();
    expect(deleteInvoicePayment).not.toHaveBeenCalled();
  });

  it('Escape closes the dialog', async () => {
    renderAt('/payments/invoice/ip-1');
    await userEvent.click(await screen.findByTestId('payment-void-button'));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByTestId('payment-void-dialog')).not.toBeInTheDocument();
  });

  it('voiding an invoice payment deletes it, refreshes the invoice and payment lists, and returns to the list', async () => {
    vi.mocked(deleteInvoicePayment).mockResolvedValue(undefined);
    const { invalidate } = renderAt('/payments/invoice/ip-1');

    await userEvent.click(await screen.findByTestId('payment-void-button'));
    await userEvent.click(screen.getByTestId('payment-void-confirm'));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/payments$/));
    expect(deleteInvoicePayment).toHaveBeenCalledWith('ip-1');
    expect(deleteBillPayment).not.toHaveBeenCalled();
    const keys = invalidatedKeys(invalidate);
    expect(keys).toEqual(
      expect.arrayContaining(['["invoice-payments"]', '["invoices"]', '["invoice","inv-9"]', '["dashboard-stats"]'])
    );
    expect(keys).not.toContain('["bill-payments"]');
    expect(showToast).toHaveBeenCalledWith({ variant: 'success', message: 'Payment voided.' });
  });

  it('voiding a bill payment refreshes the bill side and returns to the outgoing tab', async () => {
    vi.mocked(deleteBillPayment).mockResolvedValue(undefined);
    const { invalidate } = renderAt('/payments/bill/bp-1');

    await userEvent.click(await screen.findByTestId('payment-void-button'));
    await userEvent.click(screen.getByTestId('payment-void-confirm'));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/payments?tab=outgoing'));
    expect(deleteBillPayment).toHaveBeenCalledWith('bp-1');
    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining(['["bill-payments"]', '["bills"]', '["bill","bill-4"]'])
    );
  });

  it('a refused void (relatedList) keeps the user on the page with an explanation', async () => {
    vi.mocked(deleteInvoicePayment).mockRejectedValue(new DeleteBlockedError(['finance']));
    const { invalidate } = renderAt('/payments/invoice/ip-1');

    await userEvent.click(await screen.findByTestId('payment-void-button'));
    await userEvent.click(screen.getByTestId('payment-void-confirm'));

    expect(await screen.findByTestId('payment-void-error')).toHaveTextContent(
      'This payment was not voided because other records still use it (finance).'
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/payments/invoice/ip-1');
    expect(invalidate).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a non-admin void that became an approval request says so', async () => {
    vi.mocked(deleteInvoicePayment).mockRejectedValue(new DeletePendingApprovalError('dr-1'));
    renderAt('/payments/invoice/ip-1');

    await userEvent.click(await screen.findByTestId('payment-void-button'));
    await userEvent.click(screen.getByTestId('payment-void-confirm'));

    expect(await screen.findByTestId('payment-void-error')).toHaveTextContent('sent to an administrator');
  });

  it('a server error is shown in the dialog, and the void can be retried', async () => {
    vi.mocked(deleteInvoicePayment)
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} }, message: 'Request failed with status code 500' })
      .mockResolvedValueOnce(undefined);
    renderAt('/payments/invoice/ip-1');

    await userEvent.click(await screen.findByTestId('payment-void-button'));
    await userEvent.click(screen.getByTestId('payment-void-confirm'));
    expect(await screen.findByTestId('payment-void-error')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('payment-void-confirm'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/payments$/));
    expect(deleteInvoicePayment).toHaveBeenCalledTimes(2);
  });

  it('a refused void that names no module gives the plain explanation', async () => {
    vi.mocked(deleteInvoicePayment).mockRejectedValue(new DeleteBlockedError([]));
    renderAt('/payments/invoice/ip-1');

    await userEvent.click(await screen.findByTestId('payment-void-button'));
    await userEvent.click(screen.getByTestId('payment-void-confirm'));

    expect(await screen.findByTestId('payment-void-error')).toHaveTextContent(
      /^This payment was not voided because other records still use it\.$/
    );
  });

  // Added (SOUPFIN-177): the detail page and void dialog read in every app language
  describe('translations', () => {
    it('every locale has the same detail keys and placeholders as English', () => {
      const placeholders = (v: string) => (v.match(/{{\w+}}/g) ?? []).sort().join(',');
      const en = enPayments.detail as Record<string, string>;
      for (const locale of [dePayments, frPayments, nlPayments]) {
        const other = locale.detail as Record<string, string>;
        expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
        for (const key of Object.keys(en)) {
          expect(other[key].trim()).not.toBe('');
          expect(placeholders(other[key])).toBe(placeholders(en[key]));
        }
      }
    });

    it.each([
      ['de', 'Zahlung erhalten', 'Zahlung stornieren', 'Diese Zahlung stornieren?', 'Zahlung behalten'],
      ['fr', 'Paiement reçu', 'Annuler le paiement', 'Annuler ce paiement ?', 'Conserver le paiement'],
      ['nl', 'Betaling ontvangen', 'Betaling ongedaan maken', 'Deze betaling ongedaan maken?', 'Betaling behouden'],
    ])('renders the detail page and void dialog in %s', async (lang, heading, voidLabel, dialogTitle, keepLabel) => {
      await i18n.changeLanguage(lang);
      try {
        renderAt('/payments/invoice/ip-1');

        expect(await screen.findByTestId('payment-detail-heading')).toHaveTextContent(heading);
        expect(screen.getByTestId('payment-void-button')).toHaveTextContent(voidLabel);

        await userEvent.click(screen.getByTestId('payment-void-button'));
        const dialog = screen.getByTestId('payment-void-dialog');
        expect(dialog).toHaveTextContent(dialogTitle);
        // the amount and the invoice are interpolated, not dropped
        expect(dialog).toHaveTextContent('$1,990.00');
        expect(dialog).toHaveTextContent('Invoice #2025001');
        expect(screen.getByTestId('payment-void-cancel')).toHaveTextContent(keepLabel);

        // no raw key and no English left behind
        expect(screen.getByTestId('payment-detail-page')).not.toHaveTextContent(/detail\.\w+/);
        expect(screen.getByTestId('payment-detail-page')).not.toHaveTextContent(/Void|Payment date|Keep payment/);
      } finally {
        await i18n.changeLanguage('en');
      }
    });

    it('a refused void in German names the modules and stays on the page', async () => {
      vi.mocked(deleteInvoicePayment).mockRejectedValue(new DeleteBlockedError(['finance', 'ledger']));
      await i18n.changeLanguage('de');
      try {
        renderAt('/payments/invoice/ip-1');
        await userEvent.click(await screen.findByTestId('payment-void-button'));
        await userEvent.click(screen.getByTestId('payment-void-confirm'));

        expect(await screen.findByTestId('payment-void-error')).toHaveTextContent(
          'Diese Zahlung wurde nicht storniert, weil andere Datensätze sie noch verwenden (finance, ledger).'
        );
        expect(screen.getByTestId('location')).toHaveTextContent('/payments/invoice/ip-1');
      } finally {
        await i18n.changeLanguage('en');
      }
    });

    it('a successful void toasts in the active language', async () => {
      vi.mocked(deleteBillPayment).mockResolvedValue(undefined);
      await i18n.changeLanguage('fr');
      try {
        renderAt('/payments/bill/bp-1');
        await userEvent.click(await screen.findByTestId('payment-void-button'));
        expect(screen.getByTestId('payment-detail-back')).toHaveTextContent('Retour aux paiements sortants');
        expect(screen.getByTestId('payment-void-dialog')).toHaveTextContent('La facture fournisseur');
        await userEvent.click(screen.getByTestId('payment-void-confirm'));

        await waitFor(() => expect(showToast).toHaveBeenCalledWith({ variant: 'success', message: 'Paiement annulé.' }));
      } finally {
        await i18n.changeLanguage('en');
      }
    });
  });
});
