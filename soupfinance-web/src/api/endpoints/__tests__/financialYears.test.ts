/**
 * Added (SOUPFIN-158): financial-year endpoints — URLs, payloads, and the
 * normalisation the pages rely on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient, { getCsrfToken, csrfQueryString } from '../../client';
import {
  closeFinancialYear,
  createFinancialYear,
  getCloseChecklist,
  getLockDate,
  listFinancialYears,
  postOpeningBalances,
  reopenFinancialYear,
  setLockDate,
} from '../financialYears';

vi.mock('../../client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getCsrfToken: vi.fn(),
  csrfQueryString: vi.fn(),
  normalizeToArray: (value: unknown) => (value == null ? [] : Array.isArray(value) ? value : [value]),
}));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const put = vi.mocked(apiClient.put);

beforeEach(() => {
  vi.mocked(getCsrfToken).mockResolvedValue({ SYNCHRONIZER_TOKEN: 't', SYNCHRONIZER_URI: '/financialYear/save' });
  vi.mocked(csrfQueryString).mockReturnValue('SYNCHRONIZER_TOKEN=t&SYNCHRONIZER_URI=%2FfinancialYear%2Fsave');
});

describe('listFinancialYears', () => {
  it('asks for up to 100 rows, newest first, and trims Grails timestamps to dates', async () => {
    get.mockResolvedValue({
      data: [{ id: 'fy1', name: 'FY 2025', fromDate: '2025-01-01T00:00:00Z', toDate: '2025-12-31T00:00:00Z' }],
    });
    const years = await listFinancialYears();
    expect(get).toHaveBeenCalledWith('/financialYear/index.json?max=100&sort=fromDate&order=desc');
    expect(years).toEqual([{ id: 'fy1', name: 'FY 2025', fromDate: '2025-01-01', toDate: '2025-12-31' }]);
  });

  it('returns an empty list for an empty response', async () => {
    get.mockResolvedValue({ data: [] });
    expect(await listFinancialYears()).toEqual([]);
  });

  it('lets a failure propagate instead of returning an empty list', async () => {
    get.mockRejectedValue(new Error('boom'));
    await expect(listFinancialYears()).rejects.toThrow('boom');
  });
});

describe('createFinancialYear', () => {
  it('posts to save.json with the CSRF token, trimming text and omitting blank notes', async () => {
    post.mockResolvedValue({ data: { id: 'new', name: 'FY 2026', fromDate: '2026-01-01', toDate: '2026-12-31' } });
    await createFinancialYear({ name: ' FY 2026 ', fromDate: '2026-01-01', toDate: '2026-12-31', notes: '  ' });
    expect(getCsrfToken).toHaveBeenCalledWith('financialYear');
    expect(post).toHaveBeenCalledWith(
      '/financialYear/save.json?SYNCHRONIZER_TOKEN=t&SYNCHRONIZER_URI=%2FfinancialYear%2Fsave',
      { name: 'FY 2026', fromDate: '2026-01-01', toDate: '2026-12-31' }
    );
  });
});

describe('close checklist, close and reopen', () => {
  it('coerces checklist numbers and treats a missing balanced flag as unbalanced', async () => {
    get.mockResolvedValue({ data: { pendingEntries: '2', netIncome: '1500.5', trialBalance: { totalDebit: '10', totalCredit: 10 } } });
    const checklist = await getCloseChecklist('fy1');
    expect(get).toHaveBeenCalledWith('/financialYear/closeChecklist/fy1.json');
    expect(checklist.pendingEntries).toBe(2);
    expect(checklist.netIncome).toBe(1500.5);
    expect(checklist.trialBalance).toEqual({ totalDebit: 10, totalCredit: 10, balanced: false });
  });

  it('closes and reopens by id', async () => {
    post.mockResolvedValue({ data: { id: 'fy1', name: 'FY 2025', fromDate: '2025-01-01', toDate: '2025-12-31', status: 'CLOSED' } });
    expect((await closeFinancialYear('fy1')).status).toBe('CLOSED');
    expect(post).toHaveBeenLastCalledWith('/financialYear/close/fy1.json', {});
    await reopenFinancialYear('fy1');
    expect(post).toHaveBeenLastCalledWith('/financialYear/reopen/fy1.json', {});
  });
});

describe('lock date', () => {
  it('reads a timestamp as a date, and no lock as null', async () => {
    get.mockResolvedValueOnce({ data: { lockDate: '2025-12-31T00:00:00Z' } });
    expect(await getLockDate()).toBe('2025-12-31');
    get.mockResolvedValueOnce({ data: { lockDate: null } });
    expect(await getLockDate()).toBeNull();
    get.mockResolvedValueOnce({ data: {} });
    expect(await getLockDate()).toBeNull();
  });

  it('sets and clears it with PUT', async () => {
    put.mockResolvedValueOnce({ data: { lockDate: '2025-12-31' } });
    expect(await setLockDate('2025-12-31')).toBe('2025-12-31');
    expect(put).toHaveBeenLastCalledWith('/financialYear/lockDate.json', { lockDate: '2025-12-31' });
    put.mockResolvedValueOnce({ data: { lockDate: null } });
    expect(await setLockDate(null)).toBeNull();
    expect(put).toHaveBeenLastCalledWith('/financialYear/lockDate.json', { lockDate: null });
  });
});

describe('postOpeningBalances', () => {
  it('drops zero rows before posting', async () => {
    post.mockResolvedValue({ data: { asOfDate: '2025-12-31', lineCount: 2, totalDebit: 5, totalCredit: 5 } });
    await postOpeningBalances({
      asOfDate: '2025-12-31',
      lines: [
        { ledgerAccount: { id: 'a' }, debit: 5, credit: 0 },
        { ledgerAccount: { id: 'z' }, debit: 0, credit: 0 },
        { ledgerAccount: { id: 'b' }, debit: 0, credit: 5 },
      ],
    });
    expect(post).toHaveBeenCalledWith('/financialYear/openingBalances.json', {
      asOfDate: '2025-12-31',
      lines: [
        { ledgerAccount: { id: 'a' }, debit: 5, credit: 0 },
        { ledgerAccount: { id: 'b' }, debit: 0, credit: 5 },
      ],
    });
  });
});
