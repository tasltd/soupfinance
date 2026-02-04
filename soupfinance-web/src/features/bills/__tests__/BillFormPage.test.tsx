/**
 * Unit tests for BillFormPage component
 * Tests rendering, create/edit modes, form validation, line items, totals, and submission
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BillFormPage } from '../BillFormPage';
import type { Bill, BillStatus, Vendor } from '../../../types';

// Mock the bills API
vi.mock('../../../api/endpoints/bills', () => ({
  getBill: vi.fn(),
  createBill: vi.fn(),
  updateBill: vi.fn(),
}));

// Mock the vendors API
vi.mock('../../../api/endpoints/vendors', () => ({
  listVendors: vi.fn(),
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

import { getBill, createBill, updateBill } from '../../../api/endpoints/bills';
import { listVendors } from '../../../api/endpoints/vendors';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'vendor-123',
    name: 'Acme Supplies',
    email: 'contact@acme.com',
    phoneNumber: '555-1234',
    address: '123 Main St',
    archived: false,
    dateCreated: '2024-01-01T10:00:00Z',
    lastUpdated: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

function createMockBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-123',
    billNumber: 'BILL-2024-001',
    vendor: { id: 'vendor-1', name: 'Acme Supplies' },
    issueDate: '2024-01-15',
    dueDate: '2024-02-15',
    status: 'DRAFT' as BillStatus,
    subtotal: 1000,
    taxAmount: 100,
    totalAmount: 1100,
    amountPaid: 0,
    amountDue: 1100,
    notes: 'Test bill notes',
    items: [
      {
        id: 'item-1',
        bill: { id: 'bill-123' },
        description: 'Office Supplies',
        quantity: 10,
        unitPrice: 50,
        taxRate: 10,
        amount: 550,
      },
      {
        id: 'item-2',
        bill: { id: 'bill-123' },
        description: 'Printer Paper',
        quantity: 5,
        unitPrice: 100,
        taxRate: 10,
        amount: 550,
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

function renderBillFormPage(billId?: string) {
  const queryClient = createQueryClient();
  const initialEntries = billId ? [`/bills/${billId}/edit`] : ['/bills/new'];
  const path = billId ? '/bills/:id/edit' : '/bills/new';

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path={path} element={<BillFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('BillFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('rendering (create mode)', () => {
    it('renders the page container with correct test id', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-form-page')).toBeInTheDocument();
    });

    it('renders the page heading for new bill', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-form-heading')).toHaveTextContent('New Bill');
    });

    it('renders bill details card', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-details-card')).toBeInTheDocument();
    });

    it('renders vendor select dropdown', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-vendor-select')).toBeInTheDocument();
    });

    it('renders date inputs', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      await screen.findByTestId('bill-form-page');

      expect(screen.getByTestId('bill-issue-date-input')).toBeInTheDocument();
      expect(screen.getByTestId('bill-due-date-input')).toBeInTheDocument();
    });

    it('renders notes textarea', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-notes-textarea')).toBeInTheDocument();
    });

    it('renders line items card', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-items-card')).toBeInTheDocument();
    });

    it('renders add item button', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-add-item-button')).toBeInTheDocument();
    });

    it('renders save and cancel buttons', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      await screen.findByTestId('bill-form-page');

      expect(screen.getByTestId('bill-form-save-button')).toBeInTheDocument();
      expect(screen.getByTestId('bill-form-cancel-button')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('displays loading vendors message in dropdown while fetching', () => {
      // Component shows "Loading vendors..." as disabled option in dropdown while loading
      vi.mocked(listVendors).mockImplementation(() => new Promise(() => {}));

      renderBillFormPage();

      // The component renders the form with a "Loading vendors..." option in the dropdown
      const vendorSelect = screen.getByTestId('bill-vendor-select');
      expect(vendorSelect).toHaveTextContent('Loading vendors...');
    });

    it('displays loading message while fetching bill in edit mode', () => {
      vi.mocked(listVendors).mockResolvedValue([createMockVendor()]);
      vi.mocked(getBill).mockImplementation(() => new Promise(() => {}));

      renderBillFormPage('bill-123');

      expect(screen.getByTestId('bill-form-loading')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('displays error message when bill fetch fails in edit mode', async () => {
      vi.mocked(listVendors).mockResolvedValue([createMockVendor()]);
      vi.mocked(getBill).mockRejectedValue(new Error('Bill not found'));

      renderBillFormPage('bill-123');

      expect(await screen.findByTestId('bill-form-error')).toBeInTheDocument();
    });
  });

  describe('edit mode', () => {
    it('renders page heading for edit bill', async () => {
      const mockVendors = [createMockVendor()];
      const mockBill = createMockBill();
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(getBill).mockResolvedValue(mockBill);

      renderBillFormPage('bill-123');

      expect(await screen.findByTestId('bill-form-heading')).toHaveTextContent('Edit Bill');
    });

    it('populates form with existing bill data', async () => {
      const mockVendors = [
        createMockVendor({ id: 'vendor-1', name: 'Acme Supplies' }),
        createMockVendor({ id: 'vendor-2', name: 'Office Depot' }),
      ];
      const mockBill = createMockBill({
        vendor: { id: 'vendor-1', name: 'Acme Supplies' },
        issueDate: '2024-03-01',
        dueDate: '2024-03-31',
        notes: 'Existing notes',
      });
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(getBill).mockResolvedValue(mockBill);

      renderBillFormPage('bill-123');

      // Wait for both vendors and bill data to load
      await screen.findByTestId('bill-form-heading');
      // Wait for vendor options to be rendered
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(within(vendorSelect).queryByText('Acme Supplies')).toBeInTheDocument();
      });

      const vendorSelect = screen.getByTestId('bill-vendor-select') as HTMLSelectElement;
      expect(vendorSelect.value).toBe('vendor-1');

      const issueDateInput = screen.getByTestId('bill-issue-date-input') as HTMLInputElement;
      expect(issueDateInput.value).toBe('2024-03-01');

      const dueDateInput = screen.getByTestId('bill-due-date-input') as HTMLInputElement;
      expect(dueDateInput.value).toBe('2024-03-31');

      const notesTextarea = screen.getByTestId('bill-notes-textarea') as HTMLTextAreaElement;
      expect(notesTextarea.value).toBe('Existing notes');
    });

    it('populates existing line items', async () => {
      const mockVendors = [createMockVendor()];
      const mockBill = createMockBill({
        items: [
          { id: 'item-1', bill: { id: 'bill-123' }, description: 'Item A', quantity: 2, unitPrice: 100, taxRate: 5, amount: 210 },
          { id: 'item-2', bill: { id: 'bill-123' }, description: 'Item B', quantity: 3, unitPrice: 50, taxRate: 10, amount: 165 },
        ],
      });
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(getBill).mockResolvedValue(mockBill);

      renderBillFormPage('bill-123');

      await screen.findByTestId('bill-items-table');

      // Check first item
      const descInput0 = screen.getByTestId('bill-item-description-0') as HTMLInputElement;
      expect(descInput0.value).toBe('Item A');

      const qtyInput0 = screen.getByTestId('bill-item-quantity-0') as HTMLInputElement;
      expect(qtyInput0.value).toBe('2');

      // Check second item
      const descInput1 = screen.getByTestId('bill-item-description-1') as HTMLInputElement;
      expect(descInput1.value).toBe('Item B');
    });

    it('calls getBill with correct id', async () => {
      const mockVendors = [createMockVendor()];
      const mockBill = createMockBill();
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(getBill).mockResolvedValue(mockBill);

      renderBillFormPage('bill-456');

      await screen.findByTestId('bill-form-page');

      expect(getBill).toHaveBeenCalledWith('bill-456');
    });
  });

  describe('vendor selection', () => {
    it('displays vendors in dropdown', async () => {
      const mockVendors = [
        createMockVendor({ id: 'vendor-1', name: 'Vendor A' }),
        createMockVendor({ id: 'vendor-2', name: 'Vendor B' }),
        createMockVendor({ id: 'vendor-3', name: 'Vendor C' }),
      ];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      // Wait for vendors to load
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(vendorSelect).toHaveTextContent('Vendor A');
      });

      const vendorSelect = screen.getByTestId('bill-vendor-select');
      const options = within(vendorSelect).getAllByRole('option');

      // Includes placeholder + 3 vendors
      expect(options.length).toBeGreaterThanOrEqual(3);
      expect(vendorSelect).toHaveTextContent('Vendor A');
      expect(vendorSelect).toHaveTextContent('Vendor B');
      expect(vendorSelect).toHaveTextContent('Vendor C');
    });

    it('allows selecting a vendor', async () => {
      const user = userEvent.setup();
      const mockVendors = [
        createMockVendor({ id: 'vendor-1', name: 'Vendor A' }),
        createMockVendor({ id: 'vendor-2', name: 'Vendor B' }),
      ];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      // Wait for vendors to load
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(vendorSelect).toHaveTextContent('Vendor B');
      });

      const vendorSelect = screen.getByTestId('bill-vendor-select');
      await user.selectOptions(vendorSelect, 'vendor-2');

      expect((vendorSelect as HTMLSelectElement).value).toBe('vendor-2');
    });
  });

  describe('line items', () => {
    it('renders line items table', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-items-table')).toBeInTheDocument();
    });

    it('renders table headers', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      await screen.findByTestId('bill-items-table');

      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Qty')).toBeInTheDocument();
      expect(screen.getByText('Unit Price')).toBeInTheDocument();
      expect(screen.getByText('Tax %')).toBeInTheDocument();
    });

    it('starts with one empty line item in create mode', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      await screen.findByTestId('bill-items-table');

      expect(screen.getByTestId('bill-item-description-0')).toBeInTheDocument();
      expect(screen.getByTestId('bill-item-quantity-0')).toBeInTheDocument();
      expect(screen.getByTestId('bill-item-unitPrice-0')).toBeInTheDocument();
      expect(screen.getByTestId('bill-item-taxRate-0')).toBeInTheDocument();
    });

    it('can add new line item', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      const addButton = await screen.findByTestId('bill-add-item-button');
      await user.click(addButton);

      expect(screen.getByTestId('bill-item-description-1')).toBeInTheDocument();
    });

    it('can remove line item', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      // Add a second item first
      const addButton = await screen.findByTestId('bill-add-item-button');
      await user.click(addButton);

      // Now remove the first item
      const removeButton = screen.getByTestId('bill-item-remove-0');
      await user.click(removeButton);

      // First item should now be what was the second item
      // Or there should only be one item left
      expect(screen.queryByTestId('bill-item-description-1')).not.toBeInTheDocument();
    });

    it('can edit line item fields', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      await screen.findByTestId('bill-items-table');

      const descInput = screen.getByTestId('bill-item-description-0');
      const qtyInput = screen.getByTestId('bill-item-quantity-0');
      const priceInput = screen.getByTestId('bill-item-unitPrice-0');
      const taxInput = screen.getByTestId('bill-item-taxRate-0');

      await user.clear(descInput);
      await user.type(descInput, 'Test Item');

      await user.clear(qtyInput);
      await user.type(qtyInput, '5');

      await user.clear(priceInput);
      await user.type(priceInput, '100');

      // Tax rate is a select dropdown, not an input
      await user.selectOptions(taxInput, '10');

      expect((descInput as HTMLInputElement).value).toBe('Test Item');
      expect((qtyInput as HTMLInputElement).value).toBe('5');
      expect((priceInput as HTMLInputElement).value).toBe('100');
      expect((taxInput as HTMLSelectElement).value).toBe('10');
    });
  });

  describe('totals calculation', () => {
    it('displays subtotal', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-subtotal')).toBeInTheDocument();
    });

    it('displays tax amount', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-tax')).toBeInTheDocument();
    });

    it('displays total amount', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      expect(await screen.findByTestId('bill-total')).toBeInTheDocument();
    });

    it('calculates totals based on line items', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      await screen.findByTestId('bill-items-table');

      // Enter line item: qty=2, price=100, tax=10%
      // Subtotal = 2 * 100 = 200
      // Tax = 200 * 0.10 = 20
      // Total = 220

      const qtyInput = screen.getByTestId('bill-item-quantity-0');
      const priceInput = screen.getByTestId('bill-item-unitPrice-0');
      const taxInput = screen.getByTestId('bill-item-taxRate-0');

      await user.clear(qtyInput);
      await user.type(qtyInput, '2');

      await user.clear(priceInput);
      await user.type(priceInput, '100');

      // Tax rate is a select dropdown, not an input
      await user.selectOptions(taxInput, '10');

      await waitFor(() => {
        const subtotal = screen.getByTestId('bill-subtotal');
        expect(subtotal).toHaveTextContent('$200.00');
      });

      const tax = screen.getByTestId('bill-tax');
      expect(tax).toHaveTextContent('$20.00');

      const total = screen.getByTestId('bill-total');
      expect(total).toHaveTextContent('$220.00');
    });
  });

  describe('form submission (create mode)', () => {
    it('calls createBill on form submit', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor({ id: 'vendor-1', name: 'Acme' })];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(createBill).mockResolvedValue(createMockBill({ id: 'new-bill-id' }));

      renderBillFormPage();

      // Wait for vendors to load
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(vendorSelect).toHaveTextContent('Acme');
      });

      // Select vendor
      const vendorSelect = screen.getByTestId('bill-vendor-select');
      await user.selectOptions(vendorSelect, 'vendor-1');

      // Set dates
      const issueDateInput = screen.getByTestId('bill-issue-date-input');
      const dueDateInput = screen.getByTestId('bill-due-date-input');
      await user.clear(issueDateInput);
      await user.type(issueDateInput, '2024-03-01');
      await user.clear(dueDateInput);
      await user.type(dueDateInput, '2024-03-31');

      // Add line item
      const descInput = screen.getByTestId('bill-item-description-0');
      const qtyInput = screen.getByTestId('bill-item-quantity-0');
      const priceInput = screen.getByTestId('bill-item-unitPrice-0');

      await user.clear(descInput);
      await user.type(descInput, 'Test Item');
      await user.clear(qtyInput);
      await user.type(qtyInput, '1');
      await user.clear(priceInput);
      await user.type(priceInput, '100');

      // Submit
      const saveButton = screen.getByTestId('bill-form-save-button');
      await user.click(saveButton);

      await waitFor(() => {
        expect(createBill).toHaveBeenCalled();
      });
    });

    it('navigates to bills list after successful create', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor({ id: 'vendor-1', name: 'Test Vendor' })];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(createBill).mockResolvedValue(createMockBill({ id: 'new-bill' }));

      renderBillFormPage();

      // Wait for vendors to load
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(vendorSelect).toHaveTextContent('Test Vendor');
      });

      // Fill required fields
      const vendorSelect = screen.getByTestId('bill-vendor-select');
      await user.selectOptions(vendorSelect, 'vendor-1');

      // Set due date (required)
      const dueDateInput = screen.getByTestId('bill-due-date-input');
      await user.clear(dueDateInput);
      await user.type(dueDateInput, '2024-03-31');

      const descInput = screen.getByTestId('bill-item-description-0');
      const qtyInput = screen.getByTestId('bill-item-quantity-0');
      const priceInput = screen.getByTestId('bill-item-unitPrice-0');

      await user.type(descInput, 'Item');
      await user.clear(qtyInput);
      await user.type(qtyInput, '1');
      await user.clear(priceInput);
      await user.type(priceInput, '50');

      const saveButton = screen.getByTestId('bill-form-save-button');
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/bills');
      });
    });
  });

  describe('form submission (edit mode)', () => {
    it('calls updateBill on form submit in edit mode', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor({ id: 'vendor-1', name: 'Acme Supplies' })];
      const mockBill = createMockBill({ id: 'bill-123', vendor: { id: 'vendor-1', name: 'Acme Supplies' } });
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(updateBill).mockResolvedValue(mockBill);

      renderBillFormPage('bill-123');

      // Wait for form to load with data
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(vendorSelect).toHaveTextContent('Acme Supplies');
      });

      // Modify a field
      const notesTextarea = screen.getByTestId('bill-notes-textarea');
      await user.clear(notesTextarea);
      await user.type(notesTextarea, 'Updated notes');

      // Submit
      const saveButton = screen.getByTestId('bill-form-save-button');
      await user.click(saveButton);

      await waitFor(() => {
        expect(updateBill).toHaveBeenCalledWith('bill-123', expect.any(Object));
      });
    });

    it('navigates to bill detail after successful update', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor({ id: 'vendor-1', name: 'Acme Supplies' })];
      const mockBill = createMockBill({ id: 'bill-123', vendor: { id: 'vendor-1', name: 'Acme Supplies' } });
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(updateBill).mockResolvedValue(mockBill);

      renderBillFormPage('bill-123');

      // Wait for form to load with data
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(vendorSelect).toHaveTextContent('Acme Supplies');
      });

      const saveButton = screen.getByTestId('bill-form-save-button');
      await user.click(saveButton);

      await waitFor(() => {
        // Component navigates to bill detail page after update
        expect(mockNavigate).toHaveBeenCalledWith('/bills/bill-123');
      });
    });
  });

  describe('form validation', () => {
    it('shows error when vendor is not selected', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      await screen.findByTestId('bill-form-page');

      // Don't select vendor, just try to submit
      const saveButton = screen.getByTestId('bill-form-save-button');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByTestId('bill-form-error-message')).toBeInTheDocument();
      });
      expect(screen.getByTestId('bill-form-error-message')).toHaveTextContent(/vendor/i);
    });

    it('shows error when line item description is empty', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor({ id: 'vendor-1', name: 'Acme' })];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      // Wait for vendors to load
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(vendorSelect).toHaveTextContent('Acme');
      });

      // Select vendor
      const vendorSelect = screen.getByTestId('bill-vendor-select');
      await user.selectOptions(vendorSelect, 'vendor-1');

      // Set dates (required)
      const dueDateInput = screen.getByTestId('bill-due-date-input');
      await user.clear(dueDateInput);
      await user.type(dueDateInput, '2024-03-31');

      // Don't fill description, only quantity and price
      const qtyInput = screen.getByTestId('bill-item-quantity-0');
      const priceInput = screen.getByTestId('bill-item-unitPrice-0');

      await user.clear(qtyInput);
      await user.type(qtyInput, '1');
      await user.clear(priceInput);
      await user.type(priceInput, '100');

      // Try to submit - should fail because line item description is empty
      const saveButton = screen.getByTestId('bill-form-save-button');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByTestId('bill-form-error-message')).toBeInTheDocument();
      });
    });
  });

  describe('navigation', () => {
    it('cancel button navigates back to bills list', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      const cancelButton = await screen.findByTestId('bill-form-cancel-button');
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/bills');
    });
  });

  describe('notes', () => {
    it('allows entering notes', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderBillFormPage();

      const notesTextarea = await screen.findByTestId('bill-notes-textarea');
      await user.type(notesTextarea, 'These are my bill notes');

      expect((notesTextarea as HTMLTextAreaElement).value).toBe('These are my bill notes');
    });

    it('notes are included in form submission', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor({ id: 'vendor-1', name: 'Test Vendor' })];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(createBill).mockResolvedValue(createMockBill());

      renderBillFormPage();

      // Wait for vendors to load
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(vendorSelect).toHaveTextContent('Test Vendor');
      });

      // Fill required fields
      const vendorSelect = screen.getByTestId('bill-vendor-select');
      await user.selectOptions(vendorSelect, 'vendor-1');

      // Set due date (required)
      const dueDateInput = screen.getByTestId('bill-due-date-input');
      await user.clear(dueDateInput);
      await user.type(dueDateInput, '2024-03-31');

      const descInput = screen.getByTestId('bill-item-description-0');
      const qtyInput = screen.getByTestId('bill-item-quantity-0');
      const priceInput = screen.getByTestId('bill-item-unitPrice-0');

      await user.type(descInput, 'Item');
      await user.clear(qtyInput);
      await user.type(qtyInput, '1');
      await user.clear(priceInput);
      await user.type(priceInput, '50');

      // Add notes
      const notesTextarea = screen.getByTestId('bill-notes-textarea');
      await user.type(notesTextarea, 'Special notes');

      // Submit
      const saveButton = screen.getByTestId('bill-form-save-button');
      await user.click(saveButton);

      await waitFor(() => {
        expect(createBill).toHaveBeenCalledWith(
          expect.objectContaining({
            notes: 'Special notes',
          })
        );
      });
    });
  });

  describe('API interaction', () => {
    it('calls listVendors on mount', async () => {
      vi.mocked(listVendors).mockResolvedValue([createMockVendor()]);

      renderBillFormPage();

      await screen.findByTestId('bill-form-page');

      expect(listVendors).toHaveBeenCalled();
    });

    it('displays submission error when createBill fails', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor({ id: 'vendor-1', name: 'Test Vendor' })];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(createBill).mockRejectedValue(new Error('Server error'));

      renderBillFormPage();

      // Wait for vendors to load
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(vendorSelect).toHaveTextContent('Test Vendor');
      });

      // Fill required fields
      const vendorSelect = screen.getByTestId('bill-vendor-select');
      await user.selectOptions(vendorSelect, 'vendor-1');

      // Set due date (required)
      const dueDateInput = screen.getByTestId('bill-due-date-input');
      await user.clear(dueDateInput);
      await user.type(dueDateInput, '2024-03-31');

      const descInput = screen.getByTestId('bill-item-description-0');
      const qtyInput = screen.getByTestId('bill-item-quantity-0');
      const priceInput = screen.getByTestId('bill-item-unitPrice-0');

      await user.type(descInput, 'Item');
      await user.clear(qtyInput);
      await user.type(qtyInput, '1');
      await user.clear(priceInput);
      await user.type(priceInput, '50');

      // Submit
      const saveButton = screen.getByTestId('bill-form-save-button');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByTestId('bill-form-error-message')).toBeInTheDocument();
      });
    });

    it('displays submission error when updateBill fails', async () => {
      const user = userEvent.setup();
      const mockVendors = [createMockVendor({ id: 'vendor-1', name: 'Acme Supplies' })];
      const mockBill = createMockBill({ id: 'bill-123', vendor: { id: 'vendor-1', name: 'Acme Supplies' } });
      vi.mocked(listVendors).mockResolvedValue(mockVendors);
      vi.mocked(getBill).mockResolvedValue(mockBill);
      vi.mocked(updateBill).mockRejectedValue(new Error('Update failed'));

      renderBillFormPage('bill-123');

      // Wait for form to load with data
      await waitFor(() => {
        const vendorSelect = screen.getByTestId('bill-vendor-select');
        expect(vendorSelect).toHaveTextContent('Acme Supplies');
      });

      // Submit
      const saveButton = screen.getByTestId('bill-form-save-button');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByTestId('bill-form-error-message')).toBeInTheDocument();
      });
    });
  });
});
