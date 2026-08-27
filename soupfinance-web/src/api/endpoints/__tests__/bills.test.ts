/**
 * Unit tests for the bills API module.
 *
 * Covers SOUPFIN-30:
 *   #1 Vendor name is resolved from the Grails `vendor.serialised` string
 *      ("SYMBOL (Name)[Type]") because the backend omits `vendor.name`.
 *   #2 billDate / paymentDate are stripped of their ISO time component.
 *   #3 getBill() fetches the full line items separately (the show response
 *      returns billItemList: null) so the edit form can pre-fill them.
 *
 * Note: axios is mocked globally via test/setup.ts. Modules are imported
 * dynamically after installing the per-test axios mock (matches clients.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

describe('bills API (SOUPFIN-30)', () => {
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

  describe('extractVendorName (#1)', () => {
    it('extracts the name inside parentheses (blank symbol)', async () => {
      vi.resetModules();
      const { extractVendorName } = await import('../bills');
      expect(extractVendorName({ serialised: '(Ayawaso West Municipal Assembly)' }))
        .toBe('Ayawaso West Municipal Assembly');
    });

    it('extracts the name from "SYMBOL (Name)[Type]" and prefers explicit name', async () => {
      vi.resetModules();
      const { extractVendorName } = await import('../bills');
      expect(extractVendorName({ serialised: 'ACME (Acme Corp)[SUPPLIER]' })).toBe('Acme Corp');
      expect(extractVendorName({ name: 'Real Name', serialised: '(Ignored)' })).toBe('Real Name');
    });

    it('falls back to the trimmed serialised when there are no parentheses', async () => {
      vi.resetModules();
      const { extractVendorName } = await import('../bills');
      expect(extractVendorName({ serialised: '  Plain Vendor  ' })).toBe('Plain Vendor');
    });

    it('returns "" for missing / empty vendor references', async () => {
      vi.resetModules();
      const { extractVendorName } = await import('../bills');
      expect(extractVendorName(null)).toBe('');
      expect(extractVendorName(undefined)).toBe('');
      expect(extractVendorName({})).toBe('');
      expect(extractVendorName({ serialised: '' })).toBe('');
    });
  });

  describe('listBills (#1, #2)', () => {
    it('resolves vendor name and formats dates for every row', async () => {
      mockGet.mockResolvedValueOnce({
        data: [
          {
            id: 'b1',
            billNumber: 'B-1',
            vendor: { id: 'v1', serialised: '(Ayawaso West Municipal Assembly)' },
            billDate: '2023-07-10T00:00:00Z',
            paymentDate: '2023-10-30T00:00:00Z',
          },
        ],
      });
      vi.resetModules();
      const { listBills } = await import('../bills');
      const bills = await listBills({ max: 20 });

      expect(bills[0].vendor.name).toBe('Ayawaso West Municipal Assembly');
      expect(bills[0].billDate).toBe('2023-07-10');
      expect(bills[0].paymentDate).toBe('2023-10-30');
    });

    it('returns [] when the backend sends null/empty data', async () => {
      mockGet.mockResolvedValueOnce({ data: null });
      vi.resetModules();
      const { listBills } = await import('../bills');
      await expect(listBills()).resolves.toEqual([]);
    });
  });

  describe('getBill (#3)', () => {
    it('fetches line items separately and normalises them (taxRate/amount defaults)', async () => {
      mockGet
        .mockResolvedValueOnce({
          data: {
            id: 'b1',
            billNumber: 'B-1',
            vendor: { id: 'v1', serialised: 'AWM (Ayawaso West)[GOV]' },
            billDate: '2023-07-10T00:00:00Z',
            paymentDate: '2023-10-30T00:00:00Z',
            billItemList: null,
          },
        })
        .mockResolvedValueOnce({
          data: [
            { id: 'i1', description: 'Permit', quantity: '2', unitPrice: '820', taxRate: null, amount: null },
          ],
        });
      vi.resetModules();
      const { getBill } = await import('../bills');
      const bill = await getBill('b1');

      expect(mockGet).toHaveBeenNthCalledWith(2, expect.stringContaining('/billItem/index.json?bill.id=b1'));
      expect(bill.vendor.name).toBe('Ayawaso West');
      expect(bill.billDate).toBe('2023-07-10');
      expect(bill.billItemList).toHaveLength(1);
      const item = bill.billItemList![0];
      expect(item.quantity).toBe(2);
      expect(item.unitPrice).toBe(820);
      expect(item.taxRate).toBe(0); // null → 0
      expect(item.amount).toBe(1640); // computed 2 * 820 when backend omits amount
    });

    it('keeps the bill even when the separate item fetch fails', async () => {
      mockGet
        .mockResolvedValueOnce({
          data: {
            id: 'b2',
            billNumber: 'B-2',
            vendor: { id: 'v2', serialised: '(Vendor Two)' },
            billDate: '2024-01-01T00:00:00Z',
            paymentDate: '2024-02-01T00:00:00Z',
            billItemList: null,
          },
        })
        .mockRejectedValueOnce(new Error('boom'));
      vi.resetModules();
      const { getBill } = await import('../bills');
      const bill = await getBill('b2');
      expect(bill.vendor.name).toBe('Vendor Two');
      expect(bill.billDate).toBe('2024-01-01');
    });
  });
});

/**
 * SOUPFIN-44 — the bill-side wrapper must read the RIGHT join collection and
 * must distinguish "untaxed" from "unknown".
 *
 * `BillItem` carries tax in `taxEntryBillItemList` (the invoice domain uses
 * `taxEntryInvoiceItemList`), and its join row serialises with ONE trailing
 * number where the invoice row has two. Pinning the field name here is what
 * stops a copy-paste from the invoice module silently returning "no tax".
 */
describe('resolveBillItemTaxRate (SOUPFIN-44)', () => {
  /** Verbatim TaxEntryBillItem.serialised — one trailing number, not two. */
  const BILL_ROW =
    'TaxEntryBillItem(BillItem(quantity:2.0, unitPrice:1500, taxEntries:[CST-5.0%], ' +
    'bill:Bill((805 Restaurant)[PROVIDER], 202206-03, 230)), CST-5.0%, 0.0)';

  /** Mirrors listTaxRates: the empty-id "No Tax" sentinel comes first. */
  const catalogue = [
    { id: '', name: 'No Tax', rate: 0 },
    { id: 'uuid-cst', name: 'CST', rate: 5, serialised: 'CST-5.0%' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads taxEntryBillItemList and returns the catalogue rate', async () => {
    vi.resetModules();
    const { resolveBillItemTaxRate } = await import('../bills');
    expect(
      resolveBillItemTaxRate({ taxEntryBillItemList: [{ serialised: BILL_ROW }] }, catalogue)
    ).toBe(5);
  });

  it('returns null — not 0 — when the line is taxed by an entry it cannot identify', async () => {
    vi.resetModules();
    const { resolveBillItemTaxRate } = await import('../bills');
    expect(
      resolveBillItemTaxRate(
        { taxEntryBillItemList: [{ serialised: 'TaxEntryBillItem(X(a), VAT-S-15.0%, 225.0)' }] },
        catalogue
      )
    ).toBeNull();
  });

  it('returns 0 for a line with no tax rows, and for a missing item', async () => {
    vi.resetModules();
    const { resolveBillItemTaxRate } = await import('../bills');
    expect(resolveBillItemTaxRate({ taxEntryBillItemList: [] }, catalogue)).toBe(0);
    expect(resolveBillItemTaxRate({}, catalogue)).toBe(0);
    // The detail page maps over billItemList, so a null entry must not throw.
    expect(
      resolveBillItemTaxRate(
        null as unknown as { taxEntryBillItemList?: null },
        catalogue
      )
    ).toBe(0);
  });
});
