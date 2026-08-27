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
 * SOUPFIN-43 — the bill detail Amount Summary rendered all zeros while Balance
 * Due was correct.
 *
 * `grails-app/views/bill/_bill.gson` emits subTotal / total / totalTaxAmount /
 * paidAmount / amountDue. This codebase's `Bill` declares subtotal / totalAmount /
 * taxAmount / amountPaid / amountDue. Only `amountDue` collided, so four of five
 * rows arrived `undefined` and `formatCurrency(undefined)` printed 0.00.
 *
 * `_bill.gson` is also the template for index.json, so the list Total column and
 * the bill PDF carried the identical defect. These tests pin the mapping at the
 * API layer, which is where all three surfaces get their numbers.
 */
describe('bills API — header amount mapping (SOUPFIN-43)', () => {
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

  /** Backend header shape, verbatim field names from `_bill.gson`. */
  function backendBill(overrides: Record<string, unknown> = {}) {
    return {
      id: 'bill-6',
      billNumber: 'BILL-6',
      number: 6,
      vendor: { id: 'v1', serialised: '(Acme Supplies)' },
      billDate: '2026-08-14T00:00:00Z',
      paymentDate: '2026-09-13T00:00:00Z',
      status: 'PENDING',
      subTotal: 1500.0,
      total: 1725.0,
      totalTaxAmount: 225.0,
      paidAmount: 0,
      amountDue: 1725.0,
      baseTotal: 1725.0,
      basePaidAmount: 0,
      billItemList: null,
      ...overrides,
    };
  }

  /** getBill() issues two GETs: the bill, then its line items. */
  async function loadBill(
    header: Record<string, unknown>,
    items: unknown[] | Error = []
  ) {
    mockGet.mockResolvedValueOnce({ data: header });
    if (items instanceof Error) {
      mockGet.mockRejectedValueOnce(items);
    } else {
      mockGet.mockResolvedValueOnce({ data: items });
    }
    vi.resetModules();
    const { getBill } = await import('../bills');
    return getBill(String(header.id ?? 'bill-6'));
  }

  it('maps the reported bill #6 header (qty 3 x GH¢500, VAT 15%)', async () => {
    // The exact payload from the ticket: subTotal 1500, totalTaxAmount 225, total 1725.
    const bill = await loadBill(backendBill());

    expect(bill.subtotal).toBe(1500);
    expect(bill.taxAmount).toBe(225);
    expect(bill.totalAmount).toBe(1725);
    expect(bill.amountPaid).toBe(0);
    // Balance Due was always right — it is the one name that collided. Regression guard.
    expect(bill.amountDue).toBe(1725);
  });

  it('maps every row on the list response (Bills list Total column)', async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        backendBill(),
        backendBill({
          id: 'bill-7',
          subTotal: 800,
          totalTaxAmount: 0,
          total: 800,
          paidAmount: 300,
          amountDue: 500,
        }),
      ],
    });
    vi.resetModules();
    const { listBills } = await import('../bills');
    const bills = await listBills();

    expect(bills.map((b) => b.totalAmount)).toEqual([1725, 800]);
    expect(bills.map((b) => b.subtotal)).toEqual([1500, 800]);
    expect(bills.map((b) => b.taxAmount)).toEqual([225, 0]);
    expect(bills.map((b) => b.amountPaid)).toEqual([0, 300]);
    expect(bills.map((b) => b.amountDue)).toEqual([1725, 500]);
  });

  it('honours a partially paid bill without recomputing amountDue', async () => {
    const bill = await loadBill(
      backendBill({ paidAmount: 725.0, amountDue: 1000.0 })
    );

    expect(bill.amountPaid).toBe(725);
    expect(bill.amountDue).toBe(1000);
  });

  it('keeps a genuinely zero bill at zero (0 is not treated as "missing")', async () => {
    const bill = await loadBill(
      backendBill({ subTotal: 0, total: 0, totalTaxAmount: 0, amountDue: 0 }),
      [{ id: 'i1', description: 'Freebie', quantity: 2, unitPrice: 0, amount: 0 }]
    );

    expect(bill.subtotal).toBe(0);
    expect(bill.totalAmount).toBe(0);
    expect(bill.amountDue).toBe(0);
  });

  it('falls back to the line items when the header degrades to 0 (LazyInitializationException)', async () => {
    // _bill.gson catches LazyInitializationException and emits 0 for EVERY amount.
    // getBill() fetches the items separately, so they are the surviving truth.
    const bill = await loadBill(
      backendBill({
        subTotal: 0,
        total: 0,
        totalTaxAmount: 0,
        paidAmount: 0,
        amountDue: 0,
      }),
      [
        {
          id: 'i1',
          description: 'Consulting',
          quantity: 3,
          unitPrice: 500,
          amount: 1500,
          taxEntryBillItemList: [{ id: 'tx-1', taxAmount: 225 }],
        },
      ]
    );

    expect(bill.subtotal).toBe(1500);
    expect(bill.taxAmount).toBe(225);
    expect(bill.totalAmount).toBe(1725);
    expect(bill.amountDue).toBe(1725);
  });

  it('reads the tax off a bare FK-reference join row (serialised only)', async () => {
    // TaxEntryBillItem serialises with ONE trailing number, unlike the invoice join.
    const bill = await loadBill(
      backendBill({ subTotal: 0, total: 0, totalTaxAmount: 0, amountDue: 0 }),
      [
        {
          id: 'i1',
          description: 'Consulting',
          quantity: 2,
          unitPrice: 1000,
          amount: 2000,
          taxEntryBillItemList: [
            {
              id: 'tx-1',
              serialised: 'TaxEntryBillItem(BillItem(quantity:2.0, unitPrice:1000.00), VAT-S-15.0%, 300.0)',
            },
          ],
        },
      ]
    );

    expect(bill.subtotal).toBe(2000);
    expect(bill.taxAmount).toBe(300);
    expect(bill.totalAmount).toBe(2300);
  });

  it('computes from items when the header omits the amounts entirely', async () => {
    const header = backendBill();
    delete (header as Record<string, unknown>).subTotal;
    delete (header as Record<string, unknown>).total;
    delete (header as Record<string, unknown>).totalTaxAmount;
    delete (header as Record<string, unknown>).paidAmount;
    delete (header as Record<string, unknown>).amountDue;

    const bill = await loadBill(header, [
      { id: 'i1', description: 'A', quantity: 2, unitPrice: 250, amount: 500 },
      { id: 'i2', description: 'B', quantity: 1, unitPrice: 100 }, // amount derived
    ]);

    expect(bill.subtotal).toBe(600);
    expect(bill.taxAmount).toBe(0);
    expect(bill.totalAmount).toBe(600);
    expect(bill.amountPaid).toBe(0);
    expect(bill.amountDue).toBe(600);
  });

  it('never yields NaN/undefined when the header is empty or malformed', async () => {
    const bill = await loadBill(
      {
        id: 'bill-empty',
        billNumber: 'B-EMPTY',
        vendor: { id: 'v1', serialised: '(Acme)' },
        billDate: '2026-08-14T00:00:00Z',
        paymentDate: '2026-09-13T00:00:00Z',
        // Grails can render an unresolved amount as null; a string must not slip through either.
        subTotal: null,
        total: 'N/A',
        totalTaxAmount: undefined,
        paidAmount: null,
        amountDue: null,
      },
      new Error('items unavailable')
    );

    for (const value of [bill.subtotal, bill.taxAmount, bill.totalAmount, bill.amountPaid, bill.amountDue]) {
      expect(typeof value).toBe('number');
      expect(Number.isNaN(value)).toBe(false);
    }
    expect(bill.totalAmount).toBe(0);
  });

  it('keeps total and amountDue when the header omits only subTotal', async () => {
    // A partial header is NOT a degraded header. The unpaid-bills dropdown on the
    // payment form reads exactly this shape (total + amountDue, no subTotal) and
    // filters on amountDue > 0 — zeroing it empties the dropdown entirely.
    const bill = await loadBill(
      {
        id: 'bill-unpaid-001',
        billNumber: 'BILL-2024-010',
        vendor: { id: 'v1', serialised: '(Office Supplies Co)' },
        billDate: '2024-10-02T00:00:00Z',
        paymentDate: '2024-11-01T00:00:00Z',
        total: 1200.0,
        amountDue: 800.0,
      },
      []
    );

    expect(bill.totalAmount).toBe(1200);
    expect(bill.amountDue).toBe(800);
  });

  it('derives amountDue from total - paid when the backend omits it', async () => {
    const header = backendBill({ paidAmount: 725 });
    delete (header as Record<string, unknown>).amountDue;

    const bill = await loadBill(header);

    expect(bill.amountDue).toBe(1000);
  });

  it('accepts an already-normalised bill (mock / cached shape) unchanged', async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        {
          id: 'bill-norm',
          billNumber: 'B-NORM',
          vendor: { id: 'v1', serialised: '(Acme)' },
          billDate: '2026-08-14T00:00:00Z',
          paymentDate: '2026-09-13T00:00:00Z',
          subtotal: 1000,
          taxAmount: 150,
          totalAmount: 1150,
          amountPaid: 150,
          amountDue: 1000,
        },
      ],
    });
    vi.resetModules();
    const { listBills } = await import('../bills');
    const [bill] = await listBills();

    expect(bill.subtotal).toBe(1000);
    expect(bill.taxAmount).toBe(150);
    expect(bill.totalAmount).toBe(1150);
    expect(bill.amountPaid).toBe(150);
    expect(bill.amountDue).toBe(1000);
  });

  it('rounds derived money to 2dp so float drift never reaches the UI', async () => {
    const header = backendBill({
      subTotal: 0,
      total: 0,
      totalTaxAmount: 0,
      amountDue: 0,
    });

    const bill = await loadBill(header, [
      { id: 'i1', description: 'A', quantity: 3, unitPrice: 0.1, amount: 0.30000000000000004 },
      { id: 'i2', description: 'B', quantity: 1, unitPrice: 0.2, amount: 0.2 },
    ]);

    expect(bill.subtotal).toBe(0.5);
    expect(bill.totalAmount).toBe(0.5);
    expect(bill.amountDue).toBe(0.5);
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
