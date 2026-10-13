/**
 * Ledger Transactions Page
 * Lists all journal entries and transactions with filters
 *
 * Added: Full API integration with listLedgerTransactions endpoint
 * Added: Filter by account, date range, and status
 * Added: Loading, error, and empty states
 * Added: data-testid attributes for E2E testing
 * Added (SOUPFIN-163): server-side paging (max/offset, total from the rows'
 *   totalCount), account links to the account ledger, and a CSV export that
 *   walks every page of the filtered list, not just the one on screen.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listLedgerTransactionsPage, listAllLedgerTransactions, listLedgerAccounts } from '../../api/endpoints/ledger';
import { useFormatCurrency } from '../../stores';
import { ApiErrorState, useToast } from '../../components/feedback';
import { getApiErrorMessage } from '../../api/errors';
import { toCsv, downloadCsv } from '../../utils/csv';
import { getTodayIsoDate } from '../../utils/date';
// Fix (SOUPFIN-33 #1/#6): labelled date filter — supplies id/name/label association
// and an explicit "no date selected" description (see DateFilterField).
import { DateFilterField } from '../../components/forms';
import type { LedgerTransaction, LedgerAccount, LedgerState } from '../../types';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';

// Added: Transaction status type for filtering
type TransactionStatus = 'DRAFT' | 'PENDING' | 'POSTED' | 'REVERSED' | '';

// Added (SOUPFIN-163): rows per server page
export const LEDGER_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_LEDGER_PAGE_SIZE = 50;

const numberFormat = new Intl.NumberFormat('en-US');

export function LedgerTransactionsPage() {
  const formatCurrency = useFormatCurrency();
  const { showToast } = useToast();

  // Added: Filter state
  // Changed (SOUPFIN-163): filter setters also return to page 1
  const [accountId, setAccountIdState] = useState('');
  const [startDate, setStartDateState] = useState('');
  const [endDate, setEndDateState] = useState('');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus>('');
  // Added (SOUPFIN-163): server page (1-based) and page size
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_LEDGER_PAGE_SIZE);
  const [exporting, setExporting] = useState(false);

  const setAccountId = (v: string) => { setAccountIdState(v); setPage(1); };
  const setStartDate = (v: string) => { setStartDateState(v); setPage(1); };
  const setEndDate = (v: string) => { setEndDateState(v); setPage(1); };

  // Added: Fetch ledger accounts for filter dropdown
  const { data: accounts } = useQuery({
    queryKey: ['ledger-accounts'],
    queryFn: () => listLedgerAccounts(),
  });

  // Added: Fetch transactions with filters
  // NOTE: do not retry on 403 — module-disabled is permanent until admin enables it
  // Changed (SOUPFIN-163): one server page at a time. Status is not in the key:
  // the index action cannot filter on it (plans/soupfin-163-ledger-paging-backend.md),
  // so it is applied to the loaded page below.
  const filters = {
    accountId: accountId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  };
  const { data: pageData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['ledger-transactions', accountId, startDate, endDate, page, pageSize],
    queryFn: () => listLedgerTransactionsPage({
      ...filters,
      max: pageSize,
      offset: (page - 1) * pageSize,
      sort: 'transactionDate',
      order: 'desc',
    }),
    placeholderData: keepPreviousData,
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 401) return false;
      return failureCount < 2;
    },
  });
  const transactions = pageData?.rows;
  const total = pageData?.total ?? null;
  const hasMore = pageData?.hasMore ?? false;
  const pageCount = total !== null ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const firstRow = (page - 1) * pageSize + 1;
  const lastRow = (page - 1) * pageSize + (transactions?.length ?? 0);
  const onePage = page === 1 && !hasMore;

  // Added: Filter transactions by status client-side (API may not support status filter)
  const matchesStatus = (tx: LedgerTransaction) => !statusFilter || tx.status === statusFilter;
  const filteredTransactions = statusFilter ? transactions?.filter(matchesStatus) : transactions;

  // Added (SOUPFIN-163): export every filtered row, fetched a server page at a time
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const all = await listAllLedgerTransactions({ ...filters, sort: 'transactionDate', order: 'desc' });
      const rows = all.rows.filter(matchesStatus);
      if (rows.length === 0) {
        showToast({ variant: 'warning', message: 'Nothing to export: no transactions match these filters.' });
        return;
      }
      const header = ['Date', 'Reference', 'Account #', 'Account Name', 'Description', 'Debit', 'Credit', 'Status'];
      const csv = toCsv(header, rows.map((tx) => [
        tx.transactionDate?.slice(0, 10) ?? '',
        tx.transactionNumber || tx.reference || '',
        tx.ledgerAccount?.code ?? '',
        tx.ledgerAccount?.name ?? '',
        tx.description ?? '',
        tx.transactionState === 'DEBIT' ? (tx.amount || 0).toFixed(2) : '0.00',
        tx.transactionState === 'CREDIT' ? (tx.amount || 0).toFixed(2) : '0.00',
        tx.status || '',
      ]));
      downloadCsv(`ledger-transactions-${getTodayIsoDate()}.csv`, csv);
      if (all.truncated) {
        showToast({
          variant: 'warning',
          message: `Exported the first ${numberFormat.format(rows.length)} transactions. Narrow the dates to export the rest.`,
          duration: 7000,
        });
      } else {
        showToast({ variant: 'success', message: `Exported ${numberFormat.format(rows.length)} transaction(s) to CSV.` });
      }
    } catch (err) {
      showToast({ variant: 'error', message: `Export failed: ${getApiErrorMessage(err)}`, duration: 7000 });
    } finally {
      setExporting(false);
    }
  };

  // Added: Get status badge styling
  const getStatusStyle = (status?: string): string => {
    const styles: Record<string, string> = {
      DRAFT: 'bg-subtle-text/10 text-subtle-text',
      PENDING: 'bg-warning/10 text-warning',
      POSTED: 'bg-success/10 text-success',
      REVERSED: 'bg-danger/10 text-danger',
    };
    return styles[status || ''] || styles.DRAFT;
  };

  // Added: Get transaction state display (debit/credit)
  const getStateDisplay = (state?: LedgerState, amount?: number): { text: string; class: string } => {
    if (state === 'DEBIT') {
      return { text: formatCurrency(amount), class: 'text-text-light dark:text-text-dark' };
    } else if (state === 'CREDIT') {
      return { text: formatCurrency(amount), class: 'text-info' };
    }
    return { text: '-', class: 'text-subtle-text' };
  };

  // Added: Clear filters
  const clearFilters = () => {
    setAccountId('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('');
    setPage(1);
  };

  const hasFilters = accountId || startDate || endDate || statusFilter;

  return (
    <div className="flex flex-col gap-6" data-testid="ledger-transactions-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="ledger-transactions-heading">
            Ledger Transactions
          </h1>
          <p className="text-subtle-text">View all journal entries and transactions</p>
          <HelpLink section="ledger-transactions" className="mt-1 self-start" />
        </div>
        <div className="flex flex-wrap gap-3">
          {/* Added (SOUPFIN-163): CSV export of every filtered row */}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !!error}
            className="flex items-center gap-2 h-10 px-4 rounded-lg border border-primary text-primary font-bold text-sm hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="ledger-export-button"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            {exporting ? 'Exporting' : 'Export CSV'}
          </button>
          <Link
            to="/accounting/journal-entry/new"
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
            data-testid="new-journal-entry-button"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            New Journal Entry
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4" data-testid="ledger-filters">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Account Filter */}
          <div className="flex-1 min-w-[200px]">
            {/* Fix (SOUPFIN-33 #6): bind the label and give the control an id/name. */}
            <label
              className="block text-sm font-medium text-text-light dark:text-text-dark mb-1"
              htmlFor="ledger-account-filter"
            >
              Account
            </label>
            <select
              id="ledger-account-filter"
              name="ledger-account-filter"
              aria-label="Filter transactions by account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
              data-testid="account-filter"
            >
              <option value="">All Accounts</option>
              {accounts?.map((account: LedgerAccount) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          {/* Fix (SOUPFIN-33 #1/#6): DateFilterField supplies the id/name + <label htmlFor>
              the raw input lacked, so the empty picker is announced by name instead of as
              three anonymous "0" spinbuttons. */}
          <DateFilterField
            label="From"
            ariaLabel="Filter transactions from date"
            id="ledger-start-date-filter"
            value={startDate}
            onChange={setStartDate}
            containerClassName="min-w-[150px]"
            className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
            data-testid="start-date-filter"
          />

          {/* End Date */}
          <DateFilterField
            label="To"
            ariaLabel="Filter transactions to date"
            id="ledger-end-date-filter"
            value={endDate}
            onChange={setEndDate}
            containerClassName="min-w-[150px]"
            className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
            data-testid="end-date-filter"
          />

          {/* Status Filter */}
          <div className="min-w-[140px]">
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1" htmlFor="ledger-status-filter">Status</label>
            <select
              id="ledger-status-filter"
              name="ledger-status-filter"
              aria-label="Filter transactions by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TransactionStatus)}
              className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
              data-testid="status-filter"
            >
              <option value="">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
            </select>
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark text-sm hover:bg-primary/5"
              data-testid="clear-filters-button"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="ledger-table-container">
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="ledger-loading">
            Loading transactions...
          </div>
        ) : error ? (
          <div className="p-2">
            <ApiErrorState
              error={error}
              onRetry={() => refetch()}
              testId="ledger-error"
            />
          </div>
        ) : !filteredTransactions || filteredTransactions.length === 0 ? (
          <div className="p-12 text-center" data-testid="ledger-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">swap_horiz</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              {hasFilters ? 'No matching transactions' : 'No transactions yet'}
            </h3>
            <p className="text-subtle-text mb-4">
              {hasFilters
                ? 'Try adjusting your filters to find transactions.'
                : 'Create your first journal entry to get started.'}
            </p>
            {!hasFilters && (
              <Link
                to="/accounting/journal-entry/new"
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
                data-testid="create-first-entry-button"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                Create Journal Entry
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="ledger-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-left">Reference</th>
                  <th className="px-6 py-3 text-left">Account</th>
                  <th className="px-6 py-3 text-left">Description</th>
                  <th className="px-6 py-3 text-right">Debit</th>
                  <th className="px-6 py-3 text-right">Credit</th>
                  <th className="px-6 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx: LedgerTransaction) => {
                  const debit = getStateDisplay(
                    tx.transactionState === 'DEBIT' ? 'DEBIT' : undefined,
                    tx.transactionState === 'DEBIT' ? tx.amount : undefined
                  );
                  const credit = getStateDisplay(
                    tx.transactionState === 'CREDIT' ? 'CREDIT' : undefined,
                    tx.transactionState === 'CREDIT' ? tx.amount : undefined
                  );
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                      data-testid={`ledger-row-${tx.id}`}
                    >
                      <td className="px-6 py-4 text-text-light dark:text-text-dark whitespace-nowrap">
                        {tx.transactionDate?.slice(0, 10)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-primary">{tx.transactionNumber || tx.reference || '-'}</span>
                      </td>
                      <td className="px-6 py-4 text-text-light dark:text-text-dark">
                        {tx.ledgerAccount ? (
                          // Added (SOUPFIN-163): open the account's ledger
                          <Link
                            to={`/ledger/accounts/${tx.ledgerAccount.id}`}
                            className="hover:text-primary hover:underline"
                            data-testid={`ledger-account-link-${tx.id}`}
                          >
                            <span className="font-mono text-subtle-text">{tx.ledgerAccount.code}</span>
                            {' '}
                            {tx.ledgerAccount.name}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-6 py-4 text-text-light dark:text-text-dark max-w-xs truncate">
                        {tx.description || '-'}
                      </td>
                      <td className={`px-6 py-4 text-right font-medium ${debit.class}`}>
                        {tx.transactionState === 'DEBIT' ? debit.text : '-'}
                      </td>
                      <td className={`px-6 py-4 text-right font-medium ${credit.class}`}>
                        {tx.transactionState === 'CREDIT' ? credit.text : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getStatusStyle(tx.status)}`}
                          data-testid={`ledger-status-${tx.id}`}
                        >
                          {tx.status || 'DRAFT'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {filteredTransactions && filteredTransactions.length > 0 && (
        <div className="flex justify-between items-center text-sm text-subtle-text" data-testid="ledger-summary">
          <span>
            Showing {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
            {statusFilter && !onePage ? ' on this page' : ''}
            {hasFilters && ' (filtered)'}
          </span>
          <div className="flex gap-6">
            <span>
              {onePage ? 'Total Debits' : 'Debits on this page'}:{' '}
              <span className="font-medium text-text-light dark:text-text-dark">
                {formatCurrency(filteredTransactions
                  .filter((tx: LedgerTransaction) => tx.transactionState === 'DEBIT')
                  .reduce((sum: number, tx: LedgerTransaction) => sum + (tx.amount || 0), 0))}
              </span>
            </span>
            <span>
              {onePage ? 'Total Credits' : 'Credits on this page'}:{' '}
              <span className="font-medium text-info">
                {formatCurrency(filteredTransactions
                  .filter((tx: LedgerTransaction) => tx.transactionState === 'CREDIT')
                  .reduce((sum: number, tx: LedgerTransaction) => sum + (tx.amount || 0), 0))}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Added (SOUPFIN-163): server-side pagination */}
      {!error && transactions && (transactions.length > 0 || page > 1) && (
        <nav
          aria-label="Pagination"
          className="flex flex-wrap items-center justify-between gap-4 border-t border-border-light dark:border-border-dark pt-4"
          data-testid="ledger-pagination"
        >
          <p className="text-sm text-subtle-text" data-testid="ledger-pagination-range">
            {transactions.length > 0
              ? <>Rows {numberFormat.format(firstRow)}–{numberFormat.format(lastRow)}</>
              : <>No rows on this page</>}
            {total !== null && <> of {numberFormat.format(total)}</>}
          </p>
          <div className="flex items-center gap-3">
            <label htmlFor="ledger-page-size" className="text-sm text-subtle-text">Rows per page</label>
            <select
              id="ledger-page-size"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-9 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-2 text-sm text-text-light dark:text-text-dark"
              data-testid="ledger-page-size"
            >
              {LEDGER_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="text-sm text-text-light dark:text-text-dark" data-testid="ledger-page-indicator">
              Page {numberFormat.format(page)}{pageCount !== null && <> of {numberFormat.format(pageCount)}</>}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              className="h-9 px-3 rounded-lg border border-border-light dark:border-border-dark text-sm text-text-light dark:text-text-dark hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="ledger-pagination-prev"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || isFetching}
              className="h-9 px-3 rounded-lg border border-border-light dark:border-border-dark text-sm text-text-light dark:text-text-dark hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="ledger-pagination-next"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
