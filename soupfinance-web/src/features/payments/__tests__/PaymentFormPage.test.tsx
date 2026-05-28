/**
 * Unit tests for PaymentFormPage.
 *
 * Focus: graceful handling of the 403-on-source-list scenario that occurs
 * when the Finance module is not enabled (SOUPFIN-8). The form must NOT
 * render with empty dropdowns when the underlying invoice/bill list endpoint
 * is forbidden — it should render a clear "module not available" page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

import { listInvoices } from '../../../api/endpoints/invoices';
import { listBills } from '../../../api/endpoints/bills';

function buildAxiosError(status: number) {
  return {
    name: 'AxiosError',
    message: `Request failed with status code ${status}`,
    response: { status },
  };
}

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
  beforeEach(() => {
    vi.clearAllMocks();
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
});
