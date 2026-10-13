/**
 * Bill List Page
 * Reference: soupfinance-designs/invoice-management/ (adapted for bills)
 *
 * Added: Full API integration with listBills endpoint
 * Added: Loading, empty, and error states
 * Added: data-testid attributes for E2E testing
 * Changed: Uses dynamic currency formatting from account settings
 * Changed (SOUPFIN-183): every string goes through the `bills` namespace and the
 *   status badge is translated through billStatusLabel instead of the raw enum
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listBills } from '../../api/endpoints/bills';
import { useFormatCurrency } from '../../stores';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';
// Added (SOUPFIN-160): module-aware error card instead of a generic message
import { ApiErrorState } from '../../components/feedback';
import { billStatusLabel, billStatusStyle } from './billStatus';

export function BillListPage() {
  const { t } = useTranslation('bills');
  // Added: Fetch bills from API
  const { data: bills, isLoading, error, refetch } = useQuery({
    queryKey: ['bills'],
    queryFn: () => listBills({ max: 20, sort: 'dateCreated', order: 'desc' }),
  });

  // Changed: Use dynamic currency formatting from account settings
  const formatCurrency = useFormatCurrency();

  return (
    <div className="flex flex-col gap-6" data-testid="bill-list-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="bill-list-heading">
            {t('title')}
          </h1>
          <p className="text-subtle-text">{t('subtitle')}</p>
          <HelpLink section="bills" className="mt-1 self-start" />
        </div>
        <Link
          to="/bills/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="bill-new-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          {t('newBill')}
        </Link>
      </div>

      {/* Bill Table */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="bill-table-container">
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="bill-list-loading">{t('list.loading')}</div>
        ) : error ? (
          // Changed (SOUPFIN-160): ApiErrorState tells a disabled Finance module
          // apart from a missing role or a server fault, and never shows raw HTTP text.
          <ApiErrorState error={error} onRetry={() => refetch()} testId="bill-list-error" />
        ) : bills?.length ? (
          <div className="overflow-x-auto">
            {/* Changed: Added min-w for proper horizontal scroll on mobile */}
            <table className="w-full min-w-[800px] text-sm" data-testid="bill-list-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.billNumber')}</th>
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.vendor')}</th>
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.issueDate')}</th>
                  <th className="px-4 sm:px-6 py-3 text-left">{t('list.columns.dueDate')}</th>
                  <th className="px-4 sm:px-6 py-3 text-right">{t('list.columns.amount')}</th>
                  <th className="px-4 sm:px-6 py-3 text-right">{t('list.columns.balanceDue')}</th>
                  <th className="px-4 sm:px-6 py-3 text-center">{t('list.columns.status')}</th>
                  <th className="px-4 sm:px-6 py-3 text-center">{t('list.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id} className="border-b border-border-light dark:border-border-dark hover:bg-primary/5" data-testid={`bill-row-${bill.id}`}>
                    <td className="px-4 sm:px-6 py-4">
                      <Link to={`/bills/${bill.id}`} className="font-medium text-primary hover:underline" data-testid={`bill-link-${bill.id}`}>
                        {bill.billNumber}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-text-light dark:text-text-dark">{bill.vendor?.name || t('notAvailable')}</td>
                    <td className="px-4 sm:px-6 py-4 text-subtle-text">{bill.billDate}</td>
                    <td className="px-4 sm:px-6 py-4 text-subtle-text">{bill.paymentDate}</td>
                    <td className="px-4 sm:px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">
                      {formatCurrency(bill.totalAmount)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right font-medium text-text-light dark:text-text-dark">
                      {formatCurrency(bill.amountDue)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${billStatusStyle(bill.status)}`} data-testid={`bill-status-${bill.id}`}>
                        {billStatusLabel(t, bill.status)}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <Link to={`/bills/${bill.id}/edit`} className="text-primary hover:underline text-sm" data-testid={`bill-edit-${bill.id}`}>
                        {t('list.edit')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // Added: Empty state when no bills exist
          <div className="p-12 text-center" data-testid="bill-list-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">receipt</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">{t('list.emptyTitle')}</h3>
            <p className="text-subtle-text mb-4">{t('list.emptyBody')}</p>
            <Link to="/bills/new" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm" data-testid="bill-create-first-button">
              <span className="material-symbols-outlined text-lg">add</span>
              {t('list.createFirst')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

