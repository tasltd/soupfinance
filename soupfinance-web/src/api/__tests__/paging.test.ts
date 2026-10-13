/**
 * Added (SOUPFIN-163): server-side paging helpers.
 */
import { describe, it, expect, vi } from 'vitest';
import { readTotalCount, toPagedResult, fetchAllPages, type PagedResult } from '../paging';

describe('readTotalCount', () => {
  it('reads the totalCount the backend stamps on each row', () => {
    expect(readTotalCount([{ id: 'a', totalCount: 67335 }, { id: 'b', totalCount: 67335 }])).toBe(67335);
  });

  it('prefers an X-Total-Count header when one is sent', () => {
    expect(readTotalCount([{ id: 'a', totalCount: 5 }], { 'x-total-count': '12' })).toBe(12);
  });

  it('treats an empty first page as zero rows', () => {
    expect(readTotalCount([], undefined, 0)).toBe(0);
  });

  it('knows nothing from an empty later page or rows without a count', () => {
    expect(readTotalCount([], undefined, 50)).toBeNull();
    expect(readTotalCount([{ id: 'a' }])).toBeNull();
    expect(readTotalCount([{ id: 'a', totalCount: 'oops' }])).toBeNull();
  });
});

describe('toPagedResult', () => {
  it('uses the total to decide if a later page exists', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, totalCount: 120 }));
    expect(toPagedResult(rows, 50, 0)).toMatchObject({ total: 120, hasMore: true });
    expect(toPagedResult(rows.slice(0, 20), 50, 100)).toMatchObject({ total: 120, hasMore: false });
    // Exactly the last full page
    expect(toPagedResult(rows, 50, 70)).toMatchObject({ total: 120, hasMore: false });
  });

  it('assumes a full page may have a successor when the total is unknown', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}` }));
    expect(toPagedResult(rows, 25, 0)).toMatchObject({ total: null, hasMore: true });
    expect(toPagedResult(rows.slice(0, 24), 25, 0)).toMatchObject({ total: null, hasMore: false });
  });

  it('reports zero rows and no more pages for an empty list', () => {
    expect(toPagedResult([], 50, 0)).toEqual({ rows: [], total: 0, hasMore: false });
  });
});

// A fake server holding `count` rows that honours max/offset like Grails.
function server(count: number, opts: { ignoreOffset?: boolean; withTotal?: boolean } = {}) {
  const all = Array.from({ length: count }, (_, i) => ({ id: `row-${i}` }));
  const fetchPage = vi.fn(async (offset: number, max: number): Promise<PagedResult<{ id: string }>> => {
    const slice = all.slice(opts.ignoreOffset ? 0 : offset, (opts.ignoreOffset ? 0 : offset) + max);
    const rows = opts.withTotal === false ? slice : slice.map((r) => ({ ...r, totalCount: count }));
    return toPagedResult(rows, max, offset);
  });
  return { fetchPage, all };
}

describe('fetchAllPages', () => {
  it('returns nothing for an empty list after one request (zero)', async () => {
    const { fetchPage } = server(0);
    const result = await fetchAllPages(fetchPage);
    expect(result).toEqual({ rows: [], total: 0, truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('walks every page past the old 500 cap until the total is reached', async () => {
    const { fetchPage } = server(2500);
    const result = await fetchAllPages(fetchPage, { pageSize: 1000 });
    expect(result.rows).toHaveLength(2500);
    expect(result.rows.at(-1)?.id).toBe('row-2499');
    expect(result.total).toBe(2500);
    expect(result.truncated).toBe(false);
    expect(fetchPage.mock.calls.map(([offset, max]) => [offset, max])).toEqual([[0, 1000], [1000, 1000], [2000, 1000]]);
  });

  it('stops on a short page when the server sends no count', async () => {
    const { fetchPage } = server(1500, { withTotal: false });
    const result = await fetchAllPages(fetchPage, { pageSize: 1000 });
    expect(result.rows).toHaveLength(1500);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('stops when a page adds no new rows (a backend that ignores offset)', async () => {
    const { fetchPage } = server(3000, { ignoreOffset: true, withTotal: false });
    const result = await fetchAllPages(fetchPage, { pageSize: 1000 });
    expect(result.rows).toHaveLength(1000);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('flags truncation instead of dropping rows silently at the page cap (overflow)', async () => {
    const { fetchPage } = server(25_000);
    const result = await fetchAllPages(fetchPage, { pageSize: 1000, maxPages: 10 });
    expect(result.rows).toHaveLength(10_000);
    expect(result.total).toBe(25_000);
    expect(result.truncated).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(10);
  });

  it('never asks for more than the backend allows per page', async () => {
    const { fetchPage } = server(10);
    await fetchAllPages(fetchPage, { pageSize: 5000 });
    expect(fetchPage).toHaveBeenCalledWith(0, 1000);
  });

  it('lets a server error through rather than returning a partial list', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce(toPagedResult([{ id: 'a', totalCount: 2 }], 1, 0))
      .mockRejectedValueOnce(new Error('boom'));
    await expect(fetchAllPages(fetchPage, { pageSize: 1 })).rejects.toThrow('boom');
  });
});
