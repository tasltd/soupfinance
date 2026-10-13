/**
 * Vendor List Page
 * PURPOSE: Display and manage vendors with CRUD operations
 * Reference: soupfinance-designs/vendor-client-management/
 * Changed (SOUPFIN-183): every string goes through the `vendors` namespace
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ELEMENT_SLOT, withElement } from '../../i18n/withElement';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { listVendors, deleteVendor } from '../../api';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';
// Added (SOUPFIN-160): module-aware error card instead of a generic message
import { ApiErrorState } from '../../components/feedback';

// Added (SOUPFIN-182): rows per server page (PRD: 20 per page)
export const VENDOR_PAGE_SIZE = 20;

type VendorStatus = 'active' | 'archived';

// Added (SOUPFIN-182): compact page list — first, last, and two either side of
// current (same shape as PaymentListPage)
function visiblePages(current: number, total: number): Array<number | 'gap'> {
  const pages: Array<number | 'gap'> = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - current) <= 2) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== 'gap') {
      pages.push('gap');
    }
  }
  return pages;
}

// Added: Delete confirmation state interface
interface DeleteState {
  isOpen: boolean;
  vendorId: string | null;
  vendorName: string | null;
}

export function VendorListPage() {
  const { t } = useTranslation('vendors');
  const queryClient = useQueryClient();

  // Added: Search state for filtering vendors
  const [searchTerm, setSearchTerm] = useState('');

  // Added (SOUPFIN-182): active/archived filter and current page. Both reset the
  // page so a filter change never lands on a page past the end.
  const [status, setStatus] = useState<VendorStatus>('active');
  const [page, setPage] = useState(1);

  // Added: Delete confirmation modal state
  const [deleteState, setDeleteState] = useState<DeleteState>({
    isOpen: false,
    vendorId: null,
    vendorName: null,
  });

  // Changed: Added error state handling for API failures
  // Changed (SOUPFIN-182): one server page at a time instead of a flat max: 50.
  // Key stays under ['vendors'] so existing invalidations still refresh it.
  const { data: vendors, isLoading, error, refetch } = useQuery({
    queryKey: ['vendors', { status, search: searchTerm, page }],
    queryFn: () =>
      listVendors({
        max: VENDOR_PAGE_SIZE,
        offset: (page - 1) * VENDOR_PAGE_SIZE,
        sort: 'name',
        order: 'asc',
        search: searchTerm || undefined,
        archived: status === 'archived' || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  // Added (SOUPFIN-182): every row carries the unpaged totalCount. An offset past
  // the end returns [] with no row to read it from; report what is known.
  const rowCount = vendors?.length ?? 0;
  const total = vendors?.[0]?.totalCount ?? (rowCount > 0 ? (page - 1) * VENDOR_PAGE_SIZE + rowCount : 0);
  const totalPages = Math.max(1, Math.ceil(total / VENDOR_PAGE_SIZE));
  const rangeStart = rowCount === 0 ? 0 : (page - 1) * VENDOR_PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * VENDOR_PAGE_SIZE + rowCount;
  const goToPage = (target: number) => setPage(Math.min(Math.max(1, target), totalPages));

  const changeStatus = (next: VendorStatus) => {
    setStatus(next);
    setPage(1);
  };

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
            {t('title')}
          </h1>
          <p className="text-subtle-text">{t('subtitle')}</p>
          <HelpLink section="vendors" className="mt-1 self-start" />
        </div>
        <Link
          to="/vendors/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="vendor-new-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          {t('newVendor')}
        </Link>
      </div>

      {/* Added (SOUPFIN-182): active / archived filter */}
      <div
        role="tablist"
        aria-label={t('list.statusTabsLabel')}
        className="flex gap-1 border-b border-border-light dark:border-border-dark"
        data-testid="vendor-status-tabs"
      >
        {(['active', 'archived'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={status === tab}
            onClick={() => changeStatus(tab)}
            className={`px-4 py-2 -mb-px border-b-2 text-sm font-bold transition-colors ${
              status === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-subtle-text hover:text-text-light dark:hover:text-text-dark'
            }`}
            data-testid={`vendor-tab-${tab}`}
          >
            {t(`list.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div className="relative max-w-md" data-testid="vendor-search-container">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text text-xl">
          search
        </span>
        {/* Fix (SOUPFIN-33 #6): id/name + aria-label — the search field had no label. */}
        <input
          type="search"
          id="vendor-search"
          name="vendor-search"
          aria-label={t('list.searchLabel')}
          placeholder={t('list.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
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
            {t('list.loading')}
          </div>
        ) : error ? (
          // Changed (SOUPFIN-160): ApiErrorState tells a disabled Trading module
          // apart from a missing role or a server fault, and never shows raw HTTP text.
          <ApiErrorState error={error} onRetry={() => refetch()} testId="vendor-list-error" />
        ) : vendors?.length ? (
          <div className="overflow-x-auto">
            {/* Changed: Added min-w for proper horizontal scroll on mobile */}
            <table className="w-full min-w-[600px] text-sm" data-testid="vendor-list-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.name')}</th>
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.email')}</th>
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.phone')}</th>
                  <th className="px-4 sm:px-6 py-3 text-center">{t('list.columns.paymentTerms')}</th>
                  <th className="px-4 sm:px-6 py-3 text-center">{t('list.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                    data-testid={`vendor-row-${vendor.id}`}
                  >
                    <td className="px-4 sm:px-6 py-4">
                      <Link
                        to={`/vendors/${vendor.id}`}
                        className="font-medium text-primary hover:underline"
                        data-testid={`vendor-link-${vendor.id}`}
                      >
                        {vendor.name}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-text-light dark:text-text-dark">
                      {vendor.email || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-text-light dark:text-text-dark">
                      {vendor.phoneNumber || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center text-text-light dark:text-text-dark">
                      {vendor.paymentTerms ? t('paymentTermsDays', { count: vendor.paymentTerms }) : '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          to={`/vendors/${vendor.id}`}
                          className="p-1.5 rounded hover:bg-primary/10 text-subtle-text hover:text-primary transition-colors"
                          title={t('list.view')}
                          data-testid={`vendor-view-${vendor.id}`}
                        >
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </Link>
                        <Link
                          to={`/vendors/${vendor.id}/edit`}
                          className="p-1.5 rounded hover:bg-primary/10 text-subtle-text hover:text-primary transition-colors"
                          title={t('list.edit')}
                          data-testid={`vendor-edit-${vendor.id}`}
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </Link>
                        {/* Changed (SOUPFIN-182): delete archives, so an archived row has nothing to delete */}
                        {status === 'active' && (
                          <button
                            onClick={() => handleDeleteClick(vendor.id, vendor.name)}
                            className="p-1.5 rounded hover:bg-danger/10 text-subtle-text hover:text-danger transition-colors"
                            title={t('list.delete')}
                            data-testid={`vendor-delete-${vendor.id}`}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : page > 1 ? (
          // Added (SOUPFIN-182): rows were removed elsewhere and this page no longer exists
          <div className="p-12 text-center" data-testid="vendor-list-page-empty">
            <p className="text-subtle-text mb-4">{t('list.pageEmpty', { page })}</p>
            <button
              type="button"
              onClick={() => setPage(1)}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
              data-testid="vendor-list-first-page"
            >
              {t('list.firstPage')}
            </button>
          </div>
        ) : status === 'archived' ? (
          // Added (SOUPFIN-182)
          <div className="p-12 text-center" data-testid="vendor-list-archived-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">inventory_2</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('list.archivedEmptyTitle')}</h3>
            <p className="text-subtle-text">
              {searchTerm ? t('list.archivedNoMatch') : t('list.archivedEmptyBody')}
            </p>
          </div>
        ) : (
          <div className="p-12 text-center" data-testid="vendor-list-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 block">
              storefront
            </span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('list.emptyTitle')}</h3>
            <p className="text-subtle-text mb-4">{t('list.emptyBody')}</p>
            <Link
              to="/vendors/new"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
              data-testid="vendor-create-first-button"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              {t('list.addVendor')}
            </Link>
          </div>
        )}
      </div>

      {/* Added (SOUPFIN-182): range + server pagination */}
      {rowCount > 0 && (
        <div className="flex flex-wrap justify-between items-center gap-4 text-sm text-subtle-text" data-testid="vendor-pagination-summary">
          <span data-testid="vendor-pagination-range">
            {status === 'archived'
              ? t('list.rangeArchived', { start: rangeStart, end: rangeEnd, count: total })
              : t('list.range', { start: rangeStart, end: rangeEnd, count: total })}
          </span>
          {totalPages > 1 && (
            <nav className="flex items-center" aria-label={t('list.paginationLabel')} data-testid="vendor-pagination">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="flex size-9 items-center justify-center rounded-lg text-subtle-text hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('list.previousPage')}
                data-testid="vendor-pagination-prev"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              {visiblePages(page, totalPages).map((p, i) =>
                p === 'gap' ? (
                  <span key={`gap-${i}`} className="flex size-9 items-center justify-center">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goToPage(p)}
                    aria-current={p === page ? 'page' : undefined}
                    className={`flex size-9 items-center justify-center rounded-lg text-sm ${
                      p === page ? 'bg-primary font-bold text-white' : 'text-subtle-text hover:bg-primary/10'
                    }`}
                    data-testid={`vendor-pagination-page-${p}`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="flex size-9 items-center justify-center rounded-lg text-subtle-text hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('list.nextPage')}
                data-testid="vendor-pagination-next"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </nav>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteState.isOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          data-testid="delete-confirmation-modal"
        >
          <div className="relative w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark p-6">
              <p className="text-xl font-bold text-text-light dark:text-text-dark">{t('deleteDialog.title')}</p>
              <button
                onClick={handleCancelDelete}
                aria-label={t('deleteDialog.close')}
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
                    {withElement(
                      t('deleteDialog.confirm', { name: ELEMENT_SLOT }),
                      <span className="font-semibold">{deleteState.vendorName}</span>
                    )}
                  </p>
                  <p className="text-subtle-text mt-2 text-sm">
                    {t('deleteDialog.warning')}
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
                {t('deleteDialog.cancel')}
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="h-10 px-4 rounded-lg bg-danger text-white font-bold text-sm hover:bg-danger/90 disabled:opacity-50"
                data-testid="delete-confirm-button"
              >
                {deleteMutation.isPending ? t('deleteDialog.deleting') : t('deleteDialog.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
