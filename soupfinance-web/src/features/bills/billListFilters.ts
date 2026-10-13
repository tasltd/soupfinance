/**
 * Added (SOUPFIN-171): query building and filtering for the Bills list.
 *
 * What the backend honours on GET /rest/bill/index.json (checked 2026-10-13
 * against both backends — Grails `Bill.searchList` and the Go gateway's
 * `BillHandler.Index` → `parseQuery` + `db.Repo.applyFilters`):
 *
 *   max · offset · sort · order   honoured by both (max is clamped to 1000)
 *   search                        both: OR over whitespace tokens, each a LIKE on
 *                                 `id` and on `serialised` = "Bill(<vendor>, <prefix>, <number>)"
 *   totalCount                    both stamp it on EVERY row of the page
 *   from / to                     Grails filters billDate, Go filters date_created
 *   vendor / status               ignored by both
 *
 * So the list pages on the server when only the page is changing, and switches
 * to a "window" (the newest WINDOW_SIZE rows, narrowed on the server by a
 * superset search) whenever a filter is active, refining and paging in the
 * browser. `from`/`to` are deliberately NOT sent: the Go gateway — the active
 * production route — would apply them to the creation date, silently dropping
 * bills whose bill date is in range. See plans/soupfin-171-bill-list-filters-backend.md
 * and SOUPFIN-259 for moving these filters server-side.
 */
import type { Bill, ListParams } from '../../types';

/** Rows per page, matching the size the list used before paging existed. */
export const BILL_PAGE_SIZE = 20;

/** The backend's page-size ceiling (Grails `Math.min(max, 1000)`, Go `MaxPageSize`). */
export const BILL_FILTER_WINDOW = 1000;

/**
 * Status filter values. PENDING / PARTIAL / PAID are the only values
 * `Bill.beforeUpdate()` ever writes (`soupbroker.finance.PaymentStatus`).
 * OVERDUE is derived in the browser — see `isBillOverdue`.
 */
export type BillStatusFilter = '' | 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface BillListFilters {
  search: string;
  status: BillStatusFilter;
  vendorId: string;
  /** Inclusive lower bound on billDate, YYYY-MM-DD. */
  from: string;
  /** Inclusive upper bound on billDate, YYYY-MM-DD. */
  to: string;
}

export const EMPTY_BILL_FILTERS: BillListFilters = {
  search: '',
  status: '',
  vendorId: '',
  from: '',
  to: '',
};

export function hasActiveBillFilters(filters: BillListFilters): boolean {
  return Boolean(
    filters.search.trim() || filters.status || filters.vendorId || filters.from || filters.to
  );
}

/**
 * The search the backend gets. Tokens are split on whitespace, hyphens and
 * commas so the displayed bill number "BILL-6" reaches the server as
 * "BILL 6" — the serialised snapshot holds "BILL, 6", so the unsplit term would
 * match nothing. The backend ORs the tokens, which makes this a SUPERSET of the
 * intended matches; `matchesBillSearch` narrows it back down.
 */
export function toServerSearch(search: string): string {
  return search
    .trim()
    .split(/[\s,-]+/)
    .filter(Boolean)
    .join(' ');
}

/**
 * Params for GET /rest/bill/index.json. `page` is 1-based and only used when no
 * filter is active — with a filter, the window is always fetched from offset 0.
 */
export function buildBillListParams(filters: BillListFilters, page: number): ListParams {
  const base: ListParams = { sort: 'dateCreated', order: 'desc' };
  if (!hasActiveBillFilters(filters)) {
    return { ...base, max: BILL_PAGE_SIZE, offset: (Math.max(page, 1) - 1) * BILL_PAGE_SIZE };
  }
  const search = toServerSearch(filters.search);
  return {
    ...base,
    max: BILL_FILTER_WINDOW,
    offset: 0,
    ...(search ? { search } : {}),
  };
}

/** Today's LOCAL calendar date as YYYY-MM-DD (not toISOString, which is UTC). */
export function todayLocalISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** First 10 chars of a date string — transformBill already strips the time. */
function datePart(value: string | undefined | null): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

/**
 * Overdue = the due date (`paymentDate`) is before today and money is still
 * owed. The backend never stores an OVERDUE status, so this is derived here.
 */
export function isBillOverdue(bill: Bill, today: string): boolean {
  const due = datePart(bill.paymentDate);
  return Boolean(due) && due < today && (Number(bill.amountDue) || 0) > 0;
}

/** Case-insensitive match on the bill number or vendor name, as displayed. */
export function matchesBillSearch(bill: Bill, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  const number = (bill.billNumber || '').toLowerCase();
  const vendor = (bill.vendor?.name || '').toLowerCase();
  return number.includes(term) || vendor.includes(term);
}

/** Apply every active filter to rows already fetched. */
export function applyBillFilters(bills: Bill[], filters: BillListFilters, today: string): Bill[] {
  return bills.filter((bill) => {
    if (!matchesBillSearch(bill, filters.search)) return false;
    if (filters.vendorId && bill.vendor?.id !== filters.vendorId) return false;
    if (filters.status === 'OVERDUE') {
      if (!isBillOverdue(bill, today)) return false;
    } else if (filters.status && bill.status !== filters.status) {
      return false;
    }
    const billDate = datePart(bill.billDate);
    if (filters.from && (!billDate || billDate < filters.from)) return false;
    if (filters.to && (!billDate || billDate > filters.to)) return false;
    return true;
  });
}

/**
 * Total rows behind a server page. Both backends stamp `totalCount` on each
 * row; an empty page carries none, so fall back to what is known.
 */
export function readTotalCount(rows: Bill[], offset: number): number | null {
  const stamped = Number(rows[0]?.totalCount);
  if (Number.isFinite(stamped) && stamped > 0) return stamped;
  return rows.length ? null : offset === 0 ? 0 : null;
}

/**
 * Page numbers to render, with `null` for an ellipsis — the design-system
 * pattern (invoice-management mockup): 1 2 3 … 10.
 */
export function pageNumbers(current: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}
