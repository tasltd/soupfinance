/**
 * Added (SOUPFIN-103): the page for registry-only reports.
 *
 * A report whose registry entry has a `source` (or a `load`) and `columns`
 * needs no page of its own: this component reads the entry for the :reportId
 * route parameter, fetches the rows, and renders them as a table inside
 * <ReportShell>. Currency columns use the tenant's currency.
 *
 * Changed (SOUPFIN-104): renders the core report pack.
 * - Rows come from the entry's loader when it has one.
 * - Rows can be grouped, with a header and a subtotal per group, and a loader
 *   can replace the totals row (net income instead of income plus expenses).
 * - Reports without a backend export get PDF, Excel and CSV built in the
 *   browser from the rows on screen, so every report exports all three.
 * - Load errors use ApiErrorState, so a disabled module reads as such rather
 *   than as "Request failed with status code 403".
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { fetchReportRows } from '../../api/endpoints/reports';
import { ApiErrorState } from '../../components/feedback/ApiErrorState';
import { useCurrencyConfig, useFormatCurrency } from '../../stores';
import { formatDisplayDate } from '../../utils/date';
import { formatDisplayRange } from './reportDates';
import {
  buildReportCsvBlob,
  buildReportExcelBlob,
  buildReportPdfHtml,
  pdfOrientation,
  renderReportPdf,
  type ReportExportContent,
} from './reportExportFiles';
import { ReportShell } from './ReportShell';
import {
  findReportDefinition,
  isRegistryOnlyReport,
  type ReportDefinition,
} from './reportRegistry';
import {
  REPORT_ROW_LIMIT,
  buildDisplayRows,
  formatReportCell,
  type DisplayRow,
  type ReportColumn,
  type ReportTable,
} from './reportTable';
import { useReportControls } from './useReportControls';
import type { ClientExports } from './useReportExport';

export function RegistryReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const definition = findReportDefinition(reportId);

  // An unknown id, or a report that has its own page, goes back to the hub.
  if (!definition || !isRegistryOnlyReport(definition)) {
    return <Navigate to="/reports" replace />;
  }
  // Keyed so switching between two registry reports resets the filters.
  return <RegistryReport key={definition.id} definition={definition} />;
}

/** `${p}-totals` for the first footer row, `${p}-totals-2` and on for the rest. */
function totalTestId(rows: DisplayRow[], index: number, prefix: string): string {
  const ordinal = rows.slice(0, index).filter((row) => row.kind === 'total').length;
  return ordinal === 0 ? `${prefix}-totals` : `${prefix}-totals-${ordinal + 1}`;
}

function loadTable(definition: ReportDefinition, controls: ReturnType<typeof useReportControls>): Promise<ReportTable> {
  if (definition.load) {
    return definition.load({ range: controls.range, filters: controls.filters });
  }
  const source = definition.source!;
  return fetchReportRows(source.endpoint, controls.filters, source.rows).then((rows) => ({ rows }));
}

function RegistryReport({ definition }: { definition: ReportDefinition }) {
  const controls = useReportControls(definition.page);
  const formatCurrency = useFormatCurrency();
  const currency = useCurrencyConfig();
  const p = definition.page.testIdPrefix;

  const { data: table, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['registryReport', definition.id, controls.filters],
    queryFn: () => loadTable(definition, controls),
    staleTime: 5 * 60 * 1000,
    enabled: controls.isRangeValid,
    // A report that fails (a disabled module, a 500) fails the same way twice.
    retry: false,
  });

  const columns: ReportColumn[] = table?.columns ?? definition.columns ?? [];
  const displayRows: DisplayRow[] = useMemo(
    () =>
      table
        ? buildDisplayRows(table, columns, { groupBy: definition.groupBy, showTotals: definition.showTotals })
        : [],
    [table, columns, definition.groupBy, definition.showTotals]
  );

  const periodText =
    definition.page.dateMode === 'range'
      ? formatDisplayRange(controls.range)
      : `As of ${formatDisplayDate(controls.asOf)}`;

  // Every report without a backend export builds all three formats from the
  // rows on screen.
  const clientExports = useMemo<ClientExports | undefined>(() => {
    if (definition.export.backendType) return undefined;
    const content = (): ReportExportContent => ({
      title: definition.title,
      subtitle: periodText,
      columns,
      displayRows,
      currencyCode: currency.code,
    });
    return {
      csv: () => buildReportCsvBlob(content()),
      xlsx: () => buildReportExcelBlob(content()),
      pdf: () => renderReportPdf(buildReportPdfHtml(content(), formatCurrency), pdfOrientation(columns)),
    };
  }, [definition, periodText, columns, displayRows, currency.code, formatCurrency]);

  const align = (column: ReportColumn) =>
    column.type === 'text' || column.type === 'date' ? 'text-left' : 'text-right font-mono whitespace-nowrap';

  return (
    <ReportShell
      page={definition.page}
      controls={controls}
      onRefresh={() => refetch()}
      exportDefinition={definition}
      exportDisabled={isLoading || isError}
      clientExports={clientExports}
      isFetching={isFetching}
      subtitle={
        <>
          {definition.description} · {periodText}
        </>
      }
    >
      {table?.truncated && (
        <div
          className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text-light dark:text-text-dark"
          role="status"
          data-testid={`${p}-truncated`}
        >
          <span className="material-symbols-outlined text-warning">warning</span>
          <p>
            This report read the first {REPORT_ROW_LIMIT.toLocaleString('en-US')} records only, so its totals may be
            low. Pick a shorter date range.
          </p>
        </div>
      )}

      {isError ? (
        <ApiErrorState error={error} onRetry={() => refetch()} testId={`${p}-error`} />
      ) : (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
          data-testid={`${p}-table-container`}
        >
          {isLoading ? (
            <div className="p-12 text-center" data-testid={`${p}-loading`}>
              <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">sync</span>
              <p className="text-subtle-text">Loading {definition.title.toLowerCase()}...</p>
            </div>
          ) : !table || table.rows.length === 0 ? (
            <div className="p-12 text-center" data-testid={`${p}-empty`}>
              <span className="material-symbols-outlined text-6xl text-subtle-text/50 mb-4">{definition.icon}</span>
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Nothing to show</h3>
              <p className="text-subtle-text max-w-md mx-auto">
                {definition.page.dateMode === 'range'
                  ? 'This report has no rows for the dates you picked. Try a wider date range.'
                  : 'This report has no rows for the date you picked. Try a later date.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm" data-testid={`${p}-table`}>
                <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className={`px-4 py-3 font-semibold whitespace-nowrap ${
                          column.type === 'text' || column.type === 'date' ? 'text-left' : 'text-right'
                        }`}
                      >
                        {column.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((displayRow, index) => {
                    if (displayRow.kind === 'group') {
                      return (
                        <tr
                          key={`group-${index}`}
                          className="bg-background-light/60 dark:bg-background-dark/60"
                          data-testid={`${p}-group-${index}`}
                        >
                          <th
                            colSpan={columns.length}
                            scope="rowgroup"
                            className="px-4 py-2 text-left font-bold text-text-light dark:text-text-dark"
                          >
                            {displayRow.label}
                          </th>
                        </tr>
                      );
                    }
                    const kindClass =
                      displayRow.kind === 'row'
                        ? 'border-b border-border-light dark:border-border-dark hover:bg-primary/5'
                        : displayRow.kind === 'subtotal'
                          ? 'border-b border-border-light dark:border-border-dark font-semibold'
                          : 'bg-background-light dark:bg-background-dark font-bold border-t-2 border-text-light dark:border-text-dark';
                    const testId =
                      displayRow.kind === 'row'
                        ? `${p}-row-${index}`
                        : displayRow.kind === 'subtotal'
                          ? `${p}-subtotal-${index}`
                          : totalTestId(displayRows, index, p);
                    return (
                      <tr key={`${displayRow.kind}-${index}`} className={kindClass} data-testid={testId}>
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={`px-4 py-3 text-text-light dark:text-text-dark ${align(column)}`}
                          >
                            {formatReportCell(column, displayRow.row[column.key], formatCurrency)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Link to="/reports" className="self-start text-sm font-medium text-primary hover:underline">
        Back to all reports
      </Link>
    </ReportShell>
  );
}
