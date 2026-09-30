/**
 * SOUPFIN-64 — report default date ranges are off by one day east of UTC.
 *
 * `new Date(y, m, 1).toISOString().split('T')[0]` builds a Date at LOCAL
 * midnight and then converts it to UTC, so at any positive UTC offset the
 * formatted date rolls back a day. Trial Balance, Cash Flow and P&L all
 * defaulted to the previous month's last day through to a day before month end.
 *
 * These tests are the reason the fix is verifiable at all: a UTC-only run
 * cannot catch this bug, because in UTC the broken code and the fixed code
 * agree. Node 22 re-reads `process.env.TZ` on every Date operation, so each
 * case forces its own timezone rather than trusting whatever TZ the CI machine
 * happens to run in.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  toLocalIsoDate,
  getTodayIsoDate,
  getCurrentMonthRange,
  getFirstDayOfCurrentMonth,
} from '../date';

/** Timezones east of UTC — the ones where the old code was wrong. */
const POSITIVE_OFFSET = ['Europe/Paris', 'Asia/Kolkata', 'Pacific/Kiritimati'];
/** UTC and a western zone — the old code happened to be right here. */
const NON_POSITIVE_OFFSET = ['UTC', 'America/New_York'];
const ALL_ZONES = [...NON_POSITIVE_OFFSET, ...POSITIVE_OFFSET];

const ORIGINAL_TZ = process.env.TZ;

function withTimezone(tz: string) {
  process.env.TZ = tz;
}

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
  vi.useRealTimers();
});

describe('toLocalIsoDate', () => {
  it.each(ALL_ZONES)('formats local calendar parts in %s', (tz) => {
    withTimezone(tz);
    // Local midnight on the first of the month — the exact value that used to
    // roll back to the previous month under toISOString().
    expect(toLocalIsoDate(new Date(2026, 7, 1))).toBe('2026-08-01');
    expect(toLocalIsoDate(new Date(2026, 7, 31))).toBe('2026-08-31');
    // Zero padding on single-digit month and day.
    expect(toLocalIsoDate(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it.each(POSITIVE_OFFSET)('disagrees with toISOString() in %s (the bug)', (tz) => {
    withTimezone(tz);
    const firstOfMonth = new Date(2026, 7, 1);
    // Pins the defect itself: the old expression really does return July here.
    expect(firstOfMonth.toISOString().split('T')[0]).toBe('2026-07-31');
    expect(toLocalIsoDate(firstOfMonth)).toBe('2026-08-01');
  });

  it('formats a local-midnight date one day either side of a DST jump', () => {
    // Paris springs forward at 02:00 on 2026-03-29. Local midnight on the 29th
    // is still a valid instant; the returned string must be the 29th.
    withTimezone('Europe/Paris');
    expect(toLocalIsoDate(new Date(2026, 2, 28))).toBe('2026-03-28');
    expect(toLocalIsoDate(new Date(2026, 2, 29))).toBe('2026-03-29');
    expect(toLocalIsoDate(new Date(2026, 2, 30))).toBe('2026-03-30');
  });

  it('handles a leap day and a year boundary', () => {
    withTimezone('Asia/Kolkata');
    expect(toLocalIsoDate(new Date(2028, 1, 29))).toBe('2028-02-29');
    expect(toLocalIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(toLocalIsoDate(new Date(2027, 0, 1))).toBe('2027-01-01');
  });

  it('returns "" for unusable input rather than "Invalid Date"', () => {
    expect(toLocalIsoDate(new Date('not a date'))).toBe('');
    expect(toLocalIsoDate(null as unknown as Date)).toBe('');
    // A string is not a Date — coercing it would silently reintroduce parsing.
    expect(toLocalIsoDate('2026-08-01' as unknown as Date)).toBe('');
  });

  it('falls back to now when called with no argument', () => {
    withTimezone('Europe/Paris');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    // `undefined` is what triggers the default parameter, so it must behave as
    // "today" rather than as invalid input.
    expect(toLocalIsoDate()).toBe('2026-08-15');
    expect(toLocalIsoDate(undefined as unknown as Date)).toBe('2026-08-15');
  });

  it('pads a year below 1000 to four digits', () => {
    withTimezone('UTC');
    const early = new Date(2026, 0, 1);
    early.setFullYear(999);
    expect(toLocalIsoDate(early)).toBe('0999-01-01');
  });
});

describe('getTodayIsoDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it.each(ALL_ZONES)('returns the local calendar day in %s', (tz) => {
    withTimezone(tz);
    // Midday UTC: every listed zone is on the same calendar day EXCEPT
    // Kiritimati (UTC+14), which is already on the 16th.
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    const expected = tz === 'Pacific/Kiritimati' ? '2026-08-16' : '2026-08-15';
    expect(getTodayIsoDate()).toBe(expected);
  });

  it('returns tomorrow, not today, for a user already past local midnight', () => {
    withTimezone('Asia/Kolkata'); // UTC+05:30
    // 20:00 UTC on the 15th is 01:30 on the 16th in Kolkata.
    vi.setSystemTime(new Date('2026-08-15T20:00:00Z'));
    expect(new Date().toISOString().split('T')[0]).toBe('2026-08-15'); // the bug
    expect(getTodayIsoDate()).toBe('2026-08-16');
  });

  it('returns yesterday for a user west of UTC still on the previous day', () => {
    withTimezone('America/New_York'); // UTC-04:00 in August
    // 02:00 UTC on the 16th is 22:00 on the 15th in New York.
    vi.setSystemTime(new Date('2026-08-16T02:00:00Z'));
    expect(new Date().toISOString().split('T')[0]).toBe('2026-08-16'); // the bug
    expect(getTodayIsoDate()).toBe('2026-08-15');
  });
});

describe('getCurrentMonthRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it.each(ALL_ZONES)('spans the whole local month in %s', (tz) => {
    withTimezone(tz);
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(getCurrentMonthRange()).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it.each(POSITIVE_OFFSET)('never starts in the previous month in %s', (tz) => {
    withTimezone(tz);
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    const { from, to } = getCurrentMonthRange();
    expect(from.slice(0, 7)).toBe('2026-08');
    expect(to.slice(0, 7)).toBe('2026-08');
    // The last day of the month must be INSIDE the default range — excluding it
    // is what made month-end figures read low.
    expect(to).toBe('2026-08-31');
  });

  it('covers every month length, including February in a leap year', () => {
    withTimezone('Europe/Paris');
    const cases: Array<[string, string, string]> = [
      ['2026-02-10T12:00:00Z', '2026-02-01', '2026-02-28'],
      ['2028-02-10T12:00:00Z', '2028-02-01', '2028-02-29'],
      ['2026-04-10T12:00:00Z', '2026-04-01', '2026-04-30'],
      ['2026-12-10T12:00:00Z', '2026-12-01', '2026-12-31'],
      ['2026-01-10T12:00:00Z', '2026-01-01', '2026-01-31'],
    ];
    for (const [now, from, to] of cases) {
      vi.setSystemTime(new Date(now));
      expect(getCurrentMonthRange()).toEqual({ from, to });
    }
  });

  it('uses the LOCAL month when the UTC instant falls in a different one', () => {
    withTimezone('Pacific/Kiritimati'); // UTC+14
    // 2026-07-31T12:00Z is already 2026-08-01 local — the range must be August.
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'));
    expect(getCurrentMonthRange()).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('accepts an explicit reference date', () => {
    withTimezone('Asia/Kolkata');
    expect(getCurrentMonthRange(new Date(2026, 10, 17))).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });
});

describe('getFirstDayOfCurrentMonth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it.each(ALL_ZONES)('is the first of the local month in %s', (tz) => {
    withTimezone(tz);
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    expect(getFirstDayOfCurrentMonth()).toBe('2026-08-01');
  });

  it.each(POSITIVE_OFFSET)('is never the previous month in %s', (tz) => {
    withTimezone(tz);
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'));
    // The old code returned 2026-07-31 here.
    expect(getFirstDayOfCurrentMonth()).toBe('2026-08-01');
  });
});
