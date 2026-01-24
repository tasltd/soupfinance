/**
 * Ledger Transactions Page
 * Lists all journal entries and transactions with filters
 *
 * Added: Full API integration with listLedgerTransactions endpoint
 * Added: Filter by account, date range, and status
 * Added: Loading, error, and empty states
 * Added: data-testid attributes for E2E testing
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listLedgerTransactions, listLedgerAccounts } from '../../api/endpoints/ledger';
import type { LedgerTransaction, LedgerAccount, LedgerState } from '../../types';

// Added: Transaction status type for filtering
type TransactionStatus = 'DRAFT' | 'PENDING' | 'POSTED' | 'REVERSED' | '';

export function LedgerTransactionsPage() {
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
  const { data: transactions, isLoading, error } = useQuery({
    queryKey: ['ledger-transactions', accountId, startDate, endDate, statusFilter],
    queryFn: () => listLedgerTransactions({
      max: 100,
      sort: 'transactionDate',
      order: 'desc',
      accountId: accountId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
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
      return { text: `$${(amount || 0).toFixed(2)}`, class: 'text-text-light dark:text-text-dark' };
    } else if (state === 'CREDIT') {
      return { text: `$${(amount || 0).toFixed(2)}`, class: 'text-info' };
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
            Ledger Transactions
          </h1>
          <p className="text-subtle-text">View all journal entries and transactions</p>
        </div>
        <Link
          to="/accounting/journal-entry/new"
          className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90"
          data-testid="new-journal-entry-button"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          New Journal Entry
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4" data-testid="ledger-filters">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Account Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">Account</label>
            <select
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
          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
              data-testid="start-date-filter"
            />
          </div>

          {/* End Date */}
          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
              data-testid="end-date-filter"
            />
          </div>

          {/* Status Filter */}
          <div className="min-w-[140px]">
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">Status</label>
            <select
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
          <div className="p-12 text-center" data-testid="ledger-error">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load transactions</h3>
            <p className="text-subtle-text mb-4">There was an error loading ledger transactions. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Retry
            </button>
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
            {hasFilters && ' (filtered)'}
          </span>
          <div className="flex gap-6">
            <span>
              Total Debits:{' '}
              <span className="font-medium text-text-light dark:text-text-dark">
                ${filteredTransactions
                  .filter((tx: LedgerTransaction) => tx.transactionState === 'DEBIT')
                  .reduce((sum: number, tx: LedgerTransaction) => sum + (tx.amount || 0), 0)
                  .toFixed(2)}
              </span>
            </span>
            <span>
              Total Credits:{' '}
              <span className="font-medium text-info">
                ${filteredTransactions
                  .filter((tx: LedgerTransaction) => tx.transactionState === 'CREDIT')
                  .reduce((sum: number, tx: LedgerTransaction) => sum + (tx.amount || 0), 0)
                  .toFixed(2)}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
