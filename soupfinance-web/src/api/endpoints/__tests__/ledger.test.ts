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

// Added (SOUPFIN-154): the voucher edit form saves through updateVoucher, so it
// must send every FK as a nested object the way createVoucher does.
describe('updateVoucher FK binding (SOUPFIN-154)', () => {
  let mockPut: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPut = vi.fn().mockResolvedValue({ data: { id: 'v1' } });
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: vi.fn(),
      post: vi.fn(),
      put: mockPut,
      delete: vi.fn(),
    });
  });

  it('sends staff, both entry sides and payment method as nested FKs', async () => {
    vi.resetModules();
    const { updateVoucher } = await import('../ledger');
    await updateVoucher('v1', {
      voucherType: 'RECEIPT',
      voucherTo: 'STAFF',
      amount: 1250,
      notes: 'Refund',
      staffId: 's1',
      debitAccountId: 'acc-cash',
      creditAccountId: 'acc-income',
      paymentMethodId: 'pm-1',
    });

    const [url, body] = mockPut.mock.calls[0];
    expect(url).toBe('/voucher/update/v1.json');
    expect(body).toEqual({
      id: 'v1',
      voucherType: 'RECEIPT',
      voucherTo: 'STAFF',
      amount: 1250,
      notes: 'Refund',
      staff: { id: 's1' },
      debitLedgerAccount: { id: 'acc-cash' },
      creditLedgerAccount: { id: 'acc-income' },
      paymentMethod: { id: 'pm-1' },
    });
    // No flat *Id keys leak through: Grails would ignore them silently.
    expect(Object.keys(body).filter((k) => k.endsWith('Id'))).toEqual([]);
  });

  it('omits FKs that were not given', async () => {
    vi.resetModules();
    const { updateVoucher } = await import('../ledger');
    await updateVoucher('v2', { notes: 'Only the description changed' });
    expect(mockPut.mock.calls[0][1]).toEqual({ id: 'v2', notes: 'Only the description changed' });
  });
});

// Added (SOUPFIN-157): every voucher type is posted with its two entry sides
// under the backend's names. The Voucher delegates to a LedgerTransaction whose
// fields are debitLedgerAccount/creditLedgerAccount; any other key is dropped.
describe('createVoucher entry sides (SOUPFIN-157)', () => {
  let mockGet: ReturnType<typeof vi.fn>;
  let mockPost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet = vi.fn().mockResolvedValue({
      data: { SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/voucher/create' },
    });
    mockPost = vi.fn().mockResolvedValue({ data: { id: 'v-new' } });
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: mockGet,
      post: mockPost,
      put: vi.fn(),
      delete: vi.fn(),
    });
  });

  it.each([
    ['PAYMENT', 'acc-expense', 'acc-bank'],
    ['RECEIPT', 'acc-bank', 'acc-income'],
    ['CONTRA', 'acc-savings', 'acc-bank'],
    ['JOURNAL', 'acc-depreciation', 'acc-accumulated'],
  ] as const)('%s posts Dr %s and Cr %s', async (voucherType, debit, credit) => {
    vi.resetModules();
    const { createVoucher } = await import('../ledger');
    const saved = await createVoucher({
      voucherType,
      voucherTo: 'OTHER',
      transactionDate: '2026-10-12',
      amount: 1500,
      notes: `${voucherType} test`,
      debitAccountId: debit,
      creditAccountId: credit,
    });

    expect(mockGet).toHaveBeenCalledWith('/voucher/create.json');
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/voucher/save.json?SYNCHRONIZER_TOKEN=tok&SYNCHRONIZER_URI=%2Fvoucher%2Fcreate');
    expect(body.voucherType).toBe(voucherType);
    expect(body.debitLedgerAccount).toEqual({ id: debit });
    expect(body.creditLedgerAccount).toEqual({ id: credit });
    // The keys the backend has no field for are gone.
    expect(body).not.toHaveProperty('cashAccount');
    expect(body).not.toHaveProperty('expenseAccount');
    expect(body).not.toHaveProperty('incomeAccount');
    expect(saved).toEqual({ id: 'v-new' });
  });
});
