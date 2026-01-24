/**
 * Balance Sheet Report Page
 * Reference: soupfinance-designs/balance-sheet-report/
 *
 * Displays Assets, Liabilities, and Equity with the accounting equation:
 * Assets = Liabilities + Equity
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBalanceSheetDirect, exportFinanceReport, type ReportFilters } from '../../api/endpoints/reports';
import type { BalanceSheet, BalanceSheetItem } from '../../types';

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

// Added: Get today's date in YYYY-MM-DD format
function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function BalanceSheetPage() {
  // Added: State for "As Of" date filter with default to today
  const [asOfDate, setAsOfDate] = useState<string>(getTodayISO());

  // Added: Fetch balance sheet data using React Query
  const {
    data: balanceSheet,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<BalanceSheet>({
    queryKey: ['balanceSheet', asOfDate],
    queryFn: () => getBalanceSheetDirect(asOfDate),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

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

  // Added: Export handler for PDF/Excel/CSV
  const handleExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    try {
      const filters: ReportFilters = {
        from: '1900-01-01', // Balance sheet is as-of, not period-based
        to: asOfDate,
      };
      const blob = await exportFinanceReport('balanceSheet', filters, format);
      const url = URL.createObjectURL(blob);

      // Create download link
      const link = document.createElement('a');
      link.href = url;
      const extension = format === 'xlsx' ? 'xlsx' : format;
      link.download = `balance-sheet-${asOfDate}.${extension}`;
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
    <div className="flex flex-col gap-6" data-testid="balance-sheet-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="balance-sheet-heading"
          >
            Balance Sheet
          </h1>
          <p className="text-subtle-text">
            {balanceSheet ? `As of ${formatDateDisplay(balanceSheet.asOf)}` : 'Assets, liabilities, and equity position'}
          </p>
        </div>
      </div>

      {/* Toolbar: Date Picker + Export Buttons */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-border-light dark:border-border-dark"
        data-testid="balance-sheet-toolbar"
      >
        {/* Date Picker */}
        <div className="flex items-center gap-3">
          <label htmlFor="asOfDate" className="text-sm font-medium text-text-light dark:text-text-dark">
            As Of Date:
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtle-text">
              calendar_today
            </span>
            <input
              id="asOfDate"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="pl-10 pr-4 py-2 h-10 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary/50 focus:border-primary"
              data-testid="balance-sheet-date-picker"
            />
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 h-10 px-4 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark hover:bg-background-light dark:hover:bg-background-dark text-text-light dark:text-text-dark"
            data-testid="balance-sheet-refresh"
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
            data-testid="balance-sheet-export-pdf"
          >
            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
            <span className="text-sm font-bold">PDF</span>
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="flex items-center justify-center gap-2 h-10 px-4 bg-primary text-white rounded-lg hover:bg-primary/90"
            data-testid="balance-sheet-export-excel"
          >
            <span className="material-symbols-outlined text-lg">grid_on</span>
            <span className="text-sm font-bold">Excel</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center justify-center gap-2 h-10 px-4 border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark hover:bg-background-light dark:hover:bg-background-dark"
            data-testid="balance-sheet-export-csv"
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
                {currencyFormatter.format(balanceSheet.totalAssets)}
              </p>
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
                {currencyFormatter.format(balanceSheet.totalLiabilities)}
              </p>
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
                {currencyFormatter.format(balanceSheet.totalEquity)}
              </p>
            </div>
          </div>

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
                    {currencyFormatter.format(balanceSheet.totalAssets)} ={' '}
                    {currencyFormatter.format(balanceSheet.totalLiabilities)} +{' '}
                    {currencyFormatter.format(balanceSheet.totalEquity)}
                  </p>
                </div>
              </div>
              {equationCheck.balanced ? (
                <span className="text-success font-bold">Balanced</span>
              ) : (
                <span className="text-warning font-bold">
                  Difference: {currencyFormatter.format(equationCheck.difference)}
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
              testIdPrefix="assets"
            />

            {/* Liabilities Section */}
            <BalanceSheetSection
              title="Liabilities"
              icon="credit_card"
              iconColor="text-danger"
              items={balanceSheet.liabilities}
              total={balanceSheet.totalLiabilities}
              testIdPrefix="liabilities"
            />

            {/* Equity Section */}
            <BalanceSheetSection
              title="Equity"
              icon="savings"
              iconColor="text-success"
              items={balanceSheet.equity}
              total={balanceSheet.totalEquity}
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
                {currencyFormatter.format(balanceSheet.totalLiabilities + balanceSheet.totalEquity)}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Empty State - No data */}
      {!isLoading && !isError && balanceSheet && balanceSheet.assets.length === 0 && balanceSheet.liabilities.length === 0 && balanceSheet.equity.length === 0 && (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center"
          data-testid="balance-sheet-empty"
        >
          <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">account_balance</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">No accounts found</h3>
          <p className="text-subtle-text">
            There are no ledger accounts with balances as of {formatDateDisplay(asOfDate)}.
          </p>
        </div>
      )}
    </div>
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
  testIdPrefix: string;
}

function BalanceSheetSection({ title, icon, iconColor, items, total, testIdPrefix }: BalanceSheetSectionProps) {
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
            <BalanceSheetItemRow
              key={`${testIdPrefix}-${index}`}
              item={item}
              testId={`${testIdPrefix}-item-${index}`}
            />
          ))
        )}
      </div>

      {/* Section Total */}
      <div
        className="flex justify-between items-center px-6 py-4 border-t-2 border-text-light dark:border-text-dark bg-background-light dark:bg-background-dark"
        data-testid={`balance-sheet-${testIdPrefix}-total`}
      >
        <span className="font-bold text-text-light dark:text-text-dark">Total {title}</span>
        <span className="font-bold text-lg text-text-light dark:text-text-dark">
          {currencyFormatter.format(total)}
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
  testId: string;
  depth?: number;
}

function BalanceSheetItemRow({ item, testId, depth = 0 }: BalanceSheetItemRowProps) {
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
            depth > 0 ? 'text-subtle-text' : 'text-text-light dark:text-text-dark'
          }`}
        >
          {currencyFormatter.format(item.balance)}
        </span>
      </div>
      {/* Render children recursively if present */}
      {item.children?.map((child, index) => (
        <BalanceSheetItemRow
          key={`${testId}-child-${index}`}
          item={child}
          testId={`${testId}-child-${index}`}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
