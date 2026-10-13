/**
 * Invoice List Page
 * Reference: soupfinance-designs/invoice-management/
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
// Added (SOUPFIN-167): every visible string comes from the invoices namespace
import { useTranslation } from 'react-i18next';
import { listInvoices } from '../../api';
import { useFormatCurrency } from '../../stores';
// Added: GSAP page entrance animation (SOUP-679)
import { usePageEntrance } from '../../hooks/useGsapAnimations';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';
import { formatLocaleDate } from '../../utils/date';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';

export function InvoiceListPage() {
  const { t, i18n } = useTranslation('invoices');
  // Added (SOUPFIN-167): amounts and dates follow the reader's language
  const formatCurrency = useFormatCurrency(i18n.language);
  // Added: GSAP page entrance animation ref (SOUP-679)
  const pageRef = usePageEntrance();

  // Changed: Added error state handling for API failures
  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => listInvoices({ max: 20, sort: 'dateCreated', order: 'desc' }),
  });

  // Added: data-testid attributes for E2E testing
  return (
    <div ref={pageRef} className="flex flex-col gap-6" data-testid="invoice-list-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="invoice-list-heading">
            {t('title')}
          </h1>
          <p className="text-subtle-text">{t('subtitle')}</p>
          <HelpLink section="invoices" className="mt-1 self-start" />
        </div>
        <Link
          to="/invoices/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="invoice-new-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          {t('newInvoice')}
        </Link>
      </div>

      {/* Invoice Table */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="invoice-table-container">
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="invoice-list-loading">{t('list.loading')}</div>
        ) : error ? (
          // Added: Error state when API fails
          <div className="p-12 text-center" data-testid="invoice-list-error">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('list.errorTitle')}</h3>
            <p className="text-subtle-text mb-4">{t('list.errorBody')}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              {t('actions.retry')}
            </button>
          </div>
        ) : invoices?.length ? (
          <div className="overflow-x-auto">
            {/* Changed: Added min-w for proper horizontal scroll on mobile */}
            <table className="w-full min-w-[700px] text-sm" data-testid="invoice-list-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.number')}</th>
                  {/* Changed: Label from Account to Client */}
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.client')}</th>
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.invoiceDate')}</th>
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.dueDate')}</th>
                  <th className="px-4 sm:px-6 py-3 text-right">{t('list.columns.amount')}</th>
                  <th className="px-4 sm:px-6 py-3 text-center">{t('list.columns.status')}</th>
                  <th className="px-4 sm:px-6 py-3 text-center">{t('list.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border-light dark:border-border-dark hover:bg-primary/5" data-testid={`invoice-row-${invoice.id}`}>
                    <td className="px-4 sm:px-6 py-4">
                      <Link to={`/invoices/${invoice.id}`} className="font-medium text-primary hover:underline" data-testid={`invoice-link-${invoice.id}`}>
                        {String(invoice.number)}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-text-light dark:text-text-dark">{invoice.accountServices?.serialised || t('notAvailable')}</td>
                    <td className="px-4 sm:px-6 py-4 text-subtle-text">{formatLocaleDate(invoice.invoiceDate, i18n.language) || '-'}</td>
                    <td className="px-4 sm:px-6 py-4 text-subtle-text">{formatLocaleDate(invoice.paymentDate, i18n.language) || '-'}</td>
                    <td className="px-4 sm:px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      {/* Fix: invoice.status is optional, default to DRAFT */}
                      {/* Changed (SOUPFIN-167): translated label, not the raw enum */}
                      <InvoiceStatusBadge status={invoice.status} data-testid={`invoice-status-${invoice.id}`} />
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <Link to={`/invoices/${invoice.id}/edit`} className="text-primary hover:underline text-sm" data-testid={`invoice-edit-${invoice.id}`}>
                        {t('actions.edit')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center" data-testid="invoice-list-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">receipt_long</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('list.emptyTitle')}</h3>
            <p className="text-subtle-text mb-4">{t('list.emptyBody')}</p>
            <Link to="/invoices/new" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm" data-testid="invoice-create-first-button">
              <span className="material-symbols-outlined text-lg">add</span>
              {t('actions.createInvoice')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
