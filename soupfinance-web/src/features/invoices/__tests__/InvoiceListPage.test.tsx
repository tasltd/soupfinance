/**
 * Unit tests for InvoiceListPage component
 * Tests rendering, loading/error/empty states, data display, and navigation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoiceListPage } from '../InvoiceListPage';
import type { Invoice, InvoiceStatus } from '../../../types';

// Mock the invoices API
vi.mock('../../../api', () => ({
  listInvoices: vi.fn(),
}));

// Mock the account store for currency formatting
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => {
    const value = amount ?? 0;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
}));

import { listInvoices } from '../../../api';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-123',
    // Changed: invoiceNumber → number (int), client → accountServices, issueDate → invoiceDate, dueDate → paymentDate
    number: 2024001,
    accountServices: { id: 'client-1', serialised: 'Acme Corp' },
    invoiceDate: '2024-01-15',
    paymentDate: '2024-02-15',
    currency: 'USD',
    status: 'DRAFT' as InvoiceStatus,
    subtotal: 1000,
    taxAmount: 100,
    discountAmount: 50,
    totalAmount: 1050,
    amountPaid: 0,
    amountDue: 1050,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    ...overrides,
  };
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

function renderInvoiceListPage() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <InvoiceListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('InvoiceListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the page container with correct test id', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);

      renderInvoiceListPage();

      expect(await screen.findByTestId('invoice-list-page')).toBeInTheDocument();
    });

    it('renders the page heading', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);

      renderInvoiceListPage();

      expect(await screen.findByTestId('invoice-list-heading')).toHaveTextContent('Invoices');
    });

    it('renders the page description', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);

      renderInvoiceListPage();

      expect(await screen.findByText('Manage and track your invoices')).toBeInTheDocument();
    });

    it('renders the New Invoice button', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);

      renderInvoiceListPage();

      const newButton = await screen.findByTestId('invoice-new-button');
      expect(newButton).toBeInTheDocument();
      expect(newButton).toHaveTextContent('New Invoice');
      expect(newButton).toHaveAttribute('href', '/invoices/new');
    });
  });

  describe('loading state', () => {
    it('displays loading message while fetching invoices', () => {
      // Never resolves to keep loading state
      vi.mocked(listInvoices).mockImplementation(() => new Promise(() => {}));

      renderInvoiceListPage();

      expect(screen.getByTestId('invoice-list-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading invoices...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('displays error message when fetch fails', async () => {
      vi.mocked(listInvoices).mockRejectedValue(new Error('Network error'));

      renderInvoiceListPage();

      expect(await screen.findByTestId('invoice-list-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load invoices')).toBeInTheDocument();
    });

    it('displays retry button in error state', async () => {
      vi.mocked(listInvoices).mockRejectedValue(new Error('Network error'));

      renderInvoiceListPage();

      const retryButton = await screen.findByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('displays helpful error description', async () => {
      vi.mocked(listInvoices).mockRejectedValue(new Error('Network error'));

      renderInvoiceListPage();

      expect(await screen.findByText(/There was an error loading your invoices/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('displays empty state when no invoices exist', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);

      renderInvoiceListPage();

      expect(await screen.findByTestId('invoice-list-empty')).toBeInTheDocument();
    });

    it('displays helpful empty state message', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);

      renderInvoiceListPage();

      expect(await screen.findByText('No invoices yet')).toBeInTheDocument();
      expect(screen.getByText(/Create your first invoice/i)).toBeInTheDocument();
    });

    it('displays create invoice button in empty state', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);

      renderInvoiceListPage();

      const createButton = await screen.findByTestId('invoice-create-first-button');
      expect(createButton).toBeInTheDocument();
      expect(createButton).toHaveTextContent('Create Invoice');
      expect(createButton).toHaveAttribute('href', '/invoices/new');
    });
  });

  describe('data display', () => {
    it('renders invoice table when invoices exist', async () => {
      const mockInvoices = [createMockInvoice()];
      vi.mocked(listInvoices).mockResolvedValue(mockInvoices);

      renderInvoiceListPage();

      expect(await screen.findByTestId('invoice-list-table')).toBeInTheDocument();
    });

    it('renders table headers correctly', async () => {
      const mockInvoices = [createMockInvoice()];
      vi.mocked(listInvoices).mockResolvedValue(mockInvoices);

      renderInvoiceListPage();

      await screen.findByTestId('invoice-list-table');

      expect(screen.getByText('Invoice #')).toBeInTheDocument();
      // Changed: 'Client' → 'Account' (matches InvoiceListPage table header)
      expect(screen.getByText('Account')).toBeInTheDocument();
      // Changed: 'Date' → 'Invoice Date' (matches InvoiceListPage table header)
      expect(screen.getByText('Invoice Date')).toBeInTheDocument();
      expect(screen.getByText('Due Date')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('renders invoice row with correct data', async () => {
      // Changed: field names to match Grails domain (number, accountServices, invoiceDate, paymentDate)
      const mockInvoice = createMockInvoice({
        id: 'inv-456',
        number: 2024042,
        accountServices: { id: 'client-2', serialised: 'Tech Solutions Inc' },
        invoiceDate: '2024-03-01',
        paymentDate: '2024-03-31',
        totalAmount: 2500.50,
        status: 'SENT',
      });
      vi.mocked(listInvoices).mockResolvedValue([mockInvoice]);

      renderInvoiceListPage();

      const row = await screen.findByTestId('invoice-row-inv-456');
      expect(row).toBeInTheDocument();

      // Changed: invoice number is now an integer, display format depends on component
      const invoiceLink = within(row).getByTestId('invoice-link-inv-456');
      expect(invoiceLink).toHaveTextContent('2024042');
      expect(invoiceLink).toHaveAttribute('href', '/invoices/inv-456');

      // Check client name (from accountServices.serialised)
      expect(within(row).getByText('Tech Solutions Inc')).toBeInTheDocument();

      // Check dates (invoiceDate and paymentDate)
      expect(within(row).getByText('2024-03-01')).toBeInTheDocument();
      expect(within(row).getByText('2024-03-31')).toBeInTheDocument();

      // Check amount - formatted with $ and .00
      expect(within(row).getByText('$2,500.50')).toBeInTheDocument();
    });

    it('renders multiple invoices', async () => {
      // Changed: invoiceNumber → number (integer, matches Grails domain)
      const mockInvoices = [
        createMockInvoice({ id: 'inv-1', number: 1 }),
        createMockInvoice({ id: 'inv-2', number: 2 }),
        createMockInvoice({ id: 'inv-3', number: 3 }),
      ];
      vi.mocked(listInvoices).mockResolvedValue(mockInvoices);

      renderInvoiceListPage();

      expect(await screen.findByTestId('invoice-row-inv-1')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-row-inv-2')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-row-inv-3')).toBeInTheDocument();
    });

    it('renders edit link for each invoice', async () => {
      const mockInvoice = createMockInvoice({ id: 'inv-789' });
      vi.mocked(listInvoices).mockResolvedValue([mockInvoice]);

      renderInvoiceListPage();

      const editLink = await screen.findByTestId('invoice-edit-inv-789');
      expect(editLink).toBeInTheDocument();
      expect(editLink).toHaveTextContent('Edit');
      expect(editLink).toHaveAttribute('href', '/invoices/inv-789/edit');
    });
  });

  describe('status badges', () => {
    it.each([
      ['PAID', 'bg-success'],
      ['SENT', 'bg-info'],
      ['PENDING', 'bg-warning'],
      ['OVERDUE', 'bg-danger'],
      ['DRAFT', 'bg-subtle-text'],
    ] as const)('renders %s status with correct styling', async (status, expectedClass) => {
      const mockInvoice = createMockInvoice({
        id: `inv-${status.toLowerCase()}`,
        status: status as InvoiceStatus,
      });
      vi.mocked(listInvoices).mockResolvedValue([mockInvoice]);

      renderInvoiceListPage();

      const statusBadge = await screen.findByTestId(`invoice-status-inv-${status.toLowerCase()}`);
      expect(statusBadge).toHaveTextContent(status);
      expect(statusBadge.className).toContain(expectedClass);
    });

    it('displays status text correctly', async () => {
      const mockInvoice = createMockInvoice({ id: 'inv-test', status: 'PAID' });
      vi.mocked(listInvoices).mockResolvedValue([mockInvoice]);

      renderInvoiceListPage();

      const statusBadge = await screen.findByTestId('invoice-status-inv-test');
      expect(statusBadge).toHaveTextContent('PAID');
    });
  });

  describe('navigation', () => {
    it('New Invoice button links to create page', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);

      renderInvoiceListPage();

      const newButton = await screen.findByTestId('invoice-new-button');
      expect(newButton).toHaveAttribute('href', '/invoices/new');
    });

    it('invoice number links to detail page', async () => {
      const mockInvoice = createMockInvoice({ id: 'inv-detail-test' });
      vi.mocked(listInvoices).mockResolvedValue([mockInvoice]);

      renderInvoiceListPage();

      const invoiceLink = await screen.findByTestId('invoice-link-inv-detail-test');
      expect(invoiceLink).toHaveAttribute('href', '/invoices/inv-detail-test');
    });

    it('edit link navigates to edit page', async () => {
      const mockInvoice = createMockInvoice({ id: 'inv-edit-test' });
      vi.mocked(listInvoices).mockResolvedValue([mockInvoice]);

      renderInvoiceListPage();

      const editLink = await screen.findByTestId('invoice-edit-inv-edit-test');
      expect(editLink).toHaveAttribute('href', '/invoices/inv-edit-test/edit');
    });
  });

  describe('API interaction', () => {
    it('calls listInvoices with correct params on mount', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);

      renderInvoiceListPage();

      await screen.findByTestId('invoice-list-page');

      expect(listInvoices).toHaveBeenCalledWith({
        max: 20,
        sort: 'dateCreated',
        order: 'desc',
      });
    });

    it('only calls listInvoices once on initial render', async () => {
      vi.mocked(listInvoices).mockResolvedValue([]);

      renderInvoiceListPage();

      await screen.findByTestId('invoice-list-page');

      expect(listInvoices).toHaveBeenCalledTimes(1);
    });
  });

  describe('table container', () => {
    it('renders table container with correct test id', async () => {
      vi.mocked(listInvoices).mockResolvedValue([createMockInvoice()]);

      renderInvoiceListPage();

      expect(await screen.findByTestId('invoice-table-container')).toBeInTheDocument();
    });

    it('table container has proper styling classes', async () => {
      vi.mocked(listInvoices).mockResolvedValue([createMockInvoice()]);

      renderInvoiceListPage();

      const container = await screen.findByTestId('invoice-table-container');
      expect(container.className).toContain('rounded-xl');
      expect(container.className).toContain('border');
    });
  });

  describe('amount formatting', () => {
    it('formats amounts with dollar sign and two decimal places', async () => {
      const mockInvoice = createMockInvoice({
        id: 'inv-format',
        totalAmount: 1234.56,
      });
      vi.mocked(listInvoices).mockResolvedValue([mockInvoice]);

      renderInvoiceListPage();

      const row = await screen.findByTestId('invoice-row-inv-format');
      expect(within(row).getByText('$1,234.56')).toBeInTheDocument();
    });

    it('formats whole number amounts correctly', async () => {
      const mockInvoice = createMockInvoice({
        id: 'inv-whole',
        totalAmount: 500,
      });
      vi.mocked(listInvoices).mockResolvedValue([mockInvoice]);

      renderInvoiceListPage();

      const row = await screen.findByTestId('invoice-row-inv-whole');
      expect(within(row).getByText('$500.00')).toBeInTheDocument();
    });
  });
});
