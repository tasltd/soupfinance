/**
 * Unit tests for the shared date-input sanitiser (SOUPFIN-19).
 *
 * Guards against the "0/0/0" placeholder bug: a null / sentinel / malformed
 * value must collapse to '' so a native <input type="date"> shows its standard
 * locale placeholder rather than a zero date.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeDateInputValue, formatDisplayDate } from '../date';

describe('sanitizeDateInputValue (SOUPFIN-19)', () => {
  it('returns "" for null / undefined / empty values', () => {
    expect(sanitizeDateInputValue(null)).toBe('');
    expect(sanitizeDateInputValue(undefined)).toBe('');
    expect(sanitizeDateInputValue('')).toBe('');
    expect(sanitizeDateInputValue('   ')).toBe('');
  });

  it('returns "" for the MariaDB null-date sentinel and zero-date placeholders', () => {
    expect(sanitizeDateInputValue('0000-00-00')).toBe('');
    expect(sanitizeDateInputValue('0000-01-01')).toBe('');
    expect(sanitizeDateInputValue('0/0/0')).toBe('');
  });

  it('returns "" for malformed date strings instead of forwarding them', () => {
    expect(sanitizeDateInputValue('not-a-date')).toBe('');
    expect(sanitizeDateInputValue('01/01/2024')).toBe('');
    expect(sanitizeDateInputValue('2024-1-1')).toBe('');
    expect(sanitizeDateInputValue('2024/01/01')).toBe('');
  });

  it('passes through a valid YYYY-MM-DD value unchanged', () => {
    expect(sanitizeDateInputValue('2024-01-01')).toBe('2024-01-01');
    expect(sanitizeDateInputValue('  2024-12-31  ')).toBe('2024-12-31');
  });

  it('strips the time portion of an ISO datetime', () => {
    expect(sanitizeDateInputValue('2024-01-01T00:00:00.000Z')).toBe('2024-01-01');
    expect(sanitizeDateInputValue('2024-06-17T13:45:00')).toBe('2024-06-17');
  });
});

describe('formatDisplayDate (SOUPFIN-30 #12)', () => {
  it('formats a YYYY-MM-DD value as a long human-readable date', () => {
    expect(formatDisplayDate('2026-07-21')).toBe('July 21, 2026');
    expect(formatDisplayDate('2024-01-01')).toBe('January 1, 2024');
    expect(formatDisplayDate('2024-12-31')).toBe('December 31, 2024');
  });

  it('formats an ISO datetime by stripping the time first', () => {
    expect(formatDisplayDate('2026-07-21T00:00:00Z')).toBe('July 21, 2026');
  });

  it('does not shift the day across timezones (no UTC-midnight bug)', () => {
    // new Date('2026-07-21') would parse as UTC midnight and could render the
    // 20th in negative-offset zones; the parts-based parse must stay on the 21st.
    expect(formatDisplayDate('2026-07-21')).toContain('21');
    expect(formatDisplayDate('2026-07-21')).toContain('2026');
  });

  it('returns "" for null / undefined / empty / sentinel / malformed input', () => {
    expect(formatDisplayDate(null)).toBe('');
    expect(formatDisplayDate(undefined)).toBe('');
    expect(formatDisplayDate('')).toBe('');
    expect(formatDisplayDate('0000-00-00')).toBe('');
    expect(formatDisplayDate('0/0/0')).toBe('');
    expect(formatDisplayDate('not-a-date')).toBe('');
    expect(formatDisplayDate('01/01/2026')).toBe('');
  });
});
