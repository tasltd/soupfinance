/**
 * SOUPFIN-177: Payments list — server pagination, recorded-date and method
 * filters, method badges from the PaymentMethod record, and a detail link.
 *
 * The invoices/bills endpoint modules are mocked at the list-call level so
 * the real listPaymentsPage runs between the page and the "server".
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../i18n';
import { PaymentListPage, PAYMENT_PAGE_SIZE } from '../PaymentListPage';

vi.mock('../../../api/endpoints/invoices', () => ({
  listAllInvoicePayments: vi.fn(),
}));
vi.mock('../../../api/endpoints/bills', () => ({
  listAllBillPayments: vi.fn(),
}));
vi.mock('../../../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({
    data: [
      { id: 'pm-bank', name: 'Bank Transfer' },
      { id: 'pm-momo', name: 'MTN Mobile Money' },
    ],
  }),
}));
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) =>
    `$${(amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
}));

import { listAllInvoicePayments } from '../../../api/endpoints/invoices';
import { listAllBillPayments } from '../../../api/endpoints/bills';
import type { InvoicePayment, BillPayment } from '../../../types';

const MOMO = { id: 'pm-momo', class: 'soupbroker.finance.PaymentMethod', serialised: 'MTN Mobile Money' };
const BANK = { id: 'pm-bank', class: 'soupbroker.finance.PaymentMethod', serialised: 'Bank Transfer' };

function incoming(i: number, totalCount: number, method: typeof MOMO | null = MOMO): InvoicePayment {
  return {
    id: `ip-${i}`,
    invoice: {
      id: `inv-${i}`,
      serialised: `Invoice(number:${1000 + i}, accountServices:Direct Account : Corporate(Client ${i} Ltd), currency:USD, total:10.00)`,
    },
    paymentMethod: method ?? undefined,
    amount: 10 + i,
    paymentDate: '2026-10-01',
    quickReference: `QR-${i}`,
    totalCount,
  };
}

function outgoing(i: number, totalCount: number): BillPayment {
  return {
    id: `bp-${i}`,
    bill: { id: `bill-${i}`, serialised: `Bill((Vendor ${i})[SUPPLIER], ${i})` },
    paymentMethod: BANK,
    amount: 5,
    paymentDate: '2026-10-02',
    totalCount,
  };
}

/** Query params of the n-th call to a mocked list function. */
function paramsOf(fn: unknown, n: number): Record<string, unknown> {
  return (vi.mocked(fn as typeof listAllInvoicePayments).mock.calls[n]?.[0] ?? {}) as Record<string, unknown>;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(initialPath = '/payments') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/payments" element={<PaymentListPage />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PaymentListPage (SOUPFIN-177)', () => {
  // Added (SOUPFIN-180): the page now reads its strings from the payments namespace
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAllBillPayments).mockResolvedValue([outgoing(1, 1)]);
  });

  describe('server pagination', () => {
    it('asks the server for page 1 and shows the range and page count from totalCount', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue(
        Array.from({ length: PAYMENT_PAGE_SIZE }, (_, i) => incoming(i, 45))
      );

      renderPage();

      expect(await screen.findByTestId('pagination-range')).toHaveTextContent('Showing 1–20 of 45 incoming payments');
      expect(paramsOf(listAllInvoicePayments, 0)).toMatchObject({ max: 20, offset: 0, sort: 'paymentDate', order: 'desc' });
      expect(screen.getByTestId('pagination-page-3')).toBeInTheDocument();
      expect(screen.queryByTestId('pagination-page-4')).not.toBeInTheDocument();
      expect(screen.getByTestId('pagination-prev')).toBeDisabled();
      // the tab badge shows the filtered total, not the rows on screen
      expect(within(screen.getByTestId('tab-incoming')).getByText('45')).toBeInTheDocument();
    });

    it('Next requests offset 20 and shows the next rows', async () => {
      vi.mocked(listAllInvoicePayments).mockImplementation(async (params) => {
        const offset = Number(params?.offset ?? 0);
        const count = Math.min(PAYMENT_PAGE_SIZE, 45 - offset);
        return Array.from({ length: count }, (_, i) => incoming(offset + i, 45));
      });

      renderPage();
      await screen.findByTestId('payment-row-ip-0');
      await userEvent.click(screen.getByTestId('pagination-next'));

      expect(await screen.findByTestId('payment-row-ip-20')).toBeInTheDocument();
      expect(screen.queryByTestId('payment-row-ip-0')).not.toBeInTheDocument();
      expect(screen.getByTestId('pagination-range')).toHaveTextContent('Showing 21–40 of 45');
      expect(screen.getByTestId('pagination-page-2')).toHaveAttribute('aria-current', 'page');

      await userEvent.click(screen.getByTestId('pagination-page-3'));
      expect(await screen.findByTestId('payment-row-ip-44')).toBeInTheDocument();
      expect(screen.getByTestId('pagination-range')).toHaveTextContent('Showing 41–45 of 45');
      expect(screen.getByTestId('pagination-next')).toBeDisabled();
    });

    it('hides the pager when everything fits on one page', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([incoming(1, 3), incoming(2, 3), incoming(3, 3)]);

      renderPage();

      expect(await screen.findByTestId('pagination-range')).toHaveTextContent('Showing 1–3 of 3');
      expect(screen.queryByTestId('payment-pagination')).not.toBeInTheDocument();
    });

    it('overflow: 10,000 payments → a compact pager, not 500 buttons', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue(
        Array.from({ length: PAYMENT_PAGE_SIZE }, (_, i) => incoming(i, 10_000))
      );

      renderPage();

      const pager = await screen.findByTestId('payment-pagination');
      expect(within(pager).getByTestId('pagination-page-500')).toBeInTheDocument();
      expect(within(pager).getAllByRole('button').length).toBeLessThan(12);
      expect(screen.getByTestId('pagination-range')).toHaveTextContent('of 10000');
    });

    it('a page that empties underneath the user offers a way back to page 1', async () => {
      vi.mocked(listAllInvoicePayments).mockImplementation(async (params) =>
        Number(params?.offset) === 0 ? Array.from({ length: 20 }, (_, i) => incoming(i, 25)) : []
      );

      renderPage();
      await screen.findByTestId('payment-row-ip-0');
      await userEvent.click(screen.getByTestId('pagination-next'));

      expect(await screen.findByTestId('payment-list-page-empty')).toHaveTextContent('no payments on page 2');
      await userEvent.click(screen.getByTestId('payment-list-first-page'));
      expect(await screen.findByTestId('payment-row-ip-0')).toBeInTheDocument();
    });
  });

  describe('filters', () => {
    it('sends the recorded-date range as from/to and resets to page 1', async () => {
      vi.mocked(listAllInvoicePayments).mockImplementation(async (params) =>
        Array.from({ length: 20 }, (_, i) => incoming(Number(params?.offset ?? 0) + i, 60))
      );

      renderPage();
      await screen.findByTestId('payment-row-ip-0');
      await userEvent.click(screen.getByTestId('pagination-next'));
      await screen.findByTestId('payment-row-ip-20');

      await userEvent.type(screen.getByTestId('filter-from'), '2026-10-01');
      await userEvent.type(screen.getByTestId('filter-to'), '2026-10-13');

      await waitFor(() => {
        const last = vi.mocked(listAllInvoicePayments).mock.calls.at(-1)?.[0];
        expect(last).toMatchObject({ from: '2026-10-01', to: '2026-10-13', offset: 0 });
      });
      // the outgoing tab is filtered the same way
      await waitFor(() =>
        expect(vi.mocked(listAllBillPayments).mock.calls.at(-1)?.[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-13' })
      );
      expect(screen.getByTestId('filter-clear')).toBeInTheDocument();
    });

    it('warns when the range is inverted', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([]);

      renderPage();
      await screen.findByTestId('payment-filters');
      await userEvent.type(screen.getByTestId('filter-to'), '2026-01-01');
      await userEvent.type(screen.getByTestId('filter-from'), '2026-02-01');

      expect(screen.getByTestId('filter-date-hint')).toHaveTextContent('before');
    });

    it('lists the tenant\'s own payment methods and filters by the chosen one', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([
        incoming(1, 3, MOMO),
        incoming(2, 3, BANK),
        incoming(3, 3, null),
      ]);

      renderPage();
      await screen.findByTestId('payment-row-ip-1');
      const select = screen.getByTestId('filter-method') as HTMLSelectElement;
      expect([...select.options].map((o) => o.textContent)).toEqual(['All methods', 'Bank Transfer', 'MTN Mobile Money']);

      await userEvent.selectOptions(select, 'pm-momo');

      await waitFor(() => expect(screen.queryByTestId('payment-row-ip-2')).not.toBeInTheDocument());
      expect(screen.getByTestId('payment-row-ip-1')).toBeInTheDocument();
      expect(screen.queryByTestId('payment-row-ip-3')).not.toBeInTheDocument();
      expect(vi.mocked(listAllInvoicePayments).mock.calls.at(-1)?.[0]).toMatchObject({ 'paymentMethod.id': 'pm-momo' });
      expect(screen.getByTestId('pagination-range')).toHaveTextContent('Showing 1–1 of 1');
    });

    it('shows a no-matches state with a clear button, then restores the full list', async () => {
      vi.mocked(listAllInvoicePayments).mockImplementation(async (params) =>
        params?.from ? [] : [incoming(1, 1)]
      );

      renderPage();
      await screen.findByTestId('payment-row-ip-1');
      await userEvent.type(screen.getByTestId('filter-from'), '2030-01-01');

      expect(await screen.findByTestId('payment-list-no-matches')).toBeInTheDocument();
      expect(screen.queryByTestId('payment-list-empty')).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId('filter-clear'));
      expect(await screen.findByTestId('payment-row-ip-1')).toBeInTheDocument();
      expect((screen.getByTestId('filter-from') as HTMLInputElement).value).toBe('');
    });
  });

  describe('rows', () => {
    it('labels the method from the record — a free-text method is no longer blank', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([incoming(1, 2, MOMO), incoming(2, 2, null)]);

      renderPage();

      expect(await screen.findByTestId('payment-method-badge-ip-1')).toHaveTextContent('MTN Mobile Money');
      expect(screen.getByTestId('payment-method-badge-ip-2')).toHaveTextContent('Not recorded');
    });

    it('shows the invoice number, client and quick reference, and links to the detail page', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([incoming(7, 1)]);

      renderPage();

      const row = await screen.findByTestId('payment-row-ip-7');
      expect(within(row).getByRole('link', { name: 'Invoice #1007' })).toHaveAttribute('href', '/invoices/inv-7');
      expect(row).toHaveTextContent('Client 7 Ltd');
      expect(row).toHaveTextContent('QR-7');
      expect(screen.getByTestId('payment-view-ip-7')).toHaveAttribute('href', '/payments/invoice/ip-7');
    });

    it('outgoing rows link to /payments/bill/:id and the tab is kept in the URL', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([incoming(1, 1)]);

      renderPage();
      await screen.findByTestId('payment-row-ip-1');
      await userEvent.click(screen.getByTestId('tab-outgoing'));

      expect(await screen.findByTestId('payment-view-bp-1')).toHaveAttribute('href', '/payments/bill/bp-1');
      expect(screen.getByTestId('payment-row-bp-1')).toHaveTextContent('Bill #1');
      expect(screen.getByTestId('location')).toHaveTextContent('/payments?tab=outgoing');
    });

    it('opens on the outgoing tab when the URL says so', async () => {
      vi.mocked(listAllInvoicePayments).mockResolvedValue([incoming(1, 1)]);

      renderPage('/payments?tab=outgoing');

      expect(await screen.findByTestId('payment-row-bp-1')).toBeInTheDocument();
      expect(screen.getByTestId('tab-outgoing').className).toMatch(/bg-primary/);
    });

    it('overflow: a 7-figure amount and a very long client name still render', async () => {
      const big = { ...incoming(1, 1), amount: 9_876_543.21 };
      big.invoice = { id: 'inv-1', serialised: `Invoice(number:1, accountServices:Direct Account : Corporate(${'Very Long Client Name '.repeat(10).trim()}), total:1.00)` };
      vi.mocked(listAllInvoicePayments).mockResolvedValue([big]);

      renderPage();

      const row = await screen.findByTestId('payment-row-ip-1');
      expect(row).toHaveTextContent('+$9,876,543.21');
      expect(row).toHaveTextContent('Very Long Client Name');
    });
  });
});
