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
