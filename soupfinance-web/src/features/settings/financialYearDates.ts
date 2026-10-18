/**
 * Added (SOUPFIN-158): pure date rules for the financial-years pages.
 *
 * Dates are YYYY-MM-DD strings compared as strings (they sort correctly) and
 * built from local calendar parts, never through toISOString() — see
 * SOUPFIN-64 for the off-by-one that causes.
 */
import { toLocalIsoDate } from '../../utils/date';
import type { FinancialYear, FinancialYearFormData } from '../../types/financialYear';

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

/** The calendar day after `iso`. */
export function dayAfter(iso: string): string {
  const [y, m, d] = parts(iso);
  return toLocalIsoDate(new Date(y, m - 1, d + 1));
}

/** The calendar day before `iso`. */
export function dayBefore(iso: string): string {
  const [y, m, d] = parts(iso);
  return toLocalIsoDate(new Date(y, m - 1, d - 1));
}

/** The last day of the twelve-month year starting on `fromIso`. */
export function yearEndFor(fromIso: string): string {
  const [y, m, d] = parts(fromIso);
  return toLocalIsoDate(new Date(y + 1, m - 1, d - 1));
}

/** "FY 2025" for a calendar year, "FY 2025-26" for one that spans two. */
export function nameFor(fromIso: string, toIso: string): string {
  const fromYear = fromIso.slice(0, 4);
  const toYear = toIso.slice(0, 4);
  return fromYear === toYear ? `FY ${fromYear}` : `FY ${fromYear}-${toYear.slice(2)}`;
}

/**
 * Defaults for the create form: the year after the latest one on file, or the
 * current calendar year when there is none.
 */
export function suggestNextYear(years: FinancialYear[], today: string): FinancialYearFormData {
  const latestEnd = years.reduce<string | null>(
    (latest, year) => (!latest || year.toDate > latest ? year.toDate : latest),
    null
  );
  const fromDate = latestEnd ? dayAfter(latestEnd) : `${today.slice(0, 4)}-01-01`;
  const toDate = yearEndFor(fromDate);
  return { name: nameFor(fromDate, toDate), fromDate, toDate, notes: '' };
}

/** The first existing year whose range shares a day with from..to, if any. */
export function findOverlap(years: FinancialYear[], fromDate: string, toDate: string): FinancialYear | undefined {
  return years.find((year) => year.fromDate <= toDate && fromDate <= year.toDate);
}

/**
 * Why the create form cannot be saved, or null when it can. The backend checks
 * the same rules (plan §2.2); this keeps the user from a round trip.
 */
export function validateNewYear(years: FinancialYear[], data: FinancialYearFormData): string | null {
  if (!data.name.trim()) return 'Enter a name for the financial year.';
  if (!data.fromDate || !data.toDate) return 'Enter both the start date and the end date.';
  if (data.toDate <= data.fromDate) return 'The end date must be after the start date.';
  const overlap = findOverlap(years, data.fromDate, data.toDate);
  if (overlap) return `These dates overlap ${overlap.name}. Financial years cannot share a day.`;
  return null;
}
