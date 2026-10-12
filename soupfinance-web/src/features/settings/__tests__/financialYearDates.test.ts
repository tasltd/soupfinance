/**
 * Added (SOUPFIN-158): date rules for creating financial years.
 */
import { describe, it, expect } from 'vitest';
import {
  dayAfter,
  dayBefore,
  findOverlap,
  nameFor,
  suggestNextYear,
  validateNewYear,
  yearEndFor,
} from '../financialYearDates';
import type { FinancialYear } from '../../../types/financialYear';

const year = (id: string, fromDate: string, toDate: string, name = id): FinancialYear => ({ id, name, fromDate, toDate });

describe('calendar arithmetic', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(dayAfter('2025-12-31')).toBe('2026-01-01');
    expect(dayAfter('2024-02-28')).toBe('2024-02-29');
    expect(dayBefore('2024-03-01')).toBe('2024-02-29');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
  });

  it('ends a year the day before its anniversary', () => {
    expect(yearEndFor('2026-01-01')).toBe('2026-12-31');
    expect(yearEndFor('2025-07-01')).toBe('2026-06-30');
  });

  it('names calendar years and split years', () => {
    expect(nameFor('2026-01-01', '2026-12-31')).toBe('FY 2026');
    expect(nameFor('2025-07-01', '2026-06-30')).toBe('FY 2025-26');
  });
});

describe('suggestNextYear', () => {
  it('suggests the current calendar year when there are no years', () => {
    expect(suggestNextYear([], '2026-10-12')).toEqual({
      name: 'FY 2026', fromDate: '2026-01-01', toDate: '2026-12-31', notes: '',
    });
  });

  it('follows the latest year on file, whatever the list order', () => {
    const years = [year('a', '2024-07-01', '2025-06-30'), year('b', '2025-07-01', '2026-06-30'), year('c', '2023-07-01', '2024-06-30')];
    expect(suggestNextYear(years, '2026-10-12')).toMatchObject({ fromDate: '2026-07-01', toDate: '2027-06-30', name: 'FY 2026-27' });
  });

  it('handles fifty years on file', () => {
    const years = Array.from({ length: 50 }, (_, i) => year(`y${i}`, `${1980 + i}-01-01`, `${1980 + i}-12-31`));
    expect(suggestNextYear(years, '2026-10-12').fromDate).toBe('2030-01-01');
  });
});

describe('validateNewYear', () => {
  const existing = [year('fy25', '2025-01-01', '2025-12-31', 'FY 2025')];
  const ok = { name: 'FY 2026', fromDate: '2026-01-01', toDate: '2026-12-31' };

  it('accepts a year that starts the day after the last one', () => {
    expect(validateNewYear(existing, ok)).toBeNull();
  });

  it('requires a name and both dates', () => {
    expect(validateNewYear(existing, { ...ok, name: '   ' })).toMatch(/name/);
    expect(validateNewYear(existing, { ...ok, toDate: '' })).toMatch(/both/);
  });

  it('rejects an end date on or before the start date', () => {
    expect(validateNewYear(existing, { ...ok, toDate: '2026-01-01' })).toMatch(/after the start/);
    expect(validateNewYear(existing, { ...ok, toDate: '2025-06-30' })).toMatch(/after the start/);
  });

  it('rejects a year that shares even one day with another', () => {
    expect(validateNewYear(existing, { ...ok, fromDate: '2025-12-31' })).toBe(
      'These dates overlap FY 2025. Financial years cannot share a day.'
    );
    expect(findOverlap(existing, '2024-01-01', '2026-12-31')?.id).toBe('fy25');
    expect(findOverlap(existing, '2024-01-01', '2024-12-31')).toBeUndefined();
  });
});
