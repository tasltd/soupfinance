/**
 * Vendor Detail Page
 * PURPOSE: Display vendor information in read-only format
 * Reference: soupfinance-designs/vendor-client-management/
 */
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVendor, deleteVendor } from '../../api';
import { useState } from 'react';

// Added: Delete confirmation state interface
interface DeleteState {
  isOpen: boolean;
}

export function VendorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteState, setDeleteState] = useState<DeleteState>({ isOpen: false });

  // Added: Query to fetch vendor data
  const { data: vendor, isLoading, error } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => getVendor(id!),
    enabled: !!id,
  });

  // Added: Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteVendor(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      navigate('/vendors');
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="vendor-detail-page">
        <div className="flex items-center justify-center p-12 text-subtle-text">
          Loading vendor...
        </div>
      </div>
    );
  }

  // Error state
  if (error || !vendor) {
    return (
      <div className="flex flex-col gap-6" data-testid="vendor-detail-page">
        <div className="p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">error</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Vendor not found</h3>
          <p className="text-subtle-text mb-4">The vendor you're looking for doesn't exist or has been deleted.</p>
          <Link
            to="/vendors"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
          >
            Back to Vendors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="vendor-detail-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <Link
            to="/vendors"
            className="inline-flex items-center gap-1 text-sm text-subtle-text hover:text-primary mb-2"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to Vendors
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
            {vendor.name}
          </h1>
          <p className="text-subtle-text">Vendor Details</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setDeleteState({ isOpen: true })}
            className="h-10 px-4 rounded-lg border border-danger text-danger font-medium text-sm hover:bg-danger/10"
            data-testid="vendor-detail-delete"
          >
            Delete
          </button>
          <Link
            to={`/vendors/${id}/edit`}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
            data-testid="vendor-detail-edit"
          >
            <span className="material-symbols-outlined text-lg">edit</span>
            Edit
          </Link>
        </div>
      </div>

      {/* Vendor Information Card */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
        {/* Basic Information Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-subtle-text mb-1">Vendor Name</p>
              <p className="text-text-light dark:text-text-dark font-medium">{vendor.name}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">Email</p>
              <p className="text-text-light dark:text-text-dark">
                {vendor.email || <span className="text-subtle-text">Not provided</span>}
              </p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">Phone Number</p>
              <p className="text-text-light dark:text-text-dark">
                {vendor.phoneNumber || <span className="text-subtle-text">Not provided</span>}
              </p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">Tax Identification Number</p>
              <p className="text-text-light dark:text-text-dark">
                {vendor.taxIdentificationNumber || <span className="text-subtle-text">Not provided</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Payment Terms Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">Payment Terms</h2>
          <div>
            <p className="text-sm text-subtle-text mb-1">Payment Terms (Days)</p>
            <p className="text-text-light dark:text-text-dark">
              {vendor.paymentTerms ? `${vendor.paymentTerms} days` : <span className="text-subtle-text">Not specified</span>}
            </p>
          </div>
        </div>

        {/* Address Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">Address</h2>
          <p className="text-text-light dark:text-text-dark whitespace-pre-wrap">
            {vendor.address || <span className="text-subtle-text">Not provided</span>}
          </p>
        </div>

        {/* Notes Section */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">Additional Notes</h2>
          <p className="text-text-light dark:text-text-dark whitespace-pre-wrap">
            {vendor.notes || <span className="text-subtle-text">No notes</span>}
          </p>
        </div>
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
                onClick={() => setDeleteState({ isOpen: false })}
                className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
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
                    <span className="font-semibold">{vendor.name}</span>?
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
                onClick={() => setDeleteState({ isOpen: false })}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
                data-testid="delete-cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
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
