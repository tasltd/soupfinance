/**
 * Client List Page
 * PURPOSE: Display and manage invoice clients with CRUD operations
 *
 * ARCHITECTURE (2026-01-30):
 * Invoice clients are the tenant's own customers for billing.
 * Supports both INDIVIDUAL and CORPORATE client types.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listClients, deleteClient } from '../../api';
// Changed: Renamed from InvoiceClient/InvoiceClientType to Client/ClientType (matches backend domain)
import type { Client, ClientType } from '../../api/endpoints/clients';
// Fix (SOUP-1929): shared never-blank display-name resolver — used for both the
// table NAME column AND the delete dialog so the dialog never shows a blank name.
import { getClientDisplayName } from './getClientDisplayName';

// Delete confirmation state interface
interface DeleteState {
  isOpen: boolean;
  clientId: string | null;
  clientName: string | null;
}

export function ClientListPage() {
  const queryClient = useQueryClient();

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<ClientType | ''>('');

  // Delete confirmation modal state
  const [deleteState, setDeleteState] = useState<DeleteState>({
    isOpen: false,
    clientId: null,
    clientName: null,
  });

  // Query clients
  // Fix (SOUPFIN-16): Capture isFetching so the filter dropdown can show a spinner
  // while the API re-runs after a filter change. Provides visual feedback that
  // "Individual"/"Corporate" filters are actually being applied (the issue called
  // out that the filter gave no indication it was working).
  const { data: clients, isLoading, isFetching, error } = useQuery({
    queryKey: ['clients', searchTerm, typeFilter],
    queryFn: () => listClients({
      max: 50,
      sort: 'name',
      order: 'asc',
      // Fix (SOUP-1836): send the search term as `q` (the universal quick-search
      // param the backend honours). `q` triggers the KYC subtype name match
      // (firstName/lastName/companyName) — `search` alone only matched serialised
      // text, which is why a name query like "alice" returned no results.
      q: searchTerm || undefined,
      clientType: typeFilter || undefined,
    }),
  });

  // Fix (SOUPFIN-16): True when any filter or search term is active — used to
  // decide whether an empty result set is "no clients yet" or "no matches".
  const hasActiveFilters = Boolean(searchTerm.trim()) || Boolean(typeFilter);

  // Delete mutation
  // Fix (SOUP-1929): the soft-delete (archive) always proceeds via a direct
  // DELETE /rest/client/delete/{id}.json — the backend (SOUP-1928,
  // ClientService.doDelete) flips archived+deleted and excludes the client from
  // searchList even when invoices/account-services reference it, so there is NO
  // relatedList pre-check to gate on. On failure we keep the modal open and
  // surface the error instead of silently stalling ("Deleting…" → nothing).
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setDeleteState({ isOpen: false, clientId: null, clientName: null });
    },
  });

  // Open delete confirmation
  const handleDeleteClick = (clientId: string, clientName: string) => {
    deleteMutation.reset(); // clear any prior error so a re-open starts clean
    setDeleteState({ isOpen: true, clientId, clientName });
  };

  // Confirm deletion
  const handleConfirmDelete = () => {
    if (deleteState.clientId) {
      deleteMutation.mutate(deleteState.clientId);
    }
  };

  // Close delete modal
  const handleCancelDelete = () => {
    deleteMutation.reset();
    setDeleteState({ isOpen: false, clientId: null, clientName: null });
  };

  // Get client type badge styles
  const getTypeBadge = (type: ClientType) => {
    if (type === 'INDIVIDUAL') {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  };

  // Fix (SOUPFIN-14 / SOUP-1929): name fallback now lives in the shared
  // getClientDisplayName helper so the table column AND the delete dialog use the
  // exact same never-blank resolution.
  const getDisplayName = getClientDisplayName;

  return (
    <div className="flex flex-col gap-6" data-testid="client-list-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="client-list-heading"
          >
            Clients
          </h1>
          <p className="text-subtle-text">Manage your customers and billing contacts</p>
        </div>
        <Link
          to="/clients/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="client-new-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          New Client
        </Link>
      </div>

      {/* Search and Filter Bar */}
      {/* Fix (SOUPFIN-16): Wrap filter row with refetch spinner so users see that
          Individual/Corporate type selection is being applied. */}
      <div className="flex flex-wrap items-center gap-4" data-testid="client-filters">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text text-xl">
            search
          </span>
          <input
            type="search"
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            data-testid="client-search-input"
          />
        </div>

        {/* Type Filter — Fix (SOUPFIN-16): visual ring when active so user can see filter is applied. */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ClientType | '')}
          className={`h-10 px-4 rounded-lg border bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary/20 focus:outline-none ${
            typeFilter
              ? 'border-primary ring-2 ring-primary/20 font-semibold'
              : 'border-border-light dark:border-border-dark focus:border-primary'
          }`}
          data-testid="client-type-filter"
        >
          <option value="">All Types</option>
          <option value="INDIVIDUAL">Individual</option>
          <option value="CORPORATE">Corporate</option>
        </select>

        {/* Refetch spinner — visible while filter/search is being applied. */}
        {isFetching && !isLoading && (
          <span
            className="flex items-center gap-1 text-sm text-subtle-text"
            data-testid="client-list-filtering"
            role="status"
            aria-live="polite"
          >
            <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            Filtering…
          </span>
        )}

        {/* Active filter chip — confirms the active filter and offers a 1-click clear. */}
        {(searchTerm || typeFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setTypeFilter('');
            }}
            className="flex items-center gap-1 h-10 px-3 rounded-lg text-sm text-subtle-text hover:text-primary hover:bg-primary/5"
            data-testid="client-filters-clear"
          >
            <span className="material-symbols-outlined text-lg">filter_alt_off</span>
            Clear filters
          </button>
        )}
      </div>

      {/* Client Table */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="client-table-container"
      >
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="client-list-loading">
            Loading clients...
          </div>
        ) : error ? (
          <div className="p-12 text-center" data-testid="client-list-error">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load clients</h3>
            <p className="text-subtle-text mb-4">There was an error loading your clients. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Retry
            </button>
          </div>
        ) : clients?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="client-list-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Type</th>
                  <th className="px-6 py-3 text-left">Email</th>
                  <th className="px-6 py-3 text-left">Phone</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client: Client) => (
                  <tr
                    key={client.id}
                    className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                    data-testid={`client-row-${client.id}`}
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={`/clients/${client.id}`}
                        className="font-medium text-primary hover:underline"
                        data-testid={`client-link-${client.id}`}
                      >
                        {getDisplayName(client)}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeBadge(client.clientType)}`}>
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
                    </td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">
                      {client.email || '-'}
                    </td>
                    <td className="px-6 py-4 text-text-light dark:text-text-dark">
                      {client.phone || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          to={`/clients/${client.id}`}
                          className="p-1.5 rounded hover:bg-primary/10 text-subtle-text hover:text-primary transition-colors"
                          title="View"
                          data-testid={`client-view-${client.id}`}
                        >
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </Link>
                        <Link
                          to={`/clients/${client.id}/edit`}
                          className="p-1.5 rounded hover:bg-primary/10 text-subtle-text hover:text-primary transition-colors"
                          title="Edit"
                          data-testid={`client-edit-${client.id}`}
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </Link>
                        <button
                          onClick={() => handleDeleteClick(client.id, getDisplayName(client))}
                          className="p-1.5 rounded hover:bg-danger/10 text-subtle-text hover:text-danger transition-colors"
                          title="Delete"
                          data-testid={`client-delete-${client.id}`}
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
        ) : hasActiveFilters ? (
          // Fix (SOUPFIN-16): When a search or type filter is active but no clients
          // matched, show a "no results" message instead of the empty-state CTA so
          // the user knows to broaden their filter rather than thinking the account
          // has no clients at all.
          <div className="p-12 text-center" data-testid="client-list-no-results">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">
              search_off
            </span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              No clients match your filters
            </h3>
            <p className="text-subtle-text mb-4">
              {searchTerm && typeFilter
                ? `No ${typeFilter === 'INDIVIDUAL' ? 'individual' : 'corporate'} clients match "${searchTerm}". Try broadening your search or removing filters.`
                : searchTerm
                  ? `No clients match "${searchTerm}". Try a different search term.`
                  : `No ${typeFilter === 'INDIVIDUAL' ? 'individual' : 'corporate'} clients found. Try a different type or clear the filter.`}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setTypeFilter('');
              }}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-bold text-sm hover:bg-primary/5"
              data-testid="client-list-clear-filters-button"
            >
              <span className="material-symbols-outlined text-lg">filter_alt_off</span>
              Clear filters
            </button>
          </div>
        ) : (
          <div className="p-12 text-center" data-testid="client-list-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">
              people
            </span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No clients yet</h3>
            <p className="text-subtle-text mb-4">Add your first client to start creating invoices.</p>
            <Link
              to="/clients/new"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
              data-testid="client-create-first-button"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Add Client
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
              <p className="text-xl font-bold text-text-light dark:text-text-dark">Delete Client</p>
              <button
                onClick={handleCancelDelete}
                className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                data-testid="client-delete-modal-close"
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
                    <span className="font-semibold">{deleteState.clientName}</span>?
                  </p>
                  <p className="text-subtle-text mt-2 text-sm">
                    This action cannot be undone. Invoices associated with this client will remain
                    but the client reference will be removed.
                  </p>
                  {/* Fix (SOUP-1929): surface delete failures instead of stalling silently. */}
                  {deleteMutation.isError && (
                    <p
                      className="mt-3 text-sm text-danger"
                      role="alert"
                      data-testid="client-delete-error"
                    >
                      Could not delete this client. Please try again.
                    </p>
                  )}
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
