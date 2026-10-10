/**
 * SOUPFIN-104: the core report pack's loaders.
 *
 * The HTTP client is mocked at its edge and answers with the shapes the Grails
 * backend sends (FK references as `{id, serialised}`, enums as objects, dates
 * as ISO timestamps), so each test covers request -> aggregation -> rows. Both
 * ends are covered: no data at all, and more data than one page or the row cap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../../api/client';
import { fetchAllPages, GENERAL_LEDGER_ACCOUNT_LIMIT } from '../../../api/endpoints/reportPack';
import * as load from '../reportPackLoaders';
import { REPORT_ROW_LIMIT } from '../reportTable';

type Handler = (url: string) => unknown;

/** Answer apiClient.get by URL; paged list endpoints read `offset` and `max`. */
function routeGet(routes: Array<[RegExp, Handler]>) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    for (const [pattern, handler] of routes) {
      if (pattern.test(url)) return { data: handler(url) };
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function page<T>(items: T[]): Handler {
  return (url) => {
    const params = new URLSearchParams(url.split('?')[1] ?? '');
    const offset = Number(params.get('offset') ?? 0);
    const max = Number(params.get('max') ?? 100);
    return items.slice(offset, offset + max);
  };
}

const ref = (id: string, serialised: string) => ({ id, serialised, class: 'x' });
const ctx = (from: string, to: string) => ({ range: { from, to }, filters: { from, to } });

// Raw invoices as /rest/invoice/index.json lists them: items are amounts the
// list transform can total; payments carry their amounts.
function invoice(id: string, customer: string, date: string, amount: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    number: Number(id.replace(/\D/g, '')) || 1,
    accountServices: ref(`as-${customer}`, customer),
    invoiceDate: `${date}T00:00:00Z`,
    paymentDate: `${date}T00:00:00Z`,
    currency: 'GHS',
    invoiceItemList: [{ id: `${id}-i1`, quantity: 1, unitPrice: amount }],
    invoicePaymentList: [],
    ...extra,
  };
}

function bill(id: string, vendor: string, date: string, total: number, tax = 0, extra: Record<string, unknown> = {}) {
  return {
    id,
    billNumber: `BILL-${id}`,
    vendor: ref(`v-${vendor}`, vendor),
    billDate: `${date}T00:00:00Z`,
    paymentDate: `${date}T00:00:00Z`,
    subTotal: total - tax,
    totalTaxAmount: tax,
    total,
    paidAmount: 0,
    amountDue: total,
    status: 'PENDING',
    ...extra,
  };
}

const incomeStatement = (rows: Array<[string, 'REVENUE' | 'EXPENSE', number]>) => ({
  ledgerAccountList: rows.map(([name, ledgerGroup, calculatedBalance]) => ({ id: name, name, currency: 'GHS', ledgerGroup, calculatedBalance })),
});

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Paging
// =============================================================================

describe('fetchAllPages', () => {
  it('returns nothing, untruncated, for an empty list', async () => {
    const fetchPage = vi.fn().mockResolvedValue([]);
    expect(await fetchAllPages(fetchPage, 5000)).toEqual({ items: [], truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('reads past the first page to the end of the list', async () => {
    const all = Array.from({ length: 250 }, (_, i) => i);
    const fetchPage = vi.fn(async ({ offset, max }) => all.slice(offset, offset + max));
    const result = await fetchAllPages(fetchPage, 5000);
    expect(result.items).toHaveLength(250);
    expect(result.truncated).toBe(false);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([
      { max: 100, offset: 0 },
      { max: 100, offset: 100 },
      { max: 100, offset: 200 },
    ]);
  });

  it('stops at the row cap and says the list was cut short', async () => {
    const fetchPage = vi.fn(async ({ max }) => Array.from({ length: max }, () => 'row'));
    const result = await fetchAllPages(fetchPage, REPORT_ROW_LIMIT);
    expect(result.items).toHaveLength(REPORT_ROW_LIMIT);
    expect(result.truncated).toBe(true);
    // 5000 rows at 100 a page: 50 requests, never a 51st.
    expect(fetchPage).toHaveBeenCalledTimes(REPORT_ROW_LIMIT / 100);
  });
});

// =============================================================================
// Business overview
// =============================================================================

describe('Profit & Loss by Month', () => {
  it('splits the range into calendar months, clipped to the range', () => {
    expect(load.monthsInRange({ from: '2026-01-15', to: '2026-03-10' })).toEqual([
      { from: '2026-01-15', to: '2026-01-31' },
      { from: '2026-02-01', to: '2026-02-28' },
      { from: '2026-03-01', to: '2026-03-10' },
    ]);
    expect(load.monthsInRange({ from: '2025-12-01', to: '2026-01-31' }).map((m) => m.from)).toEqual([
      '2025-12-01',
      '2026-01-01',
    ]);
  });

  it('asks the backend once per month and lays the months side by side with net income', async () => {
    routeGet([
      [
        /incomeStatement\.json\?.*from=2026-01-01/,
        () => incomeStatement([['Consulting', 'REVENUE', -10_000], ['Rent', 'EXPENSE', 3_000]]),
      ],
      [
        /incomeStatement\.json\?.*from=2026-02-01/,
        () => incomeStatement([['Consulting', 'REVENUE', -12_000], ['Training', 'REVENUE', -500], ['Rent', 'EXPENSE', 3_000]]),
      ],
    ]);
    const table = await load.loadProfitLossByMonth(ctx('2026-01-01', '2026-02-28'));

    expect(table.columns?.map((c) => c.header)).toEqual(['Account', 'Jan 2026', 'Feb 2026', 'Total']);
    expect(table.rows).toEqual([
      { account: 'Consulting', section: 'Income', m202601: 10_000, m202602: 12_000, total: 22_000 },
      { account: 'Training', section: 'Income', m202601: 0, m202602: 500, total: 500 },
      { account: 'Rent', section: 'Expenses', m202601: 3_000, m202602: 3_000, total: 6_000 },
    ]);
    expect(table.summaryRows).toEqual([
      { account: 'Net income', m202601: 7_000, m202602: 9_500, total: 16_500 },
    ]);
  });

  it('refuses more than 24 months rather than firing dozens of report queries', async () => {
    routeGet([[/incomeStatement/, () => incomeStatement([])]]);
    await expect(load.loadProfitLossByMonth(ctx('2024-01-01', '2026-01-31'))).rejects.toThrow(
      'P&L by Month shows at most 24 months'
    );
    expect(apiClient.get).not.toHaveBeenCalled();
    // Exactly 24 months is allowed.
    const table = await load.loadProfitLossByMonth(ctx('2024-01-01', '2025-12-31'));
    expect(table.columns).toHaveLength(26);
    expect(apiClient.get).toHaveBeenCalledTimes(24);
  });
});

describe('Profit & Loss Comparison', () => {
  it('compares with the same dates a year earlier and reports the change', async () => {
    routeGet([
      [/from=2026-07-01/, () => incomeStatement([['Sales', 'REVENUE', -15_000], ['Wages', 'EXPENSE', 5_000]])],
      [/from=2025-07-01/, () => incomeStatement([['Sales', 'REVENUE', -10_000], ['Wages', 'EXPENSE', 5_000]])],
    ]);
    const table = await load.loadProfitLossComparative(ctx('2026-07-01', '2026-07-31'));
    expect(table.rows[0]).toMatchObject({ account: 'Sales', current: 15_000, prior: 10_000, change: 5_000, changePercent: 50 });
    expect(table.summaryRows?.[0]).toMatchObject({ account: 'Net income', current: 10_000, prior: 5_000, change: 5_000, changePercent: 100 });
  });

  it('reads 0% change, not NaN, for an account with nothing last year', async () => {
    routeGet([
      [/from=2026-07-01/, () => incomeStatement([['New line', 'REVENUE', -100]])],
      [/from=2025-07-01/, () => incomeStatement([])],
    ]);
    const table = await load.loadProfitLossComparative(ctx('2026-07-01', '2026-07-31'));
    expect(table.rows[0]).toMatchObject({ current: 100, prior: 0, change: 100, changePercent: 0 });
  });
});

describe('Profit & Loss as % of Income', () => {
  it('expresses each line as a share of total income', async () => {
    routeGet([[/incomeStatement/, () => incomeStatement([['Sales', 'REVENUE', -8_000], ['Rent', 'EXPENSE', 2_000]])]]);
    const table = await load.loadProfitLossPercentOfIncome(ctx('2026-07-01', '2026-07-31'));
    expect(table.rows).toEqual([
      { account: 'Sales', section: 'Income', amount: 8_000, percent: 100 },
      { account: 'Rent', section: 'Expenses', amount: 2_000, percent: 25 },
    ]);
    expect(table.summaryRows).toEqual([{ account: 'Net income', amount: 6_000, percent: 75 }]);
  });

  it('reads 0% everywhere for a period with no income', async () => {
    routeGet([[/incomeStatement/, () => incomeStatement([['Rent', 'EXPENSE', 2_000]])]]);
    const table = await load.loadProfitLossPercentOfIncome(ctx('2026-07-01', '2026-07-31'));
    expect(table.rows[0].percent).toBe(0);
    expect(table.summaryRows?.[0]).toEqual({ account: 'Net income', amount: -2_000, percent: 0 });
  });
});

describe('Balance Sheet Summary and Comparison', () => {
  const sheet = (cash: number, loan: number, capital: number) => ({
    ledgerAccountList: [
      { id: 'c', name: 'Cash', ledgerGroup: 'ASSET', calculatedBalance: cash },
      { id: 'l', name: 'Loan', ledgerGroup: 'LIABILITY', calculatedBalance: -loan },
      { id: 'e', name: 'Capital', ledgerGroup: 'EQUITY', calculatedBalance: capital },
    ],
  });

  it('summarises the three sections and shows whether they balance', async () => {
    routeGet([[/balanceSheet\.json\?to=2026-08-31/, () => sheet(1_000, 400, 600)]]);
    const table = await load.loadBalanceSheetSummary(ctx('2026-08-31', '2026-08-31'));
    expect(table.rows).toEqual([
      { section: 'Assets', accounts: 1, balance: 1_000 },
      { section: 'Liabilities', accounts: 1, balance: 400 },
      { section: 'Equity', accounts: 1, balance: 600 },
    ]);
    expect(table.summaryRows?.map((r) => r.balance)).toEqual([1_000, 0]);
  });

  it('compares with the same date a year earlier', async () => {
    routeGet([
      [/to=2026-08-31/, () => sheet(1_000, 400, 600)],
      [/to=2025-08-31/, () => sheet(700, 200, 500)],
    ]);
    const table = await load.loadBalanceSheetComparative(ctx('2026-08-31', '2026-08-31'));
    expect(table.rows.find((r) => r.account === 'Cash')).toMatchObject({ section: 'Assets', current: 1_000, prior: 700, change: 300 });
    expect(table.summaryRows?.[0]).toMatchObject({ current: 1_000, prior: 700, change: 300 });
  });
});

describe('Statement of Changes in Equity', () => {
  it('lists equity accounts only and adds the period profit', async () => {
    routeGet([
      [
        /accountBalances/,
        () => ({
          resultList: {
            ASSET: { accountList: [{ name: 'Cash', endingBalance: 9 }] },
            EQUITY: { accountList: [{ name: 'Share capital', startingBalance: 1_000, calculatedCreditBalance: 500, calculatedDebitBalance: 0, endingBalance: 1_500 }] },
          },
        }),
      ],
      [/incomeStatement/, () => incomeStatement([['Sales', 'REVENUE', -800], ['Rent', 'EXPENSE', 300]])],
    ]);
    const table = await load.loadChangesInEquity(ctx('2026-08-01', '2026-08-31'));
    expect(table.rows.map((r) => r.name)).toEqual(['Share capital', 'Profit for the period (not yet closed to equity)']);
    expect(table.rows[1]).toMatchObject({ calculatedCreditBalance: 500, calculatedDebitBalance: 0, endingBalance: 500 });
  });
});

// =============================================================================
// Sales and customers
// =============================================================================

describe('Sales by Customer', () => {
  const invoices = [
    invoice('inv-1', 'Acme Ltd', '2026-08-03', 1_000),
    invoice('inv-2', 'Acme Ltd', '2026-08-20', 500),
    invoice('inv-3', 'Beta Co', '2026-08-10', 2_000),
    invoice('inv-4', 'Beta Co', '2026-07-31', 9_999), // before the range
    invoice('inv-5', 'Beta Co', '2026-08-11', 7_777, { status: 'CANCELLED' }),
  ];

  it('totals invoices per customer, leaving out other dates and cancelled invoices', async () => {
    routeGet([[/\/invoice\/index\.json/, page(invoices)]]);
    const table = await load.loadSalesByCustomerSummary(ctx('2026-08-01', '2026-08-31'));
    expect(table.rows).toEqual([
      { customer: 'Acme Ltd', invoices: 2, subtotal: 1_500, tax: 0, total: 1_500 },
      { customer: 'Beta Co', invoices: 1, subtotal: 2_000, tax: 0, total: 2_000 },
    ]);
    expect(table.truncated).toBe(false);
  });

  it('returns no rows when there are no invoices', async () => {
    routeGet([[/\/invoice\/index\.json/, page([])]]);
    expect((await load.loadSalesByCustomerSummary(ctx('2026-08-01', '2026-08-31'))).rows).toEqual([]);
  });

  it('reads every page of invoices and flags the report when it hits the row cap', async () => {
    const many = Array.from({ length: REPORT_ROW_LIMIT + 50 }, (_, i) => invoice(`inv-${i + 1}`, `C${i % 7}`, '2026-08-05', 10));
    routeGet([[/\/invoice\/index\.json/, page(many)]]);
    const table = await load.loadSalesByCustomerSummary(ctx('2026-08-01', '2026-08-31'));
    expect(table.truncated).toBe(true);
    expect(table.rows.reduce((t, r) => t + Number(r.invoices), 0)).toBe(REPORT_ROW_LIMIT);
    expect(table.rows.reduce((t, r) => t + Number(r.total), 0)).toBe(REPORT_ROW_LIMIT * 10);
  });
});

describe('Sales by Product/Service', () => {
  it('joins invoice lines to invoices in the range and groups by service', async () => {
    routeGet([
      [/\/invoice\/index\.json/, page([invoice('inv-1', 'Acme', '2026-08-03', 0), invoice('inv-2', 'Beta', '2026-06-01', 0)])],
      [
        /\/invoiceItem\/index\.json/,
        page([
          { id: 'i1', invoice: ref('inv-1', '#1'), serviceDescription: ref('s1', 'Audit'), description: 'Q3 audit', quantity: 2, unitPrice: 300 },
          { id: 'i2', invoice: ref('inv-1', '#1'), serviceDescription: null, description: 'Travel', quantity: 1, unitPrice: 50 },
          { id: 'i3', invoice: ref('inv-2', '#2'), serviceDescription: ref('s1', 'Audit'), description: 'Old', quantity: 9, unitPrice: 9 },
        ]),
      ],
    ]);
    const table = await load.loadSalesByProductSummary(ctx('2026-08-01', '2026-08-31'));
    expect(table.rows).toEqual([
      { product: 'Audit', quantity: 2, amount: 600, averagePrice: 300 },
      { product: 'Travel', quantity: 1, amount: 50, averagePrice: 50 },
    ]);
  });
});

describe('Customer Balance', () => {
  it('counts only payments made on or before the as-of date', async () => {
    routeGet([
      [/\/invoice\/index\.json/, page([invoice('inv-1', 'Acme', '2026-08-01', 1_000), invoice('inv-2', 'Acme', '2026-09-05', 400)])],
      [
        /\/invoicePayment\/index\.json/,
        page([
          { id: 'p1', invoice: { id: 'inv-1' }, amount: 300, paymentDate: '2026-08-10T00:00:00Z' },
          { id: 'p2', invoice: { id: 'inv-1' }, amount: 700, paymentDate: '2026-09-01T00:00:00Z' },
        ]),
      ],
    ]);
    // On 31 August only the first payment had arrived; the September invoice did not exist.
    const august = await load.loadCustomerBalanceSummary(ctx('2026-08-31', '2026-08-31'));
    expect(august.rows).toEqual([{ customer: 'Acme', invoices: 1, balance: 700 }]);
    // By 30 September inv-1 is fully paid and inv-2 is open.
    const detail = await load.loadCustomerBalanceDetail(ctx('2026-09-30', '2026-09-30'));
    expect(detail.rows).toEqual([
      { customer: 'Acme', date: '2026-09-05', dueDate: '2026-09-05', number: '2', total: 400, paid: 0, balance: 400 },
    ]);
  });
});

describe('Income by Customer', () => {
  it('reads the backend clientIncome report and works out what is unpaid', async () => {
    routeGet([[/clientIncome\.json\?.*from=2026-08-01/, () => ({ clientList: [{ name: 'Zed', income: 900, paidIncome: 400 }, { name: 'Ama', income: 100, paidIncome: 100 }] })]]);
    const table = await load.loadIncomeByCustomer(ctx('2026-08-01', '2026-08-31'));
    expect(table.rows).toEqual([
      { customer: 'Ama', income: 100, paid: 100, unpaid: 0 },
      { customer: 'Zed', income: 900, paid: 400, unpaid: 500 },
    ]);
  });

  it('copes with a response that has no clientList', async () => {
    routeGet([[/clientIncome/, () => ({})]]);
    expect((await load.loadIncomeByCustomer(ctx('2026-08-01', '2026-08-31'))).rows).toEqual([]);
  });
});

// =============================================================================
// Expenses and vendors
// =============================================================================

describe('Transaction List by Vendor', () => {
  it('lists bills and their payments in the range under each vendor', async () => {
    routeGet([
      [/\/bill\/index\.json/, page([bill('b1', 'Ecg', '2026-08-02', 500), bill('b2', 'Ecg', '2026-05-02', 80)])],
      [
        /\/billPayment\/index\.json/,
        page([
          { id: 'bp1', bill: { id: 'b2' }, amount: 80, paymentDate: '2026-08-04T00:00:00Z', reference: 'CHQ 0042' },
          { id: 'bp2', bill: { id: 'b1' }, amount: 100, paymentDate: '2026-09-04T00:00:00Z' },
        ]),
      ],
    ]);
    const table = await load.loadTransactionListByVendor(ctx('2026-08-01', '2026-08-31'));
    expect(table.rows).toEqual([
      { vendor: 'Ecg', date: '2026-08-02', type: 'Bill', number: 'BILL-b1', reference: '', billed: 500, paid: null },
      { vendor: 'Ecg', date: '2026-08-04', type: 'Bill payment', number: 'BILL-b2', reference: 'CHQ 0042', billed: null, paid: 80 },
    ]);
  });
});

describe('Vendor Balance', () => {
  it('drops bills paid in full by the as-of date', async () => {
    routeGet([
      [/\/bill\/index\.json/, page([bill('b1', 'Ecg', '2026-08-02', 500), bill('b2', 'Water', '2026-08-03', 60)])],
      [/\/billPayment\/index\.json/, page([{ id: 'bp', bill: { id: 'b2' }, amount: 60, paymentDate: '2026-08-03' }])],
    ]);
    const table = await load.loadVendorBalanceSummary(ctx('2026-08-31', '2026-08-31'));
    expect(table.rows).toEqual([{ vendor: 'Ecg', bills: 1, balance: 500 }]);
  });
});

// =============================================================================
// Taxes
// =============================================================================

describe('Tax reports', () => {
  const salesTax = {
    salesTaxList: [
      { invoiceDate: '2026-08-09T00:00:00Z', clientName: 'Acme', invoiceNumber: 12, salesAmount: 1_000, taxAmount: 219, totalAmount: 1_219, taxBreakdown: [{ taxName: 'VAT', taxRate: 15, taxAmount: 150 }, { taxName: 'NHIL', taxRate: 2.5, taxAmount: 25 }, { taxName: 'GETFund', taxRate: 2.5, taxAmount: 25 }, { taxName: 'COVID', taxRate: 1.9, taxAmount: 19 }] },
      { invoiceDate: '2026-08-02T00:00:00Z', clientName: 'Beta', invoiceNumber: 11, salesAmount: 200, taxAmount: 30, totalAmount: 230, taxBreakdown: [{ taxName: 'VAT', taxRate: 15, taxAmount: 30 }] },
    ],
    totalSalesAmount: 1_200,
    totalTaxAmount: 249,
  };

  it('nets tax collected on sales against tax paid on bills', async () => {
    routeGet([
      [/salesTax\.json/, () => salesTax],
      [/\/bill\/index\.json/, page([bill('b1', 'Ecg', '2026-08-02', 115, 15), bill('b2', 'Rent', '2026-08-03', 900, 0)])],
    ]);
    const table = await load.loadTaxLiability(ctx('2026-08-01', '2026-08-31'));
    expect(table.rows).toEqual([
      { item: 'Tax collected on sales', taxable: 1_200, tax: 249 },
      { item: 'Tax paid on purchases (reclaimable)', taxable: 100, tax: 15 },
    ]);
    expect(table.summaryRows).toEqual([{ item: 'Net tax payable', tax: 234 }]);
  });

  it('lists invoice tax in date order and groups the breakdown by tax and rate', async () => {
    routeGet([[/salesTax\.json/, () => salesTax]]);
    const detail = await load.loadTaxDetail(ctx('2026-08-01', '2026-08-31'));
    expect(detail.rows.map((r) => r.number)).toEqual(['11', '12']);
    const byRate = await load.loadTaxSummaryByRate(ctx('2026-08-01', '2026-08-31'));
    expect(byRate.rows.find((r) => r.tax === 'VAT')).toEqual({ tax: 'VAT', rate: 15, invoices: 2, collected: 180 });
    expect(byRate.rows).toHaveLength(4);
  });
});

// =============================================================================
// Banking
// =============================================================================

describe('Banking reports', () => {
  it('Deposit Detail names the customer, invoice, method and account of each payment received', async () => {
    routeGet([
      [/\/invoice\/index\.json/, page([invoice('inv-7', 'Acme', '2026-08-01', 100)])],
      [
        /\/invoicePayment\/index\.json/,
        page([
          { id: 'p', invoice: { id: 'inv-7' }, amount: 100, paymentDate: '2026-08-05T00:00:00Z', paymentMethod: { id: 'm', name: 'Mobile Money' }, payInAccount: ref('acc', 'MTN MoMo wallet'), reference: 'TX99' },
        ]),
      ],
    ]);
    const table = await load.loadDepositDetail(ctx('2026-08-01', '2026-08-31'));
    expect(table.rows).toEqual([
      { date: '2026-08-05', customer: 'Acme', number: '7', method: 'Mobile Money', account: 'MTN MoMo wallet', reference: 'TX99', amount: 100 },
    ]);
  });

  it('Cheque Detail keeps cheque payments only, in either spelling', async () => {
    routeGet([
      [/\/bill\/index\.json/, page([bill('b1', 'Ecg', '2026-08-02', 500)])],
      [
        /\/billPayment\/index\.json/,
        page([
          { id: '1', bill: { id: 'b1' }, amount: 10, paymentDate: '2026-08-03', paymentMethod: { id: 'a', name: 'Cheque' } },
          { id: '2', bill: { id: 'b1' }, amount: 20, paymentDate: '2026-08-04', paymentMethod: { id: 'b', serialised: 'Check' } },
          { id: '3', bill: { id: 'b1' }, amount: 30, paymentDate: '2026-08-05', paymentMethod: { id: 'c', name: 'Bank Transfer' } },
          { id: '4', bill: { id: 'b1' }, amount: 40, paymentDate: '2026-08-06' },
        ]),
      ],
    ]);
    expect((await load.loadChequeDetail(ctx('2026-08-01', '2026-08-31'))).rows.map((r) => r.amount)).toEqual([10, 20]);
    expect((await load.loadPaymentsMade(ctx('2026-08-01', '2026-08-31'))).rows.map((r) => r.method)).toEqual([
      'Cheque',
      'Check',
      'Bank Transfer',
      'Not recorded',
    ]);
  });
});

// =============================================================================
// For my accountant
// =============================================================================

describe('General Ledger', () => {
  it('opens each account with its balance and splits transactions into debit and credit', async () => {
    routeGet([
      [
        /accountTransactions\.json\?.*max=1000/,
        () => ({
          resultList: [
            {
              account: { id: 'a1', name: 'Cash at bank' },
              startingBalance: 1_000,
              transactionList: [
                { transactionDate: '2026-08-09T00:00:00Z', notes: 'Fees received', amount: 250, transactionState: { name: 'DEBIT' }, balance: 1_250 },
                { transactionDate: '2026-08-02T00:00:00Z', notes: 'Rent', debit: 0, credit: 100, balance: 900 },
              ],
            },
          ],
        }),
      ],
    ]);
    const table = await load.loadGeneralLedger(ctx('2026-08-01', '2026-08-31'));
    expect(table.rows).toEqual([
      { account: 'Cash at bank', date: '2026-08-01', description: 'Opening balance', debit: null, credit: null, balance: 1_000 },
      { account: 'Cash at bank', date: '2026-08-02', description: 'Rent', debit: 0, credit: 100, balance: 900 },
      { account: 'Cash at bank', date: '2026-08-09', description: 'Fees received', debit: 250, credit: 0, balance: 1_250 },
    ]);
    expect(table.truncated).toBe(false);
  });

  it('flags the ledger when the backend returns as many accounts as it asked for', async () => {
    const accounts = Array.from({ length: GENERAL_LEDGER_ACCOUNT_LIMIT }, (_, i) => ({ account: { name: `A${i}` }, startingBalance: 0, transactionList: [] }));
    routeGet([[/accountTransactions/, () => ({ resultList: accounts })]]);
    const table = await load.loadGeneralLedger(ctx('2026-08-01', '2026-08-31'));
    expect(table.truncated).toBe(true);
    expect(table.rows).toHaveLength(GENERAL_LEDGER_ACCOUNT_LIMIT);
  });
});

describe('Journal and Transaction List by Date', () => {
  it('turns a double-entry transaction into two lines and a single-entry one into one', () => {
    expect(
      load.journalLines({
        transactionDate: '2026-08-03T00:00:00Z',
        notes: 'Office chairs',
        amount: 900,
        debitLedgerAccount: ref('d', 'Furniture'),
        creditLedgerAccount: ref('c', 'Cash at bank'),
        ledgerTransactionGroup: ref('g', 'JE-14'),
      })
    ).toEqual([
      { entry: '2026-08-03 JE-14', date: '2026-08-03', description: 'Office chairs', account: 'Furniture', debit: 900, credit: 0 },
      { entry: '2026-08-03 JE-14', date: '2026-08-03', description: 'Office chairs', account: 'Cash at bank', debit: 0, credit: 900 },
    ]);
    expect(
      load.journalLines({ transactionDate: '2026-08-04', amount: 50, ledgerAccount: ref('x', 'Bank charges'), transactionState: 'CREDIT' })
    ).toMatchObject([{ account: 'Bank charges', debit: 0, credit: 50 }]);
  });

  it('keeps only transactions dated in the range, in date order', async () => {
    routeGet([
      [
        /\/ledgerTransaction\/index\.json/,
        page([
          { id: 't1', transactionDate: '2026-08-20', amount: 5, ledgerAccount: ref('a', 'B'), transactionState: 'DEBIT' },
          { id: 't2', transactionDate: '2026-07-20', amount: 5, ledgerAccount: ref('a', 'B'), transactionState: 'DEBIT' },
          { id: 't3', transactionDate: '2026-08-02', amount: 7, ledgerAccount: ref('a', 'A'), transactionState: 'CREDIT' },
        ]),
      ],
    ]);
    const table = await load.loadTransactionListByDate(ctx('2026-08-01', '2026-08-31'));
    expect(table.rows.map((r) => [r.date, r.account, r.debit, r.credit])).toEqual([
      ['2026-08-02', 'A', 0, 7],
      ['2026-08-20', 'B', 5, 0],
    ]);
  });
});

describe('Account List', () => {
  it('lists active accounts by type and code with the balance on the date, matched by name when ids are missing', async () => {
    routeGet([
      [
        /\/ledgerAccount\/index\.json/,
        page([
          { id: 'x2', name: 'Sales', number: '4000', ledgerAccountCategory: { id: 'k', serialised: 'Income < REVENUE' } },
          { id: 'x1', name: 'Cash', number: '1000', ledgerAccountCategory: { id: 'k', serialised: 'Current Assets < ASSET' } },
          { id: 'x3', name: 'Old', number: '1100', archived: true, ledgerAccountCategory: { id: 'k', serialised: 'Current Assets < ASSET' } },
        ]),
      ],
      [/accountBalances\.json\?.*from=1900-01-01.*to=2026-08-31/, () => ({ resultList: { ASSET: { accountList: [{ name: 'Cash', endingBalance: 4_200 }] } } })],
    ]);
    const table = await load.loadAccountList(ctx('2026-08-31', '2026-08-31'));
    expect(table.rows).toEqual([
      { code: '1000', account: 'Cash', type: 'Assets', category: 'Current Assets', balance: 4_200 },
      { code: '4000', account: 'Sales', type: 'Revenue', category: 'Income', balance: 0 },
    ]);
  });
});

// =============================================================================
// Errors
// =============================================================================

describe('errors', () => {
  it('propagate, so a 403 is never drawn as an empty report (SOUPFIN-30)', async () => {
    const forbidden = Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } });
    vi.mocked(apiClient.get).mockRejectedValue(forbidden);
    await expect(load.loadJournal(ctx('2026-08-01', '2026-08-31'))).rejects.toBe(forbidden);
    await expect(load.loadIncomeByCustomer(ctx('2026-08-01', '2026-08-31'))).rejects.toBe(forbidden);
  });
});
