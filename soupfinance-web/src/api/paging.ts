/**
 * Added (SOUPFIN-163): server-side paging helpers for Grails index actions.
 *
 * Grails index actions take `max` (clamped to 1000) and `offset`. They send no
 * X-Total-Count header and no wrapper object. Instead every row of a list
 * carries `totalCount`: the number of rows that match the filters across all
 * pages (verified on LXC: ledgerTransaction, ledgerTransactionGroup, voucher).
 */

/** The backend clamps `max` to this on every index action. */
export const SERVER_MAX_PAGE_SIZE = 1000;

/** One page of rows plus what is known about the rest. */
export interface PagedResult<T> {
  rows: T[];
  /** Rows matching the filters on every page, or null when the server did not say. */
  total: number | null;
  /** True when a later page exists. */
  hasMore: boolean;
}

/**
 * Read the filtered row count from a Grails list response.
 *
 * Prefers an `X-Total-Count` header, should a proxy or a later backend add one,
 * then the `totalCount` the backend stamps on each row. An empty first page
 * means zero rows; an empty later page says nothing about the total.
 */
export function readTotalCount(
  rows: unknown[],
  headers?: Record<string, unknown> | null,
  offset = 0
): number | null {
  const header = headers?.['x-total-count'] ?? headers?.['X-Total-Count'];
  if (header !== undefined && header !== null && header !== '') {
    const n = Number(header);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const first = rows[0] as { totalCount?: unknown } | undefined;
  if (first && first.totalCount !== undefined && first.totalCount !== null) {
    const n = Number(first.totalCount);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  if (rows.length === 0 && offset === 0) return 0;
  return null;
}

/**
 * Build a PagedResult. When the total is unknown, a full page is taken to mean
 * another page may follow.
 */
export function toPagedResult<T>(
  rows: T[],
  max: number,
  offset: number,
  headers?: Record<string, unknown> | null
): PagedResult<T> {
  const total = readTotalCount(rows, headers, offset);
  const hasMore = total !== null ? offset + rows.length < total : rows.length >= max;
  return { rows, total, hasMore };
}

export interface FetchAllResult<T> {
  rows: T[];
  total: number | null;
  /** True when the page cap stopped the walk before every row was fetched. */
  truncated: boolean;
}

/**
 * Walk every page of an index action and return all rows.
 *
 * Stops at the first page that reports no more rows, at a page that adds no new
 * id (a backend that ignores `offset` would loop forever otherwise), or at
 * `maxPages`, in which case `truncated` is true so the caller can say so
 * instead of dropping rows silently.
 */
export async function fetchAllPages<T extends { id?: string }>(
  fetchPage: (offset: number, max: number) => Promise<PagedResult<T>>,
  options: { pageSize?: number; maxPages?: number } = {}
): Promise<FetchAllResult<T>> {
  const pageSize = Math.min(options.pageSize ?? SERVER_MAX_PAGE_SIZE, SERVER_MAX_PAGE_SIZE);
  const maxPages = options.maxPages ?? 100;
  const rows: T[] = [];
  const seen = new Set<string>();
  let total: number | null = null;

  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(page * pageSize, pageSize);
    if (result.total !== null) total = result.total;
    let added = 0;
    for (const row of result.rows) {
      if (row.id) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
      }
      rows.push(row);
      added++;
    }
    if (!result.hasMore || added === 0) {
      return { rows, total, truncated: false };
    }
  }
  return { rows, total, truncated: true };
}
