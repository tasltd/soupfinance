/**
 * Unit tests for VendorDetailPage component
 * Tests rendering, loading/error states, data display, and delete functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VendorDetailPage } from '../VendorDetailPage';
import type { Vendor } from '../../../types';

// Mock the vendors API
// Component imports from '../../api' but test file is in __tests__ so use '../../../api'
vi.mock('../../../api', () => ({
  getVendor: vi.fn(),
  deleteVendor: vi.fn(),
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

import { getVendor, deleteVendor } from '../../../api';

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

function renderVendorDetailPage(vendorId: string = 'vendor-123') {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/vendors/${vendorId}`]}>
        <Routes>
          <Route path="/vendors/:id" element={<VendorDetailPage />} />
          <Route path="/vendors" element={<div>Vendors List</div>} />
          <Route path="/vendors/:id/edit" element={<div>Edit Vendor</div>} />
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
});
