/**
 * SOUPFIN-178: open-document lists and the allocation save.
 *
 * axios is mocked at the instance level so the real endpoint code runs end to
 * end. Row shapes follow the LXC backend (2026-10-13): invoice/index.json and
 * bill/index.json ignore the accountServices.id / vendor.id filters and return
 * every row, each repeating `totalCount`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    })),
  },
}));

/** An invoice row whose single line totals `total`, with `paid` already received. */
function invoiceRow(id: string, accountServicesId: string, total: number, paid: number, totalCount: number) {
  return {
    id,
    number: Number(id.replace(/\D/g, '')) || 1,
    accountServices: { id: accountServicesId, class: 'soupbroker.kyc.AccountServices', serialised: 'Direct Account' },
    paymentDate: '2026-11-12T00:00:00Z',
    invoiceDate: '2026-10-13T00:00:00Z',
    invoiceItemList: [{ id: `${id}-item`, quantity: 1, unitPrice: total, amount: total, taxEntryInvoiceItemList: [] }],
    invoicePaymentList: paid ? [{ id: `${id}-pay`, amount: paid }] : [],
    totalCount,
  };
}

function billRow(id: string, vendorId: string, total: number, paid: number, totalCount: number) {
  return {
    id,
    number: id.toUpperCase(),
    vendor: { id: vendorId, class: 'soupbroker.trading.Vendor', serialised: 'Vendor' },
    paymentDate: '2026-11-01T00:00:00Z',
    billDate: '2026-10-01T00:00:00Z',
    subTotal: total,
    total,
    paidAmount: paid,
    amountDue: total - paid,
    totalCount,
  };
}

function queryOf(call: unknown[]): URLSearchParams {
  return new URLSearchParams(String(call[0]).split('?')[1] || '');
}

describe('paymentAllocations endpoints (SOUPFIN-178)', () => {
  let http: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    http = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      ...http,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    });
    vi.resetModules();
  });

  describe('listOpenInvoicesForAccountServices', () => {
    it("keeps only the client's invoices that still have a balance", async () => {
      http.get.mockResolvedValue({
        data: [
          invoiceRow('inv-1', 'as-mine', 3000, 0, 4),
          invoiceRow('inv-2', 'as-mine', 2500, 2500, 4), // fully paid
          invoiceRow('inv-3', 'as-other', 1000, 0, 4), // someone else's
          invoiceRow('inv-4', 'as-mine', 1000, 400, 4), // part paid
        ],
      });
      const { listOpenInvoicesForAccountServices } = await import('../paymentAllocations');

      const result = await listOpenInvoicesForAccountServices(['as-mine']);

      expect(result.documents.map((i) => [i.id, i.amountDue])).toEqual([
        ['inv-1', 3000],
        ['inv-4', 600],
      ]);
      expect(result.truncated).toBe(false);
      const q = queryOf(http.get.mock.calls[0]);
      expect(String(http.get.mock.calls[0][0])).toMatch(/^\/invoice\/index\.json\?/);
      expect(q.get('max')).toBe('1000');
      expect(q.get('sort')).toBe('paymentDate');
      expect(q.get('order')).toBe('asc');
      expect(q.get('accountServices.id')).toBe('as-mine');
    });

    it('matches any of several accounts and sends no single-account filter', async () => {
      http.get.mockResolvedValue({
        data: [invoiceRow('inv-1', 'as-a', 10, 0, 2), invoiceRow('inv-2', 'as-b', 20, 0, 2)],
      });
      const { listOpenInvoicesForAccountServices } = await import('../paymentAllocations');

      const result = await listOpenInvoicesForAccountServices(['as-a', 'as-b']);

      expect(result.documents.map((i) => i.id)).toEqual(['inv-1', 'inv-2']);
      expect(queryOf(http.get.mock.calls[0]).has('accountServices.id')).toBe(false);
    });

    it('makes no request for a client with no account', async () => {
      const { listOpenInvoicesForAccountServices } = await import('../paymentAllocations');
      expect(await listOpenInvoicesForAccountServices([])).toEqual({ documents: [], truncated: false });
      expect(http.get).not.toHaveBeenCalled();
    });

    it('reports truncation when the backend holds more rows than one scan reads', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => invoiceRow(`inv-${i}`, 'as-1', 10, 0, 1500));
      http.get.mockResolvedValue({ data: rows });
      const { listOpenInvoicesForAccountServices } = await import('../paymentAllocations');

      const result = await listOpenInvoicesForAccountServices(['as-1']);

      expect(result.documents).toHaveLength(1000);
      expect(result.truncated).toBe(true);
    });
  });

  describe('listOpenBillsForVendor', () => {
    it("keeps only the vendor's bills with a balance due", async () => {
      http.get.mockResolvedValue({
        data: [
          billRow('b-1', 'v-1', 500, 0, 3),
          billRow('b-2', 'v-1', 500, 500, 3),
          billRow('b-3', 'v-2', 500, 0, 3),
        ],
      });
      const { listOpenBillsForVendor } = await import('../paymentAllocations');

      const result = await listOpenBillsForVendor('v-1');

      expect(result.documents.map((b) => [b.id, b.amountDue])).toEqual([['b-1', 500]]);
      expect(String(http.get.mock.calls[0][0])).toMatch(/^\/bill\/index\.json\?/);
      expect(queryOf(http.get.mock.calls[0]).get('vendor.id')).toBe('v-1');
    });
  });

  describe('resolveClientAccountServicesIds', () => {
    it('uses nested ids, resolves bare portfolio refs, and drops duplicates', async () => {
      http.get.mockResolvedValue({ data: { id: 'port-2', accountServices: { id: 'as-2' } } });
      const { resolveClientAccountServicesIds } = await import('../paymentAllocations');

      const ids = await resolveClientAccountServicesIds({
        id: 'c-1',
        portfolioList: [
          { id: 'port-1', accountServices: { id: 'as-1' } },
          { id: 'port-2' },
          { id: 'port-3', accountServices: { id: 'as-1' } },
        ],
      } as never);

      expect(ids).toEqual(['as-1', 'as-2']);
      expect(http.get).toHaveBeenCalledTimes(1);
      expect(String(http.get.mock.calls[0][0])).toBe('/clientPortfolio/show/port-2.json');
    });

    it('returns no ids for a client without a portfolio', async () => {
      const { resolveClientAccountServicesIds } = await import('../paymentAllocations');
      expect(await resolveClientAccountServicesIds({ id: 'c-1' } as never)).toEqual([]);
    });
  });

  describe('createPaymentAllocation', () => {
    const request = {
      direction: 'RECEIPT' as const,
      strategy: 'FIFO' as const,
      totalAmount: 5000,
      paymentDate: '2026-10-13',
      accountServicesId: 'as-1',
      cashAccountId: 'acc-1000',
      allocations: [
        { invoiceId: 'inv-1', amount: 3000 },
        { invoiceId: 'inv-2', amount: 2000 },
      ],
    };

    it('posts the command as JSON with the CSRF token in the query string', async () => {
      http.get.mockResolvedValue({ data: { SYNCHRONIZER_TOKEN: 'tok-1', SYNCHRONIZER_URI: '/paymentAllocationGroup/save' } });
      http.post.mockResolvedValue({ data: { id: 'grp-1', status: 'POSTED', totalAmount: 5000 } });
      const { createPaymentAllocation } = await import('../paymentAllocations');

      const group = await createPaymentAllocation(request);

      expect(String(http.get.mock.calls[0][0])).toBe('/paymentAllocationGroup/create.json');
      const [url, body] = http.post.mock.calls[0];
      expect(String(url)).toMatch(/^\/paymentAllocationGroup\/save\.json\?/);
      expect(queryOf([url]).get('SYNCHRONIZER_TOKEN')).toBe('tok-1');
      expect(body).toEqual(request);
      expect(group).toMatchObject({ id: 'grp-1', status: 'POSTED' });
    });

    it('posts without a query string when the backend issues no token', async () => {
      http.get.mockResolvedValue({ data: { id: null, status: 'DRAFT' } });
      http.post.mockResolvedValue({ data: { id: 'grp-2' } });
      const { createPaymentAllocation } = await import('../paymentAllocations');

      await createPaymentAllocation(request);

      expect(String(http.post.mock.calls[0][0])).toBe('/paymentAllocationGroup/save.json');
    });

    it('lets a 422 from the backend reach the caller', async () => {
      http.get.mockResolvedValue({ data: {} });
      const error = Object.assign(new Error('Request failed with status code 422'), {
        isAxiosError: true,
        response: { status: 422, data: { message: 'Allocation 3500 exceeds amount due 3000 for invoice #1' } },
      });
      http.post.mockRejectedValue(error);
      const { createPaymentAllocation } = await import('../paymentAllocations');

      await expect(createPaymentAllocation(request)).rejects.toBe(error);
    });
  });
});
