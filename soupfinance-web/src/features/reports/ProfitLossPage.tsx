/**
 * Profit & Loss Report Page (Income Statement)
 * Reference: soupfinance-designs/income-statement-report/, profit-and-loss-summary-report/
 *
 * Displays Income (Revenue) and Expenses for a period, with Net Profit calculation:
 * Net Profit = Total Income - Total Expenses
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getIncomeStatement, exportFinanceReport, type ReportFilters } from '../../api/endpoints/reports';
import type { ProfitLoss, ProfitLossItem } from '../../types';

// Added: Currency formatter for consistent display
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Added: Format date for display (e.g., "January 1, 2026 - January 31, 2026")
function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
}

// Added: Get first day of current month in YYYY-MM-DD format
function getFirstDayOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

// Added: Get today's date in YYYY-MM-DD format
function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function ProfitLossPage() {
  // Added: State for date range filter with defaults to current month
  const [fromDate, setFromDate] = useState<string>(getFirstDayOfMonth());
  const [toDate, setToDate] = useState<string>(getTodayISO());

  // Added: Fetch income statement data using React Query
  const {
    data: profitLoss,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ProfitLoss>({
    queryKey: ['incomeStatement', fromDate, toDate],
    queryFn: () => getIncomeStatement({ from: fromDate, to: toDate }),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  // Added: Calculate profit margin percentage
  const profitMargin = useMemo(() => {
    if (!profitLoss || profitLoss.totalIncome === 0) return 0;
    return (profitLoss.netProfit / profitLoss.totalIncome) * 100;
  }, [profitLoss]);

  // Added: Export handler for PDF/Excel/CSV
  const handleExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    try {
      const filters: ReportFilters = {
        from: fromDate,
        to: toDate,
      };
      const blob = await exportFinanceReport('incomeStatement', filters, format);
      const url = URL.createObjectURL(blob);

      // Create download link
      const link = document.createElement('a');
      link.href = url;
      const extension = format === 'xlsx' ? 'xlsx' : format;
      link.download = `profit-loss-${fromDate}-to-${toDate}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      // NOTE: In production, show toast notification for export errors
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="profit-loss-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="profit-loss-heading"
          >
            Profit & Loss
          </h1>
          <p className="text-subtle-text">
            {profitLoss
              ? formatDateRange(profitLoss.periodStart, profitLoss.periodEnd)
              : 'Income statement for the period'}
          </p>
        </div>
      </div>

      {/* Toolbar: Date Range Pickers + Export Buttons */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-border-light dark:border-border-dark"
        data-testid="profit-loss-toolbar"
      >
        {/* Date Range Pickers */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="fromDate" className="text-sm font-medium text-text-light dark:text-text-dark">
              From:
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text">
                calendar_today
              </span>
              <input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="pl-10 pr-4 py-2 h-10 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary/50 focus:border-primary"
                data-testid="profit-loss-from-date"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="toDate" className="text-sm font-medium text-text-light dark:text-text-dark">
              To:
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text">
                calendar_today
              </span>
              <input
                id="toDate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="pl-10 pr-4 py-2 h-10 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary/50 focus:border-primary"
                data-testid="profit-loss-to-date"
              />
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 h-10 px-4 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark hover:bg-background-light dark:hover:bg-background-dark text-text-light dark:text-text-dark"
            data-testid="profit-loss-refresh"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            Refresh
          </button>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('pdf')}
            className="flex items-center justify-center gap-2 h-10 px-4 border border-primary rounded-lg text-primary hover:bg-primary/10"
            data-testid="profit-loss-export-pdf"
          >
            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
            <span className="text-sm font-bold">PDF</span>
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="flex items-center justify-center gap-2 h-10 px-4 bg-primary text-white rounded-lg hover:bg-primary/90"
            data-testid="profit-loss-export-excel"
          >
            <span className="material-symbols-outlined text-lg">grid_on</span>
            <span className="text-sm font-bold">Excel</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center justify-center gap-2 h-10 px-4 border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark hover:bg-background-light dark:hover:bg-background-dark"
            data-testid="profit-loss-export-csv"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            <span className="text-sm font-bold">CSV</span>
          </button>
        </div>
      </div>

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
            {/* Total Income Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-success">trending_up</span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Total Income</p>
              </div>
              <p
                className="text-success tracking-tight text-2xl font-bold"
                data-testid="profit-loss-total-income"
              >
                {currencyFormatter.format(profitLoss.totalIncome)}
              </p>
            </div>

            {/* Total Expenses Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-danger">trending_down</span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Total Expenses</p>
              </div>
              <p
                className="text-danger tracking-tight text-2xl font-bold"
                data-testid="profit-loss-total-expenses"
              >
                {currencyFormatter.format(profitLoss.totalExpenses)}
              </p>
            </div>

            {/* Net Profit Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined ${profitLoss.netProfit >= 0 ? 'text-success' : 'text-danger'}`}
                >
                  {profitLoss.netProfit >= 0 ? 'show_chart' : 'trending_down'}
                </span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Net Profit</p>
              </div>
              <p
                className={`tracking-tight text-2xl font-bold ${
                  profitLoss.netProfit >= 0 ? 'text-success' : 'text-danger'
                }`}
                data-testid="profit-loss-net-profit"
              >
                {currencyFormatter.format(profitLoss.netProfit)}
              </p>
              <p className="text-sm text-subtle-text">
                {profitMargin >= 0 ? '+' : ''}{profitMargin.toFixed(1)}% margin
              </p>
            </div>
          </div>

          {/* Income and Expenses Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="profit-loss-sections">
            {/* Income Section */}
            <ProfitLossSection
              title="Income (Revenue)"
              icon="trending_up"
              iconColor="text-success"
              items={profitLoss.income}
              total={profitLoss.totalIncome}
              testIdPrefix="income"
              isIncome={true}
            />

            {/* Expenses Section */}
            <ProfitLossSection
              title="Expenses"
              icon="trending_down"
              iconColor="text-danger"
              items={profitLoss.expenses}
              total={profitLoss.totalExpenses}
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
            <div className="flex justify-between items-center">
              <div>
                <p className="text-lg font-bold text-text-light dark:text-text-dark">
                  Net {profitLoss.netProfit >= 0 ? 'Profit' : 'Loss'}
                </p>
                <p className="text-sm text-subtle-text">
                  Total Income - Total Expenses = {currencyFormatter.format(profitLoss.totalIncome)} - {currencyFormatter.format(profitLoss.totalExpenses)}
                </p>
              </div>
              <p
                className={`text-2xl font-black ${
                  profitLoss.netProfit >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {currencyFormatter.format(profitLoss.netProfit)}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Empty State - No data */}
      {!isLoading && !isError && profitLoss && profitLoss.income.length === 0 && profitLoss.expenses.length === 0 && (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
          data-testid="profit-loss-empty"
        >
          <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">trending_up</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No transactions found</h3>
          <p className="text-subtle-text">
            There are no income or expense transactions for the selected period.
          </p>
        </div>
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
  testIdPrefix: string;
  isIncome: boolean;
}

function ProfitLossSection({ title, icon, iconColor, items, total, testIdPrefix, isIncome }: ProfitLossSectionProps) {
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
        <span className="text-sm text-subtle-text">{items.length} accounts</span>
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
              testId={`${testIdPrefix}-item-${index}`}
              isIncome={isIncome}
            />
          ))
        )}
      </div>

      {/* Section Total */}
      <div
        className={`flex justify-between items-center px-6 py-4 border-t-2 ${
          isIncome ? 'border-success bg-success/5' : 'border-danger bg-danger/5'
        }`}
        data-testid={`profit-loss-${testIdPrefix}-total`}
      >
        <span className="font-bold text-text-light dark:text-text-dark">Total {title}</span>
        <span
          className={`font-bold text-lg ${isIncome ? 'text-success' : 'text-danger'}`}
        >
          {currencyFormatter.format(total)}
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
  testId: string;
  isIncome: boolean;
  depth?: number;
}

function ProfitLossItemRow({ item, testId, isIncome, depth = 0 }: ProfitLossItemRowProps) {
  // Added: Indentation based on depth for hierarchical display
  const paddingLeft = 24 + depth * 16; // Base 24px + 16px per level

  return (
    <>
      <div
        className="flex justify-between items-center py-3 hover:bg-primary/5 transition-colors"
        style={{ paddingLeft: `${paddingLeft}px`, paddingRight: '24px' }}
        data-testid={testId}
      >
        <span
          className={`text-sm ${depth > 0 ? 'text-subtle-text' : 'text-text-light dark:text-text-dark'}`}
        >
          {item.account}
        </span>
        <span
          className={`text-sm font-medium ${
            depth > 0
              ? 'text-subtle-text'
              : isIncome
                ? 'text-success'
                : 'text-danger'
          }`}
        >
          {currencyFormatter.format(item.amount)}
        </span>
      </div>
      {/* Render children recursively if present */}
      {item.children?.map((child, index) => (
        <ProfitLossItemRow
          key={`${testId}-child-${index}`}
          item={child}
          testId={`${testId}-child-${index}`}
          isIncome={isIncome}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
