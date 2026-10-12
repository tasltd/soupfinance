/**
 * Unit tests for the ledger API module — ledger-account transform.
 *
 * Covers SOUPFIN-30:
 *   #4 Chart of Accounts renders (ledgerGroup derived so grouping works).
 *   #7 Account dropdown labels ("code - name") no longer show "undefined -".
 *   #8 Voucher/bank account filters by ledgerGroup return options.
 *
 * The backend LedgerAccount JSON has `name`, nullable `number`, `quickReference`
 * and a `ledgerAccountCategory` FK whose `serialised` ends with the group enum
 * (e.g. "Short-term Liabilities < LIABILITY"). It has NO top-level `code`,
 * `ledgerGroup`, `isActive` or `balance`.
 *
 * Note: axios is mocked globally via test/setup.ts. Modules are imported
 * dynamically after installing the per-test axios mock (matches clients.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { LedgerAccount } from '../../../types';

const rawAccount = (over: Record<string, unknown> = {}): LedgerAccount =>
  ({
    id: 'a1',
    name: 'Investment Fund Account',
    quickReference: '377E65D488',
    ledgerAccountCategory: {
      id: 'c1',
      class: 'soupbroker.finance.LedgerAccountCategory',
      serialised: 'Short-term Liabilities < LIABILITY',
    },
    ...over,
  } as unknown as LedgerAccount);

describe('ledger account transform (SOUPFIN-30)', () => {
  let mockGet: ReturnType<typeof vi.fn>;

  function installAxiosMock() {
    mockGet = vi.fn();
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: mockGet,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    installAxiosMock();
  });

  describe('deriveLedgerGroup (#8)', () => {
    it('reads the group from the trailing segment of the category serialised', async () => {
      vi.resetModules();
      const { deriveLedgerGroup } = await import('../ledger');
      expect(deriveLedgerGroup(rawAccount())).toBe('LIABILITY');
      expect(deriveLedgerGroup(rawAccount({ ledgerAccountCategory: { serialised: 'Cash and Bank < ASSET' } }))).toBe('ASSET');
      expect(deriveLedgerGroup(rawAccount({ ledgerAccountCategory: { serialised: 'Owners Capital < Parent < EQUITY' } }))).toBe('EQUITY');
      expect(deriveLedgerGroup(rawAccount({ ledgerAccountCategory: { serialised: 'Sales < INCOME' } }))).toBe('INCOME');
      expect(deriveLedgerGroup(rawAccount({ ledgerAccountCategory: { serialised: 'Cost of Sales < EXPENSE' } }))).toBe('EXPENSE');
    });

    it('prefers an already-present valid ledgerGroup', async () => {
      vi.resetModules();
      const { deriveLedgerGroup } = await import('../ledger');
      expect(deriveLedgerGroup({ ledgerGroup: 'ASSET' } as LedgerAccount)).toBe('ASSET');
    });

    it('returns undefined when no category / group token is present', async () => {
      vi.resetModules();
      const { deriveLedgerGroup } = await import('../ledger');
      expect(deriveLedgerGroup({} as LedgerAccount)).toBeUndefined();
      expect(deriveLedgerGroup(rawAccount({ ledgerAccountCategory: { serialised: 'Uncategorised' } }))).toBeUndefined();
    });
  });

  describe('transformLedgerAccount (#4, #7)', () => {
    it('derives group and code, and defaults isActive/balance', async () => {
      vi.resetModules();
      const { transformLedgerAccount } = await import('../ledger');
      const a = transformLedgerAccount(rawAccount());
      expect(a.ledgerGroup).toBe('LIABILITY');
      expect(a.code).toBe('377E65D488'); // no number → quickReference fallback
      expect(a.isActive).toBe(true);
      expect(a.balance).toBe(0);
      expect(`${a.code} - ${a.name}`).not.toContain('undefined');
    });

    it('uses backend `number` as the code when present (#7 – "5000 - Name")', async () => {
      vi.resetModules();
      const { transformLedgerAccount } = await import('../ledger');
      const a = transformLedgerAccount(rawAccount({ number: '5000', name: 'Salaries' }));
      expect(a.code).toBe('5000');
      expect(`${a.code} - ${a.name}`).toBe('5000 - Salaries');
    });

    it('marks archived accounts inactive', async () => {
      vi.resetModules();
      const { transformLedgerAccount } = await import('../ledger');
      expect(transformLedgerAccount(rawAccount({ archived: true })).isActive).toBe(false);
    });
  });

  describe('listLedgerAccounts (#4)', () => {
    it('transforms every row so grouping by ledgerGroup works', async () => {
      mockGet.mockResolvedValueOnce({
        data: [
          rawAccount({ id: 'a1', ledgerAccountCategory: { serialised: 'Cash < ASSET' } }),
          rawAccount({ id: 'a2', ledgerAccountCategory: { serialised: 'Payables < LIABILITY' } }),
        ],
      });
      vi.resetModules();
      const { listLedgerAccounts } = await import('../ledger');
      const accounts = await listLedgerAccounts();
      expect(accounts.map((a) => a.ledgerGroup)).toEqual(['ASSET', 'LIABILITY']);
    });

    it('returns [] on null data', async () => {
      mockGet.mockResolvedValueOnce({ data: null });
      vi.resetModules();
      const { listLedgerAccounts } = await import('../ledger');
      await expect(listLedgerAccounts()).resolves.toEqual([]);
    });
  });

  // Added (SOUPFIN-142): the COA page must show every account, not the backend's default 10.
  describe('listAllLedgerAccounts (SOUPFIN-142)', () => {
    const page = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) =>
        rawAccount({ id: `a${start + i}`, number: String(1000 + start + i), ledgerAccountCategory: { serialised: 'Cash < ASSET' } })
      );

    it('returns [] for a tenant with no accounts, after one request', async () => {
      mockGet.mockResolvedValueOnce({ data: [] });
      vi.resetModules();
      const { listAllLedgerAccounts } = await import('../ledger');
      await expect(listAllLedgerAccounts()).resolves.toEqual([]);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('asks for a full page sorted by number instead of the default 10 newest', async () => {
      mockGet.mockResolvedValueOnce({ data: page(0, 32) });
      vi.resetModules();
      const { listAllLedgerAccounts } = await import('../ledger');
      const accounts = await listAllLedgerAccounts();
      expect(accounts).toHaveLength(32);
      expect(accounts.every((a) => a.ledgerGroup === 'ASSET')).toBe(true);
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('/ledgerAccount/index.json?');
      expect(url).toContain('max=1000');
      expect(url).toContain('offset=0');
      expect(url).toContain('sort=number');
      expect(url).toContain('order=asc');
    });

    it('pages past the 1000-row cap for a large tenant (3167 accounts, 4 requests)', async () => {
      mockGet
        .mockResolvedValueOnce({ data: page(0, 1000) })
        .mockResolvedValueOnce({ data: page(1000, 1000) })
        .mockResolvedValueOnce({ data: page(2000, 1000) })
        .mockResolvedValueOnce({ data: page(3000, 167) });
      vi.resetModules();
      const { listAllLedgerAccounts } = await import('../ledger');
      const accounts = await listAllLedgerAccounts();
      expect(accounts).toHaveLength(3167);
      expect(new Set(accounts.map((a) => a.id)).size).toBe(3167);
      expect(mockGet).toHaveBeenCalledTimes(4);
      expect(mockGet.mock.calls[3][0]).toContain('offset=3000');
    });

    it('stops when the backend ignores offset and repeats page one', async () => {
      mockGet.mockResolvedValue({ data: page(0, 1000) });
      vi.resetModules();
      const { listAllLedgerAccounts } = await import('../ledger');
      const accounts = await listAllLedgerAccounts();
      expect(accounts).toHaveLength(1000);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('caps the walk at 50 pages even if every page is new and full', async () => {
      let call = 0;
      mockGet.mockImplementation(() => Promise.resolve({ data: page(1000 * call++, 1000) }));
      vi.resetModules();
      const { listAllLedgerAccounts } = await import('../ledger');
      const accounts = await listAllLedgerAccounts();
      expect(mockGet).toHaveBeenCalledTimes(50);
      expect(accounts).toHaveLength(50_000);
    });

    it('propagates a 403 instead of returning an empty chart', async () => {
      mockGet.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { response: { status: 403 } }));
      vi.resetModules();
      const { listAllLedgerAccounts } = await import('../ledger');
      await expect(listAllLedgerAccounts()).rejects.toThrow('Forbidden');
    });
  });

  describe('ledgerGroupMatches (#8)', () => {
    it('matches an exact group and rejects a different one', async () => {
      vi.resetModules();
      const { ledgerGroupMatches } = await import('../ledger');
      expect(ledgerGroupMatches('ASSET', 'ASSET')).toBe(true);
      expect(ledgerGroupMatches('EXPENSE', 'ASSET')).toBe(false);
      expect(ledgerGroupMatches(undefined, 'ASSET')).toBe(false);
    });

    it('treats INCOME and REVENUE as equivalent in both directions', async () => {
      vi.resetModules();
      const { ledgerGroupMatches } = await import('../ledger');
      expect(ledgerGroupMatches('REVENUE', 'INCOME')).toBe(true);
      expect(ledgerGroupMatches('INCOME', 'REVENUE')).toBe(true);
      // income-like equivalence must NOT leak into other groups
      expect(ledgerGroupMatches('REVENUE', 'EXPENSE')).toBe(false);
      expect(ledgerGroupMatches('EXPENSE', 'INCOME')).toBe(false);
    });
  });

  describe('listLedgerAccountsByGroup (#8)', () => {
    it('filters client-side by the derived group (backend cannot filter)', async () => {
      mockGet.mockResolvedValueOnce({
        data: [
          rawAccount({ id: 'a1', ledgerAccountCategory: { serialised: 'Cash < ASSET' } }),
          rawAccount({ id: 'a2', ledgerAccountCategory: { serialised: 'Rent < EXPENSE' } }),
          rawAccount({ id: 'a3', ledgerAccountCategory: { serialised: 'Bank < ASSET' } }),
        ],
      });
      vi.resetModules();
      const { listLedgerAccountsByGroup } = await import('../ledger');
      const assets = await listLedgerAccountsByGroup('ASSET');
      expect(assets.map((a) => a.id)).toEqual(['a1', 'a3']);
    });

    it('treats INCOME and REVENUE as equivalent', async () => {
      mockGet.mockResolvedValueOnce({
        data: [
          rawAccount({ id: 'a1', ledgerAccountCategory: { serialised: 'Sales < INCOME' } }),
          rawAccount({ id: 'a2', ledgerAccountCategory: { serialised: 'Other < REVENUE' } }),
          rawAccount({ id: 'a3', ledgerAccountCategory: { serialised: 'Rent < EXPENSE' } }),
        ],
      });
      vi.resetModules();
      const { listLedgerAccountsByGroup } = await import('../ledger');
      const income = await listLedgerAccountsByGroup('INCOME');
      expect(income.map((a) => a.id)).toEqual(['a1', 'a2']);
    });
  });
});
