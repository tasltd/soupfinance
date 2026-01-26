/**
 * Vendor List Page
 * PURPOSE: Display and manage vendors with CRUD operations
 * Reference: soupfinance-designs/vendor-client-management/
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listVendors, deleteVendor } from '../../api';

// Added: Delete confirmation state interface
interface DeleteState {
  isOpen: boolean;
  vendorId: string | null;
  vendorName: string | null;
}

export function VendorListPage() {
  const queryClient = useQueryClient();

  // Added: Search state for filtering vendors
  const [searchTerm, setSearchTerm] = useState('');

  // Added: Delete confirmation modal state
  const [deleteState, setDeleteState] = useState<DeleteState>({
    isOpen: false,
    vendorId: null,
    vendorName: null,
  });

  // Changed: Added error state handling for API failures
  const { data: vendors, isLoading, error } = useQuery({
    queryKey: ['vendors', searchTerm],
    queryFn: () => listVendors({ max: 50, sort: 'name', order: 'asc', search: searchTerm || undefined }),
  });

  // Added: Delete mutation with cache invalidation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVendor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setDeleteState({ isOpen: false, vendorId: null, vendorName: null });
    },
  });

  // Added: Open delete confirmation modal
  const handleDeleteClick = (vendorId: string, vendorName: string) => {
    setDeleteState({ isOpen: true, vendorId, vendorName });
  };

  // Added: Confirm and execute deletion
  const handleConfirmDelete = () => {
    if (deleteState.vendorId) {
      deleteMutation.mutate(deleteState.vendorId);
    }
  };

  // Added: Close delete modal
  const handleCancelDelete = () => {
    setDeleteState({ isOpen: false, vendorId: null, vendorName: null });
  };

  return (
    <div className="flex flex-col gap-6" data-testid="vendor-list-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="vendor-list-heading"
          >
            Vendors
          </h1>
          <p className="text-subtle-text">Manage your suppliers and vendors</p>
        </div>
        <Link
          to="/vendors/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="vendor-new-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          New Vendor
        </Link>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md" data-testid="vendor-search-container">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text text-xl">
          search
        </span>
        <input
          type="search"
          placeholder="Search vendors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-10 pl-10 pr-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
          data-testid="vendor-search-input"
        />
      </div>

      {/* Vendor Table */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="vendor-table-container"
      >
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="vendor-list-loading">
            Loading vendors...
          </div>
        ) : error ? (
          // Added: Error state when API fails
          <div className="p-12 text-center" data-testid="vendor-list-error">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load vendors</h3>
            <p className="text-subtle-text mb-4">There was an error loading your vendors. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Retry
            </button>
          </div>
        ) : vendors?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="vendor-list-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Email</th>
                  <th className="px-6 py-3 text-left">Phone</th>
                  <th className="px-6 py-3 text-center">Payment Terms</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                    data-testid={`vendor-row-${vendor.id}`}
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={`/vendors/${vendor.id}`}
                        className="font-medium text-primary hover:underline"
                        data-testid={`vendor-link-${vendor.id}`}
                      >
                        {vendor.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">
                      {vendor.email || '-'}
                    </td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">
                      {vendor.phoneNumber || '-'}
                    </td>
                    <td className="px-6 py-4 text-center text-text-light dark:text-text-dark">
                      {vendor.paymentTerms ? `${vendor.paymentTerms} days` : '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          to={`/vendors/${vendor.id}`}
                          className="p-1.5 rounded hover:bg-primary/10 text-subtle-text hover:text-primary transition-colors"
                          title="View"
                          data-testid={`vendor-view-${vendor.id}`}
                        >
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </Link>
                        <Link
                          to={`/vendors/${vendor.id}/edit`}
                          className="p-1.5 rounded hover:bg-primary/10 text-subtle-text hover:text-primary transition-colors"
                          title="Edit"
                          data-testid={`vendor-edit-${vendor.id}`}
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </Link>
                        <button
                          onClick={() => handleDeleteClick(vendor.id, vendor.name)}
                          className="p-1.5 rounded hover:bg-danger/10 text-subtle-text hover:text-danger transition-colors"
                          title="Delete"
                          data-testid={`vendor-delete-${vendor.id}`}
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center" data-testid="vendor-list-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">
              storefront
            </span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No vendors yet</h3>
            <p className="text-subtle-text mb-4">Add your first vendor to start managing expenses.</p>
            <Link
              to="/vendors/new"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
              data-testid="vendor-create-first-button"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Add Vendor
            </Link>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteState.isOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          data-testid="delete-confirmation-modal"
        >
          <div className="relative w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark p-6">
              <p className="text-xl font-bold text-text-light dark:text-text-dark">Delete Vendor</p>
              <button
                onClick={handleCancelDelete}
                className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                data-testid="vendor-delete-modal-close"
              >
                <span className="material-symbols-outlined text-2xl text-subtle-text">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 size-12 rounded-full bg-danger/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-danger">warning</span>
                </div>
                <div>
                  <p className="text-text-light dark:text-text-dark">
                    Are you sure you want to delete{' '}
                    <span className="font-semibold">{deleteState.vendorName}</span>?
                  </p>
                  <p className="text-subtle-text mt-2 text-sm">
                    This action cannot be undone. All bills associated with this vendor will remain but
                    the vendor reference will be removed.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
              <button
                onClick={handleCancelDelete}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
                data-testid="delete-cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="h-10 px-4 rounded-lg bg-danger text-white font-bold text-sm hover:bg-danger/90 disabled:opacity-50"
                data-testid="delete-confirm-button"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
