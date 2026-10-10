/**
 * Profit & Loss Report Page (Income Statement)
 * Reference: soupfinance-designs/income-statement-report/, profit-and-loss-summary-report/
 *
 * Displays Income (Revenue) and Expenses for a period, with Net Profit calculation:
 * Net Profit = Total Income - Total Expenses
 *
 * Changed (SOUPFIN-103): renders inside the shared <ReportShell>, which owns the
 * date range, the comparison period, export and the tenant currency. The page
 * used to format every amount as USD; it now uses the tenant's currency.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getIncomeStatement } from '../../api/endpoints/reports';
import type { ProfitLoss, ProfitLossItem } from '../../types';
import { useFormatCurrency } from '../../stores';
import { formatDisplayDate } from '../../utils/date';
import { ReportShell } from './ReportShell';
import { getReportDefinition } from './reportRegistry';
import { formatDisplayRange } from './reportDates';
import { useReportControls } from './useReportControls';

const DEFINITION = getReportDefinition('profit-loss');

/** Prior-period amount per account name, for the comparison column. */
function amountsByAccount(items: ProfitLossItem[] | undefined): Map<string, number> {
  return new Map((items ?? []).map((item) => [item.account, item.amount]));
}

export function ProfitLossPage() {
  const controls = useReportControls(DEFINITION.page);
  const formatCurrency = useFormatCurrency();
  const { from, to } = controls.range;
  const comparisonRange = controls.comparisonRange;

  // Added: Fetch income statement data using React Query
  const {
    data: profitLoss,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<ProfitLoss>({
    queryKey: ['incomeStatement', from, to],
    queryFn: () => getIncomeStatement({ from, to }),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    enabled: controls.isRangeValid,
  });

  // Added (SOUPFIN-103): the same statement for the comparison period
  const { data: comparison } = useQuery<ProfitLoss>({
    queryKey: ['incomeStatement', comparisonRange?.from, comparisonRange?.to],
    queryFn: () => getIncomeStatement({ from: comparisonRange!.from, to: comparisonRange!.to }),
    staleTime: 5 * 60 * 1000,
    enabled: comparisonRange !== null,
  });
  const compared = comparisonRange ? comparison : undefined;

  // Added: Calculate profit margin percentage
  const profitMargin = useMemo(() => {
    if (!profitLoss || profitLoss.totalIncome === 0) return 0;
    return (profitLoss.netProfit / profitLoss.totalIncome) * 100;
  }, [profitLoss]);

  const comparisonLabel = comparisonRange ? formatDisplayRange(comparisonRange) : '';

  return (
    <ReportShell
      page={DEFINITION.page}
      controls={controls}
      onRefresh={() => refetch()}
      exportDefinition={DEFINITION}
      isFetching={isFetching}
      subtitle={profitLoss ? formatDisplayRange({ from: profitLoss.periodStart, to: profitLoss.periodEnd }) : undefined}
    >
      {/* Loading State */}
      {isLoading && (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
          data-testid="profit-loss-loading"
        >
          <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">sync</span>
          <p className="text-subtle-text">Loading income statement...</p>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div
          className="bg-danger/10 rounded-xl border border-danger/30 p-6 text-center"
          data-testid="profit-loss-error"
        >
          <span className="material-symbols-outlined text-4xl text-danger mb-2">error</span>
          <h3 className="text-lg font-bold text-danger mb-2">Failed to load income statement</h3>
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

      {/* Profit & Loss Data */}
      {profitLoss && !isLoading && !isError && (
        <>
          {/* Summary Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="profit-loss-stats">
            <SummaryCard
              label="Total Income"
              icon="trending_up"
              tone="text-success"
              value={formatCurrency(profitLoss.totalIncome)}
              previous={compared ? formatCurrency(compared.totalIncome) : undefined}
              testId="profit-loss-total-income"
            />
            <SummaryCard
              label="Total Expenses"
              icon="trending_down"
              tone="text-danger"
              value={formatCurrency(profitLoss.totalExpenses)}
              previous={compared ? formatCurrency(compared.totalExpenses) : undefined}
              testId="profit-loss-total-expenses"
            />
            <SummaryCard
              label="Net Profit"
              icon={profitLoss.netProfit >= 0 ? 'show_chart' : 'trending_down'}
              tone={profitLoss.netProfit >= 0 ? 'text-success' : 'text-danger'}
              value={formatCurrency(profitLoss.netProfit)}
              previous={compared ? formatCurrency(compared.netProfit) : undefined}
              testId="profit-loss-net-profit"
              note={`${profitMargin >= 0 ? '+' : ''}${profitMargin.toFixed(1)}% margin`}
            />
          </div>

          {comparisonRange && (
            <p className="text-sm text-subtle-text -mt-2" data-testid="profit-loss-comparison-note">
              {compared
                ? `Previous figures are for ${comparisonLabel}.`
                : `Loading figures for ${comparisonLabel}…`}
            </p>
          )}

          {/* Income and Expenses Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="profit-loss-sections">
            <ProfitLossSection
              title="Income (Revenue)"
              icon="trending_up"
              iconColor="text-success"
              items={profitLoss.income}
              total={profitLoss.totalIncome}
              previousAmounts={compared ? amountsByAccount(compared.income) : undefined}
              previousTotal={compared?.totalIncome}
              testIdPrefix="income"
              isIncome={true}
            />
            <ProfitLossSection
              title="Expenses"
              icon="trending_down"
              iconColor="text-danger"
              items={profitLoss.expenses}
              total={profitLoss.totalExpenses}
              previousAmounts={compared ? amountsByAccount(compared.expenses) : undefined}
              previousTotal={compared?.totalExpenses}
              testIdPrefix="expenses"
              isIncome={false}
            />
          </div>

          {/* Net Profit Summary Row */}
          <div
            className={`rounded-xl border-2 p-6 ${
              profitLoss.netProfit >= 0
                ? 'bg-success/10 border-success'
                : 'bg-danger/10 border-danger'
            }`}
            data-testid="profit-loss-net-profit-summary"
          >
            <div className="flex justify-between items-center gap-4">
              <div>
                <p className="text-lg font-bold text-text-light dark:text-text-dark">
                  Net {profitLoss.netProfit >= 0 ? 'Profit' : 'Loss'}
                </p>
                <p className="text-sm text-subtle-text">
                  Total Income - Total Expenses = {formatCurrency(profitLoss.totalIncome)} - {formatCurrency(profitLoss.totalExpenses)}
                </p>
              </div>
              <p
                className={`text-2xl font-black ${
                  profitLoss.netProfit >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {formatCurrency(profitLoss.netProfit)}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Empty State - No data */}
      {/* Fix(SOUPFIN-11): Empty state message now hints at common causes
          (date range, missing revenue/expense accounts) so users can self-
          diagnose instead of assuming the report is broken. */}
      {!isLoading && !isError && profitLoss && profitLoss.income.length === 0 && profitLoss.expenses.length === 0 && (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
          data-testid="profit-loss-empty"
        >
          <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">trending_up</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No transactions found</h3>
          <p className="text-subtle-text max-w-md mx-auto">
            There are no income or expense transactions between {formatDisplayDate(from)} and{' '}
            {formatDisplayDate(to)}. Try widening the date range, or check that your chart of
            accounts has revenue and expense accounts with posted transactions.
          </p>
        </div>
      )}
    </ReportShell>
  );
}

/**
 * Summary stat card. With a comparison period selected it also shows the
 * previous figure underneath.
 */
interface SummaryCardProps {
  label: string;
  icon: string;
  tone: string;
  value: string;
  previous?: string;
  note?: string;
  testId: string;
}

function SummaryCard({ label, icon, tone, value, previous, note, testId }: SummaryCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
      <div className="flex items-center gap-2">
        <span className={`material-symbols-outlined ${tone}`}>{icon}</span>
        <p className="text-text-light dark:text-text-dark text-base font-medium">{label}</p>
      </div>
      <p className={`${tone} tracking-tight text-2xl font-bold`} data-testid={testId}>
        {value}
      </p>
      {note && <p className="text-sm text-subtle-text">{note}</p>}
      {previous !== undefined && (
        <p className="text-sm text-subtle-text" data-testid={`${testId}-previous`}>
          Previous: {previous}
        </p>
      )}
    </div>
  );
}

/**
 * Profit & Loss Section Component
 * Displays a card with account list and subtotal for income or expenses
 */
interface ProfitLossSectionProps {
  title: string;
  icon: string;
  iconColor: string;
  items: ProfitLossItem[];
  total: number;
  /** Comparison-period amount per account name; undefined when not comparing. */
  previousAmounts?: Map<string, number>;
  previousTotal?: number;
  testIdPrefix: string;
  isIncome: boolean;
}

function ProfitLossSection({
  title,
  icon,
  iconColor,
  items,
  total,
  previousAmounts,
  previousTotal,
  testIdPrefix,
  isIncome,
}: ProfitLossSectionProps) {
  const formatCurrency = useFormatCurrency();
  const comparing = previousAmounts !== undefined;

  return (
    <div
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
      data-testid={`profit-loss-section-${testIdPrefix}`}
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
            <ProfitLossItemRow
              key={`${testIdPrefix}-${index}`}
              item={item}
              previousAmounts={previousAmounts}
              testId={`${testIdPrefix}-item-${index}`}
              isIncome={isIncome}
            />
          ))
        )}
      </div>

      {/* Section Total */}
      <div
        className={`flex justify-between items-center gap-4 px-6 py-4 border-t-2 ${
          isIncome ? 'border-success bg-success/5' : 'border-danger bg-danger/5'
        }`}
        data-testid={`profit-loss-${testIdPrefix}-total`}
      >
        <span className="font-bold text-text-light dark:text-text-dark">Total {title}</span>
        <span className="flex gap-6 items-baseline">
          <span className={`font-bold text-lg ${isIncome ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(total)}
          </span>
          {comparing && (
            <span className="text-sm text-subtle-text" data-testid={`profit-loss-${testIdPrefix}-total-previous`}>
              {formatCurrency(previousTotal ?? 0)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Profit & Loss Item Row Component
 * Displays individual account with amount, supports nested children
 */
interface ProfitLossItemRowProps {
  item: ProfitLossItem;
  previousAmounts?: Map<string, number>;
  testId: string;
  isIncome: boolean;
  depth?: number;
}

function ProfitLossItemRow({ item, previousAmounts, testId, isIncome, depth = 0 }: ProfitLossItemRowProps) {
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
              depth > 0
                ? 'text-subtle-text'
                : isIncome
                  ? 'text-success'
                  : 'text-danger'
            }`}
          >
            {formatCurrency(item.amount)}
          </span>
          {previousAmounts && (
            <span className="text-sm text-subtle-text" data-testid={`${testId}-previous`}>
              {/* An account with no activity in the earlier period shows 0. */}
              {formatCurrency(previousAmounts.get(item.account) ?? 0)}
            </span>
          )}
        </span>
      </div>
      {/* Render children recursively if present */}
      {item.children?.map((child, index) => (
        <ProfitLossItemRow
          key={`${testId}-child-${index}`}
          item={child}
          previousAmounts={previousAmounts}
          testId={`${testId}-child-${index}`}
          isIncome={isIncome}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
