/**
 * Vendor Detail Page
 * PURPOSE: Display vendor information in read-only format
 * Reference: soupfinance-designs/vendor-client-management/
 * Changed (SOUPFIN-183): every string goes through the `vendors` namespace
 */
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ELEMENT_SLOT, withElement } from '../../i18n/withElement';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Added (SOUPFIN-160): module-aware error card for a failed vendor load
import { ApiErrorState } from '../../components/feedback';
import { getVendor, deleteVendor } from '../../api';
import { useState } from 'react';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';

// Added: Delete confirmation state interface
interface DeleteState {
  isOpen: boolean;
}

export function VendorDetailPage() {
  const { t } = useTranslation('vendors');
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteState, setDeleteState] = useState<DeleteState>({ isOpen: false });

  // Added: Query to fetch vendor data
  const { data: vendor, isLoading, error, refetch } = useQuery({
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
          {t('loading')}
        </div>
      </div>
    );
  }

  // Error state
  if (error || !vendor) {
    return (
      <div className="flex flex-col gap-6" data-testid="vendor-detail-page">
        {/* Changed (SOUPFIN-160): a failed load says why (module disabled, no
            permission, server fault); "not found" is kept for an empty answer. */}
        {error ? (
          <>
            <ApiErrorState error={error} onRetry={() => refetch()} testId="vendor-detail-error" />
            <Link
              to="/vendors"
              className="self-center inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm"
            >
              {t('backToVendors')}
            </Link>
          </>
        ) : (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4 block">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('detail.notFoundTitle')}</h3>
            <p className="text-subtle-text mb-4">{t('detail.notFoundBody')}</p>
            <Link
              to="/vendors"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              {t('backToVendors')}
            </Link>
          </div>
        )}
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
            {t('backToVendors')}
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
            {vendor.name}
          </h1>
          <p className="text-subtle-text">{t('vendorDetails')}</p>
          <HelpLink section="vendors" className="mt-1 self-start" />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setDeleteState({ isOpen: true })}
            className="h-10 px-4 rounded-lg border border-danger text-danger font-medium text-sm hover:bg-danger/10"
            data-testid="vendor-detail-delete"
          >
            {t('detail.delete')}
          </button>
          {/* Added (SOUPFIN-178): pay several of this vendor's bills in one payment */}
          <Link
            to={`/payments/make?vendorId=${id}`}
            className="flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="vendor-pay-bills"
          >
            <span className="material-symbols-outlined text-lg">call_made</span>
            {t('detail.payBills')}
          </Link>
          <Link
            to={`/vendors/${id}/edit`}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
            data-testid="vendor-detail-edit"
          >
            <span className="material-symbols-outlined text-lg">edit</span>
            {t('detail.edit')}
          </Link>
        </div>
      </div>

      {/* Vendor Information Card */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
        {/* Basic Information Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            {t('detail.basicInfo')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-subtle-text mb-1">{t('detail.vendorName')}</p>
              <p className="text-text-light dark:text-text-dark font-medium">{vendor.name}</p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">{t('detail.email')}</p>
              <p className="text-text-light dark:text-text-dark">
                {vendor.email || <span className="text-subtle-text">{t('notProvided')}</span>}
              </p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">{t('detail.phone')}</p>
              <p className="text-text-light dark:text-text-dark">
                {vendor.phoneNumber || <span className="text-subtle-text">{t('notProvided')}</span>}
              </p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">{t('detail.tin')}</p>
              <p className="text-text-light dark:text-text-dark">
                {vendor.taxIdentificationNumber || <span className="text-subtle-text">{t('notProvided')}</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Payment Terms Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">{t('detail.paymentTermsTitle')}</h2>
          <div>
            <p className="text-sm text-subtle-text mb-1">{t('detail.paymentTermsDays')}</p>
            <p className="text-text-light dark:text-text-dark">
              {vendor.paymentTerms ? t('paymentTermsDays', { count: vendor.paymentTerms }) : <span className="text-subtle-text">{t('detail.notSpecified')}</span>}
            </p>
          </div>
        </div>

        {/* Address Section */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">{t('detail.addressTitle')}</h2>
          <p className="text-text-light dark:text-text-dark whitespace-pre-wrap">
            {vendor.address || <span className="text-subtle-text">{t('notProvided')}</span>}
          </p>
        </div>

        {/* Notes Section */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">{t('detail.notesTitle')}</h2>
          <p className="text-text-light dark:text-text-dark whitespace-pre-wrap">
            {vendor.notes || <span className="text-subtle-text">{t('detail.noNotes')}</span>}
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
              <p className="text-xl font-bold text-text-light dark:text-text-dark">{t('deleteDialog.title')}</p>
              <button
                onClick={() => setDeleteState({ isOpen: false })}
                aria-label={t('deleteDialog.close')}
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
                    {withElement(
                      t('deleteDialog.confirm', { name: ELEMENT_SLOT }),
                      <span className="font-semibold">{vendor.name}</span>
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
                onClick={() => setDeleteState({ isOpen: false })}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
                data-testid="delete-cancel-button"
              >
                {t('deleteDialog.cancel')}
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
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
