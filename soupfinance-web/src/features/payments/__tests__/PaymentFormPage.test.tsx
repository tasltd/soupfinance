/**
 * Unit tests for PaymentFormPage.
 *
 * Focus: the 403-on-source-list scenario that occurs when the Finance module is
 * not enabled (SOUPFIN-8).
 *
 * Changed (SOUPFIN-180): the page now keeps the form on screen and shows
 * ModuleDisabledBanner above it, as the Journal Entry and Voucher forms do.
 * Submit stays disabled, so the user cannot send a payment into a guaranteed 403.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../i18n';
import { PaymentFormPage } from '../PaymentFormPage';

vi.mock('../../../api/endpoints/invoices', () => ({
  listInvoices: vi.fn(),
  recordInvoicePayment: vi.fn(),
}));
vi.mock('../../../api/endpoints/bills', () => ({
  listBills: vi.fn(),
  recordBillPayment: vi.fn(),
}));
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => {
    const value = amount ?? 0;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
  useCurrencySymbol: () => '$',
}));
vi.mock('../../../hooks/useLedgerAccounts', () => ({
  useLedgerAccounts: () => ({ data: [], isLoading: false }),
}));
vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: [], isLoading: false }),
}));

import { listInvoices, recordInvoicePayment } from '../../../api/endpoints/invoices';
import { listBills } from '../../../api/endpoints/bills';
import type { Bill, Invoice } from '../../../types';

const FINANCE_GATE = { error: 'Finance module is not enabled for this tenant' };

function axiosError(status: number, url: string, data: unknown = undefined) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    config: { url },
    response: { status, data },
  });
}

const OPEN_INVOICE = {
  id: 'inv-1',
  number: 1001,
  status: 'SENT',
  amountDue: 500,
  accountServices: { id: 'as-1', serialised: 'Acme Ltd' },
} as unknown as Invoice;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PaymentFormPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PaymentFormPage', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path — module enabled', () => {
    it('renders the form without a banner when invoices load', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);
      vi.mocked(listBills).mockResolvedValue([]);

      renderPage();

      expect(await screen.findByTestId('payment-form-page')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('payment-type-toggle')).toBeInTheDocument());
      expect(screen.queryByTestId('payment-form-module-disabled')).not.toBeInTheDocument();
      expect(screen.queryByTestId('document-load-error')).not.toBeInTheDocument();
    });

    // Added (SOUPFIN-180): the mutation error is parsed, never axios's own text
    it('shows a readable message when recording the payment fails', async () => {
      vi.mocked(listInvoices).mockResolvedValue([OPEN_INVOICE]);
      vi.mocked(recordInvoicePayment).mockRejectedValue(axiosError(500, '/invoicePayment/save.json'));
      const user = userEvent.setup();

      renderPage();

      await waitFor(() => expect(screen.getByRole('option', { name: /1001/ })).toBeInTheDocument());
      await user.selectOptions(screen.getByTestId('select-document'), 'inv-1');
      await user.type(screen.getByTestId('amount-input'), '100');
      await user.click(screen.getByTestId('submit-button'));

      const formError = await screen.findByTestId('form-error');
      expect(formError).toHaveTextContent('Something went wrong on our side');
      expect(formError).not.toHaveTextContent(/status code/);
      expect(recordInvoicePayment).toHaveBeenCalledWith(
        expect.objectContaining({ 'invoice.id': 'inv-1', amount: 100 })
      );
    });
  });

  // Added (SOUPFIN-184): only posted bills with a balance can be paid
  describe('bill choices follow the lifecycle', () => {
    it('offers pending and overdue bills, never draft, voided or paid ones', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);
      const bill = (id: string, number: number, extra: Record<string, unknown>) =>
        ({ id, billNumber: `BILL-${number}`, amountDue: 300, paymentDate: '2099-12-31', status: 'PENDING', ...extra }) as unknown as Bill;
      vi.mocked(listBills).mockResolvedValue([
        bill('b-pending', 1, {}),
        bill('b-overdue', 2, { paymentDate: '2020-01-01' }),
        bill('b-draft', 3, { status: null, postingStatus: 'DRAFT' }),
        bill('b-void', 4, { postingStatus: 'CANCELLED' }),
        bill('b-paid', 5, { status: 'PAID', amountDue: 0 }),
      ]);
      const user = userEvent.setup();

      renderPage();
      await user.click(await screen.findByTestId('type-bill'));

      await waitFor(() => expect(screen.getByRole('option', { name: /BILL-1/ })).toBeInTheDocument());
      const values = Array.from(
        (screen.getByTestId('select-document') as HTMLSelectElement).options,
        (o) => o.value
      ).filter(Boolean);
      expect(values).toEqual(['b-pending', 'b-overdue']);
    });
  });

  describe('module disabled — 403 on the invoice list (SOUPFIN-8)', () => {
    beforeEach(() => {
      vi.mocked(listInvoices).mockRejectedValue(axiosError(403, '/invoice/index.json', FINANCE_GATE));
      vi.mocked(listBills).mockRejectedValue(axiosError(403, '/bill/index.json', FINANCE_GATE));
    });

    it('shows ModuleDisabledBanner with the cause and the next step', async () => {
      renderPage();
      const banner = await screen.findByTestId('payment-form-module-disabled');
      expect(banner).toHaveAttribute('role', 'alert');
      expect(banner).toHaveTextContent(/Finance module is not available/i);
      expect(banner).toHaveTextContent(/requires the Finance module to be enabled/i);
      expect(banner).toHaveTextContent(/Contact your administrator/i);
      expect(banner).toHaveTextContent(/nothing to record a payment against/i);
    });

    it('keeps the form layout visible under the banner', async () => {
      renderPage();
      await screen.findByTestId('payment-form-module-disabled');
      expect(screen.getByTestId('payment-type-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('select-document')).toBeInTheDocument();
      expect(screen.getByTestId('amount-input')).toBeInTheDocument();
      // The banner already explains the empty dropdown; no second error line
      expect(screen.queryByTestId('document-load-error')).not.toBeInTheDocument();
    });

    it('keeps Record Payment disabled even when an amount is typed', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('payment-form-module-disabled');
      await user.type(screen.getByTestId('amount-input'), '100');
      expect(screen.getByTestId('submit-button')).toBeDisabled();
      expect(recordInvoicePayment).not.toHaveBeenCalled();
    });

    it('follows the payment type: the bill side is gated too', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('payment-form-module-disabled');
      await user.click(screen.getByTestId('type-bill'));
      await waitFor(() => expect(listBills).toHaveBeenCalled());
      expect(await screen.findByTestId('payment-form-module-disabled')).toBeInTheDocument();
    });
  });

  describe('non-module errors', () => {
    it('a 500 keeps the form, shows no banner, and names the failure under the dropdown', async () => {
      vi.mocked(listInvoices).mockRejectedValue(axiosError(500, '/invoice/index.json'));
      vi.mocked(listBills).mockResolvedValue([]);

      renderPage();

      const loadError = await screen.findByTestId('document-load-error');
      expect(loadError).toHaveTextContent('The list could not be loaded');
      expect(loadError).not.toHaveTextContent(/status code/);
      expect(screen.getByTestId('payment-type-toggle')).toBeInTheDocument();
      expect(screen.queryByTestId('payment-form-module-disabled')).not.toBeInTheDocument();
    });

    it('a role denial (Spring "Forbidden" body) is not reported as a disabled module', async () => {
      vi.mocked(listInvoices).mockRejectedValue(
        axiosError(403, '/invoice/index.json', { status: 403, error: 'Forbidden' })
      );

      renderPage();

      const loadError = await screen.findByTestId('document-load-error');
      expect(loadError).toHaveTextContent(/does not have permission/);
      expect(screen.queryByTestId('payment-form-module-disabled')).not.toBeInTheDocument();
    });
  });

  // Added (SOUPFIN-180)
  describe('translations', () => {
    it.each([
      ['de', 'Zahlung erfassen', 'Zahlungsdatum'],
      ['fr', 'Enregistrer un paiement', 'Date du paiement'],
      ['nl', 'Betaling registreren', 'Betaaldatum'],
    ])('renders the form in %s', async (lang, heading, dateLabel) => {
      vi.mocked(listInvoices).mockResolvedValue([]);
      await i18n.changeLanguage(lang);
      try {
        renderPage();
        expect(await screen.findByTestId('payment-form-heading')).toHaveTextContent(heading);
        expect(screen.getByText(new RegExp(dateLabel))).toBeInTheDocument();
        expect(screen.getByTestId('payment-form-page')).not.toHaveTextContent(/form\.\w+/);
      } finally {
        await i18n.changeLanguage('en');
      }
    });
  });
});
