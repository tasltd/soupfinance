/**
 * Shared constants and helpers for finance report pages.
 *
 * Fix (SOUPFIN-16):
 *   - REPORT_MIN_DATE / REPORT_MAX_DATE: bound the report date pickers so the
 *     browser's year-selector UI lets the user navigate beyond the current
 *     calendar year. Without these bounds some browsers (notably Chrome on
 *     macOS) restricted the year selector to the current year, making
 *     historical / forward-looking analysis impossible.
 *   - safeFilenameExtension(): defensive guard so the download attribute
 *     never produces a `.null` extension. The user-facing bug was a PDF
 *     downloading as `finance-incomeStatement-report-08-06-2026.null`.
 */

export const REPORT_MIN_DATE = '1900-01-01';
export const REPORT_MAX_DATE = '2100-12-31';

const VALID_EXTENSION = /^[a-z0-9]{1,5}$/;
const INVALID_SENTINELS = new Set(['null', 'undefined', 'nan', '0']);

/**
 * Return a safe filename extension for a given export format.
 *
 * Drops null / undefined / empty / malformed values back to the fallback
 * (default 'pdf') so the generated filename always has a sensible extension.
 */
export function safeFilenameExtension(
  format: string | null | undefined,
  fallback: string = 'pdf',
): string {
  if (typeof format !== 'string') return fallback;
  const cleaned = format.trim().toLowerCase();
  if (!cleaned) return fallback;
  if (INVALID_SENTINELS.has(cleaned)) return fallback;
  if (!VALID_EXTENSION.test(cleaned)) return fallback;
  return cleaned;
}
