/**
 * SOUPFIN-177: payments list paging/filtering, payment show, and void (delete).
 *
 * axios is mocked at the instance level so the real endpoint code runs end to
 * end: URL + query string out, transformed rows and page metadata back.
 * Row shapes are copied from the LXC backend (2026-10-13): FKs carry only
 * { id, class, serialised } and every index row repeats `totalCount`.
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

const BANK = { id: 'pm-bank', class: 'soupbroker.finance.PaymentMethod', serialised: 'Bank Transfer' };
const CASH = { id: 'pm-cash', class: 'soupbroker.finance.PaymentMethod', serialised: 'Cash' };

function invoicePaymentRow(i: number, method: typeof BANK | null, totalCount: number) {
  return {
    id: `ip-${i}`,
    invoice: {
      id: 'inv-1',
      class: 'soupbroker.finance.Invoice',
      serialised: 'Invoice(number:2025001, accountServices:Direct Account : Corporate(Acme Ltd), currency:USD, total:6095.00)',
    },
    ...(method ? { paymentMethod: method } : {}),
    payInAccount: { id: 'la-1', class: 'soupbroker.finance.LedgerAccount', serialised: 'GT Bank USD' },
    totalCount,
    amount: 100 + i,
    paymentDate: '2025-09-17T00:00:00Z',
    dateCreated: '2026-09-30T00:46:26Z',
    quickReference: `QR${i}`,
  };
}

/** Query string of the n-th GET as a URLSearchParams. */
function queryOf(call: unknown[]): URLSearchParams {
  const url = String(call[0]);
  return new URLSearchParams(url.split('?')[1] || '');
}

describe('payments endpoints (SOUPFIN-177)', () => {
  let http: { get: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };

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

  describe('listPaymentsPage — server paging', () => {
    it('sends max/offset/sort for the requested page and reads the total from totalCount', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => invoicePaymentRow(20 + i, BANK, 45));
      http.get.mockResolvedValue({ data: rows });
      const { listPaymentsPage } = await import('../payments');

      const result = await listPaymentsPage('invoice', { page: 2, pageSize: 20 });

      expect(String(http.get.mock.calls[0][0])).toMatch(/^\/invoicePayment\/index\.json\?/);
      const q = queryOf(http.get.mock.calls[0]);
      expect(q.get('max')).toBe('20');
      expect(q.get('offset')).toBe('20');
      expect(q.get('sort')).toBe('paymentDate');
      expect(q.get('order')).toBe('desc');
      expect(q.has('from')).toBe(false);
      expect(q.has('paymentMethod.id')).toBe(false);
      expect(result.total).toBe(45);
      expect(result.truncated).toBe(false);
      expect(result.payments).toHaveLength(20);
      // transformPayment still runs: ISO timestamp → date
      expect(result.payments[0].paymentDate).toBe('2025-09-17');
    });

    it('passes the recorded-date range to the backend as from/to', async () => {
      http.get.mockResolvedValue({ data: [invoicePaymentRow(1, BANK, 1)] });
      const { listPaymentsPage } = await import('../payments');

      await listPaymentsPage('bill', { page: 1, pageSize: 20, from: '2026-10-01', to: '2026-10-13' });

      expect(String(http.get.mock.calls[0][0])).toMatch(/^\/billPayment\/index\.json\?/);
      const q = queryOf(http.get.mock.calls[0]);
      expect(q.get('from')).toBe('2026-10-01');
      expect(q.get('to')).toBe('2026-10-13');
      expect(q.get('offset')).toBe('0');
    });

    it('zero rows: total 0, no crash', async () => {
      http.get.mockResolvedValue({ data: [] });
      const { listPaymentsPage } = await import('../payments');

      const result = await listPaymentsPage('invoice', { page: 1, pageSize: 20 });

      expect(result).toEqual({ payments: [], total: 0, truncated: false });
    });

    it('a null body is treated as no rows', async () => {
      http.get.mockResolvedValue({ data: null });
      const { listPaymentsPage } = await import('../payments');

      const result = await listPaymentsPage('invoice', { page: 1, pageSize: 20 });

      expect(result.total).toBe(0);
    });

    it('falls back to offset + rows when the backend omits totalCount', async () => {
      const rows = [invoicePaymentRow(1, BANK, 0), invoicePaymentRow(2, BANK, 0)].map(
        ({ totalCount: _t, ...r }) => r
      );
      http.get.mockResolvedValue({ data: rows });
      const { listPaymentsPage } = await import('../payments');

      const result = await listPaymentsPage('invoice', { page: 3, pageSize: 20 });

      expect(result.total).toBe(42);
    });

    it('clamps a page below 1 to the first page', async () => {
      http.get.mockResolvedValue({ data: [] });
      const { listPaymentsPage } = await import('../payments');

      await listPaymentsPage('invoice', { page: 0, pageSize: 20 });

      expect(queryOf(http.get.mock.calls[0]).get('offset')).toBe('0');
    });

    it('overflow: a 10,000-row total gives the right page count source', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => invoicePaymentRow(i, BANK, 10_000));
      http.get.mockResolvedValue({ data: rows });
      const { listPaymentsPage } = await import('../payments');

      const result = await listPaymentsPage('invoice', { page: 500, pageSize: 20 });

      expect(queryOf(http.get.mock.calls[0]).get('offset')).toBe('9980');
      expect(result.total).toBe(10_000);
    });
  });

  describe('listPaymentsPage — method filter (backend ignores paymentMethod.id)', () => {
    it('scans up to the backend cap, keeps only the chosen method, and pages locally', async () => {
      // 30 rows from the server, alternating methods, one with no method at all.
      const rows = Array.from({ length: 30 }, (_, i) =>
        invoicePaymentRow(i, i === 29 ? null : i % 2 === 0 ? BANK : CASH, 30)
      );
      http.get.mockResolvedValue({ data: rows });
      const { listPaymentsPage, MAX_FILTER_SCAN } = await import('../payments');

      const page1 = await listPaymentsPage('invoice', { page: 1, pageSize: 10, paymentMethodId: 'pm-cash' });

      const q = queryOf(http.get.mock.calls[0]);
      expect(q.get('paymentMethod.id')).toBe('pm-cash');
      expect(q.get('max')).toBe(String(MAX_FILTER_SCAN));
      expect(q.get('offset')).toBe('0');
      // CASH rows are the odd indexes 1..27 → 14 rows
      expect(page1.total).toBe(14);
      expect(page1.payments).toHaveLength(10);
      expect(page1.payments.every((p) => p.paymentMethod?.id === 'pm-cash')).toBe(true);
      expect(page1.truncated).toBe(false);

      const page2 = await listPaymentsPage('invoice', { page: 2, pageSize: 10, paymentMethodId: 'pm-cash' });
      expect(page2.payments.map((p) => p.id)).toEqual(['ip-21', 'ip-23', 'ip-25', 'ip-27']);
    });

    it('no matches: total 0', async () => {
      http.get.mockResolvedValue({ data: [invoicePaymentRow(1, BANK, 1)] });
      const { listPaymentsPage } = await import('../payments');

      const result = await listPaymentsPage('invoice', { page: 1, pageSize: 10, paymentMethodId: 'pm-cash' });

      expect(result.payments).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('flags truncation when the backend holds more rows than the scan cap returned', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => invoicePaymentRow(i, CASH, 4321));
      http.get.mockResolvedValue({ data: rows });
      const { listPaymentsPage } = await import('../payments');

      const result = await listPaymentsPage('bill', { page: 1, pageSize: 20, paymentMethodId: 'pm-cash' });

      expect(result.truncated).toBe(true);
      expect(result.total).toBe(1000);
      expect(result.payments).toHaveLength(20);
    });
  });

  describe('getInvoicePayment / getBillPayment', () => {
    it('reads /invoicePayment/show/:id.json and normalises the date', async () => {
      http.get.mockResolvedValue({ data: invoicePaymentRow(7, BANK, 1) });
      const { getInvoicePayment } = await import('../invoices');

      const payment = await getInvoicePayment('ip-7');

      expect(http.get).toHaveBeenCalledWith('/invoicePayment/show/ip-7.json');
      expect(payment.id).toBe('ip-7');
      expect(payment.paymentDate).toBe('2025-09-17');
      expect(payment.paymentMethod?.serialised).toBe('Bank Transfer');
    });

    it('reads /billPayment/show/:id.json', async () => {
      http.get.mockResolvedValue({ data: { id: 'bp-1', amount: 5, paymentDate: '2026-10-13T00:00:00Z', bill: { id: 'b-1' } } });
      const { getBillPayment } = await import('../bills');

      const payment = await getBillPayment('bp-1');

      expect(http.get).toHaveBeenCalledWith('/billPayment/show/bp-1.json');
      expect(payment.paymentDate).toBe('2026-10-13');
    });
  });

  describe('deleteInvoicePayment / deleteBillPayment (void)', () => {
    it('resolves on a 204 with no body', async () => {
      http.delete.mockResolvedValue({ status: 204, data: '' });
      const { deleteInvoicePayment } = await import('../invoices');

      await expect(deleteInvoicePayment('ip-1')).resolves.toBeUndefined();
      expect(http.delete).toHaveBeenCalledWith('/invoicePayment/delete/ip-1.json');
    });

    it('rejects with DeleteBlockedError when the backend answered with a relatedList', async () => {
      http.delete.mockResolvedValue({
        status: 200,
        data: { relatedList: [{ relatedModule: 'finance' }, { relatedModule: 'finance' }], targetId: 'bp-1' },
      });
      const { deleteBillPayment } = await import('../bills');
      const { DeleteBlockedError } = await import('../deleteOutcome');

      const err = await deleteBillPayment('bp-1').catch((e) => e);

      expect(http.delete).toHaveBeenCalledWith('/billPayment/delete/bp-1.json');
      expect(err).toBeInstanceOf(DeleteBlockedError);
      expect(err.relatedModules).toEqual(['finance']);
    });

    it('rejects with DeletePendingApprovalError when a non-admin delete became a request', async () => {
      http.delete.mockResolvedValue({
        status: 200,
        data: { message: 'Deletion request sent to administrators', deleteRequestId: 'dr-9' },
      });
      const { deleteInvoicePayment } = await import('../invoices');
      const { DeletePendingApprovalError } = await import('../deleteOutcome');

      const err = await deleteInvoicePayment('ip-1').catch((e) => e);

      expect(err).toBeInstanceOf(DeletePendingApprovalError);
      expect(err.deleteRequestId).toBe('dr-9');
      expect(err.message).toBe('Deletion request sent to administrators');
    });

    it('propagates a 403 / network error unchanged', async () => {
      const failure = { response: { status: 403, data: { error: 'Finance module is not enabled for this tenant' } } };
      http.delete.mockRejectedValue(failure);
      const { deleteBillPayment } = await import('../bills');

      await expect(deleteBillPayment('bp-1')).rejects.toBe(failure);
    });
  });
});

describe('assertDeleteApplied', () => {
  it('accepts empty bodies and an empty relatedList', async () => {
    const { assertDeleteApplied } = await import('../deleteOutcome');
    for (const body of [undefined, null, '', {}, { relatedList: [] }]) {
      expect(() => assertDeleteApplied(body)).not.toThrow();
    }
  });

  it('drops blank module names from the blocked error', async () => {
    const { assertDeleteApplied, DeleteBlockedError } = await import('../deleteOutcome');
    let thrown: unknown;
    try {
      assertDeleteApplied({ relatedList: [{}, { relatedModule: '' }, { relatedModule: 'kyc' }] });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DeleteBlockedError);
    expect((thrown as InstanceType<typeof DeleteBlockedError>).relatedModules).toEqual(['kyc']);
  });
});
