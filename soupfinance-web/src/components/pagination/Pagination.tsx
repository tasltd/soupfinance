/**
 * Pagination — "Showing X to Y of Z results" + page controls (SOUPFIN-165).
 * Reference: soupfinance-designs/invoice-management/ (footer under the table).
 *
 * The backend does not report a total yet (see api/endpoints/listPage.ts), so
 * `total` may be null. Then the summary drops "of Z" and the page numbers stop
 * at the next page, which `hasMore` proves exists. On the last page the total
 * is known exactly, and the full page row is shown.
 */

export interface PaginationProps {
  /** Zero-based offset of the first row on this page. */
  offset: number;
  /** Page size. */
  pageSize: number;
  /** Rows actually on this page. */
  itemCount: number;
  /** Total rows, or null when unknown. */
  total: number | null;
  /** True when a next page exists. */
  hasMore: boolean;
  /** Called with the 1-based page to show. */
  onPageChange: (page: number) => void;
  /** Noun for the summary, e.g. "invoices". */
  itemLabel?: string;
  /** Prefix for data-testid values, e.g. "invoice". */
  testIdPrefix: string;
}

type PageToken = number | 'gap';

/**
 * Page numbers to render: first, last, current ±1, with gaps between.
 * `lastKnown` is the highest page we know exists.
 */
export function getPageTokens(current: number, lastKnown: number): PageToken[] {
  if (lastKnown <= 7) {
    return Array.from({ length: lastKnown }, (_, i) => i + 1);
  }
  const pages = new Set([1, lastKnown, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= lastKnown).sort((a, b) => a - b);
  const tokens: PageToken[] = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) tokens.push('gap');
    tokens.push(page);
  });
  return tokens;
}

const BUTTON_BASE =
  'flex size-9 items-center justify-center rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50';
const BUTTON_IDLE =
  'text-subtle-text hover:bg-background-light dark:hover:bg-background-dark disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

export function Pagination({
  offset,
  pageSize,
  itemCount,
  total,
  hasMore,
  onPageChange,
  itemLabel = 'results',
  testIdPrefix,
}: PaginationProps) {
  const current = Math.floor(offset / pageSize) + 1;
  const first = itemCount > 0 ? offset + 1 : 0;
  const last = offset + itemCount;
  const lastKnown = total !== null ? Math.max(1, Math.ceil(total / pageSize)) : current + (hasMore ? 1 : 0);
  const tokens = getPageTokens(current, lastKnown);
  const canGoBack = current > 1;
  const canGoForward = hasMore;

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-border-light dark:border-border-dark"
      aria-label="Pagination"
      data-testid={`${testIdPrefix}-pagination`}
    >
      <p className="text-sm text-subtle-text" data-testid={`${testIdPrefix}-pagination-summary`}>
        Showing <span className="font-semibold text-text-light dark:text-text-dark">{first}</span> to{' '}
        <span className="font-semibold text-text-light dark:text-text-dark">{last}</span>
        {total !== null && (
          <>
            {' '}of <span className="font-semibold text-text-light dark:text-text-dark">{total}</span>
          </>
        )}{' '}
        {itemLabel}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(current - 1)}
          disabled={!canGoBack}
          className={`${BUTTON_BASE} ${BUTTON_IDLE}`}
          aria-label="Previous page"
          data-testid={`${testIdPrefix}-pagination-prev`}
        >
          <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
        </button>
        {tokens.map((token, i) =>
          token === 'gap' ? (
            <span key={`gap-${i}`} className="flex size-9 items-center justify-center text-sm text-subtle-text" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={token}
              type="button"
              onClick={() => onPageChange(token)}
              aria-current={token === current ? 'page' : undefined}
              aria-label={`Page ${token}`}
              className={`${BUTTON_BASE} ${
                token === current ? 'bg-primary font-bold text-white' : BUTTON_IDLE
              }`}
              data-testid={`${testIdPrefix}-pagination-page-${token}`}
            >
              {token}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(current + 1)}
          disabled={!canGoForward}
          className={`${BUTTON_BASE} ${BUTTON_IDLE}`}
          aria-label="Next page"
          data-testid={`${testIdPrefix}-pagination-next`}
        >
          <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>
      </div>
    </nav>
  );
}
