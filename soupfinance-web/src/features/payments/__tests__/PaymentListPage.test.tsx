/**
 * Unit tests for PaymentListPage.
 *
 * Focus: error handling per tab. The Finance module gate answers 403 with
 * `{"error": "Finance module is not enabled for this tenant"}` (SOUPFIN-8).
 *
 * Changed (SOUPFIN-180): each tab shows its own ApiErrorState, classified by
 * api/errors. One tab's 403 no longer has to wait for the other tab to fail
 * before the user is told the module is not enabled.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../i18n';
import { PaymentListPage } from '../PaymentListPage';

vi.mock('../../../api/endpoints/invoices', () => ({
  listAllInvoicePayments: vi.fn(),
}));
vi.mock('../../../api/endpoints/bills', () => ({
  listAllBillPayments: vi.fn(),
}));
vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ data: [] }),
}));
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => {
    const value = amount ?? 0;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
}));

import { listAllInvoicePayments } from '../../../api/endpoints/invoices';
import { listAllBillPayments } from '../../../api/endpoints/bills';

const FINANCE_GATE = { error: 'Finance module is not enabled for this tenant' };
// Spring Boot's envelope for a role denial (see memory: 403 body tells role from module)
const ROLE_DENIAL = { timestamp: '2026-10-13T10:00:00Z', status: 403, error: 'Forbidden', path: '/rest/billPayment/index.json' };

function axiosError(status: number, url: string, data: unknown = undefined) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    config: { url },
    response: { status, data },
  });
}

const invoiceGate = () => axiosError(403, '/invoicePayment/index.json', FINANCE_GATE);
const billGate = () => axiosError(403, '/billPayment/index.json', FINANCE_GATE);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PaymentListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PaymentListPage', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path — module enabled', () => {
    it('renders the tabs and the empty state when both endpoints return data', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([]);
      vi.mocked(listAllBillPayments).mockResolvedValue([]);

      renderPage();

      expect(await screen.findByTestId('payment-list-page')).toBeInTheDocument();
      expect(screen.getByTestId('payment-tabs')).toBeInTheDocument();
      expect(await screen.findByTestId('payment-list-empty')).toHaveTextContent('No incoming payments');
      expect(screen.queryByTestId('payment-list-error')).not.toBeInTheDocument();
    });

    // Added (SOUPFIN-178): entry points to the multi-invoice / multi-bill allocation screen
    it('offers Receive payment and Pay bills next to Record Payment', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([]);
      vi.mocked(listAllBillPayments).mockResolvedValue([]);

      renderPage();

      expect(await screen.findByTestId('receive-payment-button')).toHaveAttribute('href', '/payments/receive');
      expect(screen.getByTestId('pay-bills-button')).toHaveAttribute('href', '/payments/make');
      expect(screen.getByTestId('receive-payment-button')).not.toHaveAttribute('aria-disabled', 'true');
    });
  });

  // Added (SOUPFIN-180): the case the old "both must 403" rule got wrong
  describe('module disabled on ONE tab only', () => {
    beforeEach(() => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([]);
      vi.mocked(listAllBillPayments).mockRejectedValue(billGate());
    });

    it('explains the gate on the failing tab and leaves the working tab alone', async () => {
      const user = userEvent.setup();
      renderPage();

      // Incoming works: its empty state shows, no error
      expect(await screen.findByTestId('payment-list-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('payment-list-error')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('tab-outgoing'));

      const errorState = await screen.findByTestId('payment-list-error');
      expect(errorState).toHaveAttribute('data-error-kind', 'module_disabled');
      expect(screen.getByTestId('payment-list-error-title')).toHaveTextContent('Finance module is not available');
      expect(screen.getByTestId('payment-list-error-hint')).toHaveTextContent(/contact your administrator/i);
      // A retry cannot enable a module
      expect(screen.queryByTestId('payment-list-error-retry')).not.toBeInTheDocument();
      // Filters cannot help either
      expect(screen.queryByTestId('payment-filters')).not.toBeInTheDocument();
    });

    it('disables only the action for the gated side', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('pay-bills-button')).toHaveAttribute('aria-disabled', 'true')
      );
      expect(screen.getByTestId('pay-bills-button').className).toMatch(/pointer-events-none/);
      expect(screen.getByTestId('receive-payment-button')).toHaveAttribute('aria-disabled', 'false');
      // Record Payment can still take an invoice payment
      expect(screen.getByTestId('record-payment-button')).toHaveAttribute('aria-disabled', 'false');
    });
  });

  describe('module disabled on both tabs (SOUPFIN-8)', () => {
    beforeEach(() => {
      vi.mocked(listAllInvoicePayments).mockRejectedValue(invoiceGate());
      vi.mocked(listAllBillPayments).mockRejectedValue(billGate());
    });

    it('shows the module-disabled state on the default tab with its cause', async () => {
      renderPage();
      const errorState = await screen.findByTestId('payment-list-error');
      expect(errorState).toHaveAttribute('data-error-kind', 'module_disabled');
      expect(errorState).toHaveTextContent(/Finance module is not available/i);
      expect(errorState).toHaveTextContent(/requires the Finance module to be enabled/i);
      // Tabs stay so the user can see both sides are affected
      expect(screen.getByTestId('payment-tabs')).toBeInTheDocument();
    });

    it('disables all three header actions so users cannot reach a broken form', async () => {
      renderPage();
      await screen.findByTestId('payment-list-error');
      for (const id of ['record-payment-button', 'receive-payment-button', 'pay-bills-button']) {
        await waitFor(() => expect(screen.getByTestId(id)).toHaveAttribute('aria-disabled', 'true'));
        expect(screen.getByTestId(id).className).toMatch(/pointer-events-none/);
      }
    });

    it('links to the guide answer about enabling a module', async () => {
      renderPage();
      const errorState = await screen.findByTestId('payment-list-error');
      const help = within(errorState).getByRole('link', { name: /need help/i });
      expect(help.getAttribute('href')).toMatch(/module-not-enabled/);
    });
  });

  describe('other errors, branched by kind', () => {
    it('a role denial is "no permission", not "module disabled", and offers no retry', async () => {
      vi.mocked(listAllInvoicePayments).mockRejectedValue(
        axiosError(403, '/invoicePayment/index.json', ROLE_DENIAL)
      );
      vi.mocked(listAllBillPayments).mockResolvedValue([]);

      renderPage();

      const errorState = await screen.findByTestId('payment-list-error');
      expect(errorState).toHaveAttribute('data-error-kind', 'forbidden');
      expect(errorState).toHaveTextContent('You do not have permission');
      expect(errorState).not.toHaveTextContent(/Forbidden/);
      expect(screen.queryByTestId('payment-list-error-retry')).not.toBeInTheDocument();
      // A role denial is not a gate: the actions stay enabled
      expect(screen.getByTestId('receive-payment-button')).toHaveAttribute('aria-disabled', 'false');
    });

    it('a 500 shows the server-error state with a retry that refetches only that tab', async () => {
      vi.mocked(listAllInvoicePayments)
        .mockRejectedValueOnce(axiosError(500, '/invoicePayment/index.json'))
        .mockResolvedValueOnce([]);
      vi.mocked(listAllBillPayments).mockResolvedValue([]);
      const user = userEvent.setup();

      renderPage();

      const errorState = await screen.findByTestId('payment-list-error');
      expect(errorState).toHaveAttribute('data-error-kind', 'server_error');
      expect(errorState).not.toHaveTextContent(/status code/);
      // Filters stay: the user may still want them after the retry
      expect(screen.getByTestId('payment-filters')).toBeInTheDocument();
      const billCalls = vi.mocked(listAllBillPayments).mock.calls.length;

      await user.click(screen.getByTestId('payment-list-error-retry'));

      expect(await screen.findByTestId('payment-list-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('payment-list-error')).not.toBeInTheDocument();
      expect(listAllInvoicePayments).toHaveBeenCalledTimes(2);
      expect(vi.mocked(listAllBillPayments).mock.calls.length).toBe(billCalls);
    });

    it('a network failure says so instead of "no payments"', async () => {
      vi.mocked(listAllInvoicePayments).mockRejectedValue(
        Object.assign(new Error('Network Error'), { isAxiosError: true, config: { url: '/invoicePayment/index.json' } })
      );
      vi.mocked(listAllBillPayments).mockResolvedValue([]);

      renderPage();

      const errorState = await screen.findByTestId('payment-list-error');
      expect(errorState).toHaveAttribute('data-error-kind', 'network');
      expect(screen.queryByTestId('payment-list-empty')).not.toBeInTheDocument();
    });
  });

  // Added (SOUPFIN-180): every visible string comes from the payments namespace
  describe('translations', () => {
    it.each([
      ['de', 'Zahlung erfassen', 'Keine eingehenden Zahlungen'],
      ['fr', 'Enregistrer un paiement', 'Aucun paiement entrant'],
      ['nl', 'Betaling registreren', 'Geen inkomende betalingen'],
    ])('renders the page in %s', async (lang, recordLabel, emptyTitle) => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([]);
      vi.mocked(listAllBillPayments).mockResolvedValue([]);
      await i18n.changeLanguage(lang);
      try {
        renderPage();
        expect(await screen.findByTestId('payment-list-empty')).toHaveTextContent(emptyTitle);
        expect(screen.getByTestId('record-payment-button')).toHaveTextContent(recordLabel);
        // No raw key leaks through
        expect(screen.getByTestId('payment-list-page')).not.toHaveTextContent(/list\.\w+/);
      } finally {
        await i18n.changeLanguage('en');
      }
    });
  });
});
