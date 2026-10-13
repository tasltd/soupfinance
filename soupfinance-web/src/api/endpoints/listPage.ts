/**
 * Server-paged list helper (SOUPFIN-165).
 *
 * WHY THIS EXISTS: the Grails `index.json` / `archived.json` actions page with
 * `max` + `offset`, but they render a BARE JSON ARRAY. The total the controller
 * computes (`SoupComparableList.totalCount`, passed to the view as
 * `invoiceCount` / `clientCount`) is never written to the body or to a header —
 * verified against the LXC backend on 2026-10-13: no `X-Total-Count`, no
 * `Content-Range`, no count key. So the client cannot know "of Z" up front.
 *
 * What we do instead:
 *   1. Ask for `max + 1` rows. If the extra row comes back there is a next page;
 *      it is dropped before rendering. One request, no second COUNT call.
 *   2. Read `X-Total-Count` when the backend sends it. The backend plan
 *      `plans/soupfin-165-list-total-count-and-status-filter.md` asks for exactly
 *      that header; until it ships, `total` is known only on the last page,
 *      where it is simply `offset + items.length`.
 */
import type { AxiosResponse } from 'axios';

export interface ListPage<T> {
  /** Rows for this page, at most `max`. */
  items: T[];
  /** Zero-based offset of the first row. */
  offset: number;
  /** Page size requested. */
  max: number;
  /** Total rows across all pages, or null while it is unknown. */
  total: number | null;
  /** True when at least one row exists after this page. */
  hasMore: boolean;
}

/** Page size used by the invoice and client lists. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Turn a `max + 1` response into a page.
 *
 * `fetchRows` must request `max + 1` rows; this function trims the probe row.
 */
export function toListPage<T>(
  response: Pick<AxiosResponse<T[]>, 'data' | 'headers'>,
  offset: number,
  max: number
): ListPage<T> {
  const rows = Array.isArray(response.data) ? response.data : [];
  const hasMore = rows.length > max;
  const items = hasMore ? rows.slice(0, max) : rows;

  const header = response.headers?.['x-total-count'];
  const headerTotal = header === undefined || header === null ? NaN : Number(header);

  let total: number | null;
  if (Number.isFinite(headerTotal) && headerTotal >= 0) {
    total = headerTotal;
  } else if (!hasMore && (items.length > 0 || offset === 0)) {
    // Last page: everything before it plus what is on it. An empty page past
    // the end (a stale `?page=9` link) says nothing about the real total.
    total = offset + items.length;
  } else {
    total = null;
  }

  return { items, offset, max, total, hasMore };
}
