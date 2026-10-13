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
// Added (SOUPFIN-167): every visible string comes from the clients namespace
import { Trans, useTranslation } from 'react-i18next';
// Fix (SOUP-1929): never-blank display name for the header + delete dialog.
import { getClientDisplayName } from './getClientDisplayName';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';

interface DeleteState {
  isOpen: boolean;
}

export function ClientDetailPage() {
  const { t } = useTranslation('clients');
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
          {t('detail.loading')}
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
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('detail.notFoundTitle')}</h3>
          <p className="text-subtle-text mb-4">{t('detail.notFoundBody')}</p>
          <Link
            to="/clients"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
          >
            {t('actions.backToList')}
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
            {t('actions.backToList')}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
              {getClientDisplayName(client, t('unnamed'))}
            </h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeBadge()}`}>
              {client.clientType === 'INDIVIDUAL' ? (
                <>
                  <span className="material-symbols-outlined text-sm mr-1">person</span>
                  {t('types.individual')}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm mr-1">business</span>
                  {t('types.corporate')}
                </>
              )}
            </span>
          </div>
          <p className="text-subtle-text">{t('detail.subtitle')}</p>
          <HelpLink section="clients" className="mt-1 self-start" />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              deleteMutation.reset(); // clear any prior error on re-open
              setDeleteState({ isOpen: true });
            }}
            className="h-10 px-4 rounded-lg border border-danger text-danger font-medium text-sm hover:bg-danger/10"
            data-testid="client-detail-delete"
          >
            {t('actions.delete')}
          </button>
          <Link
            to={`/clients/${id}/edit`}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
            data-testid="client-detail-edit"
          >
            <span className="material-symbols-outlined text-lg">edit</span>
            {t('actions.edit')}
          </Link>
        </div>
      </div>

      {/* Client Information Card */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
        {/* Individual-specific Information */}
        {client.clientType === 'INDIVIDUAL' && (
          <div className="p-6 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
              {t('detail.personalInfo')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-subtle-text mb-1">{t('fields.firstName')}</p>
                <p className="text-text-light dark:text-text-dark font-medium">{client.firstName}</p>
              </div>
              <div>
                <p className="text-sm text-subtle-text mb-1">{t('fields.lastName')}</p>
                <p className="text-text-light dark:text-text-dark font-medium">{client.lastName}</p>
              </div>
            </div>
          </div>
        )}

        {/* Corporate-specific Information */}
        {client.clientType === 'CORPORATE' && (
          <div className="p-6 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
              {t('detail.companyInfo')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-subtle-text mb-1">{t('fields.companyName')}</p>
                <p className="text-text-light dark:text-text-dark font-medium">{client.companyName}</p>
              </div>
              <div>
                <p className="text-sm text-subtle-text mb-1">{t('fields.contactPerson')}</p>
                <p className="text-text-light dark:text-text-dark">
                  {client.contactPerson || <span className="text-subtle-text">{t('detail.notProvided')}</span>}
                </p>
              </div>
              <div>
                <p className="text-sm text-subtle-text mb-1">{t('fields.registrationNumber')}</p>
                <p className="text-text-light dark:text-text-dark">
                  {client.registrationNumber || <span className="text-subtle-text">{t('detail.notProvided')}</span>}
                </p>
              </div>
              <div>
                <p className="text-sm text-subtle-text mb-1">{t('fields.taxNumber')}</p>
                <p className="text-text-light dark:text-text-dark">
                  {client.taxNumber || <span className="text-subtle-text">{t('detail.notProvided')}</span>}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Contact Information */}
        <div className="p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            {t('detail.contactInfo')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-subtle-text mb-1">{t('fields.email')}</p>
              <p className="text-text-light dark:text-text-dark">
                {client.email ? (
                  <a href={`mailto:${client.email}`} className="text-primary hover:underline">
                    {client.email}
                  </a>
                ) : (
                  <span className="text-subtle-text">{t('detail.notProvided')}</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-subtle-text mb-1">{t('fields.phone')}</p>
              <p className="text-text-light dark:text-text-dark">
                {client.phone ? (
                  <a href={`tel:${client.phone}`} className="text-primary hover:underline">
                    {client.phone}
                  </a>
                ) : (
                  <span className="text-subtle-text">{t('detail.notProvided')}</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Billing Address */}
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
            {t('detail.billingAddress')}
          </h2>
          <p className="text-text-light dark:text-text-dark whitespace-pre-wrap">
            {client.address || <span className="text-subtle-text">{t('detail.notProvided')}</span>}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
        <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
          {t('detail.quickActions')}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to={`/invoices/new?clientId=${client.id}`}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="client-create-invoice"
          >
            <span className="material-symbols-outlined text-lg">receipt_long</span>
            {t('actions.createInvoice')}
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
              <p className="text-xl font-bold text-text-light dark:text-text-dark">{t('deleteDialog.title')}</p>
              <button
                onClick={() => {
                  deleteMutation.reset();
                  setDeleteState({ isOpen: false });
                }}
                className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                aria-label={t('actions.close')}
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
                    <Trans
                      t={t}
                      i18nKey="deleteDialog.confirm"
                      values={{ name: getClientDisplayName(client, t('unnamed')) }}
                      components={{ bold: <span className="font-semibold" /> }}
                    />
                  </p>
                  <p className="text-subtle-text mt-2 text-sm">
                    {t('deleteDialog.body')}
                  </p>
                  {/* Fix (SOUP-1929): surface delete failures instead of stalling silently. */}
                  {deleteMutation.isError && (
                    <p
                      className="mt-3 text-sm text-danger"
                      role="alert"
                      data-testid="client-delete-error"
                    >
                      {t('deleteDialog.error')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 border-t border-border-light dark:border-border-dark p-6">
              <button
                onClick={() => {
                  deleteMutation.reset();
                  setDeleteState({ isOpen: false });
                }}
                className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
                data-testid="delete-cancel-button"
              >
                {t('actions.cancel')}
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="h-10 px-4 rounded-lg bg-danger text-white font-bold text-sm hover:bg-danger/90 disabled:opacity-50"
                data-testid="delete-confirm-button"
              >
                {deleteMutation.isPending ? t('actions.deleting') : t('actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
