/**
 * Added (SOUPFIN-104): the table model every registry report renders and exports.
 *
 * A loader returns a ReportTable (rows, optional dynamic columns, optional
 * summary rows). This module turns it into the rows the page draws and the
 * export files write: group headers, per-group subtotals and the footer. The
 * screen and all three export formats read the same DisplayRow list, so a
 * PDF, an Excel sheet and a CSV always show what the page showed.
 */
import type { ReportRow } from '../../api/endpoints/reports';
import { formatDisplayDate } from '../../utils/date';

export type ReportColumnType = 'text' | 'date' | 'currency' | 'number' | 'percent';

export interface ReportColumn {
  /** Field on the row. */
  key: string;
  header: string;
  type: ReportColumnType;
  /**
   * Whether the column is summed in subtotals and the totals row. Defaults to
   * true for currency and number columns, false for every other type. Set it
   * false for running balances, which must not be added up.
   */
  total?: boolean;
}

export interface ReportTable {
  rows: ReportRow[];
  /** Replaces the registry columns (P&L by Month has one column per month). */
  columns?: ReportColumn[];
  /**
   * Replaces the automatic totals row. Used where a plain sum means nothing,
   * such as income and expenses on one report (the footer shows net income).
   */
  summaryRows?: ReportRow[];
  /** True when the source had more rows than REPORT_ROW_LIMIT. */
  truncated?: boolean;
}

export type DisplayRow =
  | { kind: 'group'; label: string }
  | { kind: 'row'; row: ReportRow }
  | { kind: 'subtotal'; label: string; row: ReportRow }
  | { kind: 'total'; row: ReportRow };

/** Most rows one report will fetch and draw. Beyond it the page says so. */
export const REPORT_ROW_LIMIT = 5000;

/** A cell value as a number; blanks and non-numbers count as 0. */
export function toReportNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Money and ratios kept to two decimals so float noise never reaches a cell. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function isTotalledColumn(column: ReportColumn): boolean {
  if (column.total !== undefined) return column.total;
  return column.type === 'currency' || column.type === 'number';
}

/** Sum of each totalled column, keyed by column key. */
export function totalReportColumns(rows: ReportRow[], columns: ReportColumn[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const column of columns) {
    if (!isTotalledColumn(column)) continue;
    totals[column.key] = round2(rows.reduce((sum, row) => sum + toReportNumber(row[column.key]), 0));
  }
  return totals;
}

/**
 * The rows to draw, in order.
 *
 * - With `groupBy`, rows are grouped by that field in first-seen order; each
 *   group gets a header and, when any column is totalled, a subtotal.
 * - The footer is the loader's summary rows, or else one totals row when any
 *   column is totalled and `showTotals` is not false.
 */
export function buildDisplayRows(
  table: ReportTable,
  columns: ReportColumn[],
  options: { groupBy?: string; showTotals?: boolean } = {}
): DisplayRow[] {
  const { groupBy, showTotals = true } = options;
  const hasTotals = columns.some(isTotalledColumn);
  const labelKey = columns[0]?.key ?? 'label';
  const out: DisplayRow[] = [];

  if (groupBy) {
    const groups = new Map<string, ReportRow[]>();
    for (const row of table.rows) {
      const label = String(row[groupBy] ?? '') || 'Unassigned';
      const list = groups.get(label);
      if (list) list.push(row);
      else groups.set(label, [row]);
    }
    for (const [label, rows] of groups) {
      out.push({ kind: 'group', label });
      for (const row of rows) out.push({ kind: 'row', row });
      if (hasTotals) {
        out.push({
          kind: 'subtotal',
          label: `Total ${label}`,
          row: { [labelKey]: `Total ${label}`, ...totalReportColumns(rows, columns) },
        });
      }
    }
  } else {
    for (const row of table.rows) out.push({ kind: 'row', row });
  }

  if (table.summaryRows) {
    for (const row of table.summaryRows) out.push({ kind: 'total', row });
  } else if (hasTotals && showTotals && table.rows.length > 0) {
    out.push({ kind: 'total', row: { [labelKey]: 'Total', ...totalReportColumns(table.rows, columns) } });
  }
  return out;
}

/** A cell as the page and the PDF show it. Money goes through the tenant formatter. */
export function formatReportCell(
  column: ReportColumn,
  value: unknown,
  formatCurrency: (amount: number) => string
): string {
  if (value === null || value === undefined || value === '') {
    // A blank money cell on a group/summary row stays blank rather than 0.00.
    return '';
  }
  switch (column.type) {
    case 'currency':
      return formatCurrency(toReportNumber(value));
    case 'number':
      return toReportNumber(value).toLocaleString('en-US');
    case 'percent':
      return `${toReportNumber(value).toFixed(1)}%`;
    case 'date':
      return formatDisplayDate(String(value)) || String(value);
    default:
      return String(value);
  }
}

/**
 * A cell as a spreadsheet stores it: numbers stay numbers (two decimals, no
 * currency symbol) so they can be summed; dates stay ISO so they sort.
 */
export function rawReportCell(column: ReportColumn, value: unknown): string | number {
  if (value === null || value === undefined || value === '') return '';
  if (column.type === 'currency' || column.type === 'number' || column.type === 'percent') {
    return round2(toReportNumber(value));
  }
  if (column.type === 'date') {
    // Only a timestamp loses its time. A label in a date column ("Total") must
    // not: "Total".split('T') would turn it into an empty string.
    const text = String(value);
    return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : text;
  }
  return String(value);
}

/** `a / b * 100`, or 0 when b is 0, so a period with no income reads 0% rather than NaN. */
export function percentOf(part: number, whole: number): number {
  return whole === 0 ? 0 : round2((part / whole) * 100);
}
