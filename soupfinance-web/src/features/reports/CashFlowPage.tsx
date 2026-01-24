/**
 * Cash Flow Statement Report Page
 * Reference: soupfinance-designs/cash-flow-statement-report/
 *
 * Displays Operating, Investing, and Financing activities with:
 * - Date range filter (from/to) defaulting to current month
 * - Three sections for activity types with amounts
 * - Section subtotals and net cash flow calculation
 * - Beginning/Ending cash balance summary
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCashFlowStatement, type ReportFilters } from '../../api/endpoints/reports';
import type { CashFlowStatement, CashFlowActivity } from '../../types';

// Added: Currency formatter for consistent display
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Added: Format date for display (e.g., "January 20, 2026")
function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
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

export function CashFlowPage() {
  // Added: State for date range filter with default to current month
  const [fromDate, setFromDate] = useState<string>(getFirstDayOfMonth());
  const [toDate, setToDate] = useState<string>(getTodayISO());

  // Added: Fetch cash flow data using React Query
  const {
    data: cashFlow,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CashFlowStatement>({
    queryKey: ['cashFlowStatement', fromDate, toDate],
    queryFn: () => {
      const filters: ReportFilters = { from: fromDate, to: toDate };
      return getCashFlowStatement(filters);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  // Added: Calculate summary values
  const summary = useMemo(() => {
    if (!cashFlow) {
      return {
        netCashFlow: 0,
        beginningBalance: 0,
        endingBalance: 0,
      };
    }
    return {
      netCashFlow: cashFlow.netCashFlow,
      beginningBalance: cashFlow.beginningCashBalance,
      endingBalance: cashFlow.endingCashBalance,
    };
  }, [cashFlow]);

  // Added: Placeholder export handlers (backend export endpoint not yet available)
  const handleExport = (format: 'pdf' | 'xlsx' | 'csv') => {
    // NOTE: Export functionality requires backend endpoint implementation
    console.log(`Export to ${format} requested - backend endpoint not yet available`);
    alert(`Export to ${format.toUpperCase()} will be available when backend support is added.`);
  };

  return (
    <div className="flex flex-col gap-6" data-testid="cash-flow-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="cash-flow-heading"
          >
            Cash Flow Statement
          </h1>
          <p className="text-subtle-text">
            {cashFlow
              ? `${formatDateDisplay(cashFlow.periodStart)} to ${formatDateDisplay(cashFlow.periodEnd)}`
              : 'Cash movements and liquidity analysis'}
          </p>
        </div>
      </div>

      {/* Toolbar: Date Range Picker + Export Buttons */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-border-light dark:border-border-dark"
        data-testid="cash-flow-toolbar"
      >
        {/* Date Range Picker */}
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
                data-testid="cash-flow-from-date"
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
                data-testid="cash-flow-to-date"
              />
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 h-10 px-4 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark hover:bg-background-light dark:hover:bg-background-dark text-text-light dark:text-text-dark"
            data-testid="cash-flow-refresh"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            Refresh
          </button>
        </div>

        {/* Export Buttons (placeholder - backend not yet available) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('pdf')}
            disabled
            className="flex items-center justify-center gap-2 h-10 px-4 border border-border-light dark:border-border-dark rounded-lg text-subtle-text cursor-not-allowed opacity-50"
            data-testid="cash-flow-export-pdf"
            title="Export to PDF (coming soon)"
          >
            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
            <span className="text-sm font-bold">PDF</span>
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            disabled
            className="flex items-center justify-center gap-2 h-10 px-4 border border-border-light dark:border-border-dark rounded-lg text-subtle-text cursor-not-allowed opacity-50"
            data-testid="cash-flow-export-excel"
            title="Export to Excel (coming soon)"
          >
            <span className="material-symbols-outlined text-lg">grid_on</span>
            <span className="text-sm font-bold">Excel</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled
            className="flex items-center justify-center gap-2 h-10 px-4 border border-border-light dark:border-border-dark rounded-lg text-subtle-text cursor-not-allowed opacity-50"
            data-testid="cash-flow-export-csv"
            title="Export to CSV (coming soon)"
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
          data-testid="cash-flow-loading"
        >
          <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">sync</span>
          <p className="text-subtle-text">Loading cash flow statement...</p>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div
          className="bg-danger/10 rounded-xl border border-danger/30 p-6 text-center"
          data-testid="cash-flow-error"
        >
          <span className="material-symbols-outlined text-4xl text-danger mb-2">error</span>
          <h3 className="text-lg font-bold text-danger mb-2">Failed to load cash flow statement</h3>
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

      {/* Cash Flow Data */}
      {cashFlow && !isLoading && !isError && (
        <>
          {/* Summary Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="cash-flow-stats">
            {/* Beginning Cash Balance Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-subtle-text">account_balance_wallet</span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Beginning Cash Balance</p>
              </div>
              <p
                className="text-text-light dark:text-text-dark tracking-tight text-2xl font-bold"
                data-testid="cash-flow-beginning-balance"
              >
                {currencyFormatter.format(summary.beginningBalance)}
              </p>
            </div>

            {/* Net Cash Flow Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined ${summary.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                  {summary.netCashFlow >= 0 ? 'trending_up' : 'trending_down'}
                </span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Net Cash Flow</p>
              </div>
              <p
                className={`tracking-tight text-2xl font-bold ${summary.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}
                data-testid="cash-flow-net"
              >
                {currencyFormatter.format(summary.netCashFlow)}
              </p>
            </div>

            {/* Ending Cash Balance Card */}
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-primary/30 bg-primary/5 dark:bg-primary/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">water_drop</span>
                <p className="text-text-light dark:text-text-dark text-base font-medium">Ending Cash Balance</p>
              </div>
              <p
                className="text-primary tracking-tight text-2xl font-bold"
                data-testid="cash-flow-ending-balance"
              >
                {currencyFormatter.format(summary.endingBalance)}
              </p>
            </div>
          </div>

          {/* Activity Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" data-testid="cash-flow-sections">
            {/* Operating Activities Section */}
            <CashFlowSection
              title="Operating Activities"
              icon="business_center"
              iconColor="text-primary"
              activities={cashFlow.operatingActivities}
              total={cashFlow.totalOperatingCashFlow}
              testIdPrefix="operating"
            />

            {/* Investing Activities Section */}
            <CashFlowSection
              title="Investing Activities"
              icon="trending_up"
              iconColor="text-info"
              activities={cashFlow.investingActivities}
              total={cashFlow.totalInvestingCashFlow}
              testIdPrefix="investing"
            />

            {/* Financing Activities Section */}
            <CashFlowSection
              title="Financing Activities"
              icon="account_balance"
              iconColor="text-warning"
              activities={cashFlow.financingActivities}
              total={cashFlow.totalFinancingCashFlow}
              testIdPrefix="financing"
            />
          </div>

          {/* Summary Section */}
          <div
            className="bg-surface-light dark:bg-surface-dark rounded-xl border-2 border-text-light dark:border-text-dark overflow-hidden"
            data-testid="cash-flow-summary"
          >
            <div className="px-6 py-4 border-b border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">summarize</span>
                <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Cash Flow Summary</h2>
              </div>
            </div>
            <div className="divide-y divide-border-light dark:divide-border-dark">
              {/* Beginning Cash Balance */}
              <div className="flex justify-between items-center px-6 py-4">
                <span className="text-text-light dark:text-text-dark">Beginning Cash Balance</span>
                <span className="font-medium text-text-light dark:text-text-dark">
                  {currencyFormatter.format(cashFlow.beginningCashBalance)}
                </span>
              </div>
              {/* Operating Cash Flow */}
              <div className="flex justify-between items-center px-6 py-3 pl-10">
                <span className="text-subtle-text">Cash from Operating Activities</span>
                <span className={`font-medium ${cashFlow.totalOperatingCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                  {cashFlow.totalOperatingCashFlow >= 0 ? '+' : ''}{currencyFormatter.format(cashFlow.totalOperatingCashFlow)}
                </span>
              </div>
              {/* Investing Cash Flow */}
              <div className="flex justify-between items-center px-6 py-3 pl-10">
                <span className="text-subtle-text">Cash from Investing Activities</span>
                <span className={`font-medium ${cashFlow.totalInvestingCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                  {cashFlow.totalInvestingCashFlow >= 0 ? '+' : ''}{currencyFormatter.format(cashFlow.totalInvestingCashFlow)}
                </span>
              </div>
              {/* Financing Cash Flow */}
              <div className="flex justify-between items-center px-6 py-3 pl-10">
                <span className="text-subtle-text">Cash from Financing Activities</span>
                <span className={`font-medium ${cashFlow.totalFinancingCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                  {cashFlow.totalFinancingCashFlow >= 0 ? '+' : ''}{currencyFormatter.format(cashFlow.totalFinancingCashFlow)}
                </span>
              </div>
              {/* Net Cash Flow */}
              <div className="flex justify-between items-center px-6 py-4 bg-background-light dark:bg-background-dark">
                <span className="font-bold text-text-light dark:text-text-dark">Net Cash Flow</span>
                <span className={`font-bold text-lg ${cashFlow.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                  {cashFlow.netCashFlow >= 0 ? '+' : ''}{currencyFormatter.format(cashFlow.netCashFlow)}
                </span>
              </div>
              {/* Ending Cash Balance */}
              <div className="flex justify-between items-center px-6 py-4 border-t-2 border-text-light dark:border-text-dark">
                <span className="font-black text-text-light dark:text-text-dark">Ending Cash Balance</span>
                <span className="font-black text-xl text-primary">
                  {currencyFormatter.format(cashFlow.endingCashBalance)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty State - No activities */}
      {!isLoading && !isError && cashFlow &&
        cashFlow.operatingActivities.length === 0 &&
        cashFlow.investingActivities.length === 0 &&
        cashFlow.financingActivities.length === 0 && (
          <div
            className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
            data-testid="cash-flow-empty"
          >
            <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">water_drop</span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No cash flow activities</h3>
            <p className="text-subtle-text">
              There are no cash flow activities for the period {formatDateDisplay(fromDate)} to {formatDateDisplay(toDate)}.
            </p>
          </div>
        )}
    </div>
  );
}

/**
 * Cash Flow Section Component
 * Displays a card with activity list and subtotal
 */
interface CashFlowSectionProps {
  title: string;
  icon: string;
  iconColor: string;
  activities: CashFlowActivity[];
  total: number;
  testIdPrefix: string;
}

function CashFlowSection({ title, icon, iconColor, activities, total, testIdPrefix }: CashFlowSectionProps) {
  return (
    <div
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
      data-testid={`cash-flow-section-${testIdPrefix}`}
    >
      {/* Section Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined ${iconColor}`}>{icon}</span>
          <h2 className="text-lg font-bold text-text-light dark:text-text-dark">{title}</h2>
        </div>
        <span className="text-sm text-subtle-text">{activities.length} items</span>
      </div>

      {/* Activity List */}
      <div className="divide-y divide-border-light dark:divide-border-dark max-h-80 overflow-y-auto">
        {activities.length === 0 ? (
          <div className="p-6 text-center text-subtle-text">
            <p>No {title.toLowerCase()}</p>
          </div>
        ) : (
          activities.map((activity, index) => (
            <CashFlowActivityRow
              key={`${testIdPrefix}-${index}`}
              activity={activity}
              testId={`${testIdPrefix}-activity-${index}`}
            />
          ))
        )}
      </div>

      {/* Section Total */}
      <div
        className="flex justify-between items-center px-6 py-4 border-t-2 border-text-light dark:border-text-dark bg-background-light dark:bg-background-dark"
        data-testid={`cash-flow-${testIdPrefix}-total`}
      >
        <span className="font-bold text-text-light dark:text-text-dark">Total {title}</span>
        <span className={`font-bold text-lg ${total >= 0 ? 'text-success' : 'text-danger'}`}>
          {total >= 0 ? '+' : ''}{currencyFormatter.format(total)}
        </span>
      </div>
    </div>
  );
}

/**
 * Cash Flow Activity Row Component
 * Displays individual activity with amount colored by inflow/outflow
 */
interface CashFlowActivityRowProps {
  activity: CashFlowActivity;
  testId: string;
}

function CashFlowActivityRow({ activity, testId }: CashFlowActivityRowProps) {
  const isInflow = activity.amount >= 0;

  return (
    <div
      className="flex justify-between items-center px-6 py-3 hover:bg-primary/5 transition-colors"
      data-testid={testId}
    >
      <span className="text-sm text-text-light dark:text-text-dark truncate pr-4">
        {activity.description}
      </span>
      <span
        className={`text-sm font-medium whitespace-nowrap ${isInflow ? 'text-success' : 'text-danger'}`}
      >
        {isInflow ? '+' : ''}{currencyFormatter.format(activity.amount)}
      </span>
    </div>
  );
}
