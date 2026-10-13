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
// Added (SOUPFIN-183): the page reads its strings from the i18n namespaces
import '../../../i18n';
import type { Vendor } from '../../../types';

// Mock the vendors API
vi.mock('../../../api', () => ({
  listVendors: vi.fn(),
  deleteVendor: vi.fn(),
}));

import { listVendors, deleteVendor } from '../../../api';
// Added (SOUPFIN-160): Axios-shaped 403/500 errors
import { moduleDisabled403, roleDenied403, serverError500 } from '../../../test/apiErrorFixtures';

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

      // Changed (SOUPFIN-160): ApiErrorState shows the error's own message
      expect(await screen.findByTestId('vendor-list-error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
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

      expect(await screen.findByTestId('vendor-list-error-message')).toHaveTextContent('Network error');
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

      // Changed (SOUPFIN-182): first page of 20, active vendors
      expect(listVendors).toHaveBeenCalledWith({
        max: 20,
        offset: 0,
        sort: 'name',
        order: 'asc',
        search: undefined,
        archived: undefined,
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

  // Added (SOUPFIN-160): the error card names the cause and never shows HTTP text
  describe('module-aware errors (SOUPFIN-160)', () => {
    it.each([
      ['a disabled Trading module', () => moduleDisabled403('Trading', '/vendor/index.json'), 'module_disabled', 'Trading module is not available'],
      ['a missing role', () => roleDenied403('/vendor/index.json'), 'forbidden', 'You do not have permission'],
      ['a server fault', () => serverError500('/vendor/index.json'), 'server_error', 'Server error'],
    ])('explains %s', async (_cause, makeError, kind, title) => {
      vi.mocked(listVendors).mockRejectedValue(makeError());

      renderVendorListPage();

      const card = await screen.findByTestId('vendor-list-error');
      expect(card).toHaveAttribute('data-error-kind', kind);
      expect(within(card).getByText(title)).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/status code/i);
    });

    it('offers no Retry when the module is disabled', async () => {
      vi.mocked(listVendors).mockRejectedValue(moduleDisabled403('Trading', '/vendor/index.json'));

      renderVendorListPage();

      const card = await screen.findByTestId('vendor-list-error');
      expect(within(card).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
      expect(within(card).getByText(/contact your administrator to enable this module/i)).toBeInTheDocument();
    });

    it('Retry after a server fault refetches and shows the data', async () => {
      vi.mocked(listVendors).mockRejectedValueOnce(serverError500('/vendor/index.json'));

      renderVendorListPage();

      const card = await screen.findByTestId('vendor-list-error');
      vi.mocked(listVendors).mockResolvedValue([]);
      within(card).getByRole('button', { name: /retry/i }).click();

      await waitFor(() => expect(screen.queryByTestId('vendor-list-error')).not.toBeInTheDocument());
      expect(vi.mocked(listVendors)).toHaveBeenCalledTimes(2);
    });
  });

  // Added (SOUPFIN-182): archived filter and 20-row server pagination
  describe('archived filter and pagination (SOUPFIN-182)', () => {
    function pageOf(count: number, totalCount: number, prefix = 'v') {
      return Array.from({ length: count }, (_, i) =>
        createMockVendor({ id: `${prefix}-${i}`, name: `${prefix} Vendor ${i}`, totalCount })
      );
    }

    it('starts on the Active tab and switches to archived.json results', async () => {
      const user = userEvent.setup();
      vi.mocked(listVendors).mockImplementation(async (params) =>
        params?.archived
          ? [createMockVendor({ id: 'gone-1', name: 'Old Supplier', archived: true, totalCount: 1 })]
          : [createMockVendor({ id: 'live-1', name: 'Live Supplier', totalCount: 1 })]
      );

      renderVendorListPage();

      expect(await screen.findByText('Live Supplier')).toBeInTheDocument();
      expect(screen.getByTestId('vendor-tab-active')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('vendor-delete-live-1')).toBeInTheDocument();

      await user.click(screen.getByTestId('vendor-tab-archived'));

      expect(await screen.findByText('Old Supplier')).toBeInTheDocument();
      expect(screen.queryByText('Live Supplier')).not.toBeInTheDocument();
      expect(screen.getByTestId('vendor-tab-archived')).toHaveAttribute('aria-selected', 'true');
      expect(listVendors).toHaveBeenLastCalledWith(expect.objectContaining({ archived: true, offset: 0 }));
      // Delete archives; an archived row has nothing left to delete
      expect(screen.queryByTestId('vendor-delete-gone-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('vendor-edit-gone-1')).toHaveAttribute('href', '/vendors/gone-1/edit');
      expect(screen.getByTestId('vendor-pagination-range')).toHaveTextContent('Showing 1 to 1 of 1 archived vendor');
    });

    it('shows an archived empty state, not the "add your first vendor" prompt (zero rows)', async () => {
      const user = userEvent.setup();
      vi.mocked(listVendors).mockImplementation(async (params) =>
        params?.archived ? [] : [createMockVendor({ totalCount: 1 })]
      );

      renderVendorListPage();
      await screen.findByTestId('vendor-list-table');
      await user.click(screen.getByTestId('vendor-tab-archived'));

      expect(await screen.findByTestId('vendor-list-archived-empty')).toHaveTextContent('No archived vendors');
      expect(screen.queryByTestId('vendor-list-empty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('vendor-pagination-summary')).not.toBeInTheDocument();
    });

    it('hides the pager when everything fits on one page', async () => {
      vi.mocked(listVendors).mockResolvedValue(pageOf(20, 20));

      renderVendorListPage();

      expect(await screen.findByTestId('vendor-pagination-range')).toHaveTextContent('Showing 1 to 20 of 20 vendors');
      expect(screen.queryByTestId('vendor-pagination')).not.toBeInTheDocument();
    });

    it('pages through the server with offset and reads the total from totalCount', async () => {
      const user = userEvent.setup();
      vi.mocked(listVendors).mockImplementation(async (params) => {
        const offset = Number(params?.offset ?? 0);
        return offset === 0 ? pageOf(20, 45, 'p1') : offset === 20 ? pageOf(20, 45, 'p2') : pageOf(5, 45, 'p3');
      });

      renderVendorListPage();

      expect(await screen.findByText('p1 Vendor 0')).toBeInTheDocument();
      expect(screen.getAllByTestId(/^vendor-row-/)).toHaveLength(20);
      expect(screen.getByTestId('vendor-pagination-range')).toHaveTextContent('Showing 1 to 20 of 45 vendors');
      expect(screen.getByTestId('vendor-pagination-prev')).toBeDisabled();

      await user.click(screen.getByTestId('vendor-pagination-page-3'));
      expect(await screen.findByText('p3 Vendor 0')).toBeInTheDocument();
      expect(screen.getAllByTestId(/^vendor-row-/)).toHaveLength(5);
      expect(listVendors).toHaveBeenLastCalledWith(expect.objectContaining({ max: 20, offset: 40 }));
      expect(screen.getByTestId('vendor-pagination-range')).toHaveTextContent('Showing 41 to 45 of 45 vendors');
      expect(screen.getByTestId('vendor-pagination-next')).toBeDisabled();
      expect(screen.getByTestId('vendor-pagination-page-3')).toHaveAttribute('aria-current', 'page');

      await user.click(screen.getByTestId('vendor-pagination-prev'));
      expect(await screen.findByText('p2 Vendor 0')).toBeInTheDocument();
      expect(listVendors).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 }));
    });

    it('collapses a large page list with gaps (overflow: 2,000 vendors = 100 pages)', async () => {
      vi.mocked(listVendors).mockResolvedValue(pageOf(20, 2000));

      renderVendorListPage();

      await screen.findByTestId('vendor-pagination');
      const pageButtons = screen.getAllByTestId(/^vendor-pagination-page-/).map((b) => b.textContent);
      expect(pageButtons).toEqual(['1', '2', '3', '100']);
      expect(screen.getByTestId('vendor-pagination-range')).toHaveTextContent('Showing 1 to 20 of 2000 vendors');
    });

    it('returns to page 1 when the filter or the search changes', async () => {
      const user = userEvent.setup();
      vi.mocked(listVendors).mockImplementation(async (params) =>
        pageOf(params?.offset ? 5 : 20, 25, params?.offset ? 'second' : 'first')
      );

      renderVendorListPage();
      await screen.findByTestId('vendor-pagination');
      await user.click(screen.getByTestId('vendor-pagination-next'));
      expect(await screen.findByText('second Vendor 0')).toBeInTheDocument();

      await user.click(screen.getByTestId('vendor-tab-archived'));
      await waitFor(() =>
        expect(listVendors).toHaveBeenLastCalledWith(expect.objectContaining({ archived: true, offset: 0 }))
      );

      await user.click(screen.getByTestId('vendor-pagination-next'));
      await waitFor(() => expect(listVendors).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 })));
      await user.type(screen.getByTestId('vendor-search-input'), 'a');
      await waitFor(() =>
        expect(listVendors).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'a', offset: 0, archived: true }))
      );
    });

    it('offers a way back when a page past the end comes back empty', async () => {
      const user = userEvent.setup();
      // Page 1 says 25 exist; by the time page 2 loads, the rows were removed elsewhere
      vi.mocked(listVendors).mockImplementation(async (params) => (params?.offset ? [] : pageOf(20, 25)));

      renderVendorListPage();
      await screen.findByTestId('vendor-pagination');
      await user.click(screen.getByTestId('vendor-pagination-next'));

      expect(await screen.findByTestId('vendor-list-page-empty')).toHaveTextContent('Page 2 has no vendors.');
      expect(screen.queryByTestId('vendor-list-empty')).not.toBeInTheDocument();
      await user.click(screen.getByTestId('vendor-list-first-page'));
      expect(await screen.findByText('v Vendor 0')).toBeInTheDocument();
    });
  });
});
