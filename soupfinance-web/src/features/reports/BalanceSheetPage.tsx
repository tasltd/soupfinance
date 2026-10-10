/**
 * Balance Sheet Report Page
 * Reference: soupfinance-designs/balance-sheet-report/
 *
 * Displays Assets, Liabilities, and Equity as of a specific date, with the
 * accounting equation check: Assets = Liabilities + Equity
 *
 * Changed (SOUPFIN-103): renders inside the shared <ReportShell>, which owns the
 * as-of date, the comparison date, export and the tenant currency. Amounts were
 * hardcoded to USD; they now follow the tenant's currency.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBalanceSheetDirect, type ReportFilters } from '../../api/endpoints/reports';
import type { BalanceSheet, BalanceSheetItem } from '../../types';
import { useFormatCurrency } from '../../stores';
import { formatDisplayDate } from '../../utils/date';
import { ReportShell } from './ReportShell';
import { getReportDefinition } from './reportRegistry';
import { REPORT_MIN_DATE } from './reportDates';
import { useReportControls } from './useReportControls';

const DEFINITION = getReportDefinition('balance-sheet');

/** Comparison-date balance per account name. */
function balancesByAccount(items: BalanceSheetItem[] | undefined): Map<string, number> {
  return new Map((items ?? []).map((item) => [item.account, item.balance]));
}

export function BalanceSheetPage() {
  const controls = useReportControls(DEFINITION.page);
  const formatCurrency = useFormatCurrency();
  const asOfDate = controls.asOf;
  const comparisonAsOf = controls.comparisonAsOf;

  // Added: Fetch balance sheet data using React Query
  const {
    data: balanceSheet,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<BalanceSheet>({
    queryKey: ['balanceSheet', asOfDate],
    queryFn: () => getBalanceSheetDirect(asOfDate),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: controls.isRangeValid,
  });

  // Added (SOUPFIN-103): the balance sheet at the comparison date
  const { data: comparison } = useQuery<BalanceSheet>({
    queryKey: ['balanceSheet', comparisonAsOf],
    queryFn: () => getBalanceSheetDirect(comparisonAsOf!),
    staleTime: 5 * 60 * 1000,
    enabled: comparisonAsOf !== null,
  });
  const compared = comparisonAsOf ? comparison : undefined;

  // Added: Calculate accounting equation check
  const equationCheck = useMemo(() => {
    if (!balanceSheet) return { balanced: true, difference: 0 };
    const liabilitiesPlusEquity = balanceSheet.totalLiabilities + balanceSheet.totalEquity;
    const difference = balanceSheet.totalAssets - liabilitiesPlusEquity;
    return {
      balanced: Math.abs(difference) < 0.01, // Account for floating point
      difference,
    };
  }, [balanceSheet]);

  // Balance sheet is as-of, not period-based: the export asks for everything
  // up to the as-of date, as the page did before the shell.
  const exportFilters = useMemo<ReportFilters>(
    () => ({ from: REPORT_MIN_DATE, to: asOfDate }),
    [asOfDate]
  );

  return (
    <ReportShell
      page={DEFINITION.page}
      controls={controls}
      onRefresh={() => refetch()}
      exportDefinition={DEFINITION}
      exportFilters={exportFilters}
      isFetching={isFetching}
      subtitle={`As of ${formatDisplayDate(balanceSheet?.asOf ?? asOfDate)}`}
    >
      {/* Loading State */}
      {isLoading && (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
          data-testid="balance-sheet-loading"
        >
          <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">sync</span>
          <p className="text-subtle-text">Loading balance sheet...</p>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div
          className="bg-danger/10 rounded-xl border border-danger/30 p-6 text-center"
          data-testid="balance-sheet-error"
        >
          <span className="material-symbols-outlined text-4xl text-danger mb-2">error</span>
          <h3 className="text-lg font-bold text-danger mb-2">Failed to load balance sheet</h3>
          <p className="text-subtle-text mb-4">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => refetch()}
            className="h-10 px-4 bg-danger text-white rounded-lg hover:bg-danger/90 font-bold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Balance Sheet Data */}
      {balanceSheet && !isLoading && !isError && (
        <>
          {/* Summary Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="balance-sheet-stats">
            {/* Total Assets Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">account_balance</span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Total Assets</p>
              </div>
              <p
                className="text-text-light dark:text-text-dark tracking-tight text-2xl font-bold"
                data-testid="balance-sheet-total-assets"
              >
                {formatCurrency(balanceSheet.totalAssets)}
              </p>
              {compared && (
                <p className="text-sm text-subtle-text" data-testid="balance-sheet-total-assets-previous">
                  Previous: {formatCurrency(compared.totalAssets)}
                </p>
              )}
            </div>

            {/* Total Liabilities Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-danger">credit_card</span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Total Liabilities</p>
              </div>
              <p
                className="text-text-light dark:text-text-dark tracking-tight text-2xl font-bold"
                data-testid="balance-sheet-total-liabilities"
              >
                {formatCurrency(balanceSheet.totalLiabilities)}
              </p>
              {compared && (
                <p className="text-sm text-subtle-text" data-testid="balance-sheet-total-liabilities-previous">
                  Previous: {formatCurrency(compared.totalLiabilities)}
                </p>
              )}
            </div>

            {/* Total Equity Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-success">savings</span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Total Equity</p>
              </div>
              <p
                className="text-text-light dark:text-text-dark tracking-tight text-2xl font-bold"
                data-testid="balance-sheet-total-equity"
              >
                {formatCurrency(balanceSheet.totalEquity)}
              </p>
              {compared && (
                <p className="text-sm text-subtle-text" data-testid="balance-sheet-total-equity-previous">
                  Previous: {formatCurrency(compared.totalEquity)}
                </p>
              )}
            </div>
          </div>

          {comparisonAsOf && (
            <p className="text-sm text-subtle-text -mt-2" data-testid="balance-sheet-comparison-note">
              {compared
                ? `Previous figures are as of ${formatDisplayDate(comparisonAsOf)}.`
                : `Loading figures as of ${formatDisplayDate(comparisonAsOf)}…`}
            </p>
          )}

          {/* Accounting Equation Check */}
          <div
            className={`rounded-xl p-4 border ${
              equationCheck.balanced
                ? 'bg-success/10 border-success/30'
                : 'bg-warning/10 border-warning/30'
            }`}
            data-testid="balance-sheet-equation"
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-2xl ${
                    equationCheck.balanced ? 'text-success' : 'text-warning'
                  }`}
                >
                  {equationCheck.balanced ? 'check_circle' : 'warning'}
                </span>
                <div>
                  <p className="font-bold text-text-light dark:text-text-dark">
                    Accounting Equation: Assets = Liabilities + Equity
                  </p>
                  <p className="text-sm text-subtle-text">
                    {formatCurrency(balanceSheet.totalAssets)} ={' '}
                    {formatCurrency(balanceSheet.totalLiabilities)} +{' '}
                    {formatCurrency(balanceSheet.totalEquity)}
                  </p>
                </div>
              </div>
              {equationCheck.balanced ? (
                <span className="text-success font-bold">Balanced</span>
              ) : (
                <span className="text-warning font-bold">
                  Difference: {formatCurrency(equationCheck.difference)}
                </span>
              )}
            </div>
          </div>

          {/* Balance Sheet Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" data-testid="balance-sheet-sections">
            {/* Assets Section */}
            <BalanceSheetSection
              title="Assets"
              icon="account_balance"
              iconColor="text-primary"
              items={balanceSheet.assets}
              total={balanceSheet.totalAssets}
              previousBalances={compared ? balancesByAccount(compared.assets) : undefined}
              previousTotal={compared?.totalAssets}
              testIdPrefix="assets"
            />

            {/* Liabilities Section */}
            <BalanceSheetSection
              title="Liabilities"
              icon="credit_card"
              iconColor="text-danger"
              items={balanceSheet.liabilities}
              total={balanceSheet.totalLiabilities}
              previousBalances={compared ? balancesByAccount(compared.liabilities) : undefined}
              previousTotal={compared?.totalLiabilities}
              testIdPrefix="liabilities"
            />

            {/* Equity Section */}
            <BalanceSheetSection
              title="Equity"
              icon="savings"
              iconColor="text-success"
              items={balanceSheet.equity}
              total={balanceSheet.totalEquity}
              previousBalances={compared ? balancesByAccount(compared.equity) : undefined}
              previousTotal={compared?.totalEquity}
              testIdPrefix="equity"
            />
          </div>

          {/* Grand Total Row */}
          <div
            className="bg-surface-light dark:bg-surface-dark rounded-xl border-2 border-text-light dark:border-text-dark p-6"
            data-testid="balance-sheet-grand-total"
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-lg font-bold text-text-light dark:text-text-dark">
                  Total Liabilities & Equity
                </p>
                <p className="text-sm text-subtle-text">Should equal Total Assets</p>
              </div>
              <p className="text-2xl font-black text-text-light dark:text-text-dark">
                {formatCurrency(balanceSheet.totalLiabilities + balanceSheet.totalEquity)}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Empty State - No data */}
      {/* Fix(SOUPFIN-11): Empty-state copy now distinguishes "no data" from
          common setup issues so users know what to check next. */}
      {!isLoading && !isError && balanceSheet && balanceSheet.assets.length === 0 && balanceSheet.liabilities.length === 0 && balanceSheet.equity.length === 0 && (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
          data-testid="balance-sheet-empty"
        >
          <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">account_balance</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No accounts found</h3>
          <p className="text-subtle-text max-w-md mx-auto">
            There are no ledger accounts with balances as of {formatDisplayDate(asOfDate)}.
            Try a later date, or check that your chart of accounts contains
            asset, liability, and equity accounts with posted transactions.
          </p>
        </div>
      )}
    </ReportShell>
  );
}

/**
 * Balance Sheet Section Component
 * Displays a card with account list and subtotal
 */
interface BalanceSheetSectionProps {
  title: string;
  icon: string;
  iconColor: string;
  items: BalanceSheetItem[];
  total: number;
  /** Comparison-date balance per account name; undefined when not comparing. */
  previousBalances?: Map<string, number>;
  previousTotal?: number;
  testIdPrefix: string;
}

function BalanceSheetSection({
  title,
  icon,
  iconColor,
  items,
  total,
  previousBalances,
  previousTotal,
  testIdPrefix,
}: BalanceSheetSectionProps) {
  const formatCurrency = useFormatCurrency();
  const comparing = previousBalances !== undefined;

  return (
    <div
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
      data-testid={`balance-sheet-section-${testIdPrefix}`}
    >
      {/* Section Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined ${iconColor}`}>{icon}</span>
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">{title}</h2>
        </div>
        {comparing ? (
          <span className="flex gap-6 text-xs font-semibold uppercase text-subtle-text">
            <span>Current</span>
            <span>Previous</span>
          </span>
        ) : (
          <span className="text-sm text-subtle-text">{items.length} accounts</span>
        )}
      </div>

      {/* Account List */}
      <div className="divide-y divide-border-light dark:divide-border-dark">
        {items.length === 0 ? (
          <div className="p-6 text-center text-subtle-text">
            <p>No {title.toLowerCase()} accounts</p>
          </div>
        ) : (
          items.map((item, index) => (
            <BalanceSheetItemRow
              key={`${testIdPrefix}-${index}`}
              item={item}
              previousBalances={previousBalances}
              testId={`${testIdPrefix}-item-${index}`}
            />
          ))
        )}
      </div>

      {/* Section Total */}
      <div
        className="flex justify-between items-center gap-4 px-6 py-4 border-t-2 border-text-light dark:border-text-dark bg-background-light dark:bg-background-dark"
        data-testid={`balance-sheet-${testIdPrefix}-total`}
      >
        <span className="font-bold text-text-light dark:text-text-dark">Total {title}</span>
        <span className="flex gap-6 items-baseline">
          <span className="font-bold text-lg text-text-light dark:text-text-dark">
            {formatCurrency(total)}
          </span>
          {comparing && (
            <span className="text-sm text-subtle-text" data-testid={`balance-sheet-${testIdPrefix}-total-previous`}>
              {formatCurrency(previousTotal ?? 0)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Balance Sheet Item Row Component
 * Displays individual account with balance, supports nested children
 */
interface BalanceSheetItemRowProps {
  item: BalanceSheetItem;
  previousBalances?: Map<string, number>;
  testId: string;
  depth?: number;
}

function BalanceSheetItemRow({ item, previousBalances, testId, depth = 0 }: BalanceSheetItemRowProps) {
  const formatCurrency = useFormatCurrency();
  // Added: Indentation based on depth for hierarchical display
  const paddingLeft = 24 + depth * 16; // Base 24px + 16px per level

  return (
    <>
      <div
        className="flex justify-between items-center gap-4 py-3 hover:bg-primary/5 transition-colors"
        style={{ paddingLeft: `${paddingLeft}px`, paddingRight: '24px' }}
        data-testid={testId}
      >
        <span
          className={`text-sm ${depth > 0 ? 'text-subtle-text' : 'text-text-light dark:text-text-dark'}`}
        >
          {item.account}
        </span>
        <span className="flex gap-6 items-baseline">
          <span
            className={`text-sm font-medium ${
              depth > 0 ? 'text-subtle-text' : 'text-text-light dark:text-text-dark'
            }`}
          >
            {formatCurrency(item.balance)}
          </span>
          {previousBalances && (
            <span className="text-sm text-subtle-text" data-testid={`${testId}-previous`}>
              {formatCurrency(previousBalances.get(item.account) ?? 0)}
            </span>
          )}
        </span>
      </div>
      {/* Render children recursively if present */}
      {item.children?.map((child, index) => (
        <BalanceSheetItemRow
          key={`${testId}-child-${index}`}
          item={child}
          previousBalances={previousBalances}
          testId={`${testId}-child-${index}`}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
