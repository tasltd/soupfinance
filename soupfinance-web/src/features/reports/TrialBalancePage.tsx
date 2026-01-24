/**
 * Trial Balance Report Page
 *
 * Displays all accounts with their debit/credit ending balances.
 * Total debits should equal total credits when books are balanced.
 *
 * Reference: soupfinance-designs/trial-balance-report/
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTrialBalance, exportFinanceReport, type ReportFilters } from '../../api/endpoints/reports';
import type { TrialBalanceItem } from '../../types';

// Added: Trial balance uses subset of LedgerGroup (excludes 'INCOME' which is aliased to 'REVENUE')
type TrialBalanceLedgerGroup = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

// Added: Get current month date range (first day to last day)
function getCurrentMonthRange() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: firstDay.toISOString().split('T')[0],
    to: lastDay.toISOString().split('T')[0],
  };
}

// Added: Format currency with proper thousands separator
function formatCurrency(amount: number, currency = 'USD'): string {
  if (amount === 0) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// Added: Ledger group display configuration
const LEDGER_GROUP_CONFIG: Record<TrialBalanceLedgerGroup, { label: string; icon: string }> = {
  ASSET: { label: 'Assets', icon: 'account_balance_wallet' },
  LIABILITY: { label: 'Liabilities', icon: 'credit_card' },
  EQUITY: { label: 'Equity', icon: 'pie_chart' },
  REVENUE: { label: 'Revenue', icon: 'trending_up' },
  EXPENSE: { label: 'Expenses', icon: 'receipt_long' },
};

// Added: Order of ledger groups for display
const LEDGER_GROUP_ORDER: TrialBalanceLedgerGroup[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

/**
 * Collapsible account group section component
 */
interface AccountGroupProps {
  group: TrialBalanceLedgerGroup;
  accounts: TrialBalanceItem[];
  isExpanded: boolean;
  onToggle: () => void;
}

function AccountGroup({ group, accounts, isExpanded, onToggle }: AccountGroupProps) {
  const config = LEDGER_GROUP_CONFIG[group];

  // Calculate group totals
  const groupTotalDebit = accounts.reduce((sum, acc) => sum + acc.endingDebit, 0);
  const groupTotalCredit = accounts.reduce((sum, acc) => sum + acc.endingCredit, 0);

  if (accounts.length === 0) return null;

  return (
    <>
      {/* Group Header Row - Clickable for accordion */}
      <tr
        className="bg-background-light dark:bg-background-dark cursor-pointer hover:bg-primary/5"
        onClick={onToggle}
        data-testid={`trial-balance-group-${group}`}
      >
        <td colSpan={2} className="px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-lg text-primary">
              {isExpanded ? 'expand_more' : 'chevron_right'}
            </span>
            <span className="material-symbols-outlined text-lg text-subtle-text">
              {config.icon}
            </span>
            <span className="font-bold text-text-light dark:text-text-dark">
              {config.label}
            </span>
            <span className="text-xs text-subtle-text">({accounts.length} accounts)</span>
          </div>
        </td>
        <td className="px-6 py-3 text-right font-semibold font-mono text-text-light dark:text-text-dark">
          {formatCurrency(groupTotalDebit)}
        </td>
        <td className="px-6 py-3 text-right font-semibold font-mono text-text-light dark:text-text-dark">
          {formatCurrency(groupTotalCredit)}
        </td>
      </tr>

      {/* Account Rows - Shown when expanded */}
      {isExpanded &&
        accounts.map((account) => (
          <tr
            key={account.id}
            className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
            data-testid={`trial-balance-account-${account.id}`}
          >
            <td className="px-6 py-3 pl-14 text-subtle-text">{account.currency}</td>
            <td className="px-6 py-3 text-text-light dark:text-text-dark">{account.name}</td>
            <td className="px-6 py-3 text-right font-mono text-text-light dark:text-text-dark">
              {formatCurrency(account.endingDebit, account.currency)}
            </td>
            <td className="px-6 py-3 text-right font-mono text-text-light dark:text-text-dark">
              {formatCurrency(account.endingCredit, account.currency)}
            </td>
          </tr>
        ))}
    </>
  );
}

/**
 * Trial Balance Report Page Component
 */
export function TrialBalancePage() {
  // Added: Date filter state with default to current month
  const defaultRange = useMemo(() => getCurrentMonthRange(), []);
  const [filters, setFilters] = useState<ReportFilters>({
    from: defaultRange.from,
    to: defaultRange.to,
  });

  // Added: Track which ledger groups are expanded (all expanded by default)
  const [expandedGroups, setExpandedGroups] = useState<Set<TrialBalanceLedgerGroup>>(
    new Set(LEDGER_GROUP_ORDER)
  );

  // Added: Export loading state
  const [exportLoading, setExportLoading] = useState<string | null>(null);

  // Fetch trial balance data
  const {
    data: trialBalance,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['trialBalance', filters],
    queryFn: () => getTrialBalance(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Handle date filter changes
  const handleFilterChange = (field: 'from' | 'to', value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  // Toggle ledger group expansion
  const toggleGroup = (group: TrialBalanceLedgerGroup) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(group)) {
        newSet.delete(group);
      } else {
        newSet.add(group);
      }
      return newSet;
    });
  };

  // Expand/collapse all groups
  const toggleAllGroups = () => {
    if (expandedGroups.size === LEDGER_GROUP_ORDER.length) {
      setExpandedGroups(new Set());
    } else {
      setExpandedGroups(new Set(LEDGER_GROUP_ORDER));
    }
  };

  // Handle export
  const handleExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    setExportLoading(format);
    try {
      const blob = await exportFinanceReport('trialBalance', filters, format);
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trial-balance-${filters.from}-to-${filters.to}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExportLoading(null);
    }
  };

  // Check if books are balanced
  const isBalanced =
    trialBalance && Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) < 0.01;

  return (
    <div className="flex flex-col gap-6" data-testid="trial-balance-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="trial-balance-heading"
          >
            Trial Balance
          </h1>
          <p className="text-subtle-text">
            Debit and credit balances for all accounts
            {trialBalance?.asOf && ` as of ${trialBalance.asOf}`}
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleExport('pdf')}
            disabled={exportLoading !== null || isLoading}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-bold text-sm hover:bg-primary/10 disabled:opacity-50"
            data-testid="trial-balance-export-pdf"
          >
            <span className="material-symbols-outlined text-base">picture_as_pdf</span>
            {exportLoading === 'pdf' ? 'Exporting...' : 'PDF'}
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            disabled={exportLoading !== null || isLoading}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-bold text-sm hover:bg-primary/10 disabled:opacity-50"
            data-testid="trial-balance-export-excel"
          >
            <span className="material-symbols-outlined text-base">table_view</span>
            {exportLoading === 'xlsx' ? 'Exporting...' : 'Excel'}
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exportLoading !== null || isLoading}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-bold text-sm hover:bg-primary/10 disabled:opacity-50"
            data-testid="trial-balance-export-csv"
          >
            <span className="material-symbols-outlined text-base">download</span>
            {exportLoading === 'csv' ? 'Exporting...' : 'CSV'}
          </button>
        </div>
      </div>

      {/* Filter Section */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6"
        data-testid="trial-balance-filters"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
          {/* From Date */}
          <label className="flex flex-col">
            <span className="text-sm font-medium text-text-light dark:text-text-dark pb-2">
              From Date
            </span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => handleFilterChange('from', e.target.value)}
              className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary/50 focus:border-primary"
              data-testid="trial-balance-filter-from"
            />
          </label>

          {/* To Date */}
          <label className="flex flex-col">
            <span className="text-sm font-medium text-text-light dark:text-text-dark pb-2">
              To Date
            </span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => handleFilterChange('to', e.target.value)}
              className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary/50 focus:border-primary"
              data-testid="trial-balance-filter-to"
            />
          </label>

          {/* Spacer for alignment */}
          <div className="hidden lg:block" />

          {/* Action Buttons */}
          <div className="flex gap-3 justify-start lg:justify-end">
            <button
              onClick={() => setFilters(defaultRange)}
              className="flex-1 lg:flex-none h-12 px-4 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-bold text-sm hover:bg-primary/10"
              data-testid="trial-balance-filter-reset"
            >
              Reset
            </button>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex-1 lg:flex-none h-12 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
              data-testid="trial-balance-filter-apply"
            >
              {isLoading ? 'Loading...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Balance Status Banner */}
      {trialBalance && !isLoading && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg border ${
            isBalanced
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-danger/10 border-danger/30 text-danger'
          }`}
          data-testid="trial-balance-status"
        >
          <span className="material-symbols-outlined">
            {isBalanced ? 'check_circle' : 'warning'}
          </span>
          <span className="font-medium">
            {isBalanced
              ? 'Books are balanced - Total Debits equal Total Credits'
              : `Books are NOT balanced - Difference: ${formatCurrency(Math.abs(trialBalance.totalDebit - trialBalance.totalCredit))}`}
          </span>
        </div>
      )}

      {/* Trial Balance Table */}
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
        data-testid="trial-balance-table-container"
      >
        {isLoading ? (
          // Loading State
          <div className="p-12 text-center" data-testid="trial-balance-loading">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4 animate-pulse">
              hourglass_empty
            </span>
            <p className="text-subtle-text">Loading trial balance...</p>
          </div>
        ) : isError ? (
          // Error State
          <div className="p-12 text-center" data-testid="trial-balance-error">
            <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              Failed to load report
            </h3>
            <p className="text-subtle-text mb-4">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Try Again
            </button>
          </div>
        ) : !trialBalance ||
          LEDGER_GROUP_ORDER.every((g) => trialBalance.accounts[g].length === 0) ? (
          // Empty State
          <div className="p-12 text-center" data-testid="trial-balance-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">
              account_balance
            </span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              No accounts found
            </h3>
            <p className="text-subtle-text">
              No account balances found for the selected date range.
            </p>
          </div>
        ) : (
          // Data Table
          <>
            {/* Table Header with Expand/Collapse All */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark">
              <span className="text-sm font-medium text-subtle-text">
                {LEDGER_GROUP_ORDER.reduce((sum, g) => sum + trialBalance.accounts[g].length, 0)}{' '}
                accounts
              </span>
              <button
                onClick={toggleAllGroups}
                className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                data-testid="trial-balance-toggle-all"
              >
                <span className="material-symbols-outlined text-base">
                  {expandedGroups.size === LEDGER_GROUP_ORDER.length
                    ? 'unfold_less'
                    : 'unfold_more'}
                </span>
                {expandedGroups.size === LEDGER_GROUP_ORDER.length ? 'Collapse All' : 'Expand All'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm" data-testid="trial-balance-table">
                <thead className="border-b border-border-light dark:border-border-dark">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left font-semibold text-text-light dark:text-text-dark"
                    >
                      Currency
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left font-semibold text-text-light dark:text-text-dark"
                    >
                      Account Name
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-right font-semibold text-text-light dark:text-text-dark"
                    >
                      Debit
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-right font-semibold text-text-light dark:text-text-dark"
                    >
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LEDGER_GROUP_ORDER.map((group) => (
                    <AccountGroup
                      key={group}
                      group={group}
                      accounts={trialBalance.accounts[group]}
                      isExpanded={expandedGroups.has(group)}
                      onToggle={() => toggleGroup(group)}
                    />
                  ))}
                </tbody>

                {/* Totals Footer */}
                <tfoot className="bg-background-light dark:bg-background-dark border-t-2 border-border-light dark:border-border-dark">
                  <tr data-testid="trial-balance-totals">
                    <th
                      scope="row"
                      colSpan={2}
                      className="px-6 py-4 text-left text-base font-bold text-text-light dark:text-text-dark"
                    >
                      Totals
                    </th>
                    <td
                      className="px-6 py-4 text-right text-base font-bold font-mono text-text-light dark:text-text-dark"
                      data-testid="trial-balance-total-debit"
                    >
                      {formatCurrency(trialBalance.totalDebit)}
                    </td>
                    <td
                      className="px-6 py-4 text-right text-base font-bold font-mono text-text-light dark:text-text-dark"
                      data-testid="trial-balance-total-credit"
                    >
                      {formatCurrency(trialBalance.totalCredit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
