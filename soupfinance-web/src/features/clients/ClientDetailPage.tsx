/**
 * Client Detail Page
 * PURPOSE: Display client information in read-only format
 *
 * ARCHITECTURE (2026-01-30):
 * Shows client details with type-specific fields (Individual vs Corporate)
 */
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClient, deleteClient } from '../../api';
import { useState } from 'react';

interface DeleteState {
  isOpen: boolean;
}

export function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteState, setDeleteState] = useState<DeleteState>({ isOpen: false });

  // Query to fetch client data
  const { data: client, isLoading, error } = useQuery({
    queryKey: ['client', id],
    queryFn: () => getClient(id!),
    enabled: !!id,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteClient(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      navigate('/clients');
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="client-detail-page">
        <div className="flex items-center justify-center p-12 text-subtle-text">
          Loading client...
        </div>
      </div>
    );
  }

  // Error state
  if (error || !client) {
    return (
      <div className="flex flex-col gap-6" data-testid="client-detail-page">
        <div className="p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">error</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Client not found</h3>
          <p className="text-subtle-text mb-4">The client you're looking for doesn't exist or has been deleted.</p>
          <Link
            to="/clients"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
          >
            Back to Clients
          </Link>
        </div>
      </div>
    );
  }

  // Get type badge styles
  const getTypeBadge = () => {
    if (client.clientType === 'INDIVIDUAL') {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  };

  return (
    <div className="flex flex-col gap-6" data-testid="client-detail-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <Link
            to="/clients"
            className="inline-flex items-center gap-1 text-sm text-subtle-text hover:text-primary mb-2"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to Clients
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
              {client.name}
            </h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeBadge()}`}>
              {client.clientType === 'INDIVIDUAL' ? (
                <>
                  <span className="material-symbols-outlined text-sm mr-1">person</span>
                  Individual
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm mr-1">business</span>
                  Corporate
                </>
              )}
            </span>
          </div>
          <p className="text-subtle-text">Client Details</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setDeleteState({ isOpen: true })}
            className="h-10 px-4 rounded-lg border border-danger text-danger font-medium text-sm hover:bg-danger/10"
            data-testid="client-detail-delete"
          >
            Delete
          </button>
          <Link
            to={`/clients/${id}/edit`}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
            data-testid="client-detail-edit"
          >
            <span className="material-symbols-outlined text-lg">edit</span>
            Edit
          </Link>
        </div>
      </div>

      {/* Client Information Card */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
        {/* Individual-specific Information */}
        {client.clientType === 'INDIVIDUAL' && (
          <div className="p-6 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
              Personal Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-subtle-text mb-1">First Name</p>
                <p className="text-text-light dark:text-text-dark font-medium">{client.firstName}</p>
              </div>
              <div>
                <p className="text-sm text-subtle-text mb-1">Last Name</p>
                <p className="text-text-light dark:text-text-dark font-medium">{client.lastName}</p>
              </div>
            </div>
          </div>
        )}

        {/* Corporate-specific Information */}
        {client.clientType === 'CORPORATE' && (
          <div className="p-6 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
              Company Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-subtle-text mb-1">Company Name</p>
                <p className="text-text-light dark:text-text-dark font-medium">{client.companyName}</p>
              </div>
              <div>
                <p className="text-sm text-subtle-text mb-1">Contact Person</p>
                <p className="text-text-light dark:text-text-dark">
                  {client.contactPerson || <span className="text-subtle-text">Not provided</span>}
                </p>
              </div>
              <div>
                <p className="text-sm text-subtle-text mb-1">Registration Number</p>
                <p className="text-text-light dark:text-text-dark">
                  {client.registrationNumber || <span className="text-subtle-text">Not provided</span>}
                </p>
              </div>
              <div>
                <p className="text-sm text-subtle-text mb-1">Tax Number</p>
                <p className="text-text-light dark:text-text-dark">
                  {client.taxNumber || <span className="text-subtle-text">Not provided</span>}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Contact Information */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Contact Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-subtle-text mb-1">Email</p>
              <p className="text-text-light dark:text-text-dark">
                {client.email ? (
                  <a href={`mailto:${client.email}`} className="text-primary hover:underline">
                    {client.email}
                  </a>
                ) : (
                  <span className="text-subtle-text">Not provided</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">Phone</p>
              <p className="text-text-light dark:text-text-dark">
                {client.phone ? (
                  <a href={`tel:${client.phone}`} className="text-primary hover:underline">
                    {client.phone}
                  </a>
                ) : (
                  <span className="text-subtle-text">Not provided</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Billing Address */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            Billing Address
          </h2>
          <p className="text-text-light dark:text-text-dark whitespace-pre-wrap">
            {client.address || <span className="text-subtle-text">Not provided</span>}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
        <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to={`/invoices/new?clientId=${client.id}`}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="client-create-invoice"
          >
            <span className="material-symbols-outlined text-lg">receipt_long</span>
            Create Invoice
          </Link>
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
              <p className="text-xl font-bold text-text-light dark:text-text-dark">Delete Client</p>
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
                    <span className="font-semibold">{client.name}</span>?
                  </p>
                  <p className="text-subtle-text mt-2 text-sm">
                    This action cannot be undone. Invoices associated with this client will remain
                    but the client reference will be removed.
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
