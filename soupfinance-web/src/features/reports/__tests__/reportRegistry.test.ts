/**
 * SOUPFIN-103: the report catalogue.
 *
 * Pins the registry's integrity (unique ids, real routes, export types the
 * backend accepts), the hub's search and grouping, and the row extraction a
 * registry-only report depends on, at both ends: no rows and very many rows.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractReportRows } from '../../../api/endpoints/reports';
import {
  REPORTS,
  REPORT_CATEGORIES,
  findReportDefinition,
  getReportDefinition,
  groupReportsByCategory,
  isRegistryOnlyReport,
  searchReports,
  totalReportColumns,
  type ReportColumn,
} from '../reportRegistry';

const APP_SOURCE = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');
const FINANCE_REPORT_TYPES = [
  'trialBalance',
  'balanceSheet',
  'incomeStatement',
  'agedReceivables',
  'agedPayables',
  'accountBalances',
  'accountTransactions',
];

describe('registry integrity', () => {
  it('lists the six migrated reports and Account Balances first', () => {
    expect(REPORTS.slice(0, 7).map((r) => r.id)).toEqual([
      'profit-loss',
      'balance-sheet',
      'cash-flow',
      'ar-aging',
      'ap-aging',
      'trial-balance',
      'account-balances',
    ]);
  });

  it('has unique ids and a known category for every report', () => {
    const ids = REPORTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = REPORT_CATEGORIES.map((c) => c.id);
    for (const report of REPORTS) {
      expect(categories).toContain(report.category);
    }
  });

  it('links every report to a route the app actually declares', () => {
    for (const report of REPORTS) {
      const route = report.path.startsWith('/reports/view/') ? '/reports/view/:reportId' : report.path;
      expect(APP_SOURCE, `${report.id} -> ${route}`).toContain(`path="${route}"`);
    }
  });

  it('only exports through report types the backend controller has', () => {
    for (const report of REPORTS) {
      if (report.export.backendType) {
        expect(FINANCE_REPORT_TYPES).toContain(report.export.backendType);
      }
    }
  });

  it('holds no hardcoded currency anywhere in a report definition', () => {
    expect(JSON.stringify(REPORTS)).not.toMatch(/USD|\$/);
  });

  it('marks only entries with a source or loader, and columns, as registry-only', () => {
    // Changed (SOUPFIN-104): every pack report is registry-only; the six
    // migrated reports keep their own pages.
    const ownPages = ['profit-loss', 'balance-sheet', 'cash-flow', 'ar-aging', 'ap-aging', 'trial-balance'];
    expect(REPORTS.filter((r) => !isRegistryOnlyReport(r)).map((r) => r.id)).toEqual(ownPages);
  });

  it('finds definitions by id, and refuses unknown ids', () => {
    expect(getReportDefinition('trial-balance').title).toBe('Trial Balance');
    expect(() => getReportDefinition('nope')).toThrow('Unknown report: nope');
    expect(findReportDefinition('nope')).toBeUndefined();
    expect(findReportDefinition(undefined)).toBeUndefined();
  });

  it('shares one page config between A/R and A/P aging', () => {
    expect(getReportDefinition('ar-aging').page).toBe(getReportDefinition('ap-aging').page);
  });
});

describe('searchReports', () => {
  it('returns everything for an empty or blank query', () => {
    expect(searchReports('')).toEqual(REPORTS);
    expect(searchReports('   ')).toEqual(REPORTS);
  });

  it('matches title, keywords and category, ignoring case', () => {
    // Changed (SOUPFIN-104): the pack adds P&L variants and renames two categories.
    expect(searchReports('PROFIT').map((r) => r.id)).toEqual([
      'profit-loss',
      'profit-loss-by-month',
      'profit-loss-comparative',
      'profit-loss-percent-of-income',
    ]);
    expect(searchReports('income statement').map((r) => r.id)).toEqual(['profit-loss', 'profit-loss-by-month']);
    expect(searchReports('receivable').map((r) => r.id)).toEqual([
      'ar-aging',
      'customer-balance-summary',
      'customer-balance-detail',
    ]);
    expect(searchReports('expenses and vendors aging').map((r) => r.id)).toEqual(['ap-aging']);
  });

  it('requires every word to match', () => {
    expect(searchReports('aging vendors').map((r) => r.id)).toEqual(['ap-aging']);
    expect(searchReports('aging').map((r) => r.id)).toEqual(['ar-aging', 'ap-aging']);
  });

  it('returns nothing for a query nothing matches', () => {
    expect(searchReports('payroll')).toEqual([]);
  });
});

describe('groupReportsByCategory', () => {
  it('keeps category order and drops empty categories', () => {
    const grouped = groupReportsByCategory(searchReports('aging'));
    expect(grouped.map((g) => g.category.id)).toEqual(['who-owes-you', 'what-you-owe']);
    expect(groupReportsByCategory([])).toEqual([]);
  });

  it('places every report in exactly one category', () => {
    const grouped = groupReportsByCategory(REPORTS);
    expect(grouped.flatMap((g) => g.reports)).toHaveLength(REPORTS.length);
  });
});

describe('extractReportRows', () => {
  const grouped = {
    resultList: {
      ASSET: { accountList: [{ id: 'a1', name: 'Cash', endingBalance: 100 }], balance: 100 },
      LIABILITY: { accountList: [{ id: 'l1', name: 'Loan', endingBalance: -40 }] },
      EQUITY: { balance: 0 },
      CUSTOM: { accountList: [{ id: 'c1', name: 'Odd' }] },
    },
    totalDebit: 100,
  };

  it('flattens the grouped account shape and labels each row with its group', () => {
    const rows = extractReportRows(grouped, 'groupedAccountList');
    expect(rows).toEqual([
      { id: 'a1', name: 'Cash', endingBalance: 100, ledgerGroup: 'Assets' },
      { id: 'l1', name: 'Loan', endingBalance: -40, ledgerGroup: 'Liabilities' },
      { id: 'c1', name: 'Odd', ledgerGroup: 'CUSTOM' },
    ]);
  });

  it('returns no rows for empty and malformed responses', () => {
    expect(extractReportRows(null, 'groupedAccountList')).toEqual([]);
    expect(extractReportRows({}, 'groupedAccountList')).toEqual([]);
    expect(extractReportRows({ resultList: [] }, 'groupedAccountList')).toEqual([]);
    expect(extractReportRows({ resultList: { ASSET: { accountList: [null, 3] } } }, 'groupedAccountList')).toEqual([]);
    expect(extractReportRows('oops', 'array')).toEqual([]);
  });

  it('reads plain and wrapped arrays', () => {
    expect(extractReportRows([{ a: 1 }], 'array')).toEqual([{ a: 1 }]);
    expect(extractReportRows({ resultList: [{ a: 2 }] }, 'array')).toEqual([{ a: 2 }]);
  });

  it('keeps every row of a very large response', () => {
    const accountList = Array.from({ length: 5000 }, (_, i) => ({ id: `a${i}`, endingBalance: i }));
    const rows = extractReportRows({ resultList: { ASSET: { accountList } } }, 'groupedAccountList');
    expect(rows).toHaveLength(5000);
    expect(rows[4999]).toMatchObject({ id: 'a4999', ledgerGroup: 'Assets' });
  });
});

describe('totalReportColumns', () => {
  const columns: ReportColumn[] = [
    { key: 'name', header: 'Account', type: 'text' },
    { key: 'amount', header: 'Amount', type: 'currency' },
    { key: 'count', header: 'Count', type: 'number' },
  ];

  it('totals to zero for no rows, and skips text columns', () => {
    expect(totalReportColumns([], columns)).toEqual({ amount: 0, count: 0 });
  });

  it('counts blanks and non-numbers as zero, and reads numeric strings', () => {
    const rows = [{ amount: '12.5', count: null }, { amount: 'n/a', count: 2 }, { amount: undefined }];
    expect(totalReportColumns(rows, columns)).toEqual({ amount: 12.5, count: 2 });
  });

  it('totals ten thousand seven-figure rows exactly', () => {
    const rows = Array.from({ length: 10_000 }, () => ({ amount: 1_250_000, count: 1 }));
    expect(totalReportColumns(rows, columns)).toEqual({ amount: 12_500_000_000, count: 10_000 });
  });
});
