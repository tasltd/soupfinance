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

  it('sends staff, income account and payment method as nested FKs', async () => {
    vi.resetModules();
    const { updateVoucher } = await import('../ledger');
    await updateVoucher('v1', {
      voucherType: 'RECEIPT',
      voucherTo: 'STAFF',
      amount: 1250,
      notes: 'Refund',
      staffId: 's1',
      cashAccountId: 'acc-cash',
      incomeAccountId: 'acc-income',
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
      cashAccount: { id: 'acc-cash' },
      incomeAccount: { id: 'acc-income' },
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

// Added (SOUPFIN-156): VoucherController has no approve or cancel action.
// Approval and rejection save a VoucherApproval, which needs a CSRF token and
// an agent; posting is /voucher/post/:id.json.
describe('voucher lifecycle endpoints (SOUPFIN-156)', () => {
  let mockGet: ReturnType<typeof vi.fn>;
  let mockPost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet = vi.fn();
    mockPost = vi.fn().mockResolvedValue({ data: {} });
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: mockGet,
      post: mockPost,
      put: vi.fn(),
      delete: vi.fn(),
    });
  });

  it('approveVoucher saves an APPROVED VoucherApproval with the token and agent from create.json', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        SYNCHRONIZER_TOKEN: 'tok-1',
        SYNCHRONIZER_URI: '/voucherApproval/create',
        agent: { id: 'agent-9', serialised: 'Ama Mensah' },
      },
    });
    vi.resetModules();
    const { approveVoucher } = await import('../ledger');
    await approveVoucher('v1');

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0]).toBe('/voucherApproval/create.json?voucher.id=v1');
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toMatch(/^\/voucherApproval\/save\.json\?/);
    expect(url).toContain('SYNCHRONIZER_TOKEN=tok-1');
    expect(body).toEqual({ voucher: { id: 'v1' }, approvalState: 'APPROVED', agent: { id: 'agent-9' } });
    // The old endpoint never existed on the backend.
    expect(mockPost.mock.calls.some(([u]) => String(u).startsWith('/voucher/approve'))).toBe(false);
  });

  it('falls back to /user/current.json for the agent when create.json has none', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { voucherApproval: { SYNCHRONIZER_TOKEN: 'tok-2', SYNCHRONIZER_URI: '/u' } } })
      .mockResolvedValueOnce({ data: { username: 'ama', agentId: 'agent-from-user' } });
    vi.resetModules();
    const { approveVoucher } = await import('../ledger');
    await approveVoucher('v2');

    expect(mockGet.mock.calls[1][0]).toBe('/user/current.json');
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toContain('SYNCHRONIZER_TOKEN=tok-2');
    expect(body.agent).toEqual({ id: 'agent-from-user' });
  });

  it('rejectVoucher saves a REJECTED VoucherApproval, never /voucher/cancel', async () => {
    mockGet.mockResolvedValueOnce({ data: { SYNCHRONIZER_TOKEN: 't', SYNCHRONIZER_URI: '/u', agent: { id: 'a1' } } });
    vi.resetModules();
    const ledger = await import('../ledger');
    await ledger.rejectVoucher('v3', 'Duplicate of PV-12');

    expect(mockPost.mock.calls[0][1]).toEqual({
      voucher: { id: 'v3' },
      approvalState: 'REJECTED',
      agent: { id: 'a1' },
      comments: 'Duplicate of PV-12',
    });
    expect('cancelVoucher' in ledger).toBe(false);
  });

  it('postVoucher posts to /voucher/post/:id.json and returns the voucher', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 'v4', status: 'APPROVED', ledgerTransaction: { verifiedTransaction: true } } });
    vi.resetModules();
    const { postVoucher } = await import('../ledger');
    const result = await postVoucher('v4');
    expect(mockPost.mock.calls[0][0]).toBe('/voucher/post/v4.json');
    expect(result.id).toBe('v4');
  });

  it('propagates a backend refusal instead of swallowing it', async () => {
    mockGet.mockResolvedValueOnce({ data: { SYNCHRONIZER_TOKEN: 't', SYNCHRONIZER_URI: '/u', agent: { id: 'a1' } } });
    mockPost.mockRejectedValueOnce(new Error('Request failed with status code 422'));
    vi.resetModules();
    const { approveVoucher } = await import('../ledger');
    await expect(approveVoucher('v5')).rejects.toThrow('422');
  });
});
