/**
 * Unit tests for ledger account CRUD endpoints (SOUPFIN-149).
 *
 * Covers:
 *  - createLedgerAccount: CSRF from create.json, passed as URL params on POST save
 *  - updateLedgerAccount: PUT with no CSRF round trip
 *  - deactivateLedgerAccount: PUT { archived: true }, never DELETE
 *  - ledgerAccountHasTransactions: ?ledgerAccount=<id>&max=1, empty vs non-empty
 *  - listLedgerAccountCategories: max=1000, ledgerGroup from field or serialised
 *  - canEditLedgerAccount / canDeleteLedgerAccount: null flags = domain defaults
 *
 * axios is mocked globally via test/setup.ts; modules are imported after the
 * per-test axios mock is installed (same pattern as ledger.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

describe('ledger account CRUD endpoints (SOUPFIN-149)', () => {
  let mockGet: ReturnType<typeof vi.fn>;
  let mockPost: ReturnType<typeof vi.fn>;
  let mockPut: ReturnType<typeof vi.fn>;
  let mockDelete: ReturnType<typeof vi.fn>;

  async function loadLedger() {
    mockGet = vi.fn();
    mockPost = vi.fn();
    mockPut = vi.fn();
    mockDelete = vi.fn();
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: mockDelete,
    });
    vi.resetModules();
    return import('../ledger');
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createLedgerAccount', () => {
    it('fetches a CSRF token from create.json and sends it as URL params on save', async () => {
      const ledger = await loadLedger();
      mockGet.mockResolvedValueOnce({
        data: { SYNCHRONIZER_TOKEN: 'tok-149', SYNCHRONIZER_URI: '/rest/ledgerAccount/create.json' },
      });
      mockPost.mockResolvedValueOnce({
        data: {
          id: 'new-1',
          name: 'Petty Cash',
          number: '1015',
          ledgerAccountCategory: { id: 'cat-1', serialised: 'Cash and Bank < ASSET' },
        },
      });

      const saved = await ledger.createLedgerAccount({
        name: 'Petty Cash',
        number: '1015',
        ledgerAccountCategory: { id: 'cat-1' },
      });

      expect(mockGet).toHaveBeenCalledWith('/ledgerAccount/create.json');
      const [url, body] = mockPost.mock.calls[0];
      expect(url).toMatch(/^\/ledgerAccount\/save\.json\?/);
      expect(url).toContain('SYNCHRONIZER_TOKEN=tok-149');
      expect(body).toEqual({ name: 'Petty Cash', number: '1015', ledgerAccountCategory: { id: 'cat-1' } });
      // The response is normalised: code from number, group from category.
      expect(saved.code).toBe('1015');
      expect(saved.ledgerGroup).toBe('ASSET');
    });
  });

  describe('updateLedgerAccount', () => {
    it('PUTs to update/:id with the id in the body and no CSRF fetch', async () => {
      const ledger = await loadLedger();
      mockPut.mockResolvedValueOnce({
        data: { id: 'acc-1', name: 'Renamed', ledgerAccountCategory: { serialised: 'Sales < INCOME' } },
      });

      const updated = await ledger.updateLedgerAccount('acc-1', { name: 'Renamed', parentAccount: null });

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPut).toHaveBeenCalledWith('/ledgerAccount/update/acc-1.json', {
        name: 'Renamed',
        parentAccount: null,
        id: 'acc-1',
      });
      expect(updated.ledgerGroup).toBe('INCOME');
    });
  });

  describe('deactivateLedgerAccount', () => {
    it('archives through PUT update, never DELETE', async () => {
      const ledger = await loadLedger();
      mockPut.mockResolvedValueOnce({ data: { id: 'acc-1', name: 'Cash', archived: true } });

      const result = await ledger.deactivateLedgerAccount('acc-1');

      expect(mockPut).toHaveBeenCalledWith('/ledgerAccount/update/acc-1.json', { archived: true, id: 'acc-1' });
      expect(mockDelete).not.toHaveBeenCalled();
      expect(result.isActive).toBe(false);
    });
  });

  describe('ledgerAccountHasTransactions', () => {
    it('asks for one transaction on the account and returns true when one exists', async () => {
      const ledger = await loadLedger();
      mockGet.mockResolvedValueOnce({ data: [{ id: 'tx-1' }] });

      await expect(ledger.ledgerAccountHasTransactions('acc-1')).resolves.toBe(true);
      expect(mockGet).toHaveBeenCalledWith('/ledgerTransaction/index.json?ledgerAccount=acc-1&max=1');
    });

    it('returns false for an empty list', async () => {
      const ledger = await loadLedger();
      mockGet.mockResolvedValueOnce({ data: [] });
      await expect(ledger.ledgerAccountHasTransactions('acc-2')).resolves.toBe(false);
    });

    it('returns false when the body is not a list (no data)', async () => {
      const ledger = await loadLedger();
      mockGet.mockResolvedValueOnce({ data: null });
      await expect(ledger.ledgerAccountHasTransactions('acc-3')).resolves.toBe(false);
    });

    it('propagates a failed check instead of reporting "no transactions"', async () => {
      const ledger = await loadLedger();
      mockGet.mockRejectedValueOnce(Object.assign(new Error('Server error'), { response: { status: 500 } }));
      await expect(ledger.ledgerAccountHasTransactions('acc-4')).rejects.toThrow('Server error');
    });
  });

  describe('listLedgerAccountCategories', () => {
    it('requests the backend maximum and keeps an explicit ledgerGroup', async () => {
      const ledger = await loadLedger();
      mockGet.mockResolvedValueOnce({
        data: [{ id: 'c1', name: 'Cash and Bank', ledgerGroup: 'ASSET', serialised: 'Cash And Bank < ASSET' }],
      });

      const categories = await ledger.listLedgerAccountCategories();

      expect(mockGet).toHaveBeenCalledWith('/ledgerAccountCategory/index.json?max=1000');
      expect(categories).toHaveLength(1);
      expect(categories[0].ledgerGroup).toBe('ASSET');
    });

    it('derives the group from serialised when the row omits ledgerGroup', async () => {
      const ledger = await loadLedger();
      mockGet.mockResolvedValueOnce({
        data: [{ id: 'c2', name: 'Short-term Liabilities', serialised: 'Short-term Liabilities < LIABILITY' }],
      });

      const [category] = await ledger.listLedgerAccountCategories();
      expect(category.ledgerGroup).toBe('LIABILITY');
    });

    it('returns an empty list for an empty response', async () => {
      const ledger = await loadLedger();
      mockGet.mockResolvedValueOnce({ data: null });
      await expect(ledger.listLedgerAccountCategories()).resolves.toEqual([]);
    });

    it('maps every row of a full 1000-row page', async () => {
      const ledger = await loadLedger();
      const rows = Array.from({ length: 1000 }, (_, i) => ({
        id: `c${i}`,
        name: `Category ${i}`,
        serialised: `Category ${i} < EXPENSE`,
      }));
      mockGet.mockResolvedValueOnce({ data: rows });

      const categories = await ledger.listLedgerAccountCategories();
      expect(categories).toHaveLength(1000);
      expect(categories.every((c) => c.ledgerGroup === 'EXPENSE')).toBe(true);
    });
  });

  describe('system flags', () => {
    it('treats null/undefined flags as the domain defaults (editable and deletable)', async () => {
      const ledger = await loadLedger();
      const legacy = { editable: null, deletable: null, systemAccount: null };
      expect(ledger.canEditLedgerAccount(legacy)).toBe(true);
      expect(ledger.canDeleteLedgerAccount(legacy)).toBe(true);
      expect(ledger.canEditLedgerAccount({})).toBe(true);
      expect(ledger.canDeleteLedgerAccount({})).toBe(true);
    });

    it('blocks edit and delete for system accounts even when the flags allow them', async () => {
      const ledger = await loadLedger();
      const system = { systemAccount: true, editable: true, deletable: true };
      expect(ledger.canEditLedgerAccount(system)).toBe(false);
      expect(ledger.canDeleteLedgerAccount(system)).toBe(false);
    });

    it('honours editable=false and deletable=false independently', async () => {
      const ledger = await loadLedger();
      const noEdit = { editable: false, deletable: true };
      const noDelete = { editable: true, deletable: false };
      expect(ledger.canEditLedgerAccount(noEdit)).toBe(false);
      expect(ledger.canDeleteLedgerAccount(noEdit)).toBe(true);
      expect(ledger.canEditLedgerAccount(noDelete)).toBe(true);
      expect(ledger.canDeleteLedgerAccount(noDelete)).toBe(false);
    });
  });
});
