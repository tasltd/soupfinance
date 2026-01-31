/**
 * Unit tests for VendorListPage component
 * Tests rendering, loading/error/empty states, data display, search, and delete functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VendorListPage } from '../VendorListPage';
import type { Vendor } from '../../../types';

// Mock the vendors API
vi.mock('../../../api', () => ({
  listVendors: vi.fn(),
  deleteVendor: vi.fn(),
}));

import { listVendors, deleteVendor } from '../../../api';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'vendor-123',
    name: 'Acme Supplies',
    email: 'info@acme.com',
    phoneNumber: '555-1234',
    address: '123 Main St',
    taxIdentificationNumber: 'TAX-12345',
    paymentTerms: 30,
    notes: 'Preferred vendor',
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

function renderVendorListPage() {
  const queryClient = createQueryClient();
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <VendorListPage />
        </MemoryRouter>
      </QueryClientProvider>
    ),
    queryClient,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('VendorListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the page container with correct test id', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      expect(await screen.findByTestId('vendor-list-page')).toBeInTheDocument();
    });

    it('renders the page heading', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      expect(await screen.findByTestId('vendor-list-heading')).toHaveTextContent('Vendors');
    });

    it('renders the page description', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      expect(await screen.findByText('Manage your suppliers and vendors')).toBeInTheDocument();
    });

    it('renders the New Vendor button', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      const newButton = await screen.findByTestId('vendor-new-button');
      expect(newButton).toBeInTheDocument();
      expect(newButton).toHaveTextContent('New Vendor');
      expect(newButton).toHaveAttribute('href', '/vendors/new');
    });

    it('renders the search input', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      const searchInput = await screen.findByTestId('vendor-search-input');
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveAttribute('placeholder', 'Search vendors...');
    });
  });

  describe('loading state', () => {
    it('displays loading message while fetching vendors', () => {
      // Never resolves to keep loading state
      vi.mocked(listVendors).mockImplementation(() => new Promise(() => {}));

      renderVendorListPage();

      expect(screen.getByTestId('vendor-list-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading vendors...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('displays error message when fetch fails', async () => {
      vi.mocked(listVendors).mockRejectedValue(new Error('Network error'));

      renderVendorListPage();

      expect(await screen.findByTestId('vendor-list-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load vendors')).toBeInTheDocument();
    });

    it('displays retry button in error state', async () => {
      vi.mocked(listVendors).mockRejectedValue(new Error('Network error'));

      renderVendorListPage();

      await screen.findByTestId('vendor-list-error');
      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('displays helpful error description', async () => {
      vi.mocked(listVendors).mockRejectedValue(new Error('Network error'));

      renderVendorListPage();

      expect(await screen.findByText(/There was an error loading your vendors/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('displays empty state when no vendors exist', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      expect(await screen.findByTestId('vendor-list-empty')).toBeInTheDocument();
    });

    it('displays helpful empty state message', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      expect(await screen.findByText('No vendors yet')).toBeInTheDocument();
      expect(screen.getByText(/Add your first vendor/i)).toBeInTheDocument();
    });

    it('displays add vendor button in empty state', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      const createButton = await screen.findByTestId('vendor-create-first-button');
      expect(createButton).toBeInTheDocument();
      expect(createButton).toHaveTextContent('Add Vendor');
      expect(createButton).toHaveAttribute('href', '/vendors/new');
    });
  });

  describe('data display', () => {
    it('renders vendor table when vendors exist', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderVendorListPage();

      expect(await screen.findByTestId('vendor-list-table')).toBeInTheDocument();
    });

    it('renders table headers correctly', async () => {
      const mockVendors = [createMockVendor()];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderVendorListPage();

      await screen.findByTestId('vendor-list-table');

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Phone')).toBeInTheDocument();
      expect(screen.getByText('Payment Terms')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('renders vendor row with correct data', async () => {
      const mockVendor = createMockVendor({
        id: 'vendor-456',
        name: 'Office Supplies Co',
        email: 'contact@office.com',
        phoneNumber: '555-9876',
        paymentTerms: 45,
      });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const row = await screen.findByTestId('vendor-row-vendor-456');
      expect(row).toBeInTheDocument();

      // Check vendor name link
      const vendorLink = within(row).getByTestId('vendor-link-vendor-456');
      expect(vendorLink).toHaveTextContent('Office Supplies Co');
      expect(vendorLink).toHaveAttribute('href', '/vendors/vendor-456');

      // Check email
      expect(within(row).getByText('contact@office.com')).toBeInTheDocument();

      // Check phone
      expect(within(row).getByText('555-9876')).toBeInTheDocument();

      // Check payment terms
      expect(within(row).getByText('45 days')).toBeInTheDocument();
    });

    it('renders multiple vendors', async () => {
      const mockVendors = [
        createMockVendor({ id: 'vendor-1', name: 'Vendor 1' }),
        createMockVendor({ id: 'vendor-2', name: 'Vendor 2' }),
        createMockVendor({ id: 'vendor-3', name: 'Vendor 3' }),
      ];
      vi.mocked(listVendors).mockResolvedValue(mockVendors);

      renderVendorListPage();

      expect(await screen.findByTestId('vendor-row-vendor-1')).toBeInTheDocument();
      expect(screen.getByTestId('vendor-row-vendor-2')).toBeInTheDocument();
      expect(screen.getByTestId('vendor-row-vendor-3')).toBeInTheDocument();
    });

    it('renders dash for missing email', async () => {
      const mockVendor = createMockVendor({
        id: 'vendor-no-email',
        email: undefined,
      });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const row = await screen.findByTestId('vendor-row-vendor-no-email');
      // Email column shows dash
      const cells = within(row).getAllByRole('cell');
      expect(cells[1]).toHaveTextContent('-');
    });

    it('renders dash for missing phone', async () => {
      const mockVendor = createMockVendor({
        id: 'vendor-no-phone',
        phoneNumber: undefined,
      });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const row = await screen.findByTestId('vendor-row-vendor-no-phone');
      const cells = within(row).getAllByRole('cell');
      expect(cells[2]).toHaveTextContent('-');
    });

    it('renders dash for missing payment terms', async () => {
      const mockVendor = createMockVendor({
        id: 'vendor-no-terms',
        paymentTerms: undefined,
      });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const row = await screen.findByTestId('vendor-row-vendor-no-terms');
      const cells = within(row).getAllByRole('cell');
      expect(cells[3]).toHaveTextContent('-');
    });
  });

  describe('action buttons', () => {
    it('renders view button for each vendor', async () => {
      const mockVendor = createMockVendor({ id: 'vendor-view-test' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const viewButton = await screen.findByTestId('vendor-view-vendor-view-test');
      expect(viewButton).toBeInTheDocument();
      expect(viewButton).toHaveAttribute('href', '/vendors/vendor-view-test');
    });

    it('renders edit button for each vendor', async () => {
      const mockVendor = createMockVendor({ id: 'vendor-edit-test' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const editButton = await screen.findByTestId('vendor-edit-vendor-edit-test');
      expect(editButton).toBeInTheDocument();
      expect(editButton).toHaveAttribute('href', '/vendors/vendor-edit-test/edit');
    });

    it('renders delete button for each vendor', async () => {
      const mockVendor = createMockVendor({ id: 'vendor-delete-test' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const deleteButton = await screen.findByTestId('vendor-delete-vendor-delete-test');
      expect(deleteButton).toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    it('renders search container', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      expect(await screen.findByTestId('vendor-search-container')).toBeInTheDocument();
    });

    it('updates search term when typing', async () => {
      const user = userEvent.setup();
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      const searchInput = await screen.findByTestId('vendor-search-input');
      await user.type(searchInput, 'Acme');

      expect(searchInput).toHaveValue('Acme');
    });

    it('calls listVendors with search parameter', async () => {
      const user = userEvent.setup();
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      const searchInput = await screen.findByTestId('vendor-search-input');
      await user.type(searchInput, 'Acme');

      await waitFor(() => {
        expect(listVendors).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'Acme' })
        );
      });
    });
  });

  describe('delete functionality', () => {
    it('opens delete confirmation modal when delete button is clicked', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor({ id: 'vendor-to-delete', name: 'Delete Me Corp' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const deleteButton = await screen.findByTestId('vendor-delete-vendor-to-delete');
      await user.click(deleteButton);

      expect(screen.getByTestId('delete-confirmation-modal')).toBeInTheDocument();
      expect(screen.getByText('Delete Vendor')).toBeInTheDocument();
      // Vendor name appears both in table link and in modal - check modal has it
      const modal = screen.getByTestId('delete-confirmation-modal');
      expect(modal).toHaveTextContent('Delete Me Corp');
    });

    it('displays warning message in delete modal', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor({ id: 'vendor-warn' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const deleteButton = await screen.findByTestId('vendor-delete-vendor-warn');
      await user.click(deleteButton);

      expect(screen.getByText(/This action cannot be undone/i)).toBeInTheDocument();
    });

    it('closes delete modal when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor({ id: 'vendor-cancel' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const deleteButton = await screen.findByTestId('vendor-delete-vendor-cancel');
      await user.click(deleteButton);

      expect(screen.getByTestId('delete-confirmation-modal')).toBeInTheDocument();

      const cancelButton = screen.getByTestId('delete-cancel-button');
      await user.click(cancelButton);

      expect(screen.queryByTestId('delete-confirmation-modal')).not.toBeInTheDocument();
    });

    it('closes delete modal when close button is clicked', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor({ id: 'vendor-close' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const deleteButton = await screen.findByTestId('vendor-delete-vendor-close');
      await user.click(deleteButton);

      const closeButton = screen.getByTestId('vendor-delete-modal-close');
      await user.click(closeButton);

      expect(screen.queryByTestId('delete-confirmation-modal')).not.toBeInTheDocument();
    });

    it('calls deleteVendor API when confirm button is clicked', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor({ id: 'vendor-confirm-delete' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);
      vi.mocked(deleteVendor).mockResolvedValue(undefined);

      renderVendorListPage();

      const deleteButton = await screen.findByTestId('vendor-delete-vendor-confirm-delete');
      await user.click(deleteButton);

      const confirmButton = screen.getByTestId('delete-confirm-button');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(deleteVendor).toHaveBeenCalledWith('vendor-confirm-delete');
      });
    });

    it('closes modal after successful deletion', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor({ id: 'vendor-success-delete' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);
      vi.mocked(deleteVendor).mockResolvedValue(undefined);

      renderVendorListPage();

      const deleteButton = await screen.findByTestId('vendor-delete-vendor-success-delete');
      await user.click(deleteButton);

      const confirmButton = screen.getByTestId('delete-confirm-button');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByTestId('delete-confirmation-modal')).not.toBeInTheDocument();
      });
    });

    it('shows loading state on confirm button during deletion', async () => {
      const user = userEvent.setup();
      const mockVendor = createMockVendor({ id: 'vendor-loading-delete' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);
      // Make delete take some time
      vi.mocked(deleteVendor).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      renderVendorListPage();

      const deleteButton = await screen.findByTestId('vendor-delete-vendor-loading-delete');
      await user.click(deleteButton);

      const confirmButton = screen.getByTestId('delete-confirm-button');
      await user.click(confirmButton);

      // Button should show loading state
      expect(confirmButton).toHaveTextContent('Deleting...');
      expect(confirmButton).toBeDisabled();
    });
  });

  describe('navigation', () => {
    it('New Vendor button links to create page', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      const newButton = await screen.findByTestId('vendor-new-button');
      expect(newButton).toHaveAttribute('href', '/vendors/new');
    });

    it('vendor name links to detail page', async () => {
      const mockVendor = createMockVendor({ id: 'vendor-detail-test' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const vendorLink = await screen.findByTestId('vendor-link-vendor-detail-test');
      expect(vendorLink).toHaveAttribute('href', '/vendors/vendor-detail-test');
    });

    it('view link navigates to detail page', async () => {
      const mockVendor = createMockVendor({ id: 'vendor-nav-view' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const viewLink = await screen.findByTestId('vendor-view-vendor-nav-view');
      expect(viewLink).toHaveAttribute('href', '/vendors/vendor-nav-view');
    });

    it('edit link navigates to edit page', async () => {
      const mockVendor = createMockVendor({ id: 'vendor-nav-edit' });
      vi.mocked(listVendors).mockResolvedValue([mockVendor]);

      renderVendorListPage();

      const editLink = await screen.findByTestId('vendor-edit-vendor-nav-edit');
      expect(editLink).toHaveAttribute('href', '/vendors/vendor-nav-edit/edit');
    });
  });

  describe('API interaction', () => {
    it('calls listVendors with correct params on mount', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      await screen.findByTestId('vendor-list-page');

      expect(listVendors).toHaveBeenCalledWith({
        max: 50,
        sort: 'name',
        order: 'asc',
        search: undefined,
      });
    });

    it('only calls listVendors once on initial render', async () => {
      vi.mocked(listVendors).mockResolvedValue([]);

      renderVendorListPage();

      await screen.findByTestId('vendor-list-page');

      expect(listVendors).toHaveBeenCalledTimes(1);
    });
  });

  describe('table container', () => {
    it('renders table container with correct test id', async () => {
      vi.mocked(listVendors).mockResolvedValue([createMockVendor()]);

      renderVendorListPage();

      expect(await screen.findByTestId('vendor-table-container')).toBeInTheDocument();
    });

    it('table container has proper styling classes', async () => {
      vi.mocked(listVendors).mockResolvedValue([createMockVendor()]);

      renderVendorListPage();

      const container = await screen.findByTestId('vendor-table-container');
      expect(container.className).toContain('rounded-xl');
      expect(container.className).toContain('border');
    });
  });
});
