/**
 * Trial Balance Report Page
 *
 * Displays all accounts with their debit/credit ending balances.
 * Total debits should equal total credits when books are balanced.
 *
 * Reference: soupfinance-designs/trial-balance-report/
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTrialBalance } from '../../api/endpoints/reports';
import { formatDisplayDate } from '../../utils/date';
import type { TrialBalanceItem } from '../../types';
// Added (SOUPFIN-81): "Need Help?" link to this page's section of the user guide
import { HelpLink } from '../../components/help';
// Changed (SOUPFIN-103): tenant currency instead of a hardcoded 'USD' default
import { CURRENCIES, useCurrencyConfig } from '../../stores';
import { formatAmountWithConfig, type CurrencyConfig } from '../../stores/accountStore';
import { ReportShell } from './ReportShell';
import { getReportDefinition } from './reportRegistry';
import { useReportControls } from './useReportControls';

const DEFINITION = getReportDefinition('trial-balance');

// Added: Trial balance uses subset of LedgerGroup (excludes 'INCOME' which is aliased to 'REVENUE')
type TrialBalanceLedgerGroup = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

/**
 * Format a trial balance amount. Zero renders blank, so each row shows only
 * its debit or its credit.
 *
 * Changed (SOUPFIN-103): totals use the tenant's currency (was a hardcoded
 * 'USD' default). An account row uses the account's own currency; a code the
 * app has no symbol for is shown as a code prefix rather than mislabelled with
 * the tenant's symbol.
 */
function formatAmount(amount: number, tenant: CurrencyConfig, accountCurrency?: string): string {
  if (amount === 0) return '';
  const code = accountCurrency?.toUpperCase();
  if (!code || code === tenant.code) return formatAmountWithConfig(amount, tenant);
  const known = CURRENCIES[code];
  return known
    ? formatAmountWithConfig(amount, known)
    : `${code} ${formatAmountWithConfig(amount, tenant, false)}`;
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
  const tenantCurrency = useCurrencyConfig();
  const formatCurrency = (amount: number, currency?: string) =>
    formatAmount(amount, tenantCurrency, currency);

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
  const controls = useReportControls(DEFINITION.page);
  const filters = controls.filters;
  const tenantCurrency = useCurrencyConfig();
  const formatCurrency = (amount: number) => formatAmount(amount, tenantCurrency);

  // Added: Track which ledger groups are expanded (all expanded by default)
  const [expandedGroups, setExpandedGroups] = useState<Set<TrialBalanceLedgerGroup>>(
    new Set(LEDGER_GROUP_ORDER)
  );

  // Fetch trial balance data
  const {
    data: trialBalance,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['trialBalance', filters],
    queryFn: () => getTrialBalance(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: controls.isRangeValid,
  });

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

  // Check if books are balanced
  const isBalanced =
    trialBalance && Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) < 0.01;

  return (
    <ReportShell
      page={DEFINITION.page}
      controls={controls}
      onRefresh={() => refetch()}
      exportDefinition={DEFINITION}
      exportDisabled={isLoading}
      isFetching={isFetching}
      subtitle={
        <>
          Debit and credit balances for all accounts
          {/* Fix (SOUPFIN-30 #12): format the as-of date for display (was raw ISO). */}
          {trialBalance?.asOf && ` as of ${formatDisplayDate(trialBalance.asOf)}`}
        </>
      }
    >
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
          {/* Added (SOUPFIN-81): the guide's "does not balance" answer, only when it applies */}
          {!isBalanced && <HelpLink section="trial-balance-unbalanced" className="ml-auto" />}
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
          // Fix(SOUPFIN-11): Clarify why the report is empty so users don't assume
          // the module is broken when it's actually a setup or date-range issue.
          <div className="p-12 text-center" data-testid="trial-balance-empty">
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">
              account_balance
            </span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              No accounts found
            </h3>
            <p className="text-subtle-text max-w-md mx-auto">
              {/* Fix (SOUPFIN-33 #2): format the range like the subtitle on line ~233
                  instead of interpolating the raw YYYY-MM-DD filter values. */}
              No account balances found between {formatDisplayDate(filters.from)} and{' '}
              {formatDisplayDate(filters.to)}.
              Try widening the date range, or check that your chart of accounts
              has posted ledger transactions for this period.
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
    </ReportShell>
  );
}
