/**
 * Unit tests for VendorDetailPage component
 * Tests rendering, loading/error states, data display, and delete functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VendorDetailPage } from '../VendorDetailPage';
import type { Bill, Vendor } from '../../../types';

// Mock the vendors API
// Component imports from '../../api' but test file is in __tests__ so use '../../../api'
vi.mock('../../../api', async () => {
  const bills = await vi.importActual<typeof import('../../../api/endpoints/bills')>(
    '../../../api/endpoints/bills'
  );
  return {
    getVendor: vi.fn(),
    deleteVendor: vi.fn(),
    // Added (SOUPFIN-172): bill history is mocked; the summary maths stays real
    // so these tests check the totals the page actually shows.
    listVendorBills: vi.fn(),
    summariseVendorBills: bills.summariseVendorBills,
  };
});

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { getVendor, deleteVendor, listVendorBills } from '../../../api';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'vendor-123',
    name: 'Acme Supplies',
    email: 'info@acme.com',
    phoneNumber: '555-1234',
    address: '123 Main St, Suite 100\nNew York, NY 10001',
    taxIdentificationNumber: '12-3456789',
    paymentTerms: 30,
    notes: 'Preferred supplier for office equipment',
    archived: false,
    dateCreated: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-01-15T10:00:00Z',
    tenantId: 'tenant-1',
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

// Added (SOUPFIN-172): a bill as listVendorBills returns it (already normalised)
function createMockBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    billNumber: 'BILL-001',
    vendor: { id: 'vendor-123', name: 'Acme Supplies' },
    billDate: '2026-09-01',
    paymentDate: '2026-10-01',
    status: 'PENDING',
    subtotal: 1000,
    taxAmount: 0,
    totalAmount: 1000,
    amountPaid: 0,
    amountDue: 1000,
    archived: false,
    dateCreated: '2026-09-01T10:00:00Z',
    lastUpdated: '2026-09-01T10:00:00Z',
    ...overrides,
  } as Bill;
}

function renderVendorDetailPage(vendorId: string = 'vendor-123') {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/vendors/${vendorId}`]}>
        <Routes>
          <Route path="/vendors/:id" element={<VendorDetailPage />} />
          <Route path="/vendors" element={<div>Vendors List</div>} />
          <Route path="/vendors/:id/edit" element={<div>Edit Vendor</div>} />
          <Route path="/bills/new" element={<div>New Bill Form</div>} />
          <Route path="/bills/:id" element={<div>Bill Detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('VendorDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    // Added (SOUPFIN-172): default to a vendor with no bills
    vi.mocked(listVendorBills).mockResolvedValue({ bills: [], complete: true });
  });

  describe('loading state', () => {
    it('displays loading message while fetching vendor', () => {
      // Never resolves to keep loading state
      vi.mocked(getVendor).mockImplementation(() => new Promise(() => {}));

      renderVendorDetailPage();

      expect(screen.getByTestId('vendor-detail-page')).toBeInTheDocument();
      expect(screen.getByText('Loading vendor...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('displays error message when vendor not found', async () => {
      vi.mocked(getVendor).mockRejectedValue(new Error('Not found'));

      renderVendorDetailPage();

      expect(await screen.findByText('Vendor not found')).toBeInTheDocument();
    });

    it('displays helpful error description', async () => {
      vi.mocked(getVendor).mockRejectedValue(new Error('Not found'));

      renderVendorDetailPage();

      expect(await screen.findByText(/doesn't exist or has been deleted/i)).toBeInTheDocument();
    });

    it('displays back to vendors link in error state', async () => {
      vi.mocked(getVendor).mockRejectedValue(new Error('Not found'));

      renderVendorDetailPage();

      const backLink = await screen.findByRole('link', { name: /back to vendors/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/vendors');
    });
  });

  describe('data display', () => {
    it('renders vendor name as page heading', async () => {
      const mockVendor = createMockVendor({ name: 'Test Supplier Inc' });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      // Wait for vendor to load and check heading
      await screen.findByText('Vendor Details');
      // Vendor name appears multiple times (heading and info section) - check it exists
      const nameElements = screen.getAllByText('Test Supplier Inc');
      expect(nameElements.length).toBeGreaterThan(0);
      // First one is the h1 heading
      expect(nameElements[0].tagName).toBe('H1');
    });

    it('renders vendor details subtitle', async () => {
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      expect(await screen.findByText('Vendor Details')).toBeInTheDocument();
    });

    it('renders back to vendors link', async () => {
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      // Wait for vendor to load
      await screen.findByText('Vendor Details');

      const backLinks = screen.getAllByText('Back to Vendors');
      expect(backLinks.length).toBeGreaterThan(0);
    });

    it('renders basic information section', async () => {
      const mockVendor = createMockVendor({
        name: 'Office Supplies Co',
        email: 'orders@office.com',
        phoneNumber: '555-9876',
        taxIdentificationNumber: '98-7654321',
      });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      expect(await screen.findByText('Basic Information')).toBeInTheDocument();
      // Name appears in heading and info section
      const nameElements = screen.getAllByText('Office Supplies Co');
      expect(nameElements.length).toBeGreaterThan(0);
      expect(screen.getByText('orders@office.com')).toBeInTheDocument();
      expect(screen.getByText('555-9876')).toBeInTheDocument();
      expect(screen.getByText('98-7654321')).toBeInTheDocument();
    });

    it('renders payment terms section', async () => {
      const mockVendor = createMockVendor({ paymentTerms: 45 });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      expect(await screen.findByText('Payment Terms')).toBeInTheDocument();
      expect(screen.getByText('45 days')).toBeInTheDocument();
    });

    it('renders address section', async () => {
      const mockVendor = createMockVendor({ address: '456 Commerce Ave\nBoston, MA 02101' });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      expect(await screen.findByText('Address')).toBeInTheDocument();
      // Address text is rendered with whitespace-pre-wrap, find by partial text
      expect(screen.getByText(/456 Commerce Ave/)).toBeInTheDocument();
    });

    it('renders notes section', async () => {
      const mockVendor = createMockVendor({ notes: 'Priority vendor for urgent orders' });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      expect(await screen.findByText('Additional Notes')).toBeInTheDocument();
      expect(screen.getByText('Priority vendor for urgent orders')).toBeInTheDocument();
    });

    it('displays "Not provided" for missing optional fields', async () => {
      const mockVendor = createMockVendor({
        email: undefined,
        phoneNumber: undefined,
        taxIdentificationNumber: undefined,
        address: undefined,
      });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      // Wait for vendor to load
      await screen.findByText('Basic Information');

      const notProvidedTexts = screen.getAllByText('Not provided');
      // email, phone, tax ID, and address = 4 "Not provided" texts
      expect(notProvidedTexts.length).toBe(4);
    });

    it('displays "Not specified" for missing payment terms', async () => {
      const mockVendor = createMockVendor({ paymentTerms: undefined });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      expect(await screen.findByText('Not specified')).toBeInTheDocument();
    });

    it('displays "No notes" for missing notes', async () => {
      const mockVendor = createMockVendor({ notes: undefined });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      expect(await screen.findByText('No notes')).toBeInTheDocument();
    });
  });

  describe('action buttons', () => {
    it('renders edit button', async () => {
      const mockVendor = createMockVendor({ id: 'vendor-456' });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage('vendor-456');

      const editButton = await screen.findByTestId('vendor-detail-edit');
      expect(editButton).toBeInTheDocument();
      expect(editButton).toHaveTextContent('Edit');
      expect(editButton).toHaveAttribute('href', '/vendors/vendor-456/edit');
    });

    it('renders delete button', async () => {
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      const deleteButton = await screen.findByTestId('vendor-detail-delete');
      expect(deleteButton).toBeInTheDocument();
      expect(deleteButton).toHaveTextContent('Delete');
    });
  });

  describe('delete functionality', () => {
    it('opens delete confirmation modal when delete button clicked', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      const deleteButton = await screen.findByTestId('vendor-detail-delete');
      await user.click(deleteButton);

      expect(screen.getByTestId('delete-confirmation-modal')).toBeInTheDocument();
    });

    it('displays vendor name in delete confirmation modal', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor({ name: 'Vendor To Delete' });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      const deleteButton = await screen.findByTestId('vendor-detail-delete');
      await user.click(deleteButton);

      // Vendor name appears in modal - look within the modal
      const modal = screen.getByTestId('delete-confirmation-modal');
      expect(modal).toHaveTextContent('Vendor To Delete');
    });

    it('displays warning message in delete modal', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      const deleteButton = await screen.findByTestId('vendor-detail-delete');
      await user.click(deleteButton);

      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    });

    it('closes delete modal when cancel button clicked', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      const deleteButton = await screen.findByTestId('vendor-detail-delete');
      await user.click(deleteButton);

      const cancelButton = screen.getByTestId('delete-cancel-button');
      await user.click(cancelButton);

      expect(screen.queryByTestId('delete-confirmation-modal')).not.toBeInTheDocument();
    });

    it('closes delete modal when close icon clicked', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      const deleteButton = await screen.findByTestId('vendor-detail-delete');
      await user.click(deleteButton);

      const closeButton = screen.getByText('close').closest('button');
      await user.click(closeButton!);

      expect(screen.queryByTestId('delete-confirmation-modal')).not.toBeInTheDocument();
    });

    it('calls deleteVendor API when confirm button clicked', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor({ id: 'vendor-to-delete' });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);
      vi.mocked(deleteVendor).mockResolvedValue(undefined);

      renderVendorDetailPage('vendor-to-delete');

      const deleteButton = await screen.findByTestId('vendor-detail-delete');
      await user.click(deleteButton);

      const confirmButton = screen.getByTestId('delete-confirm-button');
      await user.click(confirmButton);

      expect(deleteVendor).toHaveBeenCalledWith('vendor-to-delete');
    });

    it('shows deleting state on confirm button', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);
      // Never resolves to keep pending state
      vi.mocked(deleteVendor).mockImplementation(() => new Promise(() => {}));

      renderVendorDetailPage();

      const deleteButton = await screen.findByTestId('vendor-detail-delete');
      await user.click(deleteButton);

      const confirmButton = screen.getByTestId('delete-confirm-button');
      await user.click(confirmButton);

      expect(confirmButton).toHaveTextContent('Deleting...');
      expect(confirmButton).toBeDisabled();
    });

    it('navigates to vendors list after successful delete', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);
      vi.mocked(deleteVendor).mockResolvedValue(undefined);

      renderVendorDetailPage();

      const deleteButton = await screen.findByTestId('vendor-detail-delete');
      await user.click(deleteButton);

      const confirmButton = screen.getByTestId('delete-confirm-button');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/vendors');
      });
    });
  });

  describe('API interaction', () => {
    it('calls getVendor with correct vendor ID on mount', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());

      renderVendorDetailPage('vendor-specific-id');

      await screen.findByTestId('vendor-detail-page');

      expect(getVendor).toHaveBeenCalledWith('vendor-specific-id');
    });

    it('only calls getVendor once on initial render', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());

      renderVendorDetailPage();

      await screen.findByTestId('vendor-detail-page');

      expect(getVendor).toHaveBeenCalledTimes(1);
    });
  });

  describe('navigation', () => {
    it('edit button links to edit page', async () => {
      const mockVendor = createMockVendor({ id: 'vendor-nav-test' });
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage('vendor-nav-test');

      const editButton = await screen.findByTestId('vendor-detail-edit');
      expect(editButton).toHaveAttribute('href', '/vendors/vendor-nav-test/edit');
    });

    it('back link navigates to vendors list', async () => {
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      // Wait for vendor to load
      await screen.findByText('Vendor Details');

      const backLinks = screen.getAllByRole('link', { name: /back to vendors/i });
      expect(backLinks[0]).toHaveAttribute('href', '/vendors');
    });
  });

  describe('section labels', () => {
    it('renders all field labels correctly', async () => {
      const mockVendor = createMockVendor();
      vi.mocked(getVendor).mockResolvedValue(mockVendor);

      renderVendorDetailPage();

      // Wait for vendor to load
      await screen.findByText('Basic Information');

      expect(screen.getByText('Vendor Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Phone Number')).toBeInTheDocument();
      expect(screen.getByText('Tax Identification Number')).toBeInTheDocument();
      expect(screen.getByText('Payment Terms (Days)')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Added (SOUPFIN-172): AP summary, bill history and "Create bill"
  // ==========================================================================
  describe('AP summary and bill history (SOUPFIN-172)', () => {
    it('loads the bills for the vendor in the URL', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor({ id: 'vendor-777' }));

      renderVendorDetailPage('vendor-777');

      await screen.findByTestId('vendor-bills');
      expect(listVendorBills).toHaveBeenCalledWith('vendor-777');
    });

    it('shows Total Billed, Total Paid and Outstanding summed from the bills', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());
      vi.mocked(listVendorBills).mockResolvedValue({
        complete: true,
        bills: [
          createMockBill({ id: 'b1', totalAmount: 1500, amountPaid: 1500, amountDue: 0, status: 'PAID' }),
          createMockBill({ id: 'b2', totalAmount: 2500.5, amountPaid: 500, amountDue: 2000.5, status: 'PARTIAL' }),
          createMockBill({ id: 'b3', totalAmount: 750.25, amountPaid: 0, amountDue: 750.25 }),
        ],
      });

      renderVendorDetailPage();

      await waitFor(() =>
        expect(screen.getByTestId('vendor-summary-total-billed')).toHaveTextContent('4,750.75')
      );
      expect(screen.getByTestId('vendor-summary-total-paid')).toHaveTextContent('2,000.00');
      expect(screen.getByTestId('vendor-summary-outstanding')).toHaveTextContent('2,750.75');
      expect(screen.getByText('Total Billed')).toBeInTheDocument();
      expect(screen.getByText('Total Paid')).toBeInTheDocument();
      expect(screen.getByText('Outstanding')).toBeInTheDocument();
    });

    it('renders one row per bill with a link, amounts and a status badge', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());
      vi.mocked(listVendorBills).mockResolvedValue({
        complete: true,
        bills: [
          createMockBill({ id: 'b1', billNumber: 'BILL-100', status: 'PAID', amountPaid: 1000, amountDue: 0 }),
          createMockBill({ id: 'b2', billNumber: 'BILL-101', status: 'OVERDUE' }),
        ],
      });

      renderVendorDetailPage();

      const table = await screen.findByTestId('vendor-bills-table');
      // header + 2 bills
      expect(within(table).getAllByRole('row')).toHaveLength(3);
      expect(screen.getByTestId('vendor-bill-link-b1')).toHaveAttribute('href', '/bills/b1');
      expect(screen.getByTestId('vendor-bill-link-b1')).toHaveTextContent('BILL-100');
      expect(screen.getByTestId('vendor-bill-status-b1')).toHaveTextContent('PAID');
      expect(screen.getByTestId('vendor-bill-status-b1').className).toContain('text-success');
      expect(screen.getByTestId('vendor-bill-status-b2')).toHaveTextContent('OVERDUE');
      expect(screen.getByTestId('vendor-bill-status-b2').className).toContain('text-danger');
      const row = screen.getByTestId('vendor-bill-row-b1');
      expect(row).toHaveTextContent('2026-09-01');
      expect(row).toHaveTextContent('1,000.00');
      expect(screen.getByTestId('vendor-bills-count')).toHaveTextContent('2 bills');
    });

    it('labels a bill whose status the backend left null', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());
      vi.mocked(listVendorBills).mockResolvedValue({
        complete: true,
        bills: [createMockBill({ id: 'b1', status: null as unknown as Bill['status'] })],
      });

      renderVendorDetailPage();

      expect(await screen.findByTestId('vendor-bill-status-b1')).toHaveTextContent('No status');
    });

    it('opens a bill when its number is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());
      vi.mocked(listVendorBills).mockResolvedValue({
        complete: true,
        bills: [createMockBill({ id: 'b9' })],
      });

      renderVendorDetailPage();

      await user.click(await screen.findByTestId('vendor-bill-link-b9'));
      expect(await screen.findByText('Bill Detail')).toBeInTheDocument();
    });

    it('shows zero totals and an empty state when the vendor has no bills', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());

      renderVendorDetailPage();

      expect(await screen.findByTestId('vendor-bills-empty')).toHaveTextContent(
        'No bills from this vendor yet'
      );
      expect(screen.getByTestId('vendor-summary-total-billed')).toHaveTextContent('0.00');
      expect(screen.getByTestId('vendor-summary-total-paid')).toHaveTextContent('0.00');
      expect(screen.getByTestId('vendor-summary-outstanding')).toHaveTextContent('0.00');
      expect(screen.getByTestId('vendor-bills-count')).toHaveTextContent('0 bills');
      expect(screen.getByTestId('vendor-bills-create-first')).toHaveAttribute(
        'href',
        '/bills/new?vendorId=vendor-123'
      );
      expect(screen.queryByTestId('vendor-summary-incomplete')).not.toBeInTheDocument();
    });

    it('shows a loading row and placeholder totals while bills load', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());
      vi.mocked(listVendorBills).mockImplementation(() => new Promise(() => {}));

      renderVendorDetailPage();

      expect(await screen.findByTestId('vendor-bills-loading')).toHaveTextContent('Loading bills...');
      expect(screen.getByTestId('vendor-summary-total-billed')).toHaveTextContent('\u2014');
    });

    it('shows the API error instead of an empty history or zero totals', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());
      vi.mocked(listVendorBills).mockRejectedValue(new Error('Request failed with status code 500'));

      renderVendorDetailPage();

      expect(await screen.findByTestId('vendor-bills-error')).toBeInTheDocument();
      expect(screen.queryByTestId('vendor-bills-empty')).not.toBeInTheDocument();
      // Zero totals would read as "owes nothing"; the cards are hidden instead.
      expect(screen.queryByTestId('vendor-summary')).not.toBeInTheDocument();
      // The vendor itself still renders.
      expect(screen.getByText('Basic Information')).toBeInTheDocument();
    });

    it('warns that totals may be low when the bill lists were truncated', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());
      vi.mocked(listVendorBills).mockResolvedValue({
        complete: false,
        bills: [createMockBill()],
      });

      renderVendorDetailPage();

      expect(await screen.findByTestId('vendor-summary-incomplete')).toHaveTextContent(
        /totals may be low/i
      );
    });

    it('renders hundreds of bills and seven-figure totals (overflow end)', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());
      const bills = Array.from({ length: 500 }, (_, i) =>
        createMockBill({
          id: `b-${i}`,
          billNumber: `BILL-${String(i).padStart(5, '0')}`,
          totalAmount: 12_345.67,
          amountPaid: 2_345.67,
          amountDue: 10_000,
        })
      );
      vi.mocked(listVendorBills).mockResolvedValue({ complete: true, bills });

      renderVendorDetailPage();

      const table = await screen.findByTestId('vendor-bills-table');
      expect(within(table).getAllByRole('row')).toHaveLength(501);
      expect(screen.getByTestId('vendor-summary-total-billed')).toHaveTextContent('6,172,835.00');
      expect(screen.getByTestId('vendor-summary-total-paid')).toHaveTextContent('1,172,835.00');
      expect(screen.getByTestId('vendor-summary-outstanding')).toHaveTextContent('5,000,000.00');
      expect(screen.getByTestId('vendor-bills-count')).toHaveTextContent('500 bills');
    });

    it('says "1 bill", not "1 bills"', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor());
      vi.mocked(listVendorBills).mockResolvedValue({ complete: true, bills: [createMockBill()] });

      renderVendorDetailPage();

      expect(await screen.findByTestId('vendor-bills-count')).toHaveTextContent(/^1 bill$/);
    });

    it('"Create bill" opens the bill form with this vendor preselected', async () => {
      const user = userEvent.setup();
      vi.mocked(getVendor).mockResolvedValue(createMockVendor({ id: 'vendor-123' }));

      renderVendorDetailPage();

      const createLink = await screen.findByTestId('vendor-detail-create-bill');
      expect(createLink).toHaveAttribute('href', '/bills/new?vendorId=vendor-123');
      await user.click(createLink);
      expect(await screen.findByText('New Bill Form')).toBeInTheDocument();
    });

    it('URL-encodes the vendor id in the Create bill link', async () => {
      vi.mocked(getVendor).mockResolvedValue(createMockVendor({ id: 'a&b c' }));

      renderVendorDetailPage('a&b c');

      expect(await screen.findByTestId('vendor-detail-create-bill')).toHaveAttribute(
        'href',
        '/bills/new?vendorId=a%26b%20c'
      );
    });
  });
});
