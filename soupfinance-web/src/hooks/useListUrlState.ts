/**
 * useListUrlState — list filters and page number kept in the URL (SOUPFIN-165).
 *
 * The URL is the single source of truth, so a filtered page can be bookmarked,
 * shared, reloaded, and walked with the Back button. Conventions:
 *   - `page` is 1-based and omitted on page 1.
 *   - Empty filter values are removed, never written as `?q=`.
 *   - Changing any filter returns to page 1: page 4 of the old result set means
 *     nothing in the new one.
 *   - Filter edits REPLACE the history entry (typing a search would otherwise
 *     push one entry per keystroke); page changes PUSH, so Back goes back a page.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface ListUrlState<K extends string> {
  /** Current value of every filter key ('' when absent). */
  filters: Record<K, string>;
  /** 1-based page, never below 1. */
  page: number;
  /** Set or clear filter values; resets to page 1. */
  setFilters: (patch: Partial<Record<K, string | null>>) => void;
  /** Move to a 1-based page. */
  setPage: (page: number) => void;
  /** Remove every filter and the page. */
  clearFilters: () => void;
}

export function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function useListUrlState<K extends string>(keys: readonly K[]): ListUrlState<K> {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const out = {} as Record<K, string>;
    for (const key of keys) out[key] = searchParams.get(key) ?? '';
    return out;
    // keys is a module-level constant at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const page = parsePage(searchParams.get('page'));

  const setFilters = useCallback(
    (patch: Partial<Record<K, string | null>>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch) as [K, string | null | undefined][]) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setPage = useCallback(
    (nextPage: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (nextPage > 1) next.set('page', String(nextPage));
        else next.delete('page');
        return next;
      });
    },
    [setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of keys) next.delete(key);
        next.delete('page');
        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSearchParams]);

  return { filters, page, setFilters, setPage, clearFilters };
}
