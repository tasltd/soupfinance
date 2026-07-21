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
