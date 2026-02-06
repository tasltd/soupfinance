/**
 * Unit tests for InvoiceFormPage component
 * Tests create/edit modes, form validation, line items, and submission
 *
 * Changed (2026-02-06): Aligned mocks and test IDs with refactored component:
 *   - Component uses listInvoices (not listClients) for account dropdown
 *   - Component uses listTaxRates + listInvoiceServices from domainData
 *   - Test IDs: invoice-account-select (not invoice-client-select),
 *     invoice-date-input (not invoice-issue-date-input)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoiceFormPage } from '../InvoiceFormPage';
import type { Invoice, InvoiceStatus } from '../../../types';

// Mock the API modules - must match exact import paths in InvoiceFormPage.tsx
// Changed: Component imports listInvoices (not listClients) for account services dropdown
vi.mock('../../../api/endpoints/invoices', () => ({
  getInvoice: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  sendInvoice: vi.fn(),
  listInvoices: vi.fn(),
}));

// Changed: Component imports listTaxRates and listInvoiceServices from domainData
vi.mock('../../../api/endpoints/domainData', () => ({
  listTaxRates: vi.fn(),
  listInvoiceServices: vi.fn(),
}));

// Mock the stores for currency formatting
vi.mock('../../../stores', () => ({
  useFormatCurrency: () => (amount: number | null | undefined) => {
    const value = amount ?? 0;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { getInvoice, createInvoice, updateInvoice, sendInvoice, listInvoices } from '../../../api/endpoints/invoices';
import { listTaxRates, listInvoiceServices } from '../../../api/endpoints/domainData';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * PURPOSE: Create a mock invoice with accountServices for the dropdown.
 * The form populates the Account select from existing invoices' accountServices.
 */
function createMockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-123',
    number: 2024001,
    accountServices: { id: 'as-123', serialised: 'Acme Corporation' },
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
    notes: 'Thank you for your business',
    invoiceItemList: [
      {
        id: 'item-1',
        invoice: { id: 'inv-123' },
        description: 'Consulting Services',
        quantity: 10,
        unitPrice: 100,
        taxRate: 10,
        discountPercent: 5,
        amount: 1000,
        dateCreated: '2024-01-15T10:00:00Z',
        lastUpdated: '2024-01-15T10:00:00Z',
      },
    ],
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

/**
 * PURPOSE: Set up common mocks so the component can render without errors.
 * The component calls listInvoices, listTaxRates, and listInvoiceServices on mount.
 */
function setupDefaultMocks(invoicesForDropdown: Invoice[] = [createMockInvoice()]) {
  vi.mocked(listInvoices).mockResolvedValue(invoicesForDropdown);
  vi.mocked(listTaxRates).mockResolvedValue([
    { id: 'tax-none', name: 'No Tax', rate: 0 },
    { id: 'tax-vat-15', name: 'VAT 15%', rate: 15 },
  ]);
  vi.mocked(listInvoiceServices).mockResolvedValue([]);
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

interface RenderOptions {
  route?: string;
  path?: string;
}

function renderInvoiceFormPage(options: RenderOptions = {}) {
  const { route = '/invoices/new', path = '/invoices/new' } = options;
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={<InvoiceFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('InvoiceFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('rendering (create mode)', () => {
    it('renders the page container with correct test id', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-form-page')).toBeInTheDocument();
    });

    it('renders create mode heading', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      expect(await screen.findByText('New Invoice')).toBeInTheDocument();
    });

    // Changed: invoice-client-select → invoice-account-select (component uses accountServices)
    it('renders account select dropdown', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-account-select')).toBeInTheDocument();
    });

    // Changed: invoice-issue-date-input → invoice-date-input (component uses invoiceDate)
    it('renders invoice date input', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-date-input')).toBeInTheDocument();
    });

    it('renders due date input', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-due-date-input')).toBeInTheDocument();
    });

    it('renders line items table', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-items-table')).toBeInTheDocument();
    });

    it('renders add item button', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-add-item-button')).toBeInTheDocument();
    });

    it('renders form action buttons', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-form-cancel-button')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-form-save-draft-button')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-form-save-send-button')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading state while fetching invoice in edit mode', () => {
      setupDefaultMocks();
      vi.mocked(getInvoice).mockImplementation(() => new Promise(() => {}));

      renderInvoiceFormPage({
        route: '/invoices/inv-123/edit',
        path: '/invoices/:id/edit',
      });

      expect(screen.getByTestId('invoice-form-loading')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error when invoice fetch fails in edit mode', async () => {
      setupDefaultMocks();
      vi.mocked(getInvoice).mockRejectedValue(new Error('Invoice not found'));

      renderInvoiceFormPage({
        route: '/invoices/inv-123/edit',
        path: '/invoices/:id/edit',
      });

      expect(await screen.findByTestId('invoice-form-error')).toBeInTheDocument();
    });
  });

  describe('edit mode', () => {
    it('renders edit mode heading', async () => {
      const mockInvoice = createMockInvoice();
      setupDefaultMocks();
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-123/edit',
        path: '/invoices/:id/edit',
      });

      expect(await screen.findByText(/Edit Invoice/)).toBeInTheDocument();
    });

    it('populates form with existing invoice data', async () => {
      const mockInvoice = createMockInvoice({
        invoiceDate: '2024-03-15',
        paymentDate: '2024-04-15',
      });
      setupDefaultMocks();
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-123/edit',
        path: '/invoices/:id/edit',
      });

      // Changed: invoice-issue-date-input → invoice-date-input
      const invoiceDateInput = await screen.findByTestId('invoice-date-input');

      // Wait for the data to be populated
      await waitFor(() => {
        expect(invoiceDateInput).toHaveValue('2024-03-15');
      });

      const dueDateInput = screen.getByTestId('invoice-due-date-input');
      expect(dueDateInput).toHaveValue('2024-04-15');
    });

    it('calls getInvoice with correct ID', async () => {
      const mockInvoice = createMockInvoice();
      setupDefaultMocks();
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-456/edit',
        path: '/invoices/:id/edit',
      });

      await screen.findByTestId('invoice-form-page');

      expect(getInvoice).toHaveBeenCalledWith('inv-456');
    });
  });

  // Changed: "client selection" → "account selection" (component uses accountServices from invoices)
  describe('account selection', () => {
    it('populates account dropdown with accountServices from existing invoices', async () => {
      // The component extracts unique accountServices from listInvoices() results
      const mockInvoices = [
        createMockInvoice({ id: 'inv-1', accountServices: { id: 'as-1', serialised: 'Account One' } }),
        createMockInvoice({ id: 'inv-2', accountServices: { id: 'as-2', serialised: 'Account Two' } }),
      ];
      setupDefaultMocks(mockInvoices);

      renderInvoiceFormPage();

      // Wait for account options to load from invoices data
      await screen.findByText('Account One');

      const select = screen.getByTestId('invoice-account-select');
      const options = within(select).getAllByRole('option');

      // Should have placeholder + 2 account services
      expect(options.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Account One')).toBeInTheDocument();
      expect(screen.getByText('Account Two')).toBeInTheDocument();
    });

    it('allows selecting an account', async () => {
      const user = userEvent.setup();
      const mockInvoices = [
        createMockInvoice({ id: 'inv-1', accountServices: { id: 'selected-as', serialised: 'Selected Corp' } }),
      ];
      setupDefaultMocks(mockInvoices);

      renderInvoiceFormPage();

      // Wait for account option to load
      await screen.findByText('Selected Corp');

      const select = screen.getByTestId('invoice-account-select');
      await user.selectOptions(select, 'selected-as');

      expect(select).toHaveValue('selected-as');
    });
  });

  describe('line items', () => {
    it('starts with one empty line item in create mode', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      // Should have at least one line item row
      const descriptionInputs = screen.getAllByTestId(/invoice-item-description-/);
      expect(descriptionInputs.length).toBeGreaterThanOrEqual(1);
    });

    it('adds new line item when add button is clicked', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      const initialCount = screen.getAllByTestId(/invoice-item-description-/).length;

      await user.click(screen.getByTestId('invoice-add-item-button'));

      await waitFor(() => {
        const newCount = screen.getAllByTestId(/invoice-item-description-/).length;
        expect(newCount).toBe(initialCount + 1);
      });
    });

    it('removes line item when remove button is clicked', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      // Add a second item first
      await user.click(screen.getByTestId('invoice-add-item-button'));

      await waitFor(() => {
        expect(screen.getAllByTestId(/invoice-item-description-/).length).toBe(2);
      });

      // Remove one item
      const removeButtons = screen.getAllByTestId(/invoice-item-remove-/);
      await user.click(removeButtons[0]);

      await waitFor(() => {
        expect(screen.getAllByTestId(/invoice-item-description-/).length).toBe(1);
      });
    });

    it('updates line item description', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      const descriptionInput = screen.getByTestId('invoice-item-description-0');
      await user.clear(descriptionInput);
      await user.type(descriptionInput, 'Web Development Services');

      expect(descriptionInput).toHaveValue('Web Development Services');
    });

    it('updates line item quantity', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      const qtyInput = screen.getByTestId('invoice-item-quantity-0');
      await user.clear(qtyInput);
      await user.type(qtyInput, '5');

      expect(qtyInput).toHaveValue(5);
    });

    it('updates line item unit price', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      const priceInput = screen.getByTestId('invoice-item-unitPrice-0');
      await user.clear(priceInput);
      await user.type(priceInput, '150.00');

      expect(priceInput).toHaveValue(150);
    });
  });

  describe('totals calculation', () => {
    it('displays subtotal', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-subtotal')).toBeInTheDocument();
    });

    it('displays tax amount', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-tax')).toBeInTheDocument();
    });

    it('displays total', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-total')).toBeInTheDocument();
    });
  });

  describe('form submission (create mode)', () => {
    it('calls createInvoice on save draft', async () => {
      const user = userEvent.setup();
      // Set up invoices with a known accountServices for selection
      const mockInvoices = [
        createMockInvoice({ id: 'inv-existing', accountServices: { id: 'as-1', serialised: 'Test Corp' } }),
      ];
      setupDefaultMocks(mockInvoices);
      vi.mocked(createInvoice).mockResolvedValue(createMockInvoice());

      renderInvoiceFormPage();

      // Wait for account option to load from invoices
      await screen.findByText('Test Corp');

      // Fill required fields - select account
      const accountSelect = screen.getByTestId('invoice-account-select');
      await user.selectOptions(accountSelect, 'as-1');

      // Fill due date (required by form validation)
      const dueDateInput = screen.getByTestId('invoice-due-date-input');
      await user.clear(dueDateInput);
      await user.type(dueDateInput, '2026-02-28');

      // Fill a line item
      const descInput = screen.getByTestId('invoice-item-description-0');
      await user.clear(descInput);
      await user.type(descInput, 'Service');

      const qtyInput = screen.getByTestId('invoice-item-quantity-0');
      await user.clear(qtyInput);
      await user.type(qtyInput, '1');

      const priceInput = screen.getByTestId('invoice-item-unitPrice-0');
      await user.clear(priceInput);
      await user.type(priceInput, '100');

      // Click save draft
      await user.click(screen.getByTestId('invoice-form-save-draft-button'));

      await waitFor(() => {
        expect(createInvoice).toHaveBeenCalled();
      });
    });

    it('calls sendInvoice after create when save & send is clicked', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice();
      const mockInvoices = [
        createMockInvoice({ id: 'inv-existing', accountServices: { id: 'as-1', serialised: 'Test Corp' } }),
      ];
      setupDefaultMocks(mockInvoices);
      vi.mocked(createInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(sendInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage();

      // Wait for account option to load
      await screen.findByText('Test Corp');

      // Fill required fields
      await user.selectOptions(screen.getByTestId('invoice-account-select'), 'as-1');

      // Fill due date (required by form validation)
      const dueDateInput = screen.getByTestId('invoice-due-date-input');
      await user.clear(dueDateInput);
      await user.type(dueDateInput, '2026-02-28');

      const descInput = screen.getByTestId('invoice-item-description-0');
      await user.clear(descInput);
      await user.type(descInput, 'Service');

      const qtyInput = screen.getByTestId('invoice-item-quantity-0');
      await user.clear(qtyInput);
      await user.type(qtyInput, '1');

      const priceInput = screen.getByTestId('invoice-item-unitPrice-0');
      await user.clear(priceInput);
      await user.type(priceInput, '100');

      // Click save & send
      await user.click(screen.getByTestId('invoice-form-save-send-button'));

      await waitFor(() => {
        expect(createInvoice).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(sendInvoice).toHaveBeenCalledWith(mockInvoice.id);
      });
    });

    it('navigates to invoice list after successful create', async () => {
      const user = userEvent.setup();
      const mockInvoices = [
        createMockInvoice({ id: 'inv-existing', accountServices: { id: 'as-1', serialised: 'Test Corp' } }),
      ];
      setupDefaultMocks(mockInvoices);
      vi.mocked(createInvoice).mockResolvedValue(createMockInvoice());

      renderInvoiceFormPage();

      // Wait for account option to load
      await screen.findByText('Test Corp');

      // Fill form
      await user.selectOptions(screen.getByTestId('invoice-account-select'), 'as-1');

      // Fill due date (required by form validation)
      const dueDateInput = screen.getByTestId('invoice-due-date-input');
      await user.clear(dueDateInput);
      await user.type(dueDateInput, '2026-02-28');

      const descInput = screen.getByTestId('invoice-item-description-0');
      await user.clear(descInput);
      await user.type(descInput, 'Service');

      const qtyInput = screen.getByTestId('invoice-item-quantity-0');
      await user.clear(qtyInput);
      await user.type(qtyInput, '1');

      const priceInput = screen.getByTestId('invoice-item-unitPrice-0');
      await user.clear(priceInput);
      await user.type(priceInput, '100');

      await user.click(screen.getByTestId('invoice-form-save-draft-button'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/invoices');
      });
    });
  });

  describe('form submission (edit mode)', () => {
    it('calls updateInvoice on save', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ notes: 'Original notes' });
      setupDefaultMocks();
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(updateInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-123/edit',
        path: '/invoices/:id/edit',
      });

      // Wait for invoice data to load and populate the form
      await waitFor(() => {
        expect(screen.getByTestId('invoice-notes-textarea')).toHaveValue('Original notes');
      });

      // Modify a field
      const notesTextarea = screen.getByTestId('invoice-notes-textarea');
      await user.clear(notesTextarea);
      await user.type(notesTextarea, 'Updated notes');

      // Save
      await user.click(screen.getByTestId('invoice-form-save-draft-button'));

      await waitFor(() => {
        expect(updateInvoice).toHaveBeenCalled();
      });
    });

    it('passes invoice ID to updateInvoice', async () => {
      const user = userEvent.setup();
      const mockInvoice = createMockInvoice({ id: 'inv-update-test', notes: 'Test notes' });
      setupDefaultMocks();
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(updateInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-update-test/edit',
        path: '/invoices/:id/edit',
      });

      // Wait for invoice data to load and populate the form
      await waitFor(() => {
        expect(screen.getByTestId('invoice-notes-textarea')).toHaveValue('Test notes');
      });

      await user.click(screen.getByTestId('invoice-form-save-draft-button'));

      await waitFor(() => {
        expect(updateInvoice).toHaveBeenCalledWith(
          'inv-update-test',
          expect.any(Object)
        );
      });
    });
  });

  describe('form validation', () => {
    // Changed: "no client selected" → "no account selected" (component validates accountServicesId)
    it('shows error when no account selected', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      // Don't select account, try to save
      await user.click(screen.getByTestId('invoice-form-save-draft-button'));

      await waitFor(() => {
        expect(screen.getByTestId('invoice-form-error-message')).toBeInTheDocument();
      });
    });

    it('shows error when no line items have valid data', async () => {
      const user = userEvent.setup();
      const mockInvoices = [
        createMockInvoice({ id: 'inv-existing', accountServices: { id: 'as-1', serialised: 'Test Corp' } }),
      ];
      setupDefaultMocks(mockInvoices);

      renderInvoiceFormPage();

      // Wait for account options to load
      await screen.findByText('Test Corp');

      // Select account but leave line items empty
      await user.selectOptions(screen.getByTestId('invoice-account-select'), 'as-1');

      // Fill due date so that validation passes for date but fails for line items
      const dueDateInput = screen.getByTestId('invoice-due-date-input');
      await user.clear(dueDateInput);
      await user.type(dueDateInput, '2026-02-28');

      await user.click(screen.getByTestId('invoice-form-save-draft-button'));

      await waitFor(() => {
        expect(screen.getByTestId('invoice-form-error-message')).toBeInTheDocument();
      });
    });
  });

  describe('navigation', () => {
    it('navigates back to invoices list when cancel is clicked', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      await user.click(screen.getByTestId('invoice-form-cancel-button'));

      expect(mockNavigate).toHaveBeenCalledWith('/invoices');
    });
  });

  describe('notes', () => {
    it('renders notes textarea', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-notes-textarea')).toBeInTheDocument();
    });

    // Changed: Removed "renders terms textarea" test - component has no terms field
    // The component has notes and PO number, but no separate terms input

    it('allows entering notes', async () => {
      const user = userEvent.setup();
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      const notesInput = screen.getByTestId('invoice-notes-textarea');
      await user.type(notesInput, 'Payment due within 30 days');

      expect(notesInput).toHaveValue('Payment due within 30 days');
    });

    it('populates notes in edit mode', async () => {
      const mockInvoice = createMockInvoice({
        notes: 'Existing notes here',
      });
      setupDefaultMocks();
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-123/edit',
        path: '/invoices/:id/edit',
      });

      // Wait for invoice data to load and populate the form
      await waitFor(() => {
        expect(screen.getByTestId('invoice-notes-textarea')).toHaveValue('Existing notes here');
      });
    });
  });

  describe('API interaction', () => {
    // Changed: Component calls listInvoices (not listClients) on mount
    it('calls listInvoices on mount to populate account dropdown', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(listInvoices).toHaveBeenCalled();
    });

    it('does not call getInvoice in create mode', async () => {
      setupDefaultMocks();

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(getInvoice).not.toHaveBeenCalled();
    });

    it('calls getInvoice in edit mode', async () => {
      setupDefaultMocks();
      vi.mocked(getInvoice).mockResolvedValue(createMockInvoice());

      renderInvoiceFormPage({
        route: '/invoices/inv-789/edit',
        path: '/invoices/:id/edit',
      });

      await screen.findByTestId('invoice-form-page');

      expect(getInvoice).toHaveBeenCalledWith('inv-789');
    });
  });
});
