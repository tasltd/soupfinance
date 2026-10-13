/**
 * SOUPFIN-171 — query params and filtering for the Bills list.
 *
 * The params asserted here are the ones verified against both backends
 * (Grails Bill.searchList and the Go gateway's BillHandler.Index): max, offset,
 * sort, order, search. vendor / status / bill-date filters are applied in the
 * browser because neither backend honours them on index.json.
 */
import { describe, it, expect } from 'vitest';
import type { Bill } from '../../../types';
import {
  BILL_FILTER_WINDOW,
  BILL_PAGE_SIZE,
  EMPTY_BILL_FILTERS,
  applyBillFilters,
  buildBillListParams,
  hasActiveBillFilters,
  isBillOverdue,
  matchesBillSearch,
  pageNumbers,
  readTotalCount,
  todayLocalISO,
  toServerSearch,
  type BillListFilters,
} from '../billListFilters';

const TODAY = '2026-10-13';

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'b1',
    billNumber: 'BILL-6',
    vendor: { id: 'v-acme', name: 'Acme Supplies' },
    billDate: '2026-09-01',
    paymentDate: '2026-10-01',
    status: 'PENDING',
    subtotal: 100,
    taxAmount: 0,
    totalAmount: 100,
    amountPaid: 0,
    amountDue: 100,
    ...overrides,
  } as Bill;
}

function filters(overrides: Partial<BillListFilters> = {}): BillListFilters {
  return { ...EMPTY_BILL_FILTERS, ...overrides };
}

describe('buildBillListParams — what each filter sends', () => {
  it('no filter: server-side page 1 is max=20 offset=0, newest first', () => {
    expect(buildBillListParams(filters(), 1)).toEqual({
      sort: 'dateCreated',
      order: 'desc',
      max: BILL_PAGE_SIZE,
      offset: 0,
    });
  });

  it('no filter: page 3 sends offset 40 — bills past the 20th are reachable', () => {
    expect(buildBillListParams(filters(), 3)).toMatchObject({ max: 20, offset: 40 });
  });

  it('a page below 1 is treated as page 1 (never a negative offset)', () => {
    expect(buildBillListParams(filters(), 0).offset).toBe(0);
    expect(buildBillListParams(filters(), -4).offset).toBe(0);
  });

  it('search: sends `search` with the bill number split into tokens', () => {
    expect(buildBillListParams(filters({ search: 'BILL-6' }), 1)).toEqual({
      sort: 'dateCreated',
      order: 'desc',
      max: BILL_FILTER_WINDOW,
      offset: 0,
      search: 'BILL 6',
    });
  });

  it('search: a vendor name is sent as typed (trimmed)', () => {
    expect(buildBillListParams(filters({ search: '  Acme Supplies ' }), 1).search).toBe('Acme Supplies');
  });

  it('search of only spaces is not a filter and sends no `search`', () => {
    const params = buildBillListParams(filters({ search: '   ' }), 2);
    expect(params).not.toHaveProperty('search');
    expect(params).toMatchObject({ max: 20, offset: 20 });
  });

  it.each([
    ['status', { status: 'PAID' as const }],
    ['vendor', { vendorId: 'v-acme' }],
    ['date from', { from: '2026-01-01' }],
    ['date to', { to: '2026-12-31' }],
  ])('%s: fetches the 1000-row window from offset 0 and sends no unsupported param', (_label, f) => {
    const params = buildBillListParams(filters(f), 5);
    expect(params).toEqual({ sort: 'dateCreated', order: 'desc', max: 1000, offset: 0 });
    // Neither backend filters on these; Go would apply from/to to date_created.
    for (const key of ['status', 'vendor', 'vendor.id', 'from', 'to']) {
      expect(params).not.toHaveProperty(key);
    }
  });

  it('every filter at once still sends only search + the window', () => {
    const params = buildBillListParams(
      filters({ search: 'acme', status: 'OVERDUE', vendorId: 'v-acme', from: '2026-01-01', to: '2026-12-31' }),
      2
    );
    expect(params).toEqual({ sort: 'dateCreated', order: 'desc', max: 1000, offset: 0, search: 'acme' });
  });
});

describe('toServerSearch', () => {
  it.each([
    ['BILL-6', 'BILL 6'],
    ['  acme   supplies ', 'acme supplies'],
    ['Acme, Ltd', 'Acme Ltd'],
    ['---', ''],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(toServerSearch(input)).toBe(expected);
  });

  it('a 10,000-character term is passed through, not truncated or thrown on', () => {
    const long = 'x'.repeat(10_000);
    expect(toServerSearch(long)).toBe(long);
  });
});

describe('hasActiveBillFilters', () => {
  it('is false for the empty filter set and whitespace search', () => {
    expect(hasActiveBillFilters(filters())).toBe(false);
    expect(hasActiveBillFilters(filters({ search: '  ' }))).toBe(false);
  });
  it('is true when any single filter is set', () => {
    expect(hasActiveBillFilters(filters({ to: '2026-01-01' }))).toBe(true);
  });
});

describe('isBillOverdue — paymentDate before today and amountDue > 0', () => {
  it('past due with money owed is overdue', () => {
    expect(isBillOverdue(bill({ paymentDate: '2026-10-12', amountDue: 0.01 }), TODAY)).toBe(true);
  });
  it('due today is NOT overdue', () => {
    expect(isBillOverdue(bill({ paymentDate: TODAY }), TODAY)).toBe(false);
  });
  it('past due but fully paid (amountDue 0) is not overdue', () => {
    expect(isBillOverdue(bill({ paymentDate: '2020-01-01', amountDue: 0 }), TODAY)).toBe(false);
  });
  it('a negative amountDue (overpaid) is not overdue', () => {
    expect(isBillOverdue(bill({ paymentDate: '2020-01-01', amountDue: -5 }), TODAY)).toBe(false);
  });
  it('a missing due date is not overdue', () => {
    expect(isBillOverdue(bill({ paymentDate: '' }), TODAY)).toBe(false);
    expect(isBillOverdue(bill({ paymentDate: undefined as unknown as string }), TODAY)).toBe(false);
  });
  it('an ISO timestamp due date is compared by its date part', () => {
    expect(isBillOverdue(bill({ paymentDate: '2026-10-12T23:59:59Z' }), TODAY)).toBe(true);
  });
  it('a seven-figure balance years overdue is overdue', () => {
    expect(isBillOverdue(bill({ paymentDate: '1999-01-01', amountDue: 9_999_999.99 }), TODAY)).toBe(true);
  });
});

describe('todayLocalISO', () => {
  it('uses the LOCAL calendar date, not UTC', () => {
    // 23:30 local on 13 Oct is 13 Oct here, whatever the UTC date is.
    expect(todayLocalISO(new Date(2026, 9, 13, 23, 30))).toBe('2026-10-13');
    expect(todayLocalISO(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});

describe('matchesBillSearch', () => {
  it('matches the bill number as displayed, case-insensitive', () => {
    expect(matchesBillSearch(bill(), 'bill-6')).toBe(true);
  });
  it('matches the vendor name', () => {
    expect(matchesBillSearch(bill(), 'supplies')).toBe(true);
  });
  it('is a substring match, like the backend: BILL-6 also finds BILL-61', () => {
    expect(matchesBillSearch(bill({ billNumber: 'BILL-61' }), 'BILL-6')).toBe(true);
  });
  it('rejects a term that is in neither field', () => {
    expect(matchesBillSearch(bill(), 'zenith')).toBe(false);
  });
  it('tolerates a bill with no vendor and no number', () => {
    expect(matchesBillSearch(bill({ vendor: undefined as unknown as Bill['vendor'], billNumber: '' }), 'x')).toBe(false);
    expect(matchesBillSearch(bill({ vendor: undefined as unknown as Bill['vendor'] }), '')).toBe(true);
  });
});

describe('applyBillFilters', () => {
  const rows = [
    bill({ id: 'a', billNumber: 'BILL-1', vendor: { id: 'v1', name: 'Acme' }, status: 'PENDING', billDate: '2026-01-10', paymentDate: '2026-02-10', amountDue: 50 }),
    bill({ id: 'b', billNumber: 'BILL-2', vendor: { id: 'v2', name: 'Zenith' }, status: 'PARTIAL', billDate: '2026-06-15', paymentDate: '2026-12-15', amountDue: 20 }),
    bill({ id: 'c', billNumber: 'BILL-3', vendor: { id: 'v1', name: 'Acme' }, status: 'PAID', billDate: '2026-09-30', paymentDate: '2026-10-01', amountDue: 0 }),
  ];
  const ids = (list: Bill[]) => list.map((b) => b.id);

  it('no filter returns every row', () => {
    expect(ids(applyBillFilters(rows, filters(), TODAY))).toEqual(['a', 'b', 'c']);
  });
  it('an empty input stays empty under every filter', () => {
    expect(applyBillFilters([], filters({ status: 'OVERDUE', vendorId: 'v1', from: '2026-01-01' }), TODAY)).toEqual([]);
  });
  it('status matches the backend status exactly', () => {
    expect(ids(applyBillFilters(rows, filters({ status: 'PARTIAL' }), TODAY))).toEqual(['b']);
    expect(ids(applyBillFilters(rows, filters({ status: 'PAID' }), TODAY))).toEqual(['c']);
  });
  it('status OVERDUE is derived: past due with a balance (the PAID bill past due is excluded)', () => {
    expect(ids(applyBillFilters(rows, filters({ status: 'OVERDUE' }), TODAY))).toEqual(['a']);
  });
  it('vendor matches bill.vendor.id', () => {
    expect(ids(applyBillFilters(rows, filters({ vendorId: 'v1' }), TODAY))).toEqual(['a', 'c']);
    expect(ids(applyBillFilters(rows, filters({ vendorId: 'nobody' }), TODAY))).toEqual([]);
  });
  it('date range is inclusive on billDate at both ends', () => {
    expect(ids(applyBillFilters(rows, filters({ from: '2026-06-15', to: '2026-09-30' }), TODAY))).toEqual(['b', 'c']);
    expect(ids(applyBillFilters(rows, filters({ from: '2026-06-16' }), TODAY))).toEqual(['c']);
    expect(ids(applyBillFilters(rows, filters({ to: '2026-01-10' }), TODAY))).toEqual(['a']);
  });
  it('a bill with no billDate is excluded once a date bound is set', () => {
    const undated = bill({ id: 'u', billDate: '' });
    expect(applyBillFilters([undated], filters({ from: '2000-01-01' }), TODAY)).toEqual([]);
    expect(applyBillFilters([undated], filters(), TODAY)).toHaveLength(1);
  });
  it('filters combine with AND', () => {
    expect(ids(applyBillFilters(rows, filters({ vendorId: 'v1', status: 'PENDING', search: 'bill-1' }), TODAY))).toEqual(['a']);
  });
  it('narrows a full 1000-row window and keeps the original order', () => {
    const big = Array.from({ length: 1000 }, (_, i) =>
      bill({ id: `r${i}`, vendor: { id: i % 10 === 0 ? 'v1' : 'v2', name: 'X' } })
    );
    const out = applyBillFilters(big, filters({ vendorId: 'v1' }), TODAY);
    expect(out).toHaveLength(100);
    expect(out[0].id).toBe('r0');
    expect(out[99].id).toBe('r990');
  });
});

describe('readTotalCount', () => {
  it('reads the totalCount stamped on the rows', () => {
    expect(readTotalCount([bill({ totalCount: 57 })], 0)).toBe(57);
  });
  it('accepts a numeric string', () => {
    expect(readTotalCount([bill({ totalCount: '1234567' as unknown as number })], 0)).toBe(1_234_567);
  });
  it('an empty first page is 0 bills', () => {
    expect(readTotalCount([], 0)).toBe(0);
  });
  it('an empty later page and unstamped rows are unknown (null)', () => {
    expect(readTotalCount([], 40)).toBeNull();
    expect(readTotalCount([bill()], 0)).toBeNull();
  });
});

describe('pageNumbers', () => {
  it('lists every page up to 7', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('collapses with ellipses for many pages', () => {
    expect(pageNumbers(1, 10)).toEqual([1, 2, null, 10]);
    expect(pageNumbers(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageNumbers(10, 10)).toEqual([1, null, 9, 10]);
  });
  it('stays short at 50,000 pages', () => {
    expect(pageNumbers(25_000, 50_000)).toEqual([1, null, 24_999, 25_000, 25_001, null, 50_000]);
  });
});
