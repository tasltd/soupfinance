/**
 * SOUPFIN-103: date arithmetic behind the report shell.
 *
 * Every case runs in timezones on both sides of UTC. The functions under test
 * treat a report date as a calendar day, so the answer must never depend on
 * where the browser is. SOUPFIN-64 failed east of UTC and the subtitle bug
 * failed west of it; a UTC-only run catches neither.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  addDays,
  addMonths,
  formatDisplayRange,
  getComparisonAsOf,
  getComparisonRange,
  getDefaultRange,
  isValidRange,
  rangeLengthInDays,
} from '../reportDates';

const ZONES = ['UTC', 'America/Los_Angeles', 'Pacific/Honolulu', 'Europe/Paris', 'Asia/Kolkata', 'Pacific/Kiritimati'];
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe.each(ZONES)('report date arithmetic in %s', (tz) => {
  it('adds and subtracts days across month, year and leap-day boundaries', () => {
    process.env.TZ = tz;
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    // Across a DST change (US: 2026-03-08, EU: 2026-03-29) a day is still a day.
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('adds months, clamping the day and keeping month ends at month end', () => {
    process.env.TZ = tz;
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2028-03-31', -1)).toBe('2028-02-29');
    expect(addMonths('2026-02-28', -1)).toBe('2026-01-31');
    expect(addMonths('2026-03-15', -1)).toBe('2026-02-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2028-02-29', -12)).toBe('2027-02-28');
    expect(addMonths('2027-02-28', 12)).toBe('2028-02-29');
  });

  it('compares a whole month with the whole previous month', () => {
    process.env.TZ = tz;
    expect(getComparisonRange({ from: '2026-03-01', to: '2026-03-31' }, 'previousPeriod')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(getComparisonRange({ from: '2026-01-01', to: '2026-01-31' }, 'previousPeriod')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('compares a quarter with the quarter before, and a year with the year before', () => {
    process.env.TZ = tz;
    expect(getComparisonRange({ from: '2026-04-01', to: '2026-06-30' }, 'previousPeriod')).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(getComparisonRange({ from: '2026-01-01', to: '2026-12-31' }, 'previousPeriod')).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('compares a partial range with the same number of days just before it', () => {
    process.env.TZ = tz;
    // Month to date, 15 days: the 15 days before it.
    expect(getComparisonRange({ from: '2026-08-01', to: '2026-08-15' }, 'previousPeriod')).toEqual({
      from: '2026-07-17',
      to: '2026-07-31',
    });
    // One day compares with the day before.
    expect(getComparisonRange({ from: '2026-03-01', to: '2026-03-01' }, 'previousPeriod')).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
  });

  it('compares with the same dates a year earlier', () => {
    process.env.TZ = tz;
    expect(getComparisonRange({ from: '2028-02-01', to: '2028-02-29' }, 'previousYear')).toEqual({
      from: '2027-02-01',
      to: '2027-02-28',
    });
    expect(getComparisonRange({ from: '2026-08-01', to: '2026-08-15' }, 'previousYear')).toEqual({
      from: '2025-08-01',
      to: '2025-08-15',
    });
  });

  it('compares an as-of date with a month and a year earlier', () => {
    process.env.TZ = tz;
    expect(getComparisonAsOf('2026-03-31', 'previousPeriod')).toBe('2026-02-28');
    expect(getComparisonAsOf('2026-03-31', 'previousYear')).toBe('2025-03-31');
    expect(getComparisonAsOf('2026-03-31', 'none')).toBeNull();
  });

  it('formats a range without moving either end by a day', () => {
    process.env.TZ = tz;
    // `new Date('2026-08-01')` is UTC midnight: west of UTC it prints July 31.
    expect(formatDisplayRange({ from: '2026-08-01', to: '2026-08-31' })).toBe(
      'August 1, 2026 – August 31, 2026'
    );
  });

  it('opens on the local month, read from the local calendar', () => {
    process.env.TZ = tz;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Midday UTC mid-month: the local month is August everywhere.
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(getDefaultRange('month')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(getDefaultRange('monthToDate').from).toBe('2026-08-01');
    expect(getDefaultRange('monthToDate').to).toBe(tz === 'Pacific/Kiritimati' ? '2026-08-16' : '2026-08-15');
  });
});

describe('unusable input', () => {
  it('returns no comparison for an empty, reversed or nonsense range', () => {
    expect(getComparisonRange({ from: '', to: '2026-08-31' }, 'previousPeriod')).toBeNull();
    expect(getComparisonRange({ from: '2026-09-01', to: '2026-08-31' }, 'previousYear')).toBeNull();
    expect(getComparisonRange({ from: '2026-02-30', to: '2026-03-31' }, 'previousPeriod')).toBeNull();
    expect(getComparisonRange({ from: '0000-00-00', to: '2026-03-31' }, 'previousPeriod')).toBeNull();
    expect(getComparisonAsOf('', 'previousYear')).toBeNull();
  });

  it('treats only a forward range of real dates as valid', () => {
    expect(isValidRange({ from: '2026-08-01', to: '2026-08-01' })).toBe(true);
    expect(isValidRange({ from: '2026-08-02', to: '2026-08-01' })).toBe(false);
    expect(isValidRange({ from: '', to: '' })).toBe(false);
    expect(rangeLengthInDays({ from: '2026-08-01', to: '2026-08-31' })).toBe(31);
    expect(addDays('not-a-date', 1)).toBe('');
    expect(addMonths('2026-13-01', 1)).toBe('');
    expect(formatDisplayRange({ from: '', to: '2026-08-31' })).toBe('');
  });

  it('handles a very long range: a century of days, compared with the century before', () => {
    const range = { from: '1900-01-01', to: '1999-12-31' };
    expect(rangeLengthInDays(range)).toBe(36_524);
    expect(getComparisonRange(range, 'previousPeriod')).toEqual({ from: '1800-01-01', to: '1899-12-31' });
  });
});
