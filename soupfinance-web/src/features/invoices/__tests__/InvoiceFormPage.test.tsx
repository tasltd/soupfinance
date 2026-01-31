/**
 * Unit tests for InvoiceFormPage component
 * Tests create/edit modes, form validation, line items, and submission
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoiceFormPage } from '../InvoiceFormPage';
import type { Invoice, InvoiceStatus } from '../../../types';
import type { InvoiceClient } from '../../../api/endpoints/clients';

// Mock the API modules - must match exact import paths in component
// Changed: Split mocks to match actual import paths in InvoiceFormPage.tsx
vi.mock('../../../api/endpoints/invoices', () => ({
  getInvoice: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  sendInvoice: vi.fn(),
}));

vi.mock('../../../api/endpoints/clients', () => ({
  listClients: vi.fn(),
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

import { getInvoice, createInvoice, updateInvoice, sendInvoice } from '../../../api/endpoints/invoices';
import { listClients } from '../../../api/endpoints/clients';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockClient(overrides: Partial<InvoiceClient> = {}): InvoiceClient {
  return {
    id: 'client-123',
    clientType: 'CORPORATE',
    name: 'Acme Corporation',
    email: 'billing@acme.com',
    phone: '+1-555-0100',
    address: '123 Main St',
    companyName: 'Acme Corporation',
    dateCreated: '2024-01-01T10:00:00Z',
    lastUpdated: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

function createMockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-123',
    invoiceNumber: 'INV-2024-001',
    client: { id: 'client-123', name: 'Acme Corporation' },
    issueDate: '2024-01-15',
    dueDate: '2024-02-15',
    status: 'DRAFT' as InvoiceStatus,
    subtotal: 1000,
    taxAmount: 100,
    discountAmount: 50,
    totalAmount: 1050,
    amountPaid: 0,
    amountDue: 1050,
    notes: 'Thank you for your business',
    terms: 'Net 30',
    items: [
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
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-form-page')).toBeInTheDocument();
    });

    it('renders create mode heading', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      expect(await screen.findByText('New Invoice')).toBeInTheDocument();
    });

    it('renders client select dropdown', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-client-select')).toBeInTheDocument();
    });

    it('renders issue date input', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-issue-date-input')).toBeInTheDocument();
    });

    it('renders due date input', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-due-date-input')).toBeInTheDocument();
    });

    it('renders line items table', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-items-table')).toBeInTheDocument();
    });

    it('renders add item button', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      expect(await screen.findByTestId('invoice-add-item-button')).toBeInTheDocument();
    });

    it('renders form action buttons', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-form-cancel-button')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-form-save-draft-button')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-form-save-send-button')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading state while fetching invoice in edit mode', () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);
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
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);
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
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-123/edit',
        path: '/invoices/:id/edit',
      });

      expect(await screen.findByText(/Edit Invoice/)).toBeInTheDocument();
    });

    it('populates form with existing invoice data', async () => {
      const mockInvoice = createMockInvoice({
        issueDate: '2024-03-15',
        dueDate: '2024-04-15',
      });
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-123/edit',
        path: '/invoices/:id/edit',
      });

      // Changed: Wait for actual form field instead of just the container
      // The container renders before data loads, so we wait for date input which only has value after data loads
      const issueDateInput = await screen.findByTestId('invoice-issue-date-input');

      // Wait for the data to be populated
      await waitFor(() => {
        expect(issueDateInput).toHaveValue('2024-03-15');
      });

      const dueDateInput = screen.getByTestId('invoice-due-date-input');
      expect(dueDateInput).toHaveValue('2024-04-15');
    });

    it('calls getInvoice with correct ID', async () => {
      const mockInvoice = createMockInvoice();
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-456/edit',
        path: '/invoices/:id/edit',
      });

      await screen.findByTestId('invoice-form-page');

      expect(getInvoice).toHaveBeenCalledWith('inv-456');
    });
  });

  describe('client selection', () => {
    it('populates client dropdown with fetched clients', async () => {
      const mockClients = [
        createMockClient({ id: 'c1', name: 'Client One' }),
        createMockClient({ id: 'c2', name: 'Client Two' }),
      ];
      vi.mocked(listClients).mockResolvedValue(mockClients);

      renderInvoiceFormPage();

      // Changed: Wait for actual client options to load, not just the container
      // The select shows "Loading clients..." until data is fetched
      await screen.findByText('Client One');

      const select = screen.getByTestId('invoice-client-select');
      const options = within(select).getAllByRole('option');

      // Should have placeholder + 2 clients
      expect(options.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Client One')).toBeInTheDocument();
      expect(screen.getByText('Client Two')).toBeInTheDocument();
    });

    it('allows selecting a client', async () => {
      const user = userEvent.setup();
      const mockClient = createMockClient({ id: 'selected-client', name: 'Selected Corp' });
      vi.mocked(listClients).mockResolvedValue([mockClient]);

      renderInvoiceFormPage();

      // Changed: Wait for actual client option to load, not just the container
      await screen.findByText('Selected Corp');

      const select = screen.getByTestId('invoice-client-select');
      await user.selectOptions(select, 'selected-client');

      expect(select).toHaveValue('selected-client');
    });
  });

  describe('line items', () => {
    it('starts with one empty line item in create mode', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      // Should have at least one line item row
      const descriptionInputs = screen.getAllByTestId(/invoice-item-description-/);
      expect(descriptionInputs.length).toBeGreaterThanOrEqual(1);
    });

    it('adds new line item when add button is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

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
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

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
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      const descriptionInput = screen.getByTestId('invoice-item-description-0');
      await user.clear(descriptionInput);
      await user.type(descriptionInput, 'Web Development Services');

      expect(descriptionInput).toHaveValue('Web Development Services');
    });

    it('updates line item quantity', async () => {
      const user = userEvent.setup();
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      const qtyInput = screen.getByTestId('invoice-item-quantity-0');
      await user.clear(qtyInput);
      await user.type(qtyInput, '5');

      expect(qtyInput).toHaveValue(5);
    });

    it('updates line item unit price', async () => {
      const user = userEvent.setup();
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

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
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-subtotal')).toBeInTheDocument();
    });

    it('displays tax amount', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-tax')).toBeInTheDocument();
    });

    it('displays total', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-total')).toBeInTheDocument();
    });
  });

  describe('form submission (create mode)', () => {
    it('calls createInvoice on save draft', async () => {
      const user = userEvent.setup();
      const mockClient = createMockClient();
      vi.mocked(listClients).mockResolvedValue([mockClient]);
      vi.mocked(createInvoice).mockResolvedValue(createMockInvoice());

      renderInvoiceFormPage();

      // Changed: Wait for client option to load before interacting
      await screen.findByText(mockClient.name);

      // Fill required fields
      const clientSelect = screen.getByTestId('invoice-client-select');
      await user.selectOptions(clientSelect, mockClient.id);

      // Changed: Fill due date (required by form validation)
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
      const mockClient = createMockClient();
      const mockInvoice = createMockInvoice();
      vi.mocked(listClients).mockResolvedValue([mockClient]);
      vi.mocked(createInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(sendInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage();

      // Changed: Wait for client option to load before interacting
      await screen.findByText(mockClient.name);

      // Fill required fields
      await user.selectOptions(screen.getByTestId('invoice-client-select'), mockClient.id);

      // Changed: Fill due date (required by form validation)
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
      const mockClient = createMockClient();
      vi.mocked(listClients).mockResolvedValue([mockClient]);
      vi.mocked(createInvoice).mockResolvedValue(createMockInvoice());

      renderInvoiceFormPage();

      // Changed: Wait for client option to load before interacting
      await screen.findByText(mockClient.name);

      // Fill form
      await user.selectOptions(screen.getByTestId('invoice-client-select'), mockClient.id);

      // Changed: Fill due date (required by form validation)
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
      const mockClient = createMockClient();
      const mockInvoice = createMockInvoice({ notes: 'Original notes' });
      vi.mocked(listClients).mockResolvedValue([mockClient]);
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(updateInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-123/edit',
        path: '/invoices/:id/edit',
      });

      // Changed: Wait for invoice data to load and populate the form
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
      const mockClient = createMockClient();
      const mockInvoice = createMockInvoice({ id: 'inv-update-test', notes: 'Test notes' });
      vi.mocked(listClients).mockResolvedValue([mockClient]);
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);
      vi.mocked(updateInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-update-test/edit',
        path: '/invoices/:id/edit',
      });

      // Changed: Wait for invoice data to load and populate the form
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
    it('shows error when no client selected', async () => {
      const user = userEvent.setup();
      const mockClient = createMockClient();
      vi.mocked(listClients).mockResolvedValue([mockClient]);

      renderInvoiceFormPage();

      // Changed: Wait for clients to load before interacting with form
      await screen.findByText(mockClient.name);

      // Don't select client, try to save
      await user.click(screen.getByTestId('invoice-form-save-draft-button'));

      await waitFor(() => {
        // Changed: testId matches component's actual data-testid="invoice-form-error-message"
        expect(screen.getByTestId('invoice-form-error-message')).toBeInTheDocument();
      });
    });

    it('shows error when no line items have valid data', async () => {
      const user = userEvent.setup();
      const mockClient = createMockClient();
      vi.mocked(listClients).mockResolvedValue([mockClient]);

      renderInvoiceFormPage();

      // Changed: Wait for clients to load before selecting
      await screen.findByText(mockClient.name);

      // Select client but leave line items empty
      await user.selectOptions(screen.getByTestId('invoice-client-select'), mockClient.id);

      await user.click(screen.getByTestId('invoice-form-save-draft-button'));

      await waitFor(() => {
        // Changed: testId matches component's actual data-testid="invoice-form-error-message"
        expect(screen.getByTestId('invoice-form-error-message')).toBeInTheDocument();
      });
    });
  });

  describe('navigation', () => {
    it('navigates back to invoices list when cancel is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      await user.click(screen.getByTestId('invoice-form-cancel-button'));

      expect(mockNavigate).toHaveBeenCalledWith('/invoices');
    });
  });

  describe('notes and terms', () => {
    it('renders notes textarea', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-notes-textarea')).toBeInTheDocument();
    });

    it('renders terms textarea', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(screen.getByTestId('invoice-terms-input')).toBeInTheDocument();
    });

    it('allows entering notes', async () => {
      const user = userEvent.setup();
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

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
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);
      vi.mocked(getInvoice).mockResolvedValue(mockInvoice);

      renderInvoiceFormPage({
        route: '/invoices/inv-123/edit',
        path: '/invoices/:id/edit',
      });

      // Changed: Wait for invoice data to load and populate the form
      await waitFor(() => {
        expect(screen.getByTestId('invoice-notes-textarea')).toHaveValue('Existing notes here');
      });
    });
  });

  describe('API interaction', () => {
    it('calls listClients on mount', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(listClients).toHaveBeenCalled();
    });

    it('does not call getInvoice in create mode', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);

      renderInvoiceFormPage();

      await screen.findByTestId('invoice-form-page');

      expect(getInvoice).not.toHaveBeenCalled();
    });

    it('calls getInvoice in edit mode', async () => {
      vi.mocked(listClients).mockResolvedValue([createMockClient()]);
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
