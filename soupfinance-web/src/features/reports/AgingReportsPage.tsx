/**
 * Aging Reports Page
 *
 * Displays both A/R (Accounts Receivable) and A/P (Accounts Payable) aging reports
 * side by side, with age buckets: Current, 1-30 Days, 31-60 Days, 61-90 Days, Over 90 Days.
 *
 * Changed (SOUPFIN-105): this overview now buckets the open invoices and bills
 * itself (aging/agingEngine.ts), like the A/R and A/P Summary and Detail
 * reports it links to, instead of reading /financeReports/agedReceivables and
 * /agedPayables. Those endpoints count a 1-30 day amount in four buckets and
 * never count anything older, so their totals could not match the ledger.
 *
 * Reference: soupfinance-designs/ar-aging-report/, soupfinance-designs/ap-aging-report/
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ReportFilters } from '../../api/endpoints/reports';
import { formatDisplayDate } from '../../utils/date';
// Fix (SOUPFIN-33 #4): tenant-currency formatter (was hardcoded USD/"$0.00").
import { useFormatCurrency } from '../../stores';
import type { AgingReport, AgingItem } from '../../types';
// Changed (SOUPFIN-103): the as-of picker, Today button and export buttons come
// from the shared report shell. A/R and A/P are two registry entries that share
// this page, so each table keeps its own export buttons.
import { ReportExportButtons, ReportShell } from './ReportShell';
import { AGING_OVERVIEW_PAGE, getReportDefinition, type ReportDefinition } from './reportRegistry';
import { useReportControls } from './useReportControls';
import type { ClientExports } from './useReportExport';
import {
  DEFAULT_BUCKET_CONFIG,
  buildAgingSummary,
  buildSummaryCsv,
  type AgingSummary,
  type OpenDocument,
} from './aging/agingEngine';
import { AGING_SIDES } from './aging/agingSides';
import { useAgingDocuments } from './aging/useAgingData';

const AR_DEFINITION = getReportDefinition('ar-aging');
const AP_DEFINITION = getReportDefinition('ap-aging');

/**
 * Added (SOUPFIN-105): the overview's five fixed columns are the default
 * Current / 1-30 / 31-60 / 61-90 / Over 90 periods. Custom periods live on the
 * Summary and Detail reports.
 */
function toAgingReport(asOf: string, summary: AgingSummary): AgingReport {
  const [current, days30, days60, days90, over90] = [0, 1, 2, 3, 4].map((i) => summary.totals[i] ?? 0);
  return {
    asOf,
    items: summary.rows.map((row) => ({
      entity: { id: row.partyId || row.partyName, name: row.partyName },
      current: row.amounts[0] ?? 0,
      days30: row.amounts[1] ?? 0,
      days60: row.amounts[2] ?? 0,
      days90: row.amounts[3] ?? 0,
      over90: row.amounts[4] ?? 0,
      total: row.total,
    })),
    totals: { current, days30, days60, days90, over90, total: summary.total },
  };
}

function useOverviewAging(documents: OpenDocument[], asOf: string, partyLabel: string) {
  return useMemo(() => {
    const summary = buildAgingSummary(documents, DEFAULT_BUCKET_CONFIG);
    const clientExports: ClientExports = {
      csv: () => new Blob([buildSummaryCsv(summary, partyLabel, asOf)], { type: 'text/csv;charset=utf-8' }),
    };
    return { report: toAgingReport(asOf, summary), clientExports };
  }, [documents, asOf, partyLabel]);
}

/*
 * Fix (SOUPFIN-33 #4): the module-level formatCurrency() that used to live here
 * hardcoded `$0.00` / Intl 'en-US' + 'USD', so a GHS tenant saw the whole A/P and
 * A/R aging tables in dollars while every other report rendered GH₵. Both consumers
 * are React components, so they now call useFormatCurrency() (account-store backed)
 * and re-render if the tenant currency changes.
 */

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
  /**
   * Fix (SOUPFIN-35): the empty-state heading used to be derived with
   * `title.toLowerCase().replace(' aging', '')`, which destroyed the acronym
   * and rendered "No outstanding a/r". Casing is content, not a transform —
   * pass the short label already cased instead of deriving it.
   */
  shortLabel: string; // "A/R" | "A/P"
  entityLabel: string; // "Customer" for A/R, "Vendor" for A/P
  /**
   * Plural, lowercase form for the empty-state sentence ("customers are
   * current"). Explicit for the same reason as `shortLabel`: deriving it with
   * `entityLabel.toLowerCase() + 's'` happens to read correctly for "Customer"
   * and "Vendor", but silently breaks on an acronym or an irregular plural.
   */
  entityPlural: string; // "customers" | "vendors"
  data: AgingReport | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** The registry entry whose export this table's buttons run. */
  definition: ReportDefinition;
  exportFilters: ReportFilters;
  /** Added (SOUPFIN-105): the CSV is built from the rows on screen. */
  clientExports?: ClientExports;
  /** Added (SOUPFIN-105): the Summary/Detail report for this side. */
  reportPath: string;
  testIdPrefix: string;
}

function AgingTable({
  title,
  icon,
  shortLabel,
  entityLabel,
  entityPlural,
  data,
  isLoading,
  isError,
  error,
  definition,
  exportFilters,
  clientExports,
  reportPath,
  testIdPrefix,
}: AgingTableProps) {
  // Fix (SOUPFIN-33 #4): amounts follow the tenant's configured currency (GH₵ for
  // GHS accounts), matching the A/R table and the rest of the reports module.
  const formatCurrency = useFormatCurrency();

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
          <Link
            to={reportPath}
            className="text-sm font-bold text-primary hover:underline"
            data-testid={`${testIdPrefix}-open-report`}
          >
            View details
          </Link>
        </div>

        {/* Export Buttons */}
        <ReportExportButtons
          definition={definition}
          filters={exportFilters}
          testIdPrefix={testIdPrefix}
          disabled={isLoading || !data}
          clientExports={clientExports}
          size="sm"
        />
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
          {/*
            Single template literal, for the same reason as the sentence below:
            `No outstanding {shortLabel}` would compile to two sibling text
            nodes and an a11y serialiser joining them with a space reads
            "No outstanding  A/R" (doubled space). See SOUPFIN-30 #13.
          */}
          <h4
            className="text-base font-bold text-text-light dark:text-text-dark mb-2"
            data-testid={`${testIdPrefix}-empty-heading`}
          >
            {`No outstanding ${shortLabel}`}
          </h4>
          {/*
            Fix (SOUPFIN-30 #13): render the pluralised sentence as ONE text node.
            `All {expr}s are current` compiles to three sibling text nodes
            (["All ", entity, "s are current..."]). Anything that joins sibling
            text nodes with a separator — accessibility-tree serialisers and the
            a11y scanners used in V19 testing — reads that back as
            "All customer s are current". Interpolating in a single template
            literal leaves exactly one text node, so it cannot be split.
          */}
          <p className="text-subtle-text text-sm" data-testid={`${testIdPrefix}-empty-message`}>
            {`All ${entityPlural} are current as of this date.`}
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
  // Fix (SOUPFIN-33 #4): summary cards use the tenant currency, not a hardcoded "$".
  const formatCurrency = useFormatCurrency();

  // Changed (SOUPFIN-103): as-of date (default: the user's own today) from the shell
  const controls = useReportControls(AGING_OVERVIEW_PAGE);
  const asOfDate = controls.asOf;

  // Changed (SOUPFIN-105): open invoices and bills, bucketed in the browser.
  const ar = useAgingDocuments('receivables', asOfDate, controls.isRangeValid);
  const ap = useAgingDocuments('payables', asOfDate, controls.isRangeValid);
  const arOverview = useOverviewAging(ar.documents, asOfDate, AGING_SIDES.receivables.partyLabel);
  const apOverview = useOverviewAging(ap.documents, asOfDate, AGING_SIDES.payables.partyLabel);
  const arAgingData = ar.isLoaded ? arOverview.report : undefined;
  const apAgingData = ap.isLoaded ? apOverview.report : undefined;
  const arLoading = ar.isLoading;
  const apLoading = ap.isLoading;

  // Fix(SOUPFIN-11): the "Today" button must refresh even when the date is
  // already today. The shell calls this when Reset changes nothing.
  const refreshBoth = () => {
    ar.refetch();
    ap.refetch();
  };

  return (
    <ReportShell
      page={AGING_OVERVIEW_PAGE}
      controls={controls}
      onRefresh={refreshBoth}
      isFetching={ar.isFetching || ap.isFetching}
      subtitle={
        <>
          Outstanding receivables and payables by age as of{' '}
          {/* Fix (SOUPFIN-30 #12): format the date for display (was raw ISO). */}
          <span className="font-medium text-text-light dark:text-text-dark">{formatDisplayDate(asOfDate)}</span>
        </>
      }
    >
      {/* Two-Column Grid: A/R and A/P side by side on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Accounts Receivable Aging */}
        <AgingTable
          title="A/R Aging"
          icon="receipt_long"
          shortLabel="A/R"
          entityLabel="Customer"
          entityPlural="customers"
          data={arAgingData}
          isLoading={arLoading}
          isError={ar.isError}
          error={ar.error}
          definition={AR_DEFINITION}
          exportFilters={controls.filters}
          clientExports={arOverview.clientExports}
          reportPath={AGING_SIDES.receivables.paths.summary}
          testIdPrefix="ar-aging"
        />

        {/* Accounts Payable Aging */}
        <AgingTable
          title="A/P Aging"
          icon="payments"
          shortLabel="A/P"
          entityLabel="Vendor"
          entityPlural="vendors"
          data={apAgingData}
          isLoading={apLoading}
          isError={ap.isError}
          error={ap.error}
          definition={AP_DEFINITION}
          exportFilters={controls.filters}
          clientExports={apOverview.clientExports}
          reportPath={AGING_SIDES.payables.paths.summary}
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
    </ReportShell>
  );
}
