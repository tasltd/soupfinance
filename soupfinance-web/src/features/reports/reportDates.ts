/**
 * Added (SOUPFIN-103): date arithmetic for the shared report shell.
 *
 * Every report used to carry its own date helpers, and most of the report bugs
 * came from them: SOUPFIN-64 (defaults built through toISOString, so a day was
 * lost east of UTC) and SOUPFIN-72-style display bugs (`new Date('2026-07-01')`
 * is UTC midnight, so the subtitle showed the previous day west of UTC).
 *
 * The rule here is simple: a report date is a calendar day, never an instant.
 * Defaults are read from the user's local calendar (utils/date), and all
 * arithmetic below works on Y/M/D parts through Date.UTC, so the user's
 * timezone can never move a day.
 */
import {
  formatDisplayDate,
  getCurrentMonthRange,
  getTodayIsoDate,
  sanitizeDateInputValue,
} from '../../utils/date';

// Fix (SOUPFIN-16): let the native date picker scroll back to any historic year.
export const REPORT_MIN_DATE = '1900-01-01';

export interface DateRange {
  from: string;
  to: string;
}

/** How a report picks its starting range. */
export type DefaultRangeKind = 'month' | 'monthToDate';

/** The comparison periods the shell offers. */
export type ComparisonMode = 'none' | 'previousPeriod' | 'previousYear';

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

function parseIsoDate(iso: string): DateParts | null {
  const clean = sanitizeDateInputValue(iso);
  if (!clean) return null;
  const [year, month, day] = clean.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function toIso({ year, month, day }: DateParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one. UTC, so no DST shift.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function utcDayNumber({ year, month, day }: DateParts): number {
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function fromUtcDayNumber(dayNumber: number): string {
  const date = new Date(dayNumber * 86_400_000);
  return toIso({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

function isMonthEnd(parts: DateParts): boolean {
  return parts.day === daysInMonth(parts.year, parts.month);
}

/** Add (or subtract) whole days. Returns '' for an unusable date. */
export function addDays(iso: string, days: number): string {
  const parts = parseIsoDate(iso);
  if (!parts) return '';
  return fromUtcDayNumber(utcDayNumber(parts) + days);
}

/**
 * Add (or subtract) whole months. The day is clamped to the target month, and
 * a month-end date stays a month-end date: 2026-03-31 minus one month is
 * 2026-02-28, and 2026-02-28 minus one month is 2026-01-31.
 */
export function addMonths(iso: string, months: number): string {
  const parts = parseIsoDate(iso);
  if (!parts) return '';
  const index = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = daysInMonth(year, month);
  const day = isMonthEnd(parts) ? lastDay : Math.min(parts.day, lastDay);
  return toIso({ year, month, day });
}

/** Inclusive number of days in a range, or 0 when the range is unusable. */
export function rangeLengthInDays(range: DateRange): number {
  const from = parseIsoDate(range.from);
  const to = parseIsoDate(range.to);
  if (!from || !to) return 0;
  const length = utcDayNumber(to) - utcDayNumber(from) + 1;
  return length > 0 ? length : 0;
}

/** True when both ends are real dates and `from` is not after `to`. */
export function isValidRange(range: DateRange): boolean {
  return rangeLengthInDays(range) > 0;
}

/** The range a report opens with, read from the user's own calendar. */
export function getDefaultRange(kind: DefaultRangeKind = 'monthToDate'): DateRange {
  const month = getCurrentMonthRange();
  return kind === 'month' ? month : { from: month.from, to: getTodayIsoDate() };
}

/**
 * Whole calendar months covered by the range, or 0 when it does not start on
 * the 1st and end on a month end.
 */
function wholeMonthSpan(range: DateRange): number {
  const from = parseIsoDate(range.from);
  const to = parseIsoDate(range.to);
  if (!from || !to || from.day !== 1 || !isMonthEnd(to)) return 0;
  const span = (to.year - from.year) * 12 + (to.month - from.month) + 1;
  return span > 0 ? span : 0;
}

/**
 * The period a report is compared against.
 *
 * - previousPeriod: the block of time just before the range. A whole-month
 *   range compares with the same number of whole months (March compares with
 *   February, not with the 31 days before March 1). Any other range compares
 *   with the same number of days immediately before it.
 * - previousYear: the same dates one year earlier, with month ends kept.
 */
export function getComparisonRange(range: DateRange, mode: ComparisonMode): DateRange | null {
  if (mode === 'none' || !isValidRange(range)) return null;

  if (mode === 'previousYear') {
    return { from: addMonths(range.from, -12), to: addMonths(range.to, -12) };
  }

  const months = wholeMonthSpan(range);
  if (months > 0) {
    return { from: addMonths(range.from, -months), to: addDays(range.from, -1) };
  }

  const length = rangeLengthInDays(range);
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

/**
 * The as-of date a point-in-time report (Balance Sheet) is compared against:
 * one month earlier for previousPeriod, one year earlier for previousYear.
 */
export function getComparisonAsOf(asOf: string, mode: ComparisonMode): string | null {
  if (mode === 'none' || !parseIsoDate(asOf)) return null;
  return addMonths(asOf, mode === 'previousYear' ? -12 : -1);
}

/** "August 1, 2026 – August 31, 2026", with no timezone shift. */
export function formatDisplayRange(range: DateRange): string {
  const from = formatDisplayDate(range.from);
  const to = formatDisplayDate(range.to);
  if (!from || !to) return '';
  return `${from} – ${to}`;
}
