/**
 * Added (SOUPFIN-103): the filter state behind <ReportShell>.
 *
 * One hook owns the date range (or as-of date), the comparison period and the
 * reset behaviour for every report, so the timezone rules live in one place.
 */
import { useCallback, useMemo, useState } from 'react';
import type { ReportFilters } from '../../api/endpoints/reports';
import { getTodayIsoDate } from '../../utils/date';
import type { ReportPageConfig } from './reportRegistry';
import {
  getComparisonAsOf,
  getComparisonRange,
  getDefaultRange,
  isValidRange,
  type ComparisonMode,
  type DateRange,
} from './reportDates';

export interface ReportControls {
  dateMode: ReportPageConfig['dateMode'];
  /** The selected range. For as-of reports, from and to are both the as-of date. */
  range: DateRange;
  asOf: string;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  setAsOf: (value: string) => void;
  comparisonMode: ComparisonMode;
  setComparisonMode: (mode: ComparisonMode) => void;
  /** The range to compare with, or null when comparison is off. */
  comparisonRange: DateRange | null;
  /** The as-of date to compare with, or null when comparison is off. */
  comparisonAsOf: string | null;
  /** from/to sent to the backend for this report and for its export. */
  filters: ReportFilters;
  /** False while from is after to, or a date is blank. */
  isRangeValid: boolean;
  /**
   * Restore the defaults. Returns true if anything changed (the query key
   * changes, so React Query fetches by itself) and false if the filters were
   * already at their defaults (the caller must refetch explicitly).
   */
  reset: () => boolean;
}

function defaultsFor(page: ReportPageConfig): DateRange {
  if (page.dateMode === 'asOf') {
    const today = getTodayIsoDate();
    return { from: today, to: today };
  }
  return getDefaultRange(page.defaultRange);
}

export function useReportControls(page: ReportPageConfig): ReportControls {
  const [range, setRange] = useState<DateRange>(() => defaultsFor(page));
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('none');

  const setFrom = useCallback((value: string) => setRange((prev) => ({ ...prev, from: value })), []);
  const setTo = useCallback((value: string) => setRange((prev) => ({ ...prev, to: value })), []);
  const setAsOf = useCallback((value: string) => setRange({ from: value, to: value }), []);

  const effectiveComparison = page.comparison ? comparisonMode : 'none';

  const comparisonRange = useMemo(
    () => (page.dateMode === 'range' ? getComparisonRange(range, effectiveComparison) : null),
    [page.dateMode, range, effectiveComparison]
  );
  const comparisonAsOf = useMemo(
    () => (page.dateMode === 'asOf' ? getComparisonAsOf(range.to, effectiveComparison) : null),
    [page.dateMode, range.to, effectiveComparison]
  );

  const filters = useMemo<ReportFilters>(() => ({ from: range.from, to: range.to }), [range]);

  const reset = useCallback(() => {
    const defaults = defaultsFor(page);
    const changed =
      defaults.from !== range.from || defaults.to !== range.to || comparisonMode !== 'none';
    setRange(defaults);
    setComparisonMode('none');
    return changed;
  }, [page, range, comparisonMode]);

  return {
    dateMode: page.dateMode,
    range,
    asOf: range.to,
    setFrom,
    setTo,
    setAsOf,
    comparisonMode: effectiveComparison,
    setComparisonMode,
    comparisonRange,
    comparisonAsOf,
    filters,
    isRangeValid: isValidRange(range),
    reset,
  };
}
