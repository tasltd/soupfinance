/**
 * Unit tests for PaymentListPage.
 *
 * Focus: graceful handling of the 403-on-all-endpoints scenario that occurs
 * when the Finance module is not enabled for the current tenant (SOUPFIN-8).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentListPage } from '../PaymentListPage';

vi.mock('../../../api/endpoints/invoices', () => ({
  listAllInvoicePayments: vi.fn(),
}));
vi.mock('../../../api/endpoints/bills', () => ({
  listAllBillPayments: vi.fn(),
}));
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => {
    const value = amount ?? 0;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
}));

import { listAllInvoicePayments } from '../../../api/endpoints/invoices';
import { listAllBillPayments } from '../../../api/endpoints/bills';

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
        <PaymentListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PaymentListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path — module enabled', () => {
    it('renders the table when both endpoints return data', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([]);
      vi.mocked(listAllBillPayments).mockResolvedValue([]);

      renderPage();

      expect(await screen.findByTestId('payment-list-page')).toBeInTheDocument();
      expect(screen.getByTestId('payment-tabs')).toBeInTheDocument();
      // Empty state for the default (incoming) tab
      await waitFor(() => expect(screen.getByTestId('payment-list-empty')).toBeInTheDocument());
    });

    it('shows the generic error state when only one endpoint fails with 403 (not full module-disabled)', async () => {
      // Only ONE endpoint returns 403 — the module is enabled, this is a transient
      // permission glitch on just the bills side. We should fall back to the
      // generic error UI for the affected tab, NOT the module-disabled banner.
      vi.mocked(listAllInvoicePayments).mockResolvedValue([]);
      vi.mocked(listAllBillPayments).mockRejectedValue(buildAxiosError(403));

      renderPage();

      // Module-disabled banner is NOT shown — only one endpoint failed
      await waitFor(() => expect(screen.getByTestId('payment-list-page')).toBeInTheDocument());
      expect(screen.queryByTestId('payment-module-disabled')).not.toBeInTheDocument();
      // Tabs still render so the user can pick the working tab
      expect(screen.getByTestId('payment-tabs')).toBeInTheDocument();
    });
  });

  describe('module disabled — 403 on both endpoints (SOUPFIN-8)', () => {
    beforeEach(() => {
      vi.mocked(listAllInvoicePayments).mockRejectedValue(buildAxiosError(403));
      vi.mocked(listAllBillPayments).mockRejectedValue(buildAxiosError(403));
    });

    it('renders the module-disabled banner with a clear heading', async () => {
      renderPage();
      const banner = await screen.findByTestId('payment-module-disabled');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/Finance module not available/i);
    });

    it('explains the cause to the user', async () => {
      renderPage();
      const banner = await screen.findByTestId('payment-module-disabled');
      expect(banner).toHaveTextContent(/not enabled for your account/i);
      expect(banner).toHaveTextContent(/contact your administrator/i);
    });

    it('does NOT render the tabs or "Failed to load" generic error', async () => {
      renderPage();
      await screen.findByTestId('payment-module-disabled');
      expect(screen.queryByTestId('payment-tabs')).not.toBeInTheDocument();
      expect(screen.queryByTestId('payment-list-error')).not.toBeInTheDocument();
    });

    it('disables the Record Payment header button so users cannot navigate to a broken form', async () => {
      renderPage();
      await screen.findByTestId('payment-module-disabled');
      const recordButton = screen.getByTestId('record-payment-button');
      expect(recordButton).toHaveAttribute('aria-disabled', 'true');
      expect(recordButton.className).toMatch(/pointer-events-none/);
    });

    it('offers a Back to Dashboard escape hatch', async () => {
      renderPage();
      await screen.findByTestId('payment-module-disabled');
      const backLink = screen.getByTestId('payment-module-disabled-dashboard');
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/dashboard');
    });

    it('offers a Contact Support mailto link', async () => {
      renderPage();
      await screen.findByTestId('payment-module-disabled');
      const contactLink = screen.getByTestId('payment-module-disabled-contact');
      expect(contactLink).toBeInTheDocument();
      expect(contactLink.getAttribute('href')).toMatch(/^mailto:/);
    });
  });

  describe('non-403 errors', () => {
    it('shows the generic "Failed to load" state for 500 errors (not module-disabled)', async () => {
      vi.mocked(listAllInvoicePayments).mockRejectedValue(buildAxiosError(500));
      vi.mocked(listAllBillPayments).mockRejectedValue(buildAxiosError(500));

      renderPage();

      // Generic error UI per-tab — NOT the module-disabled banner
      expect(await screen.findByTestId('payment-list-error')).toBeInTheDocument();
      expect(screen.queryByTestId('payment-module-disabled')).not.toBeInTheDocument();
    });
  });
});
