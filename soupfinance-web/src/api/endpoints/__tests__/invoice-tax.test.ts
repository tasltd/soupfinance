/**
 * Unit tests for invoice line-item tax persistence (SOUPFIN-37).
 *
 * The defect: an invoice created with tax saved with a total that ignored it.
 *
 * Root cause: line items were sent as `invoiceItemList[N].*` params on
 * /rest/invoice/save.json. The backend's InvoiceService.applyItemFields()
 * copies only description, quantity, unitPrice and serviceDescription off
 * those params, so tax never reached the database. The ticket's suggested fix
 * (mirroring `billItemList[N].taxRate`) would also have been discarded —
 * InvoiceItem has no taxRate column at all; `getAmount()`, `getTaxAmount()`
 * and `getTotalAmount()` are derived getters.
 *
 * The real mechanism is `InvoiceItem.taxEntries`, a Set<TaxEntry> bound via
 * @BindUsing from a comma-separated id string. InvoiceItemController.save()
 * creates the TaxEntryInvoiceItem join rows and computes
 * `taxAmount = amount * taxRate/100`.
 *
 * Note: axios is mocked globally via test/setup.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

describe('invoice line-item tax (SOUPFIN-37)', () => {
  let mockGet: ReturnType<typeof vi.fn>;
  let mockPost: ReturnType<typeof vi.fn>;

  function installAxiosMock() {
    mockGet = vi.fn();
    mockPost = vi.fn();
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: mockGet,
      post: mockPost,
      put: vi.fn(),
      delete: vi.fn(),
    });
  }

  // Real TaxEntry UUIDs from /rest/taxEntry/index.json
  const VAT_ID = 'ff80818186941f2701869cb315b11dda';
  const NHIL_ID = 'ff80818173ca7d260173ca8249e70001';

  const CSRF = {
    SYNCHRONIZER_TOKEN: 'tok-123',
    SYNCHRONIZER_URI: '/rest/invoiceItem/create.json',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    installAxiosMock();
  });

  describe('createInvoiceItem', () => {
    async function importApi() {
      return await import('../invoices');
    }

    it('posts taxEntries as a comma-separated id string', async () => {
      mockGet.mockResolvedValue({ data: CSRF });
      mockPost.mockResolvedValue({ data: { id: 'item-1' } });

      const { createInvoiceItem } = await importApi();
      await createInvoiceItem('inv-1', {
        description: 'Advisory',
        quantity: 2,
        unitPrice: 1500,
        taxEntryIds: [NHIL_ID, VAT_ID],
      });

      const [url, payload] = mockPost.mock.calls[0];
      expect(url).toContain('/invoiceItem/save.json');
      // Grails @BindUsing tokenises on ','
      expect(payload.taxEntries).toBe(`${NHIL_ID},${VAT_ID}`);
      expect(payload.invoice).toEqual({ id: 'inv-1' });
      expect(payload.description).toBe('Advisory');
      expect(payload.quantity).toBe(2);
      expect(payload.unitPrice).toBe(1500);
    });

    it('includes the CSRF token, which POST/save requires', async () => {
      mockGet.mockResolvedValue({ data: CSRF });
      mockPost.mockResolvedValue({ data: { id: 'item-1' } });

      const { createInvoiceItem } = await importApi();
      await createInvoiceItem('inv-1', {
        description: 'Advisory',
        quantity: 1,
        unitPrice: 10,
        taxEntryIds: [VAT_ID],
      });

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/invoiceItem/create.json'));
      expect(mockPost.mock.calls[0][0]).toContain('SYNCHRONIZER_TOKEN=tok-123');
    });

    it('omits taxEntries entirely for an untaxed line', async () => {
      // An empty string would bind an empty Set and trip the controller's
      // iteration over taxEntries, so the key must be absent, not blank.
      mockGet.mockResolvedValue({ data: CSRF });
      mockPost.mockResolvedValue({ data: { id: 'item-1' } });

      const { createInvoiceItem } = await importApi();
      await createInvoiceItem('inv-1', {
        description: 'Advisory',
        quantity: 1,
        unitPrice: 100,
        taxEntryIds: [],
      });

      expect(mockPost.mock.calls[0][1]).not.toHaveProperty('taxEntries');
    });

    it('omits taxEntries when the field is undefined', async () => {
      mockGet.mockResolvedValue({ data: CSRF });
      mockPost.mockResolvedValue({ data: { id: 'item-1' } });

      const { createInvoiceItem } = await importApi();
      await createInvoiceItem('inv-1', {
        description: 'Advisory',
        quantity: 1,
        unitPrice: 100,
      });

      expect(mockPost.mock.calls[0][1]).not.toHaveProperty('taxEntries');
    });

    it('drops empty-string ids rather than sending a dangling comma', async () => {
      // "" is the No Tax sentinel; joining it blindly would produce ",<id>"
      // and the backend would try to resolve an empty id.
      mockGet.mockResolvedValue({ data: CSRF });
      mockPost.mockResolvedValue({ data: { id: 'item-1' } });

      const { createInvoiceItem } = await importApi();
      await createInvoiceItem('inv-1', {
        description: 'Advisory',
        quantity: 1,
        unitPrice: 100,
        taxEntryIds: ['', VAT_ID, ''],
      });

      expect(mockPost.mock.calls[0][1].taxEntries).toBe(VAT_ID);
    });

    it('handles a zero-quantity / zero-price line without dropping fields', async () => {
      mockGet.mockResolvedValue({ data: CSRF });
      mockPost.mockResolvedValue({ data: { id: 'item-1' } });

      const { createInvoiceItem } = await importApi();
      await createInvoiceItem('inv-1', {
        description: 'Freebie',
        quantity: 0,
        unitPrice: 0,
        taxEntryIds: [VAT_ID],
      });

      const payload = mockPost.mock.calls[0][1];
      expect(payload.quantity).toBe(0);
      expect(payload.unitPrice).toBe(0);
    });

    it('propagates a save failure instead of silently succeeding', async () => {
      mockGet.mockResolvedValue({ data: CSRF });
      mockPost.mockRejectedValue(new Error('422 Unprocessable Entity'));

      const { createInvoiceItem } = await importApi();
      await expect(
        createInvoiceItem('inv-1', { description: 'x', quantity: 1, unitPrice: 1 })
      ).rejects.toThrow('422');
    });
  });

  describe('invoice totals include tax', () => {
    // The second half of the defect: even once tax was persisted, every list
    // row, detail page, dashboard KPI and aging bucket still showed the bare
    // subtotal, because computeInvoiceTotals returned `totalAmount: subtotal`.
    async function importApi() {
      return await import('../invoices');
    }

    /** listInvoices maps over an array, so the body must be a list. */
    function invoiceResponse(invoiceItemList: unknown[]) {
      return {
        data: [
          {
            id: 'inv-1',
            invoiceDate: '2026-08-10T00:00:00Z',
            paymentDate: '2026-09-10T00:00:00Z',
            status: 'DRAFT',
            invoiceItemList,
            invoicePaymentList: [],
          },
        ],
      };
    }

    it('adds the stored tax amounts from the join rows to the total', async () => {
      mockGet.mockResolvedValue(
        invoiceResponse([
          {
            id: 'item-1',
            quantity: 2,
            unitPrice: 1500,
            taxEntryInvoiceItemList: [{ taxAmount: 75 }, { taxAmount: 75 }],
          },
        ])
      );

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].subtotal).toBe(3000);
      expect(invoices[0].taxAmount).toBe(150);
      expect(invoices[0].totalAmount).toBe(3150);
    });

    it('excludes withholding tax, which the payer deducts', async () => {
      mockGet.mockResolvedValue(
        invoiceResponse([
          {
            id: 'item-1',
            quantity: 1,
            unitPrice: 1000,
            taxEntryInvoiceItemList: [
              { taxAmount: 150, taxEntry: { isWithholdingTax: false } },
              { taxAmount: 50, taxEntry: { isWithholdingTax: true } },
            ],
          },
        ])
      );

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].taxAmount).toBe(150);
      expect(invoices[0].totalAmount).toBe(1150);
    });

    it('parses tax amounts out of serialised join rows', async () => {
      // TaxEntryInvoiceItem(InvoiceItem(...), NHIL-2.5%, 75.0, 3075.0)
      mockGet.mockResolvedValue(
        invoiceResponse([
          {
            id: 'item-1',
            quantity: 2,
            unitPrice: 1500,
            taxEntryInvoiceItemList: [
              { serialised: 'TaxEntryInvoiceItem(InvoiceItem(x), NHIL-2.5%, 75.0, 3075.0)' },
            ],
          },
        ])
      );

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].taxAmount).toBe(75);
      expect(invoices[0].totalAmount).toBe(3075);
    });

    it('falls back to rates embedded in the item serialised for list responses', async () => {
      // List items arrive as bare FK references with no join rows.
      mockGet.mockResolvedValue(
        invoiceResponse([
          {
            id: 'item-1',
            class: 'soupbroker.finance.InvoiceItem',
            serialised:
              'InvoiceItem(quantity:2.0, unitPrice:1500, taxEntries:[NHIL-2.5%, GETFL-2.5%], invoice:Invoice(x))',
          },
        ])
      );

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].subtotal).toBe(3000);
      expect(invoices[0].taxAmount).toBe(150); // 2.5% + 2.5% of 3000
      expect(invoices[0].totalAmount).toBe(3150);
    });

    it('reports zero tax for an untaxed item', async () => {
      mockGet.mockResolvedValue(
        invoiceResponse([
          {
            id: 'item-1',
            serialised: 'InvoiceItem(quantity:1.0, unitPrice:250, invoice:Invoice(x))',
          },
        ])
      );

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].taxAmount).toBe(0);
      expect(invoices[0].totalAmount).toBe(250);
    });

    it('treats an empty taxEntries list as untaxed', async () => {
      mockGet.mockResolvedValue(
        invoiceResponse([
          {
            id: 'item-1',
            serialised: 'InvoiceItem(quantity:1.0, unitPrice:250, taxEntries:[], invoice:Invoice(x))',
          },
        ])
      );

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].taxAmount).toBe(0);
      expect(invoices[0].totalAmount).toBe(250);
    });

    it('prefers exact join rows over the serialised rate fallback', async () => {
      // Both signals present: the stored amount must win.
      mockGet.mockResolvedValue(
        invoiceResponse([
          {
            id: 'item-1',
            quantity: 2,
            unitPrice: 1500,
            serialised: 'InvoiceItem(quantity:2.0, unitPrice:1500, taxEntries:[VAT-S-15.0%])',
            taxEntryInvoiceItemList: [{ taxAmount: 393.75 }],
          },
        ])
      );

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].taxAmount).toBe(393.75); // not 450 from the 15% fallback
    });

    it('sums tax across multiple line items', async () => {
      mockGet.mockResolvedValue(
        invoiceResponse([
          { id: 'i1', quantity: 1, unitPrice: 1000, taxEntryInvoiceItemList: [{ taxAmount: 150 }] },
          { id: 'i2', quantity: 2, unitPrice: 500, taxEntryInvoiceItemList: [{ taxAmount: 150 }] },
        ])
      );

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].subtotal).toBe(2000);
      expect(invoices[0].taxAmount).toBe(300);
      expect(invoices[0].totalAmount).toBe(2300);
    });

    it('rounds money to 2dp so float drift never reaches the UI', async () => {
      mockGet.mockResolvedValue(
        invoiceResponse([
          {
            id: 'item-1',
            quantity: 3,
            unitPrice: 0.1,
            taxEntryInvoiceItemList: [{ taxAmount: 0.1 }, { taxAmount: 0.2 }],
          },
        ])
      );

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].subtotal).toBe(0.3);
      expect(invoices[0].taxAmount).toBe(0.3);
      expect(invoices[0].totalAmount).toBe(0.6);
    });

    it('returns zeroes for an invoice with no line items', async () => {
      mockGet.mockResolvedValue(invoiceResponse([]));

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].subtotal).toBe(0);
      expect(invoices[0].taxAmount).toBe(0);
      expect(invoices[0].totalAmount).toBe(0);
    });

    it('reflects tax in the outstanding balance', async () => {
      // The aging/AR figure the ticket says was understated.
      mockGet.mockResolvedValue({
        data: [
          {
            id: 'inv-1',
            status: 'PARTIAL',
            invoiceItemList: [
              {
                id: 'item-1',
                quantity: 2,
                unitPrice: 1500,
                taxEntryInvoiceItemList: [{ taxAmount: 450 }],
              },
            ],
            invoicePaymentList: [{ id: 'p1', amount: 1000 }],
          },
        ],
      });

      const { listInvoices } = await importApi();
      const invoices = await listInvoices();

      expect(invoices[0].totalAmount).toBe(3450);
      expect(invoices[0].amountPaid).toBe(1000);
      expect(invoices[0].amountDue).toBe(2450); // was 2000 before the fix
    });
  });

  describe('listTaxRates', () => {
    async function importDomainData() {
      return await import('../domainData');
    }

    const TAX_ENTRIES = [
      { id: VAT_ID, name: 'VAT- STANDARD', abbreviation: 'VAT-S', taxRate: 15.0, isCompoundTax: true },
      { id: NHIL_ID, name: 'National Health Insurance Levy', taxRate: 2.5, isTaxable: true },
      { id: 'wht-1', name: 'Withholding Tax', taxRate: 4.0, isWithholdingTax: true },
    ];

    it('reads the real TaxEntry endpoint, not hardcoded values', async () => {
      mockGet.mockResolvedValue({ data: TAX_ENTRIES });

      const { listTaxRates } = await importDomainData();
      await listTaxRates();

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/taxEntry/index.json'));
    });

    it('maps each entry to its real UUID and percentage rate', async () => {
      mockGet.mockResolvedValue({ data: TAX_ENTRIES });

      const { listTaxRates } = await importDomainData();
      const rates = await listTaxRates();

      const vat = rates.find((r) => r.id === VAT_ID);
      expect(vat).toBeDefined();
      expect(vat?.rate).toBe(15);
      expect(vat?.name).toBe('VAT- STANDARD');
      // The old synthetic ids must be gone — they could never resolve to an FK.
      expect(rates.some((r) => r.id.startsWith('tax-vat'))).toBe(false);
    });

    it('prepends a "No Tax" option with an empty id', async () => {
      mockGet.mockResolvedValue({ data: TAX_ENTRIES });

      const { listTaxRates } = await importDomainData();
      const rates = await listTaxRates();

      expect(rates[0]).toMatchObject({ id: '', rate: 0 });
    });

    it('excludes withholding tax, which is deducted by the payer not added', async () => {
      mockGet.mockResolvedValue({ data: TAX_ENTRIES });

      const { listTaxRates } = await importDomainData();
      const rates = await listTaxRates();

      expect(rates.some((r) => r.id === 'wht-1')).toBe(false);
    });

    it('normalises a single object response into an array', async () => {
      // Grails collapses one-element collections to a bare object.
      mockGet.mockResolvedValue({ data: TAX_ENTRIES[1] });

      const { listTaxRates } = await importDomainData();
      const rates = await listTaxRates();

      expect(rates).toHaveLength(2); // No Tax + NHIL
      expect(rates[1].id).toBe(NHIL_ID);
    });

    it('returns just "No Tax" when the tenant has no tax entries', async () => {
      mockGet.mockResolvedValue({ data: [] });

      const { listTaxRates } = await importDomainData();
      const rates = await listTaxRates();

      expect(rates).toEqual([expect.objectContaining({ id: '', rate: 0 })]);
    });

    it('tolerates a null response body', async () => {
      mockGet.mockResolvedValue({ data: null });

      const { listTaxRates } = await importDomainData();
      const rates = await listTaxRates();

      expect(rates).toHaveLength(1);
      expect(rates[0].id).toBe('');
    });

    it('skips malformed entries that have no id', async () => {
      mockGet.mockResolvedValue({
        data: [{ name: 'Broken', taxRate: 5 }, TAX_ENTRIES[1]],
      });

      const { listTaxRates } = await importDomainData();
      const rates = await listTaxRates();

      expect(rates).toHaveLength(2); // No Tax + NHIL only
      expect(rates.every((r) => r.id === '' || r.id === NHIL_ID)).toBe(true);
    });

    it('coerces a missing or non-numeric rate to 0 rather than NaN', async () => {
      mockGet.mockResolvedValue({
        data: [{ id: 'weird-1', name: 'Weird', taxRate: undefined as unknown as number }],
      });

      const { listTaxRates } = await importDomainData();
      const rates = await listTaxRates();

      expect(rates[1].rate).toBe(0);
      expect(Number.isNaN(rates[1].rate)).toBe(false);
    });

    it('falls back to the abbreviation when name is missing', async () => {
      mockGet.mockResolvedValue({
        data: [{ id: 'abbr-1', abbreviation: 'CST', taxRate: 5 }],
      });

      const { listTaxRates } = await importDomainData();
      const rates = await listTaxRates();

      expect(rates[1].name).toBe('CST');
    });
  });
});
