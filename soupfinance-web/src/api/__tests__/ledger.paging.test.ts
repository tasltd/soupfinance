/**
 * Added (SOUPFIN-163): ledger endpoint paging params and row normalisation.
 * Only the HTTP client is mocked; the query strings are the real ones.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listLedgerTransactionsPage,
  listAllLedgerTransactions,
  getLedgerTransactionsByAccount,
  getAccountPeriodTotals,
  transformLedgerTransaction,
  listVouchersPage,
  listTransactionGroupsPage,
} from '../endpoints/ledger';
import type { LedgerTransaction } from '../../types';

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  interceptors: { request: { use: () => 0 }, response: { use: () => 0 } },
}));

vi.mock('axios', () => ({ default: { create: () => http, isAxiosError: () => false }, isAxiosError: () => false }));

const lastQuery = () => {
  const url = http.get.mock.calls.at(-1)![0] as string;
  return { path: url.split('?')[0], q: new URLSearchParams(url.split('?')[1] ?? '') };
};

beforeEach(() => {
  vi.clearAllMocks();
  http.get.mockResolvedValue({ data: [] });
});

describe('listLedgerTransactionsPage', () => {
  it('sends max, offset, sort and the filter names the backend reads', async () => {
    await listLedgerTransactionsPage({
      max: 50, offset: 100, sort: 'transactionDate', order: 'desc',
      accountId: 'acc-1', startDate: '2026-01-01', endDate: '2026-01-31',
    });
    const { path, q } = lastQuery();
    expect(path).toBe('/ledgerTransaction/index.json');
    expect(Object.fromEntries(q)).toEqual({
      max: '50', offset: '100', sort: 'transactionDate', order: 'desc',
      ledgerAccount: 'acc-1', from: '2026-01-01', to: '2026-01-31',
    });
  });

  it('omits empty filters', async () => {
    await listLedgerTransactionsPage({ max: 25, accountId: '', startDate: '' });
    expect(Object.fromEntries(lastQuery().q)).toEqual({ max: '25', offset: '0' });
  });

  it('returns the rows with the filtered total from totalCount', async () => {
    http.get.mockResolvedValueOnce({ data: [{ id: 'a', totalCount: 3 }, { id: 'b', totalCount: 3 }] });
    const page = await listLedgerTransactionsPage({ max: 2, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(true);
    expect(page.rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('prefers an X-Total-Count header if the server sends one', async () => {
    http.get.mockResolvedValueOnce({ data: [{ id: 'a' }], headers: { 'x-total-count': '40' } });
    const page = await listLedgerTransactionsPage({ max: 1, offset: 0 });
    expect(page).toMatchObject({ total: 40, hasMore: true });
  });
});

describe('listAllLedgerTransactions', () => {
  it('walks 1000-row pages with the same filters until the total', async () => {
    const all = Array.from({ length: 1700 }, (_, i) => ({ id: `r${i}`, totalCount: 1700 }));
    http.get.mockImplementation((url: string) => {
      const q = new URLSearchParams(url.split('?')[1]);
      const offset = Number(q.get('offset'));
      return Promise.resolve({ data: all.slice(offset, offset + Number(q.get('max'))) });
    });
    const result = await listAllLedgerTransactions({ accountId: 'acc-1', order: 'asc' });
    expect(result.rows).toHaveLength(1700);
    const calls = http.get.mock.calls.map(([u]) => new URLSearchParams((u as string).split('?')[1]));
    expect(calls.map((q) => [q.get('offset'), q.get('max'), q.get('ledgerAccount'), q.get('order')])).toEqual([
      ['0', '1000', 'acc-1', 'asc'],
      ['1000', '1000', 'acc-1', 'asc'],
    ]);
  });
});

describe('getLedgerTransactionsByAccount', () => {
  it('uses the index action filtered by account (there is no byAccount action)', async () => {
    await getLedgerTransactionsByAccount('acc-9', { max: 10 });
    const { path, q } = lastQuery();
    expect(path).toBe('/ledgerTransaction/index.json');
    expect(q.get('ledgerAccount')).toBe('acc-9');
  });
});

describe('getAccountPeriodTotals', () => {
  it('reads the raw debit and credit sums for the range', async () => {
    http.get.mockResolvedValueOnce({ data: { debit: '1500.250000', credit: 0, endingBalance: 0 } });
    const totals = await getAccountPeriodTotals('acc-1', '1900-01-01', '2025-12-31');
    expect(totals).toEqual({ debit: 1500.25, credit: 0 });
    const { path, q } = lastQuery();
    expect(path).toBe('/ledgerAccount/balance/acc-1.json');
    expect(Object.fromEntries(q)).toEqual({ from: '1900-01-01', to: '2025-12-31' });
  });

  it('treats a missing sum as zero', async () => {
    http.get.mockResolvedValueOnce({ data: {} });
    expect(await getAccountPeriodTotals('acc-1', '1900-01-01', '2025-12-31')).toEqual({ debit: 0, credit: 0 });
  });
});

describe('transformLedgerTransaction', () => {
  it('fills description, reference and account name from the index JSON', () => {
    const tx = transformLedgerTransaction({
      id: 't1',
      notes: 'Bank charges',
      quickReference: '329C033C2F',
      debit: 1.23,
      transactionState: 'DEBIT',
      ledgerAccount: { id: 'a1', serialised: 'First National Bank (62001131747)[ Deposits < ASSET ] - GHS' },
    } as unknown as LedgerTransaction);
    expect(tx.description).toBe('Bank charges');
    expect(tx.transactionNumber).toBe('329C033C2F');
    expect(tx.amount).toBe(1.23);
    expect(tx.ledgerAccount).toEqual(expect.objectContaining({ id: 'a1', name: 'First National Bank (62001131747)', code: '' }));
  });

  it('keeps fields that are already there', () => {
    const tx = transformLedgerTransaction({
      id: 't1', description: 'D', transactionNumber: 'JE-1', amount: 5,
      ledgerAccount: { id: 'a1', code: '1001', name: 'Cash' },
    } as unknown as LedgerTransaction);
    expect(tx).toMatchObject({ description: 'D', transactionNumber: 'JE-1', amount: 5, ledgerAccount: { code: '1001', name: 'Cash' } });
  });
});

describe('Register source pages', () => {
  it('pages vouchers with the date range as from/to', async () => {
    await listVouchersPage({ max: 1000, offset: 2000, from: '2026-01-01', to: '2026-01-31' });
    expect(Object.fromEntries(lastQuery().q)).toEqual({ max: '1000', offset: '2000', from: '2026-01-01', to: '2026-01-31' });
  });

  it('pages groups', async () => {
    await listTransactionGroupsPage({ max: 1000, offset: 0, sort: 'transactionDate', order: 'desc' });
    expect(lastQuery().path).toBe('/ledgerTransactionGroup/index.json');
    expect(lastQuery().q.get('sort')).toBe('transactionDate');
  });
});
