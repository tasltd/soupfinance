/**
 * Payment List Page
 * Lists all incoming (invoice) and outgoing (bill) payments
 * Reference: soupfinance-designs/payment-history-report/
 *
 * Added: Full API integration with listAllInvoicePayments and listAllBillPayments
 * Added: Tabbed view for incoming vs outgoing payments
 * Added: Loading, error, and empty states
 * Added: data-testid attributes for E2E testing
 * Added (SOUPFIN-177): server pagination, recorded-date and method filters,
 *   a link to each payment's detail page, and method badges read from the
 *   PaymentMethod record instead of a hard-coded enum map
 * Changed (SOUPFIN-180): every string goes through the `payments` namespace, and
 *   each tab shows its own ApiErrorState — one tab's 403 no longer waits for the other
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listPaymentsPage, MAX_FILTER_SCAN, type PaymentListFilters } from '../../api/endpoints/payments';
import { useFormatCurrency } from '../../stores';
import { usePaymentMethods } from '../../hooks/usePaymentMethods';
// Changed (SOUPFIN-180): api/errors replaces the legacy utils/apiErrors check
import { parseApiError, type ApiErrorKind } from '../../api/errors';
import { ApiErrorState } from '../../components/feedback/ApiErrorState';
import type { InvoicePayment, BillPayment } from '../../types';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';
import {
  getPaymentMethodName,
  getPaymentMethodBadgeStyle,
  describeInvoiceRef,
  describeBillRef,
} from './paymentDisplay';

// Added: Tab type for filtering
type PaymentTab = 'incoming' | 'outgoing';

// Added (SOUPFIN-177): rows per server page
export const PAYMENT_PAGE_SIZE = 20;

// Added (SOUPFIN-180): kinds a retry cannot fix — the tenant or the role must change first
const NOT_RETRYABLE: ReadonlySet<ApiErrorKind> = new Set(['module_disabled', 'forbidden']);

function errorKind(error: unknown): ApiErrorKind | null {
  return error ? parseApiError(error).kind : null;
}

const EMPTY_FILTERS: PaymentListFilters = { from: '', to: '', paymentMethodId: '' };

// Added (SOUPFIN-177): compact page list — first, last, and two either side of current
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

export function PaymentListPage() {
  const { t, i18n } = useTranslation('payments');
  const formatCurrency = useFormatCurrency();
  const { data: paymentMethods } = usePaymentMethods();

  // Changed (SOUPFIN-177): the active tab lives in the URL (?tab=outgoing) so the
  // detail page can send the user back to the tab they came from
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: PaymentTab = searchParams.get('tab') === 'outgoing' ? 'outgoing' : 'incoming';
  const setActiveTab = (tab: PaymentTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'incoming') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  // Added (SOUPFIN-177): filters apply to both tabs; each tab keeps its own page
  const [filters, setFilters] = useState<PaymentListFilters>(EMPTY_FILTERS);
  const [pages, setPages] = useState<Record<PaymentTab, number>>({ incoming: 1, outgoing: 1 });
  const hasFilters = !!(filters.from || filters.to || filters.paymentMethodId);
  const dateRangeInverted = !!(filters.from && filters.to && filters.from > filters.to);

  const updateFilter = (key: keyof PaymentListFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPages({ incoming: 1, outgoing: 1 });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPages({ incoming: 1, outgoing: 1 });
  };

  // Added: Fetch incoming payments (from invoices)
  // NOTE: retry=false so 403 (module disabled) surfaces immediately instead of retrying 3x
  // Changed (SOUPFIN-177): one server page at a time; key stays under ['invoice-payments']
  // so invalidating that prefix (record / void) refreshes it
  const {
    data: incomingPage,
    isLoading: isLoadingIncoming,
    error: incomingError,
    refetch: refetchIncoming,
  } = useQuery({
    queryKey: ['invoice-payments', 'list', { page: pages.incoming, ...filters }],
    queryFn: () =>
      listPaymentsPage('invoice', { page: pages.incoming, pageSize: PAYMENT_PAGE_SIZE, ...filters }),
    placeholderData: keepPreviousData,
    retry: false,
  });

  // Added: Fetch outgoing payments (to vendors/bills)
  const {
    data: outgoingPage,
    isLoading: isLoadingOutgoing,
    error: outgoingError,
    refetch: refetchOutgoing,
  } = useQuery({
    queryKey: ['bill-payments', 'list', { page: pages.outgoing, ...filters }],
    queryFn: () =>
      listPaymentsPage('bill', { page: pages.outgoing, pageSize: PAYMENT_PAGE_SIZE, ...filters }),
    placeholderData: keepPreviousData,
    retry: false,
  });

  // Added: Get current tab data
  const isLoading = activeTab === 'incoming' ? isLoadingIncoming : isLoadingOutgoing;
  const error = activeTab === 'incoming' ? incomingError : outgoingError;
  const currentPage = activeTab === 'incoming' ? incomingPage : outgoingPage;
  const payments = currentPage?.payments;
  const total = currentPage?.total ?? 0;
  const page = pages[activeTab];
  const totalPages = Math.max(1, Math.ceil(total / PAYMENT_PAGE_SIZE));

  const goToPage = (target: number) => {
    setPages((prev) => ({ ...prev, [activeTab]: Math.min(Math.max(1, target), totalPages) }));
  };

  // Changed (SOUPFIN-180): each tab judges its own error. A module gate on the
  // invoice side disables "Receive payment" without waiting for the bill side.
  const incomingKind = errorKind(incomingError);
  const outgoingKind = errorKind(outgoingError);
  const activeKind = activeTab === 'incoming' ? incomingKind : outgoingKind;
  const incomingBlocked = incomingKind === 'module_disabled';
  const outgoingBlocked = outgoingKind === 'module_disabled';
  // Record Payment covers both sides, so it is only useless when both are gated
  const recordBlocked = incomingBlocked && outgoingBlocked;
  const retryActiveTab = activeTab === 'incoming' ? refetchIncoming : refetchOutgoing;

  const rangeStart = total === 0 ? 0 : (page - 1) * PAYMENT_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAYMENT_PAGE_SIZE, (page - 1) * PAYMENT_PAGE_SIZE + (payments?.length ?? 0));

  // Added (SOUPFIN-177): one row renderer for both tabs
  const renderRow = (payment: InvoicePayment | BillPayment) => {
    const isIncoming = activeTab === 'incoming';
    const doc = isIncoming
      ? describeInvoiceRef((payment as InvoicePayment).invoice)
      : describeBillRef((payment as BillPayment).bill);
    const docId = isIncoming ? (payment as InvoicePayment).invoice?.id : (payment as BillPayment).bill?.id;
    const detailPath = `/payments/${isIncoming ? 'invoice' : 'bill'}/${payment.id}`;
    return (
      <tr
        key={payment.id}
        className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
        data-testid={`payment-row-${payment.id}`}
      >
        <td className="px-6 py-4 text-text-light dark:text-text-dark whitespace-nowrap">
          {payment.paymentDate}
        </td>
        <td className="px-6 py-4">
          {docId ? (
            <Link
              to={`/${isIncoming ? 'invoices' : 'bills'}/${docId}`}
              className="text-primary hover:underline font-medium"
            >
              {doc.label}
            </Link>
          ) : (
            <span className="text-subtle-text">{doc.label}</span>
          )}
          {doc.party && <p className="text-xs text-subtle-text truncate max-w-[16rem]">{doc.party}</p>}
        </td>
        <td className="px-6 py-4">
          <span
            className={`px-2.5 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${getPaymentMethodBadgeStyle(payment.paymentMethod)}`}
            data-testid={`payment-method-badge-${payment.id}`}
          >
            {getPaymentMethodName(payment.paymentMethod, paymentMethods)}
          </span>
        </td>
        <td className="px-6 py-4 text-subtle-text">
          {payment.reference || payment.quickReference || '-'}
        </td>
        <td className={`px-6 py-4 text-right font-medium whitespace-nowrap ${isIncoming ? 'text-success' : 'text-danger'}`}>
          {isIncoming ? '+' : '-'}
          {formatCurrency(payment.amount)}
        </td>
        <td className="px-6 py-4 text-right">
          <Link
            to={detailPath}
            className="inline-flex items-center gap-1 text-primary hover:underline font-medium whitespace-nowrap"
            data-testid={`payment-view-${payment.id}`}
          >
            {t('list.view')}
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </Link>
        </td>
      </tr>
    );
  };

  const inputClass =
    'form-input h-10 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-background-dark text-text-light dark:text-text-dark px-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 focus:outline-0';

  return (
    <div className="flex flex-col gap-6" data-testid="payment-list-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="payment-list-heading">
            {t('title')}
          </h1>
          <p className="text-subtle-text">{t('list.subtitle')}</p>
          <HelpLink section="payments" className="mt-1 self-start" />
        </div>
        <div className="flex flex-wrap gap-2">
        {/* Added (SOUPFIN-178): one payment applied across many invoices or bills */}
        <Link
          to="/payments/receive"
          aria-disabled={incomingBlocked}
          tabIndex={incomingBlocked ? -1 : undefined}
          onClick={(e) => {
            if (incomingBlocked) e.preventDefault();
          }}
          className={`flex items-center gap-2 h-10 px-4 rounded-lg bg-primary/10 text-primary font-bold text-sm hover:bg-primary/20 ${
            incomingBlocked ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
          }`}
          data-testid="receive-payment-button"
        >
          <span className="material-symbols-outlined text-lg">call_received</span>
          {t('list.receivePayment')}
        </Link>
        <Link
          to="/payments/make"
          aria-disabled={outgoingBlocked}
          tabIndex={outgoingBlocked ? -1 : undefined}
          onClick={(e) => {
            if (outgoingBlocked) e.preventDefault();
          }}
          className={`flex items-center gap-2 h-10 px-4 rounded-lg bg-primary/10 text-primary font-bold text-sm hover:bg-primary/20 ${
            outgoingBlocked ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
          }`}
          data-testid="pay-bills-button"
        >
          <span className="material-symbols-outlined text-lg">call_made</span>
          {t('list.payBills')}
        </Link>
        <Link
          to="/payments/new"
          aria-disabled={recordBlocked}
          tabIndex={recordBlocked ? -1 : undefined}
          onClick={(e) => {
            if (recordBlocked) e.preventDefault();
          }}
          className={`flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 ${
            recordBlocked ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
          }`}
          data-testid="record-payment-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          {t('list.recordPayment')}
        </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-light dark:bg-surface-dark rounded-lg p-1 border border-border-light dark:border-border-dark w-fit" data-testid="payment-tabs">
        <button
          onClick={() => setActiveTab('incoming')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'incoming'
              ? 'bg-primary text-white'
              : 'text-subtle-text hover:bg-primary/10'
          }`}
          data-testid="tab-incoming"
        >
          <span className="material-symbols-outlined text-lg">arrow_downward</span>
          {t('list.tabIncoming')}
          {/* Changed (SOUPFIN-177): badge shows the filtered total, not the rows on screen */}
          {incomingPage && incomingPage.total > 0 && (
            <span className={`px-2 py-0.5 text-xs rounded-full ${activeTab === 'incoming' ? 'bg-white/20' : 'bg-success/20 text-success'}`}>
              {incomingPage.total}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'outgoing'
              ? 'bg-primary text-white'
              : 'text-subtle-text hover:bg-primary/10'
          }`}
          data-testid="tab-outgoing"
        >
          <span className="material-symbols-outlined text-lg">arrow_upward</span>
          {t('list.tabOutgoing')}
          {outgoingPage && outgoingPage.total > 0 && (
            <span className={`px-2 py-0.5 text-xs rounded-full ${activeTab === 'outgoing' ? 'bg-white/20' : 'bg-danger/20 text-danger'}`}>
              {outgoingPage.total}
            </span>
          )}
        </button>
      </div>

      {/* Added (SOUPFIN-177): filters */}
      {/* Changed (SOUPFIN-180): hidden while the tab is gated or forbidden — no filter changes that */}
      {!(activeKind && NOT_RETRYABLE.has(activeKind)) && (
      <div
        className="flex flex-wrap items-end gap-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4"
        data-testid="payment-filters"
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-text-light dark:text-text-dark">
          {t('list.filterFrom')}
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => updateFilter('from', e.target.value)}
            className={inputClass}
            data-testid="filter-from"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-text-light dark:text-text-dark">
          {t('list.filterTo')}
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => updateFilter('to', e.target.value)}
            className={inputClass}
            data-testid="filter-to"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-text-light dark:text-text-dark">
          {t('list.filterMethod')}
          <select
            value={filters.paymentMethodId}
            onChange={(e) => updateFilter('paymentMethodId', e.target.value)}
            className={`form-select ${inputClass} min-w-[12rem]`}
            data-testid="filter-method"
          >
            <option value="">{t('list.allMethods')}</option>
            {paymentMethods?.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </select>
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 h-10 px-3 rounded-lg text-sm font-bold text-primary hover:bg-primary/10"
            data-testid="filter-clear"
          >
            <span className="material-symbols-outlined text-lg">close</span>
            {t('list.clearFilters')}
          </button>
        )}
        <p className="basis-full text-xs text-subtle-text" data-testid="filter-date-hint">
          {dateRangeInverted ? t('list.dateInverted') : t('list.dateHint')}
        </p>
        {currentPage?.truncated && (
          <p className="basis-full text-xs text-warning" data-testid="filter-truncated">
            {t('list.truncated', { limit: MAX_FILTER_SCAN.toLocaleString(i18n.resolvedLanguage) })}
          </p>
        )}
      </div>
      )}

      {/* Payment Table */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="payment-table-container">
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="payment-list-loading">
            {activeTab === 'incoming' ? t('list.loadingIncoming') : t('list.loadingOutgoing')}
          </div>
        ) : error ? (
          // Changed (SOUPFIN-180): ApiErrorState explains the cause per kind; a retry is
          // offered only where it can help (not for a gated module or a role denial)
          <ApiErrorState
            error={error}
            testId="payment-list-error"
            onRetry={activeKind && NOT_RETRYABLE.has(activeKind) ? undefined : () => void retryActiveTab()}
          />
        ) : !payments || payments.length === 0 ? (
          page > 1 ? (
            // Added (SOUPFIN-177): rows were removed elsewhere and this page no longer exists
            <div className="p-12 text-center" data-testid="payment-list-page-empty">
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
                {t('list.pageEmpty', { page })}
              </h3>
              <button
                type="button"
                onClick={() => setPages((prev) => ({ ...prev, [activeTab]: 1 }))}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
                data-testid="payment-list-first-page"
              >
                {t('list.firstPage')}
              </button>
            </div>
          ) : hasFilters ? (
            <div className="p-12 text-center" data-testid="payment-list-no-matches">
              <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">filter_alt_off</span>
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
                {activeTab === 'incoming' ? t('list.noMatchesIncoming') : t('list.noMatchesOutgoing')}
              </h3>
              <p className="text-subtle-text mb-4">{t('list.noMatchesHint')}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
              >
                {t('list.clearFilters')}
              </button>
            </div>
          ) : (
          <div className="p-12 text-center" data-testid="payment-list-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">payments</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              {activeTab === 'incoming' ? t('list.emptyIncoming') : t('list.emptyOutgoing')}
            </h3>
            <p className="text-subtle-text mb-4">
              {activeTab === 'incoming' ? t('list.emptyIncomingHint') : t('list.emptyOutgoingHint')}
            </p>
            <Link
              to="/payments/new"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
              data-testid="record-first-payment-button"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              {t('list.recordPayment')}
            </Link>
          </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="payment-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">{t('list.colDate')}</th>
                  <th className="px-6 py-3 text-left">
                    {activeTab === 'incoming' ? t('list.colInvoice') : t('list.colBill')}
                  </th>
                  <th className="px-6 py-3 text-left">{t('list.colMethod')}</th>
                  <th className="px-6 py-3 text-left">{t('list.colReference')}</th>
                  <th className="px-6 py-3 text-right">{t('list.colAmount')}</th>
                  <th className="px-6 py-3 text-right">
                    <span className="sr-only">{t('list.colDetails')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>{payments.map(renderRow)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary + pagination */}
      {payments && payments.length > 0 && (
        <div className="flex flex-wrap justify-between items-center gap-4 text-sm text-subtle-text" data-testid="payment-summary">
          <span data-testid="pagination-range">
            {activeTab === 'incoming'
              ? t('list.rangeIncoming', { start: rangeStart, end: rangeEnd, count: total })
              : t('list.rangeOutgoing', { start: rangeStart, end: rangeEnd, count: total })}
          </span>
          <div className="flex gap-2 items-center">
            <span>{t('list.pageTotal')}</span>
            <span className={`font-bold ${activeTab === 'incoming' ? 'text-success' : 'text-danger'}`}>
              {activeTab === 'incoming' ? '+' : '-'}
              {formatCurrency(payments.reduce((sum, p) => sum + (p.amount || 0), 0))}
            </span>
          </div>
          {totalPages > 1 && (
            <nav className="flex items-center basis-full justify-end" aria-label={t('list.pagination')} data-testid="payment-pagination">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="flex size-9 items-center justify-center rounded-lg text-subtle-text hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('list.previousPage')}
                data-testid="pagination-prev"
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
                    data-testid={`pagination-page-${p}`}
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
                data-testid="pagination-next"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
