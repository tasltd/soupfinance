/**
 * Unit tests for BillListPage component
 * Tests rendering, loading/error/empty states, data display, and navigation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BillListPage } from '../BillListPage';
import type { Bill, BillStatus } from '../../../types';

// Mock the bills API - must match the import path in BillListPage
vi.mock('../../../api/endpoints/bills', () => ({
  listBills: vi.fn(),
}));

// Added (SOUPFIN-171): the vendor filter's options
vi.mock('../../../api/endpoints/vendors', () => ({
  listVendors: vi.fn(),
}));

// Mock the account store for currency formatting
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => {
    const value = amount ?? 0;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
}));

import { listBills } from '../../../api/endpoints/bills';
import { listVendors } from '../../../api/endpoints/vendors';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-123',
    billNumber: 'BILL-2024-001',
    vendor: { id: 'vendor-1', name: 'Acme Supplies' },
    billDate: '2024-01-15',
    paymentDate: '2024-02-15',
    status: 'DRAFT' as BillStatus,
    subtotal: 1000,
    taxAmount: 100,
    totalAmount: 1050,
    amountPaid: 0,
    amountDue: 1050,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    ...overrides,
  } as Bill;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderBillListPage() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BillListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('BillListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listVendors).mockResolvedValue([]);
  });

  describe('rendering', () => {
    it('renders the page container with correct test id', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      expect(await screen.findByTestId('bill-list-page')).toBeInTheDocument();
    });

    it('renders the page heading', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      expect(await screen.findByTestId('bill-list-heading')).toHaveTextContent('Bills');
    });

    it('renders the page description', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      expect(await screen.findByText('Manage your expenses and bills')).toBeInTheDocument();
    });

    it('renders the New Bill button', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      const newButton = await screen.findByTestId('bill-new-button');
      expect(newButton).toBeInTheDocument();
      expect(newButton).toHaveTextContent('New Bill');
      expect(newButton).toHaveAttribute('href', '/bills/new');
    });
  });

  describe('loading state', () => {
    it('displays loading message while fetching bills', () => {
      // Never resolves to keep loading state
      vi.mocked(listBills).mockImplementation(() => new Promise(() => {}));

      renderBillListPage();

      expect(screen.getByTestId('bill-list-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading bills...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('displays error message when fetch fails', async () => {
      vi.mocked(listBills).mockRejectedValue(new Error('Network error'));

      renderBillListPage();

      expect(await screen.findByTestId('bill-list-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load bills')).toBeInTheDocument();
    });

    it('displays retry button in error state', async () => {
      vi.mocked(listBills).mockRejectedValue(new Error('Network error'));

      renderBillListPage();

      const retryButton = await screen.findByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('displays helpful error description', async () => {
      vi.mocked(listBills).mockRejectedValue(new Error('Network error'));

      renderBillListPage();

      expect(await screen.findByText(/There was an error loading your bills/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('displays empty state when no bills exist', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      expect(await screen.findByTestId('bill-list-empty')).toBeInTheDocument();
    });

    it('displays helpful empty state message', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      expect(await screen.findByText('No bills yet')).toBeInTheDocument();
      expect(screen.getByText(/Track your expenses by adding bills/i)).toBeInTheDocument();
    });

    it('displays create bill button in empty state', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      const createButton = await screen.findByTestId('bill-create-first-button');
      expect(createButton).toBeInTheDocument();
      expect(createButton).toHaveTextContent('Create Bill');
      expect(createButton).toHaveAttribute('href', '/bills/new');
    });
  });

  describe('data display', () => {
    it('renders bill table when bills exist', async () => {
      const mockBills = [createMockBill()];
      vi.mocked(listBills).mockResolvedValue(mockBills);

      renderBillListPage();

      expect(await screen.findByTestId('bill-list-table')).toBeInTheDocument();
    });

    it('renders table headers correctly', async () => {
      const mockBills = [createMockBill()];
      vi.mocked(listBills).mockResolvedValue(mockBills);

      renderBillListPage();

      await screen.findByTestId('bill-list-table');

      expect(screen.getByText('Bill #')).toBeInTheDocument();
      expect(screen.getByText('Vendor')).toBeInTheDocument();
      expect(screen.getByText('Issue Date')).toBeInTheDocument();
      expect(screen.getByText('Due Date')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('renders bill row with correct data', async () => {
      const mockBill = createMockBill({
        id: 'bill-456',
        billNumber: 'BILL-2024-042',
        vendor: { id: 'vendor-2', name: 'Office Supplies Co' },
        billDate: '2024-03-01',
        paymentDate: '2024-03-31',
        totalAmount: 2500.50,
        status: 'PENDING',
      });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const row = await screen.findByTestId('bill-row-bill-456');
      expect(row).toBeInTheDocument();

      // Check bill number link
      const billLink = within(row).getByTestId('bill-link-bill-456');
      expect(billLink).toHaveTextContent('BILL-2024-042');
      expect(billLink).toHaveAttribute('href', '/bills/bill-456');

      // Check vendor name
      expect(within(row).getByText('Office Supplies Co')).toBeInTheDocument();

      // Check dates
      expect(within(row).getByText('2024-03-01')).toBeInTheDocument();
      expect(within(row).getByText('2024-03-31')).toBeInTheDocument();

      // Check amount - formatted with $ and .00 (with thousands separator)
      expect(within(row).getByText('$2,500.50')).toBeInTheDocument();
    });

    it('renders multiple bills', async () => {
      const mockBills = [
        createMockBill({ id: 'bill-1', billNumber: 'BILL-001' }),
        createMockBill({ id: 'bill-2', billNumber: 'BILL-002' }),
        createMockBill({ id: 'bill-3', billNumber: 'BILL-003' }),
      ];
      vi.mocked(listBills).mockResolvedValue(mockBills);

      renderBillListPage();

      expect(await screen.findByTestId('bill-row-bill-1')).toBeInTheDocument();
      expect(screen.getByTestId('bill-row-bill-2')).toBeInTheDocument();
      expect(screen.getByTestId('bill-row-bill-3')).toBeInTheDocument();
    });

    it('renders edit link for each bill', async () => {
      const mockBill = createMockBill({ id: 'bill-789' });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const editLink = await screen.findByTestId('bill-edit-bill-789');
      expect(editLink).toBeInTheDocument();
      expect(editLink).toHaveTextContent('Edit');
      expect(editLink).toHaveAttribute('href', '/bills/bill-789/edit');
    });
  });

  describe('status badges', () => {
    it.each([
      ['PAID', 'bg-success'],
      ['PARTIAL', 'bg-info'],
      ['PENDING', 'bg-warning'],
      ['OVERDUE', 'bg-danger'],
      ['DRAFT', 'bg-subtle-text'],
      ['CANCELLED', 'bg-subtle-text'],
    ] as const)('renders %s status with correct styling', async (status, expectedClass) => {
      const mockBill = createMockBill({
        id: `bill-${status.toLowerCase()}`,
        status: status as BillStatus,
      });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const statusBadge = await screen.findByTestId(`bill-status-bill-${status.toLowerCase()}`);
      expect(statusBadge).toHaveTextContent(status);
      expect(statusBadge.className).toContain(expectedClass);
    });

    it('displays status text correctly', async () => {
      const mockBill = createMockBill({ id: 'bill-test', status: 'PAID' });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const statusBadge = await screen.findByTestId('bill-status-bill-test');
      expect(statusBadge).toHaveTextContent('PAID');
    });
  });

  describe('navigation', () => {
    it('New Bill button links to create page', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      const newButton = await screen.findByTestId('bill-new-button');
      expect(newButton).toHaveAttribute('href', '/bills/new');
    });

    it('bill number links to detail page', async () => {
      const mockBill = createMockBill({ id: 'bill-detail-test' });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const billLink = await screen.findByTestId('bill-link-bill-detail-test');
      expect(billLink).toHaveAttribute('href', '/bills/bill-detail-test');
    });

    it('edit link navigates to edit page', async () => {
      const mockBill = createMockBill({ id: 'bill-edit-test' });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const editLink = await screen.findByTestId('bill-edit-bill-edit-test');
      expect(editLink).toHaveAttribute('href', '/bills/bill-edit-test/edit');
    });
  });

  describe('API interaction', () => {
    it('calls listBills with correct params on mount', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      await screen.findByTestId('bill-list-page');

      // Changed (SOUPFIN-171): now pages with an explicit offset
      expect(listBills).toHaveBeenCalledWith({
        max: 20,
        offset: 0,
        sort: 'dateCreated',
        order: 'desc',
      });
    });

    it('only calls listBills once on initial render', async () => {
      vi.mocked(listBills).mockResolvedValue([]);

      renderBillListPage();

      await screen.findByTestId('bill-list-page');

      expect(listBills).toHaveBeenCalledTimes(1);
    });
  });

  describe('table container', () => {
    it('renders table container with correct test id', async () => {
      vi.mocked(listBills).mockResolvedValue([createMockBill()]);

      renderBillListPage();

      expect(await screen.findByTestId('bill-table-container')).toBeInTheDocument();
    });

    it('table container has proper styling classes', async () => {
      vi.mocked(listBills).mockResolvedValue([createMockBill()]);

      renderBillListPage();

      const container = await screen.findByTestId('bill-table-container');
      expect(container.className).toContain('rounded-xl');
      expect(container.className).toContain('border');
    });
  });

  describe('amount formatting', () => {
    it('formats amounts with dollar sign and two decimal places', async () => {
      const mockBill = createMockBill({
        id: 'bill-format',
        totalAmount: 1234.56,
      });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const row = await screen.findByTestId('bill-row-bill-format');
      expect(within(row).getByText('$1,234.56')).toBeInTheDocument();
    });

    it('formats whole number amounts correctly', async () => {
      const mockBill = createMockBill({
        id: 'bill-whole',
        totalAmount: 500,
      });
      vi.mocked(listBills).mockResolvedValue([mockBill]);

      renderBillListPage();

      const row = await screen.findByTestId('bill-row-bill-whole');
      expect(within(row).getByText('$500.00')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Added (SOUPFIN-171): paging, search, filters, overdue highlighting
  // ==========================================================================

  /** The params of the most recent listBills call. */
  function lastParams() {
    const calls = vi.mocked(listBills).mock.calls;
    return calls[calls.length - 1][0];
  }

  function page(n: number, size: number, total: number | undefined, prefix = 'p') {
    return Array.from({ length: size }, (_, i) =>
      createMockBill({
        id: `${prefix}${n}-${i}`,
        billNumber: `BILL-${(n - 1) * 20 + i + 1}`,
        totalCount: total,
        paymentDate: '2099-01-01',
      })
    );
  }

  describe('pagination (SOUPFIN-171)', () => {
    it('shows "1 to 20 of 45" and three page buttons from the stamped totalCount', async () => {
      vi.mocked(listBills).mockResolvedValue(page(1, 20, 45));
      renderBillListPage();

      const summary = await screen.findByTestId('bill-pagination-summary');
      expect(summary.textContent?.replace(/\s+/g, ' ').trim()).toBe('Showing 1 to 20 of 45 bills');
      expect(screen.getByTestId('bill-pagination-page-3')).toBeInTheDocument();
      expect(screen.queryByTestId('bill-pagination-page-4')).not.toBeInTheDocument();
      expect(screen.getByTestId('bill-pagination-prev')).toBeDisabled();
      expect(screen.getByTestId('bill-pagination-next')).toBeEnabled();
    });

    it('Next requests offset 20 and renders the second page — bill 21 is reachable', async () => {
      vi.mocked(listBills).mockImplementation(async (params) =>
        (params?.offset as number) === 20 ? page(2, 20, 45) : page(1, 20, 45)
      );
      renderBillListPage();

      fireEvent.click(await screen.findByTestId('bill-pagination-next'));

      expect(await screen.findByText('BILL-21')).toBeInTheDocument();
      expect(lastParams()).toEqual({ max: 20, offset: 20, sort: 'dateCreated', order: 'desc' });
      expect(screen.getByTestId('bill-pagination-page-2')).toHaveAttribute('aria-current', 'page');
    });

    it('a page number jumps straight to its offset', async () => {
      vi.mocked(listBills).mockResolvedValue(page(1, 20, 45));
      renderBillListPage();

      fireEvent.click(await screen.findByTestId('bill-pagination-page-3'));
      await waitFor(() => expect(lastParams()).toMatchObject({ max: 20, offset: 40 }));
    });

    it('collapses 50,000 pages to 1 2 … 50000', async () => {
      vi.mocked(listBills).mockResolvedValue(page(1, 20, 1_000_000));
      renderBillListPage();

      expect(await screen.findByTestId('bill-pagination-page-50000')).toBeInTheDocument();
      expect(screen.getByTestId('bill-pagination-page-2')).toBeInTheDocument();
      expect(screen.queryByTestId('bill-pagination-page-3')).not.toBeInTheDocument();
      expect(screen.getByTestId('bill-pagination-summary').textContent).toContain('1000000');
    });

    it('without a stamped total, Next is enabled only when the page is full', async () => {
      vi.mocked(listBills).mockResolvedValue(page(1, 20, undefined));
      renderBillListPage();

      expect(await screen.findByTestId('bill-pagination-current')).toHaveTextContent('Page 1');
      expect(screen.getByTestId('bill-pagination-next')).toBeEnabled();
    });

    it('a single short page shows no pagination bar', async () => {
      vi.mocked(listBills).mockResolvedValue(page(1, 3, 3));
      renderBillListPage();

      await screen.findByTestId('bill-list-table');
      expect(screen.queryByTestId('bill-pagination')).not.toBeInTheDocument();
    });

    it('no bills at all shows the first-bill empty state and no pagination', async () => {
      vi.mocked(listBills).mockResolvedValue([]);
      renderBillListPage();

      expect(await screen.findByTestId('bill-list-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('bill-pagination')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bill-list-no-results')).not.toBeInTheDocument();
    });
  });

  describe('search and filters (SOUPFIN-171)', () => {
    const rows = [
      createMockBill({ id: 'a', billNumber: 'BILL-1', vendor: { id: 'v1', name: 'Acme Supplies' }, status: 'PENDING', billDate: '2026-01-10', paymentDate: '2026-02-10', amountDue: 50 }),
      createMockBill({ id: 'b', billNumber: 'BILL-2', vendor: { id: 'v2', name: 'Zenith Power' }, status: 'PARTIAL', billDate: '2026-06-15', paymentDate: '2099-12-15', amountDue: 20 }),
      createMockBill({ id: 'c', billNumber: 'BILL-3', vendor: { id: 'v1', name: 'Acme Supplies' }, status: 'PAID', billDate: '2026-09-30', paymentDate: '2026-10-01', amountDue: 0 }),
    ];

    beforeEach(() => {
      vi.mocked(listBills).mockResolvedValue(rows);
      vi.mocked(listVendors).mockResolvedValue([
        { id: 'v2', name: 'Zenith Power' },
        { id: 'v1', name: 'Acme Supplies' },
      ] as never);
    });

    it('search sends `search` (split bill number) with the 1000-row window', async () => {
      renderBillListPage();
      await screen.findByTestId('bill-list-table');

      fireEvent.change(screen.getByTestId('bill-search-input'), { target: { value: 'BILL-2' } });

      await waitFor(() =>
        expect(lastParams()).toEqual({ max: 1000, offset: 0, sort: 'dateCreated', order: 'desc', search: 'BILL 2' })
      );
      // The server's OR match is a superset; only BILL-2 stays on screen.
      await waitFor(() => expect(screen.queryByTestId('bill-row-a')).not.toBeInTheDocument());
      expect(screen.getByTestId('bill-row-b')).toBeInTheDocument();
    });

    it('the vendor dropdown lists vendors alphabetically and filters on bill.vendor.id', async () => {
      renderBillListPage();
      await screen.findByTestId('bill-list-table');
      const select = screen.getByTestId('bill-vendor-filter');
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'All vendors',
        'Acme Supplies',
        'Zenith Power',
      ]);

      fireEvent.change(select, { target: { value: 'v1' } });

      await waitFor(() => expect(screen.queryByTestId('bill-row-b')).not.toBeInTheDocument());
      expect(screen.getByTestId('bill-row-a')).toBeInTheDocument();
      expect(screen.getByTestId('bill-row-c')).toBeInTheDocument();
      // Neither backend honours a vendor param — none is sent.
      expect(lastParams()).toEqual({ max: 1000, offset: 0, sort: 'dateCreated', order: 'desc' });
    });

    it('status PAID keeps only paid bills and sends no status param', async () => {
      renderBillListPage();
      await screen.findByTestId('bill-list-table');

      fireEvent.change(screen.getByTestId('bill-status-filter'), { target: { value: 'PAID' } });

      await waitFor(() => expect(screen.queryByTestId('bill-row-a')).not.toBeInTheDocument());
      expect(screen.getByTestId('bill-row-c')).toBeInTheDocument();
      expect(lastParams()).not.toHaveProperty('status');
    });

    it('status Overdue keeps past-due bills with a balance', async () => {
      renderBillListPage();
      await screen.findByTestId('bill-list-table');

      fireEvent.change(screen.getByTestId('bill-status-filter'), { target: { value: 'OVERDUE' } });

      await waitFor(() => expect(screen.queryByTestId('bill-row-b')).not.toBeInTheDocument());
      expect(screen.getByTestId('bill-row-a')).toBeInTheDocument();
      expect(screen.queryByTestId('bill-row-c')).not.toBeInTheDocument();
    });

    it('the status options follow the backend enum plus Overdue (no DRAFT / CANCELLED)', async () => {
      renderBillListPage();
      const options = within(await screen.findByTestId('bill-status-filter')).getAllByRole('option');
      expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(['', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE']);
    });

    it('the bill-date range filters inclusively and never sends from/to', async () => {
      renderBillListPage();
      await screen.findByTestId('bill-list-table');

      fireEvent.change(screen.getByTestId('bill-date-from'), { target: { value: '2026-06-15' } });
      fireEvent.change(screen.getByTestId('bill-date-to'), { target: { value: '2026-09-30' } });

      await waitFor(() => expect(screen.queryByTestId('bill-row-a')).not.toBeInTheDocument());
      expect(screen.getByTestId('bill-row-b')).toBeInTheDocument();
      expect(screen.getByTestId('bill-row-c')).toBeInTheDocument();
      expect(lastParams()).not.toHaveProperty('from');
      expect(lastParams()).not.toHaveProperty('to');
    });

    it('no match shows the no-results state, and Clear filters returns to server paging', async () => {
      renderBillListPage();
      await screen.findByTestId('bill-list-table');

      fireEvent.change(screen.getByTestId('bill-date-from'), { target: { value: '2030-01-01' } });

      expect(await screen.findByTestId('bill-list-no-results')).toBeInTheDocument();
      expect(screen.queryByTestId('bill-list-empty')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('bill-list-clear-filters-button'));

      await waitFor(() =>
        expect(lastParams()).toEqual({ max: 20, offset: 0, sort: 'dateCreated', order: 'desc' })
      );
      expect(await screen.findByTestId('bill-row-a')).toBeInTheDocument();
      expect(screen.getByTestId('bill-date-from')).toHaveValue('');
    });

    it('a filter change returns to page 1', async () => {
      vi.mocked(listBills).mockImplementation(async (params) =>
        (params?.max as number) === 1000 ? rows : page((params?.offset as number) / 20 + 1, 20, 60)
      );
      renderBillListPage();
      fireEvent.click(await screen.findByTestId('bill-pagination-page-3'));
      await waitFor(() => expect(lastParams()).toMatchObject({ offset: 40 }));

      fireEvent.change(screen.getByTestId('bill-status-filter'), { target: { value: 'PENDING' } });

      expect(await screen.findByTestId('bill-row-a')).toBeInTheDocument();
      expect(screen.queryByTestId('bill-pagination')).not.toBeInTheDocument();
    });

    it('filtered results page in the browser, 20 at a time', async () => {
      const many = Array.from({ length: 45 }, (_, i) =>
        createMockBill({ id: `m${i}`, billNumber: `BILL-${i + 1}`, status: 'PENDING', paymentDate: '2099-01-01' })
      );
      vi.mocked(listBills).mockResolvedValue(many);
      renderBillListPage();
      await screen.findByTestId('bill-list-table');

      fireEvent.change(screen.getByTestId('bill-status-filter'), { target: { value: 'PENDING' } });

      const summary = await screen.findByTestId('bill-pagination-summary');
      await waitFor(() =>
        expect(summary.textContent?.replace(/\s+/g, ' ').trim()).toBe('Showing 1 to 20 of 45 bills')
      );
      fireEvent.click(screen.getByTestId('bill-pagination-page-3'));
      expect(await screen.findByTestId('bill-row-m40')).toBeInTheDocument();
      expect(screen.queryByTestId('bill-row-m0')).not.toBeInTheDocument();
    });

    it('a full 1000-row window says the filters only see the most recent 1,000 bills', async () => {
      // Realistic: 20 rows for the unfiltered page, the full window once a filter asks for it.
      const window = Array.from({ length: 1000 }, (_, i) =>
        createMockBill({ id: `w${i}`, status: 'PENDING', totalCount: 1500, paymentDate: '2099-01-01' })
      );
      vi.mocked(listBills).mockImplementation(async (params) =>
        (params?.max as number) === 1000 ? window : window.slice(0, 20)
      );
      renderBillListPage();
      await screen.findByTestId('bill-list-table');
      expect(screen.queryByTestId('bill-filter-window-note')).not.toBeInTheDocument();

      fireEvent.change(screen.getByTestId('bill-status-filter'), { target: { value: 'PENDING' } });

      expect(await screen.findByTestId('bill-filter-window-note')).toHaveTextContent('1,000 most recent bills');
    });
  });

  describe('overdue highlighting (SOUPFIN-171)', () => {
    it('marks a past-due bill with a balance, and not a paid or future one', async () => {
      vi.mocked(listBills).mockResolvedValue([
        createMockBill({ id: 'late', paymentDate: '2020-01-01', amountDue: 10 }),
        createMockBill({ id: 'paid', paymentDate: '2020-01-01', amountDue: 0, status: 'PAID' }),
        createMockBill({ id: 'future', paymentDate: '2099-01-01', amountDue: 10 }),
      ]);
      renderBillListPage();

      const late = await screen.findByTestId('bill-row-late');
      expect(late).toHaveAttribute('data-overdue', 'true');
      expect(late.className).toContain('bg-danger/5');
      expect(within(late).getByTestId('bill-overdue-late')).toHaveTextContent('Overdue');

      for (const id of ['paid', 'future']) {
        const row = screen.getByTestId(`bill-row-${id}`);
        expect(row).not.toHaveAttribute('data-overdue');
        expect(screen.queryByTestId(`bill-overdue-${id}`)).not.toBeInTheDocument();
      }
    });
  });
});
