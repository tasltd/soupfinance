/**
 * Added (SOUPFIN-103): the frame every report renders inside.
 *
 * <ReportShell> owns everything reports used to copy from each other: the page
 * header and "Need Help?" link, the date range or as-of picker, the comparison
 * period selector, the Class/Location filter slot, the tenant currency label
 * and the PDF/Excel/CSV export buttons. A report page supplies only its body.
 *
 * Page state comes from useReportControls(), so the page and the shell read the
 * same dates. Test ids default to `${testIdPrefix}-...` and can be overridden
 * in the registry where older pages already had their own.
 */
import type { ReactNode } from 'react';
import { HelpLink } from '../../components/help';
import { useCurrencyConfig } from '../../stores';
import { getTodayIsoDate, formatDisplayDate } from '../../utils/date';
import type { ExportFormat, ReportFilters } from '../../api/endpoints/reports';
import { EXPORT_FORMATS, type ReportDefinition, type ReportPageConfig } from './reportRegistry';
import { formatDisplayRange, REPORT_MIN_DATE, type ComparisonMode } from './reportDates';
import type { ReportControls } from './useReportControls';
import { canExport, useReportExport, type ClientExports } from './useReportExport';

const INPUT_CLASS =
  'h-10 px-3 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary/50 focus:border-primary';

const COMPARISON_OPTIONS: { value: ComparisonMode; label: string }[] = [
  { value: 'none', label: 'No comparison' },
  { value: 'previousPeriod', label: 'Previous period' },
  { value: 'previousYear', label: 'Previous year' },
];

const FORMAT_LABELS: Record<ExportFormat, { label: string; icon: string }> = {
  pdf: { label: 'PDF', icon: 'picture_as_pdf' },
  xlsx: { label: 'Excel', icon: 'grid_on' },
  csv: { label: 'CSV', icon: 'download' },
};

// =============================================================================
// Export buttons
// =============================================================================

interface ReportExportButtonsProps {
  definition: ReportDefinition;
  filters: ReportFilters;
  /** Prefix for `${prefix}-export-pdf` etc. Defaults to the page prefix. */
  testIdPrefix?: string;
  disabled?: boolean;
  clientExports?: ClientExports;
  size?: 'md' | 'sm';
}

/**
 * PDF / Excel / CSV buttons with a spinner, a timeout and an error banner.
 * Used by the shell toolbar, and on its own where one page holds two reports
 * (A/R and A/P aging).
 */
export function ReportExportButtons({
  definition,
  filters,
  testIdPrefix = definition.page.testIdPrefix,
  disabled = false,
  clientExports,
  size = 'md',
}: ReportExportButtonsProps) {
  const { exportingFormat, exportError, clearExportError, runExport } = useReportExport(
    definition,
    filters,
    clientExports
  );
  const height = size === 'sm' ? 'h-9 px-3' : 'h-10 px-4';

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2" data-testid={`${testIdPrefix}-export-buttons`}>
        {EXPORT_FORMATS.map((format) => {
          const available = canExport(definition, format, clientExports);
          const busy = exportingFormat === format;
          const { label, icon } = FORMAT_LABELS[format];
          return (
            <button
              key={format}
              type="button"
              onClick={() => runExport(format)}
              disabled={!available || disabled || exportingFormat !== null}
              title={available ? `Export as ${label}` : `${label} export is not available for this report yet`}
              className={`flex items-center justify-center gap-2 ${height} rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark hover:border-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border-light disabled:hover:text-text-light`}
              data-testid={`${testIdPrefix}-export-${format === 'xlsx' ? 'excel' : format}`}
            >
              <span className={`material-symbols-outlined text-lg ${busy ? 'animate-spin' : ''}`}>
                {busy ? 'progress_activity' : icon}
              </span>
              <span className="text-sm font-bold">{busy ? 'Exporting…' : label}</span>
            </button>
          );
        })}
      </div>

      {exportError && (
        <div
          className="w-full bg-danger/10 border border-danger/30 rounded-lg p-3 flex items-start gap-3"
          data-testid={`${testIdPrefix}-export-error`}
          role="alert"
        >
          <span className="material-symbols-outlined text-danger">error</span>
          <div className="flex-1">
            <p className="text-danger text-sm font-medium">Export failed</p>
            <p className="text-subtle-text text-xs">{exportError}</p>
          </div>
          <button
            type="button"
            onClick={clearExportError}
            className="text-subtle-text hover:text-danger"
            aria-label="Dismiss export error"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Shell
// =============================================================================

interface ReportShellProps {
  page: ReportPageConfig;
  controls: ReportControls;
  /** Refetch the report. Called by Refresh, and by Reset when nothing changed. */
  onRefresh: () => void;
  /** The report whose export buttons sit in the toolbar. Omit for none. */
  exportDefinition?: ReportDefinition;
  /** Filters for the export, when they differ from the on-screen ones. */
  exportFilters?: ReportFilters;
  exportDisabled?: boolean;
  clientExports?: ClientExports;
  /** Replaces the default subtitle (the formatted range or as-of date). */
  subtitle?: ReactNode;
  /** Class/Location (or any extra) filters. Rendered only for pages that reserve the slot. */
  filterSlot?: ReactNode;
  isFetching?: boolean;
  children: ReactNode;
}

export function ReportShell({
  page,
  controls,
  onRefresh,
  exportDefinition,
  exportFilters,
  exportDisabled,
  clientExports,
  subtitle,
  filterSlot,
  isFetching = false,
  children,
}: ReportShellProps) {
  const currency = useCurrencyConfig();
  const p = page.testIdPrefix;
  const ids = {
    toolbar: page.testIds?.toolbar ?? `${p}-toolbar`,
    from: page.testIds?.from ?? `${p}-from-date`,
    to: page.testIds?.to ?? `${p}-to-date`,
    asOf: page.testIds?.asOf ?? `${p}-date-picker`,
    refresh: page.testIds?.refresh ?? `${p}-refresh`,
    reset: page.testIds?.reset ?? `${p}-reset`,
  };
  const inputIds = {
    from: page.inputIds?.from ?? `${p}-from`,
    to: page.inputIds?.to ?? `${p}-to`,
    asOf: page.inputIds?.asOf ?? `${p}-as-of`,
  };
  // "Trial Balance" -> "Trial balance from date" (SOUPFIN-33 #6 accessible names).
  const ariaTitle = page.title.charAt(0) + page.title.slice(1).toLowerCase();
  const maxDate = page.maxToday ? getTodayIsoDate() : undefined;

  const defaultSubtitle =
    page.dateMode === 'asOf'
      ? `As of ${formatDisplayDate(controls.asOf)}`
      : formatDisplayRange(controls.range);

  const comparisonText =
    controls.comparisonRange
      ? formatDisplayRange(controls.comparisonRange)
      : controls.comparisonAsOf
        ? formatDisplayDate(controls.comparisonAsOf)
        : '';

  const handleReset = () => {
    // Fix (SOUPFIN-11): Reset must refetch even when the dates were already at
    // their defaults; otherwise the button looks clickable but does nothing.
    if (!controls.reset()) onRefresh();
  };

  return (
    <div className="flex flex-col gap-6" data-testid={`${p}-page`}>
      {/* Page header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <h1
            className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark"
            data-testid={`${p}-heading`}
          >
            {page.title}
          </h1>
          <p className="text-subtle-text" data-testid={`${p}-subtitle`}>
            {subtitle ?? defaultSubtitle}
          </p>
          {page.helpSection && <HelpLink section={page.helpSection} className="mt-1 self-start" />}
        </div>
        {exportDefinition && (
          <ReportExportButtons
            definition={exportDefinition}
            filters={exportFilters ?? controls.filters}
            testIdPrefix={p}
            disabled={exportDisabled || !controls.isRangeValid}
            clientExports={clientExports}
          />
        )}
      </div>

      {/* Toolbar: dates, comparison, extra filters, refresh/reset */}
      <div
        className="flex flex-wrap items-end gap-4 p-4 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark"
        data-testid={ids.toolbar}
      >
        {page.dateMode === 'range' ? (
          <>
            <label className="flex flex-col gap-1" htmlFor={inputIds.from}>
              <span className="text-sm font-medium text-text-light dark:text-text-dark">From</span>
              <input
                type="date"
                id={inputIds.from}
                name={inputIds.from}
                aria-label={`${ariaTitle} from date`}
                value={controls.range.from}
                min={REPORT_MIN_DATE}
                max={maxDate}
                onChange={(e) => controls.setFrom(e.target.value)}
                className={INPUT_CLASS}
                data-testid={ids.from}
              />
            </label>
            <label className="flex flex-col gap-1" htmlFor={inputIds.to}>
              <span className="text-sm font-medium text-text-light dark:text-text-dark">To</span>
              <input
                type="date"
                id={inputIds.to}
                name={inputIds.to}
                aria-label={`${ariaTitle} to date`}
                value={controls.range.to}
                min={REPORT_MIN_DATE}
                max={maxDate}
                onChange={(e) => controls.setTo(e.target.value)}
                className={INPUT_CLASS}
                data-testid={ids.to}
              />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1" htmlFor={inputIds.asOf}>
            <span className="text-sm font-medium text-text-light dark:text-text-dark">As of</span>
            <input
              type="date"
              id={inputIds.asOf}
              name={inputIds.asOf}
              aria-label={`${ariaTitle} as-of date`}
              value={controls.asOf}
              min={REPORT_MIN_DATE}
              max={maxDate}
              onChange={(e) => controls.setAsOf(e.target.value)}
              className={INPUT_CLASS}
              data-testid={ids.asOf}
            />
          </label>
        )}

        {page.comparison && (
          <label className="flex flex-col gap-1" htmlFor={`${p}-comparison`}>
            <span className="text-sm font-medium text-text-light dark:text-text-dark">Compare with</span>
            <select
              id={`${p}-comparison`}
              value={controls.comparisonMode}
              onChange={(e) => controls.setComparisonMode(e.target.value as ComparisonMode)}
              className={INPUT_CLASS}
              data-testid={`${p}-comparison`}
            >
              {COMPARISON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {page.classLocation && filterSlot && (
          <div className="flex flex-wrap items-end gap-4" data-testid={`${p}-filter-slot`}>
            {filterSlot}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span
            className="inline-flex items-center gap-1 h-10 px-3 rounded-lg bg-background-light dark:bg-background-dark text-sm text-subtle-text"
            title={currency.name}
            data-testid={`${p}-currency`}
          >
            <span className="material-symbols-outlined text-base">payments</span>
            {currency.code}
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark text-sm font-medium hover:bg-primary/10"
            data-testid={ids.reset}
          >
            <span className="material-symbols-outlined text-base">
              {page.dateMode === 'asOf' ? 'today' : 'restart_alt'}
            </span>
            {page.resetLabel ?? 'Reset'}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={!controls.isRangeValid}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={ids.refresh}
          >
            <span className={`material-symbols-outlined text-base ${isFetching ? 'animate-spin' : ''}`}>
              refresh
            </span>
            {page.refreshLabel ?? 'Refresh'}
          </button>
        </div>

        {comparisonText && (
          <p className="basis-full text-sm text-subtle-text" data-testid={`${p}-comparison-range`}>
            Compared with {comparisonText}
          </p>
        )}
        {!controls.isRangeValid && (
          <p className="basis-full text-sm text-danger" role="alert" data-testid={`${p}-invalid-range`}>
            {page.dateMode === 'asOf'
              ? 'Pick a date to run this report.'
              : 'Pick a start date that is on or before the end date.'}
          </p>
        )}
      </div>

      {children}
    </div>
  );
}
