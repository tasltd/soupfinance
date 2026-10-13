/**
 * Ledger Transactions Page
 * Lists all journal entries and transactions with filters
 *
 * Added: Full API integration with listLedgerTransactions endpoint
 * Added: Filter by account, date range, and status
 * Added: Loading, error, and empty states
 * Added: data-testid attributes for E2E testing
 * Changed (SOUPFIN-164): every visible string comes from the `ledger` namespace.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listLedgerTransactions, listLedgerAccounts } from '../../api/endpoints/ledger';
import { useFormatCurrency } from '../../stores';
import { ApiErrorState } from '../../components/feedback';
// Fix (SOUPFIN-33 #1/#6): labelled date filter — supplies id/name/label association
// and an explicit "no date selected" description (see DateFilterField).
import { DateFilterField } from '../../components/forms';
import type { LedgerTransaction, LedgerAccount, LedgerState } from '../../types';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';

// Added: Transaction status type for filtering
type TransactionStatus = 'DRAFT' | 'PENDING' | 'POSTED' | 'REVERSED' | '';

// Added (SOUPFIN-164): statuses with a translated label (ledger:transactions.statuses)
const STATUSES = ['DRAFT', 'PENDING', 'POSTED', 'REVERSED'] as const;
type KnownStatus = (typeof STATUSES)[number];
const isKnownStatus = (status: string): status is KnownStatus => (STATUSES as readonly string[]).includes(status);

export function LedgerTransactionsPage() {
  const formatCurrency = useFormatCurrency();
  const { t } = useTranslation(['ledger', 'common']);

  // Added: Filter state
  const [accountId, setAccountId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus>('');

  // Added: Fetch ledger accounts for filter dropdown
  const { data: accounts } = useQuery({
    queryKey: ['ledger-accounts'],
    queryFn: () => listLedgerAccounts(),
  });

  // Added: Fetch transactions with filters
  // NOTE: do not retry on 403 — module-disabled is permanent until admin enables it
  const { data: transactions, isLoading, error, refetch } = useQuery({
    queryKey: ['ledger-transactions', accountId, startDate, endDate, statusFilter],
    queryFn: () => listLedgerTransactions({
      max: 100,
      sort: 'transactionDate',
      order: 'desc',
      accountId: accountId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 401) return false;
      return failureCount < 2;
    },
  });

  // Added: Filter transactions by status client-side (API may not support status filter)
  const filteredTransactions = statusFilter
    ? transactions?.filter((tx) => tx.status === statusFilter)
    : transactions;

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
  };

  const hasFilters = accountId || startDate || endDate || statusFilter;

  return (
    <div className="flex flex-col gap-6" data-testid="ledger-transactions-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="ledger-transactions-heading">
            {t('transactions.title')}
          </h1>
          <p className="text-subtle-text">{t('transactions.subtitle')}</p>
          <HelpLink section="ledger-transactions" className="mt-1 self-start" />
        </div>
        <Link
          to="/accounting/journal-entry/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="new-journal-entry-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          {t('transactions.newJournalEntry')}
        </Link>
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
              {t('transactions.filters.account')}
            </label>
            <select
              id="ledger-account-filter"
              name="ledger-account-filter"
              aria-label={t('transactions.filters.accountAria')}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
              data-testid="account-filter"
            >
              <option value="">{t('filters.all')}</option>
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
            label={t('transactions.filters.from')}
            ariaLabel={t('transactions.filters.fromAria')}
            emptyHint={t('common:dateFilter.emptyHint')}
            id="ledger-start-date-filter"
            value={startDate}
            onChange={setStartDate}
            containerClassName="min-w-[150px]"
            className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
            data-testid="start-date-filter"
          />

          {/* End Date */}
          <DateFilterField
            label={t('transactions.filters.to')}
            ariaLabel={t('transactions.filters.toAria')}
            emptyHint={t('common:dateFilter.emptyHint')}
            id="ledger-end-date-filter"
            value={endDate}
            onChange={setEndDate}
            containerClassName="min-w-[150px]"
            className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
            data-testid="end-date-filter"
          />

          {/* Status Filter */}
          <div className="min-w-[140px]">
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1" htmlFor="ledger-status-filter">{t('transactions.filters.status')}</label>
            <select
              id="ledger-status-filter"
              name="ledger-status-filter"
              aria-label={t('transactions.filters.statusAria')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TransactionStatus)}
              className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
              data-testid="status-filter"
            >
              <option value="">{t('transactions.filters.allStatus')}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>{t(`transactions.statuses.${status}`)}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark text-sm hover:bg-primary/5"
              data-testid="clear-filters-button"
            >
              {t('common:actions.clear')}
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="ledger-table-container">
        {isLoading ? (
          <div className="p-8 text-center text-subtle-text" data-testid="ledger-loading">
            {t('transactions.loading')}
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
              {hasFilters ? t('transactions.emptyFilteredTitle') : t('transactions.emptyTitle')}
            </h3>
            <p className="text-subtle-text mb-4">
              {hasFilters ? t('transactions.emptyFilteredBody') : t('transactions.emptyBody')}
            </p>
            {!hasFilters && (
              <Link
                to="/accounting/journal-entry/new"
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
                data-testid="create-first-entry-button"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                {t('transactions.createJournalEntry')}
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="ledger-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">{t('transactions.transactionDate')}</th>
                  <th className="px-6 py-3 text-left">{t('transactions.reference')}</th>
                  <th className="px-6 py-3 text-left">{t('transactions.account')}</th>
                  <th className="px-6 py-3 text-left">{t('transactions.description')}</th>
                  <th className="px-6 py-3 text-right">{t('transactions.debit')}</th>
                  <th className="px-6 py-3 text-right">{t('transactions.credit')}</th>
                  <th className="px-6 py-3 text-center">{t('transactions.status')}</th>
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
                      <td className="px-6 py-4 text-text-light dark:text-text-dark">
                        {tx.transactionDate}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-primary">{tx.transactionNumber || tx.reference || '-'}</span>
                      </td>
                      <td className="px-6 py-4 text-text-light dark:text-text-dark">
                        {tx.ledgerAccount ? (
                          <span>
                            <span className="font-mono text-subtle-text">{tx.ledgerAccount.code}</span>
                            {' '}
                            {tx.ledgerAccount.name}
                          </span>
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
                          {/* Changed (SOUPFIN-164): translated badge; an unknown status shows as sent */}
                          {isKnownStatus(tx.status || 'DRAFT')
                            ? t(`transactions.statusBadges.${(tx.status || 'DRAFT') as KnownStatus}`)
                            : tx.status}
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
            {t('transactions.summary.showing', { count: filteredTransactions.length })}
            {hasFilters && ` ${t('transactions.summary.filtered')}`}
          </span>
          <div className="flex gap-6">
            <span>
              {t('transactions.summary.totalDebits')}{' '}
              <span className="font-medium text-text-light dark:text-text-dark">
                {formatCurrency(filteredTransactions
                  .filter((tx: LedgerTransaction) => tx.transactionState === 'DEBIT')
                  .reduce((sum: number, tx: LedgerTransaction) => sum + (tx.amount || 0), 0))}
              </span>
            </span>
            <span>
              {t('transactions.summary.totalCredits')}{' '}
              <span className="font-medium text-info">
                {formatCurrency(filteredTransactions
                  .filter((tx: LedgerTransaction) => tx.transactionState === 'CREDIT')
                  .reduce((sum: number, tx: LedgerTransaction) => sum + (tx.amount || 0), 0))}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
