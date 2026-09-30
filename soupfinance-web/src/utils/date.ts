/**
 * Date utilities.
 *
 * SOUPFIN-19: Centralised sanitiser for values bound to a native
 * <input type="date">. The HTML5 date input expects a strict YYYY-MM-DD value;
 * anything else (a MariaDB "0000-00-00" null sentinel, an ISO datetime, a null,
 * or a localized "0/0/0") makes some browsers render the "0/0/0" placeholder
 * instead of a blank field. Coercing unusable values to '' makes the input fall
 * back to its standard locale placeholder (mm/dd/yyyy) so users see an empty
 * picker rather than a confusing zero date.
 */

/**
 * Normalise an arbitrary backend/string value into a value the native date
 * input can safely render. Returns '' for null/empty/invalid input so the
 * picker shows its standard placeholder, or a clean YYYY-MM-DD string.
 */
export function sanitizeDateInputValue(value?: string | number | null): string {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();
  // Empty, the MariaDB null-date sentinel, or the localized zero-date placeholder.
  if (!trimmed || trimmed.startsWith('0000-') || trimmed === '0000-00-00' || trimmed === '0/0/0') {
    return '';
  }
  // Strip the time portion of an ISO datetime (e.g. "2024-01-01T00:00:00.000Z").
  const datePart = trimmed.split('T')[0];
  // Only forward strictly-shaped YYYY-MM-DD values; reject anything else.
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '';
}

/**
 * Added (SOUPFIN-30 #12): Format a date value for human-readable *display*
 * (report subtitles, "As of" labels) as e.g. "July 21, 2026". Aging and Trial
 * Balance reports were rendering the raw ISO/YYYY-MM-DD value (e.g.
 * "as of 2026-07-21") while Balance Sheet/Cash Flow formatted theirs.
 *
 * Parses the date parts manually to avoid the UTC-midnight timezone shift that
 * `new Date('2026-07-21')` introduces (which can render the previous day in
 * negative-offset timezones). Returns '' for unusable input so callers can hide
 * the suffix rather than print "Invalid Date".
 */
export function formatDisplayDate(value?: string | number | null): string {
  const sanitized = sanitizeDateInputValue(value);
  if (!sanitized) return '';
  const [year, month, day] = sanitized.split('-').map(Number);
  // Construct in local time from explicit parts (no timezone shift).
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Fix (SOUPFIN-64): Format a Date as YYYY-MM-DD using its *local* calendar
 * parts.
 *
 * `new Date().toISOString().split('T')[0]` is the obvious-looking way to write
 * "today", and it is wrong: `toISOString()` converts to UTC first, so at any
 * positive UTC offset a Date built at local midnight rolls back a day. A user
 * in Paris opening Trial Balance got a default range of 2026-07-31..2026-08-30
 * instead of 2026-08-01..2026-08-31 — the last day of the month silently
 * excluded from every default report view, so month-end figures read low. From
 * Ghana (UTC+0) the bug is invisible, which is why it went unnoticed.
 *
 * Building the string from getFullYear/getMonth/getDate never converts, so the
 * returned date is always the one the user sees on their own calendar. This is
 * the write-side counterpart to `formatDisplayDate()` above, which already
 * avoids the equivalent trap on the read side.
 */
export function toLocalIsoDate(date: Date = new Date()): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fix (SOUPFIN-64): Today's date in the user's own timezone, as YYYY-MM-DD.
 * Use this for every default date-input value and "as of" report date — never
 * `new Date().toISOString().split('T')[0]`, which yields UTC today and is
 * therefore off by one for part of every day.
 */
export function getTodayIsoDate(): string {
  return toLocalIsoDate(new Date());
}

/**
 * Fix (SOUPFIN-64): First and last calendar day of the month containing
 * `reference` (default: now), in the user's own timezone.
 *
 * `new Date(y, m + 1, 0)` is the standard "last day of month" trick and is
 * correct — what broke was formatting its result through `toISOString()`.
 */
export function getCurrentMonthRange(reference: Date = new Date()): {
  from: string;
  to: string;
} {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  return {
    from: toLocalIsoDate(new Date(year, month, 1)),
    to: toLocalIsoDate(new Date(year, month + 1, 0)),
  };
}

/**
 * Fix (SOUPFIN-64): First calendar day of the month containing `reference`
 * (default: now), in the user's own timezone.
 */
export function getFirstDayOfCurrentMonth(reference: Date = new Date()): string {
  return getCurrentMonthRange(reference).from;
}
