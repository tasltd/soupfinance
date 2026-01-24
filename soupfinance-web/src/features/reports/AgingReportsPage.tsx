/**
 * Aging Reports Page
 *
 * Displays both A/R (Accounts Receivable) and A/P (Accounts Payable) aging reports
 * side by side, with age buckets: Current, 1-30 Days, 31-60 Days, 61-90 Days, Over 90 Days.
 *
 * Reference: soupfinance-designs/ar-aging-report/, soupfinance-designs/ap-aging-report/
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getARAgingReport,
  getAPAgingReport,
  exportFinanceReport,
  type ReportFilters,
} from '../../api/endpoints/reports';
import type { AgingReport, AgingItem } from '../../types';

// Added: Get today's date in ISO format (YYYY-MM-DD)
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Added: Format currency with proper thousands separator
function formatCurrency(amount: number, currency = 'USD'): string {
  if (amount === 0) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// Added: Get color class for aging amounts based on bucket
function getAmountColorClass(bucket: 'current' | 'days30' | 'days60' | 'days90' | 'over90', amount: number): string {
  if (amount === 0) return 'text-subtle-text';

  switch (bucket) {
    case 'current':
    case 'days30':
      return 'text-text-light dark:text-text-dark';
    case 'days60':
    case 'days90':
      return 'text-amber-600 dark:text-amber-400';
    case 'over90':
      return 'text-danger';
    default:
      return 'text-text-light dark:text-text-dark';
  }
}

/**
 * Age bucket column headers configuration
 */
const AGE_BUCKETS = [
  { key: 'current' as const, label: 'Current' },
  { key: 'days30' as const, label: '1-30 Days' },
  { key: 'days60' as const, label: '31-60 Days' },
  { key: 'days90' as const, label: '61-90 Days' },
  { key: 'over90' as const, label: '>90 Days' },
  { key: 'total' as const, label: 'Total' },
];

/**
 * Aging table component - used for both A/R and A/P sections
 */
interface AgingTableProps {
  title: string;
  icon: string;
  entityLabel: string; // "Customer" for A/R, "Vendor" for A/P
  data: AgingReport | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onExport: (format: 'pdf' | 'xlsx' | 'csv') => void;
  exportLoading: string | null;
  testIdPrefix: string;
}

function AgingTable({
  title,
  icon,
  entityLabel,
  data,
  isLoading,
  isError,
  error,
  onExport,
  exportLoading,
  testIdPrefix,
}: AgingTableProps) {
  return (
    <div
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
      data-testid={`${testIdPrefix}-container`}
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-border-light dark:border-border-dark">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-xl text-primary">{icon}</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark">{title}</h3>
        </div>

        {/* Export Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => onExport('pdf')}
            disabled={exportLoading !== null || isLoading || !data}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/10 disabled:opacity-50"
            data-testid={`${testIdPrefix}-export-pdf`}
          >
            <span className="material-symbols-outlined text-base">picture_as_pdf</span>
            <span className="hidden sm:inline">{exportLoading === 'pdf' ? '...' : 'PDF'}</span>
          </button>
          <button
            onClick={() => onExport('xlsx')}
            disabled={exportLoading !== null || isLoading || !data}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/10 disabled:opacity-50"
            data-testid={`${testIdPrefix}-export-excel`}
          >
            <span className="material-symbols-outlined text-base">table_view</span>
            <span className="hidden sm:inline">{exportLoading === 'xlsx' ? '...' : 'Excel'}</span>
          </button>
          <button
            onClick={() => onExport('csv')}
            disabled={exportLoading !== null || isLoading || !data}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/10 disabled:opacity-50"
            data-testid={`${testIdPrefix}-export-csv`}
          >
            <span className="material-symbols-outlined text-base">download</span>
            <span className="hidden sm:inline">{exportLoading === 'csv' ? '...' : 'CSV'}</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      {isLoading ? (
        // Loading State
        <div className="p-12 text-center" data-testid={`${testIdPrefix}-loading`}>
          <span className="material-symbols-outlined text-5xl text-subtle-text/50 mb-3 animate-pulse">
            hourglass_empty
          </span>
          <p className="text-subtle-text">Loading aging report...</p>
        </div>
      ) : isError ? (
        // Error State
        <div className="p-12 text-center" data-testid={`${testIdPrefix}-error`}>
          <span className="material-symbols-outlined text-5xl text-danger/50 mb-3">error</span>
          <h4 className="text-base font-bold text-text-light dark:text-text-dark mb-2">
            Failed to load report
          </h4>
          <p className="text-subtle-text text-sm">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
        </div>
      ) : !data || data.items.length === 0 ? (
        // Empty State
        <div className="p-12 text-center" data-testid={`${testIdPrefix}-empty`}>
          <span className="material-symbols-outlined text-5xl text-subtle-text/50 mb-3">
            {icon}
          </span>
          <h4 className="text-base font-bold text-text-light dark:text-text-dark mb-2">
            No outstanding {title.toLowerCase().replace(' aging', '')}
          </h4>
          <p className="text-subtle-text text-sm">
            All {entityLabel.toLowerCase()}s are current as of this date.
          </p>
        </div>
      ) : (
        // Data Table
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[700px] text-sm"
            data-testid={`${testIdPrefix}-table`}
          >
            <thead className="border-b border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left font-semibold text-text-light dark:text-text-dark"
                >
                  {entityLabel}
                </th>
                {AGE_BUCKETS.map((bucket) => (
                  <th
                    key={bucket.key}
                    scope="col"
                    className="px-4 py-3 text-right font-semibold text-text-light dark:text-text-dark"
                  >
                    {bucket.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item: AgingItem, index: number) => (
                <tr
                  key={item.entity.id || index}
                  className="border-b border-border-light dark:border-border-dark hover:bg-primary/5"
                  data-testid={`${testIdPrefix}-row-${index}`}
                >
                  <td className="px-6 py-3 font-medium text-text-light dark:text-text-dark">
                    {item.entity.name}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${getAmountColorClass('current', item.current)}`}>
                    {formatCurrency(item.current)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${getAmountColorClass('days30', item.days30)}`}>
                    {formatCurrency(item.days30)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${getAmountColorClass('days60', item.days60)}`}>
                    {formatCurrency(item.days60)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${getAmountColorClass('days90', item.days90)}`}>
                    {formatCurrency(item.days90)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${getAmountColorClass('over90', item.over90)}`}>
                    {formatCurrency(item.over90)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-text-light dark:text-text-dark">
                    {formatCurrency(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Totals Footer */}
            <tfoot className="bg-background-light dark:bg-background-dark border-t-2 border-border-light dark:border-border-dark">
              <tr data-testid={`${testIdPrefix}-totals`}>
                <th
                  scope="row"
                  className="px-6 py-4 text-left font-bold text-text-light dark:text-text-dark"
                >
                  Totals
                </th>
                <td className={`px-4 py-4 text-right font-mono font-bold ${getAmountColorClass('current', data.totals.current)}`}>
                  {formatCurrency(data.totals.current)}
                </td>
                <td className={`px-4 py-4 text-right font-mono font-bold ${getAmountColorClass('days30', data.totals.days30)}`}>
                  {formatCurrency(data.totals.days30)}
                </td>
                <td className={`px-4 py-4 text-right font-mono font-bold ${getAmountColorClass('days60', data.totals.days60)}`}>
                  {formatCurrency(data.totals.days60)}
                </td>
                <td className={`px-4 py-4 text-right font-mono font-bold ${getAmountColorClass('days90', data.totals.days90)}`}>
                  {formatCurrency(data.totals.days90)}
                </td>
                <td className={`px-4 py-4 text-right font-mono font-bold ${getAmountColorClass('over90', data.totals.over90)}`}>
                  {formatCurrency(data.totals.over90)}
                </td>
                <td className="px-4 py-4 text-right font-mono font-bold text-primary">
                  {formatCurrency(data.totals.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Aging Reports Page Component
 */
export function AgingReportsPage() {
  // Added: As-of date filter state with default to today
  const defaultDate = useMemo(() => getTodayDate(), []);
  const [asOfDate, setAsOfDate] = useState<string>(defaultDate);

  // Added: Export loading states for each section
  const [arExportLoading, setArExportLoading] = useState<string | null>(null);
  const [apExportLoading, setApExportLoading] = useState<string | null>(null);

  // Fetch A/R aging report
  const {
    data: arAgingData,
    isLoading: arLoading,
    isError: arIsError,
    error: arError,
  } = useQuery({
    queryKey: ['arAging', asOfDate],
    queryFn: () => getARAgingReport(asOfDate),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch A/P aging report
  const {
    data: apAgingData,
    isLoading: apLoading,
    isError: apIsError,
    error: apError,
  } = useQuery({
    queryKey: ['apAging', asOfDate],
    queryFn: () => getAPAgingReport(asOfDate),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Handle A/R export
  const handleArExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    setArExportLoading(format);
    try {
      const filters: ReportFilters = { from: asOfDate, to: asOfDate };
      const blob = await exportFinanceReport('agedReceivables', filters, format);
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ar-aging-${asOfDate}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('A/R export failed:', err);
    } finally {
      setArExportLoading(null);
    }
  };

  // Handle A/P export
  const handleApExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    setApExportLoading(format);
    try {
      const filters: ReportFilters = { from: asOfDate, to: asOfDate };
      const blob = await exportFinanceReport('agedPayables', filters, format);
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ap-aging-${asOfDate}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('A/P export failed:', err);
    } finally {
      setApExportLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="aging-reports-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid="aging-reports-heading"
          >
            Aging Reports
          </h1>
          <p className="text-subtle-text">
            Outstanding receivables and payables by age as of{' '}
            <span className="font-medium text-text-light dark:text-text-dark">{asOfDate}</span>
          </p>
        </div>

        {/* As Of Date Picker */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-subtle-text">schedule</span>
            <span className="text-sm font-medium text-text-light dark:text-text-dark">As of:</span>
          </label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            max={getTodayDate()}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary/50 focus:border-primary"
            data-testid="aging-reports-date-picker"
          />
          <button
            onClick={() => setAsOfDate(defaultDate)}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/10"
            data-testid="aging-reports-reset-date"
          >
            <span className="material-symbols-outlined text-base">today</span>
            Today
          </button>
        </div>
      </div>

      {/* Two-Column Grid: A/R and A/P side by side on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Accounts Receivable Aging */}
        <AgingTable
          title="A/R Aging"
          icon="receipt_long"
          entityLabel="Customer"
          data={arAgingData}
          isLoading={arLoading}
          isError={arIsError}
          error={arError as Error | null}
          onExport={handleArExport}
          exportLoading={arExportLoading}
          testIdPrefix="ar-aging"
        />

        {/* Accounts Payable Aging */}
        <AgingTable
          title="A/P Aging"
          icon="payments"
          entityLabel="Vendor"
          data={apAgingData}
          isLoading={apLoading}
          isError={apIsError}
          error={apError as Error | null}
          onExport={handleApExport}
          exportLoading={apExportLoading}
          testIdPrefix="ap-aging"
        />
      </div>

      {/* Summary Cards */}
      {(arAgingData || apAgingData) && !arLoading && !apLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="aging-summary-cards">
          {/* Total Receivables */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
            <p className="text-subtle-text text-sm font-medium mb-1">Total Receivables</p>
            <p className="text-2xl font-bold text-text-light dark:text-text-dark">
              {formatCurrency(arAgingData?.totals.total || 0)}
            </p>
            {arAgingData && arAgingData.totals.over90 > 0 && (
              <p className="text-sm text-danger mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-base">warning</span>
                {formatCurrency(arAgingData.totals.over90)} over 90 days
              </p>
            )}
          </div>

          {/* Total Payables */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
            <p className="text-subtle-text text-sm font-medium mb-1">Total Payables</p>
            <p className="text-2xl font-bold text-text-light dark:text-text-dark">
              {formatCurrency(apAgingData?.totals.total || 0)}
            </p>
            {apAgingData && apAgingData.totals.over90 > 0 && (
              <p className="text-sm text-danger mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-base">warning</span>
                {formatCurrency(apAgingData.totals.over90)} over 90 days
              </p>
            )}
          </div>

          {/* Overdue Receivables (>30 days) */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
            <p className="text-subtle-text text-sm font-medium mb-1">Overdue Receivables</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(
                (arAgingData?.totals.days60 || 0) +
                (arAgingData?.totals.days90 || 0) +
                (arAgingData?.totals.over90 || 0)
              )}
            </p>
            <p className="text-sm text-subtle-text mt-1">31+ days outstanding</p>
          </div>

          {/* Overdue Payables (>30 days) */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
            <p className="text-subtle-text text-sm font-medium mb-1">Overdue Payables</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(
                (apAgingData?.totals.days60 || 0) +
                (apAgingData?.totals.days90 || 0) +
                (apAgingData?.totals.over90 || 0)
              )}
            </p>
            <p className="text-sm text-subtle-text mt-1">31+ days outstanding</p>
          </div>
        </div>
      )}
    </div>
  );
}
