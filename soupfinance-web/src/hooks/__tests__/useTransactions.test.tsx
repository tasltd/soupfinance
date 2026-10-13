/**
 * Added (SOUPFIN-163): the Transaction Register loads every page of both
 * sources instead of stopping at 500 rows each.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTransactions, REGISTER_MAX_PAGES } from '../useTransactions';

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  interceptors: { request: { use: () => 0 }, response: { use: () => 0 } },
}));

vi.mock('axios', () => ({ default: { create: () => http, isAxiosError: () => false }, isAxiosError: () => false }));

const group = (i: number, count: number) => ({
  id: `g${i}`,
  groupDate: '2026-03-01',
  totalCount: count,
  ledgerTransactionList: [
    { transactionState: 'DEBIT', amount: 10, ledgerAccount: { code: '6000', name: 'Expense' } },
    { transactionState: 'CREDIT', amount: 10, ledgerAccount: { code: '1000', name: 'Cash' } },
  ],
});
const voucher = (i: number, count: number) => ({
  id: `v${i}`,
  voucherType: 'PAYMENT',
  voucherDate: '2026-03-02',
  amount: 25,
  totalCount: count,
  cashAccount: { code: '1000', name: 'Cash' },
  expenseAccount: { code: '6000', name: 'Expense' },
});

function serve(groups: number, vouchers: number) {
  http.get.mockImplementation((url: string) => {
    const q = new URLSearchParams(url.split('?')[1] ?? '');
    const max = Number(q.get('max'));
    const offset = Number(q.get('offset'));
    const page = (n: number, make: (i: number, c: number) => unknown) =>
      Array.from({ length: Math.max(0, Math.min(max, n - offset)) }, (_, k) => make(offset + k, n));
    if (url.startsWith('/ledgerTransactionGroup/index.json')) return Promise.resolve({ data: page(groups, group) });
    if (url.startsWith('/voucher/index.json')) return Promise.resolve({ data: page(vouchers, voucher) });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const calls = (path: string) =>
  http.get.mock.calls
    .map(([u]) => u as string)
    .filter((u) => u.startsWith(path))
    .map((u) => new URLSearchParams(u.split('?')[1]));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('useTransactions', () => {
  it('loads every row past the old 500 cap from both sources', async () => {
    serve(1200, 2100);
    const { result } = renderHook(() => useTransactions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 1200 groups × 2 lines + 2100 vouchers × 2 lines
    expect(result.current.data).toHaveLength(2400 + 4200);
    expect(result.current.truncated).toBe(false);
    expect(calls('/ledgerTransactionGroup/index.json').map((q) => q.get('offset'))).toEqual(['0', '1000']);
    expect(calls('/voucher/index.json').map((q) => q.get('offset'))).toEqual(['0', '1000', '2000']);
    for (const q of calls('/ledgerTransactionGroup/index.json')) {
      expect(q.get('max')).toBe('1000');
      expect(q.get('sort')).toBe('transactionDate');
    }
  });

  it('sends the date range to the voucher query only', async () => {
    serve(1, 1);
    const { result } = renderHook(() => useTransactions({ startDate: '2026-03-01', endDate: '2026-03-31' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [v] = calls('/voucher/index.json');
    expect(v.get('from')).toBe('2026-03-01');
    expect(v.get('to')).toBe('2026-03-31');
    const [g] = calls('/ledgerTransactionGroup/index.json');
    expect(g.has('from')).toBe(false);
  });

  it('returns an empty register for empty books (zero)', async () => {
    serve(0, 0);
    const { result } = renderHook(() => useTransactions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(calls('/voucher/index.json')).toHaveLength(1);
  });

  it('flags truncation when a source has more rows than the page cap (overflow)', async () => {
    serve(10, (REGISTER_MAX_PAGES + 2) * 1000);
    const { result } = renderHook(() => useTransactions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 10000 });
    expect(result.current.truncated).toBe(true);
    expect(calls('/voucher/index.json')).toHaveLength(REGISTER_MAX_PAGES);
  });

  it('surfaces a server error instead of a partial register', async () => {
    serve(1500, 10);
    const ok = http.get.getMockImplementation()!;
    http.get.mockImplementation((url: string) =>
      url.includes('offset=1000') ? Promise.reject(new Error('Request failed with status code 500')) : ok(url)
    );
    const { result } = renderHook(() => useTransactions(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
