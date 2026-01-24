/**
 * Unit tests for reports API module
 * Tests account balances, transactions, exports, and report builders
 *
 * Note: axios is mocked globally in test/setup.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../client';
import {
  getAccountBalances,
  getAccountTransactions,
  exportReport,
  buildBalanceSheet,
  buildProfitLoss,
  type AccountBalanceEntry,
  type ReportFilters,
} from '../reports';

// Mock the apiClient module
vi.mock('../../client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
  toQueryString: vi.fn((params: Record<string, unknown>) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    return searchParams.toString();
  }),
}));

describe('Reports API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('getAccountBalances', () => {
    it('fetches account balances with date range filters', async () => {
      // Arrange
      const filters: ReportFilters = {
        from: '2026-01-01',
        to: '2026-12-31',
      };

      const mockBalances: AccountBalanceEntry[] = [
        {
          id: 'acc-1',
          name: 'Cash on Hand',
          number: '1010',
          ledgerGroup: 'ASSET',
          ledgerSubGroup: 'CURRENT_ASSET',
          balance: 50000,
          debitTotal: 75000,
          creditTotal: 25000,
        },
        {
          id: 'acc-2',
          name: 'Accounts Payable',
          number: '2010',
          ledgerGroup: 'LIABILITY',
          ledgerSubGroup: 'CURRENT_LIABILITY',
          balance: -15000,
          debitTotal: 5000,
          creditTotal: 20000,
        },
      ];

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockBalances,
      });

      // Act
      const result = await getAccountBalances(filters);

      // Assert
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/financeReports/accountBalances.json?')
      );

      // Verify query string contains filters
      const callUrl = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('from=2026-01-01');
      expect(callUrl).toContain('to=2026-12-31');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Cash on Hand');
      expect(result[1].ledgerGroup).toBe('LIABILITY');
    });

    it('includes optional ledgerAccount filter', async () => {
      // Arrange
      const filters: ReportFilters = {
        from: '2026-01-01',
        to: '2026-06-30',
        ledgerAccount: 'acc-123',
        isParentChecked: true,
      };

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      // Act
      await getAccountBalances(filters);

      // Assert
      const callUrl = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('ledgerAccount=acc-123');
      expect(callUrl).toContain('isParentChecked=true');
    });

    it('handles API errors', async () => {
      // Arrange
      const filters: ReportFilters = { from: '2026-01-01', to: '2026-12-31' };
      const mockError = {
        response: { status: 500, data: { message: 'Internal Server Error' } },
      };
      (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

      // Act & Assert
      await expect(getAccountBalances(filters)).rejects.toEqual(mockError);
    });
  });

  describe('getAccountTransactions', () => {
    it('fetches account transactions with date range filters', async () => {
      // Arrange
      const filters: ReportFilters = {
        from: '2026-01-01',
        to: '2026-01-31',
      };

      const mockTransactions = [
        {
          id: 'txn-1',
          transactionDate: '2026-01-15',
          description: 'Office Supplies Purchase',
          debitAmount: 500,
          creditAmount: 0,
          balance: 500,
          ledgerAccountId: 'acc-expense',
          ledgerAccountName: 'Office Supplies',
          reference: 'INV-001',
        },
        {
          id: 'txn-2',
          transactionDate: '2026-01-20',
          description: 'Client Payment Received',
          debitAmount: 0,
          creditAmount: 2500,
          balance: 2500,
          ledgerAccountId: 'acc-income',
          ledgerAccountName: 'Sales Revenue',
          reference: 'REC-002',
        },
      ];

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockTransactions,
      });

      // Act
      const result = await getAccountTransactions(filters);

      // Assert
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/financeReports/accountTransactions.json?')
      );

      expect(result).toHaveLength(2);
      expect(result[0].description).toBe('Office Supplies Purchase');
      expect(result[1].creditAmount).toBe(2500);
    });

    it('filters by specific ledger account', async () => {
      // Arrange
      const filters: ReportFilters = {
        from: '2026-01-01',
        to: '2026-12-31',
        ledgerAccount: 'acc-revenue-001',
      };

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      // Act
      await getAccountTransactions(filters);

      // Assert
      const callUrl = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('ledgerAccount=acc-revenue-001');
    });
  });

  describe('exportReport', () => {
    it('exports account balances to PDF', async () => {
      // Arrange
      const filters: ReportFilters = { from: '2026-01-01', to: '2026-12-31' };
      const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockBlob,
      });

      // Act
      const result = await exportReport('accountBalances', filters, 'pdf');

      // Assert
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/financeReports/accountBalances.json?'),
        { responseType: 'blob' }
      );

      const callUrl = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('f=pdf');

      expect(result).toBeInstanceOf(Blob);
    });

    it('exports account transactions to Excel', async () => {
      // Arrange
      const filters: ReportFilters = { from: '2026-01-01', to: '2026-06-30' };
      const mockBlob = new Blob(['Excel content'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockBlob,
      });

      // Act
      const result = await exportReport('accountTransactions', filters, 'xlsx');

      // Assert
      const callUrl = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('f=xlsx');
      expect(callUrl).toContain('accountTransactions');

      expect(result).toBeInstanceOf(Blob);
    });

    it('exports to CSV format', async () => {
      // Arrange
      const filters: ReportFilters = { from: '2026-01-01', to: '2026-12-31' };
      const mockBlob = new Blob(['CSV content'], { type: 'text/csv' });

      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockBlob,
      });

      // Act
      await exportReport('accountBalances', filters, 'csv');

      // Assert
      const callUrl = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('f=csv');
    });

    it('handles export errors', async () => {
      // Arrange
      const filters: ReportFilters = { from: '2026-01-01', to: '2026-12-31' };
      const mockError = {
        response: { status: 503, data: { message: 'Export service unavailable' } },
      };
      (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

      // Act & Assert
      await expect(exportReport('accountBalances', filters, 'pdf')).rejects.toEqual(mockError);
    });
  });

  describe('buildBalanceSheet', () => {
    it('builds Balance Sheet from account balance entries', () => {
      // Arrange
      const entries: AccountBalanceEntry[] = [
        // Assets
        {
          id: '1',
          name: 'Cash',
          ledgerGroup: 'ASSET',
          balance: 50000,
          debitTotal: 50000,
          creditTotal: 0,
        },
        {
          id: '2',
          name: 'Accounts Receivable',
          ledgerGroup: 'ASSET',
          balance: 25000,
          debitTotal: 25000,
          creditTotal: 0,
        },
        // Liabilities
        {
          id: '3',
          name: 'Accounts Payable',
          ledgerGroup: 'LIABILITY',
          balance: 15000,
          debitTotal: 0,
          creditTotal: 15000,
        },
        // Equity
        {
          id: '4',
          name: 'Retained Earnings',
          ledgerGroup: 'EQUITY',
          balance: 60000,
          debitTotal: 0,
          creditTotal: 60000,
        },
      ];

      const asOf = '2026-12-31';

      // Act
      const result = buildBalanceSheet(entries, asOf);

      // Assert
      expect(result.asOf).toBe('2026-12-31');

      // Assets
      expect(result.assets).toHaveLength(2);
      expect(result.assets[0].account).toBe('Cash');
      expect(result.assets[0].balance).toBe(50000);
      expect(result.totalAssets).toBe(75000); // 50000 + 25000

      // Liabilities
      expect(result.liabilities).toHaveLength(1);
      expect(result.liabilities[0].account).toBe('Accounts Payable');
      expect(result.totalLiabilities).toBe(15000);

      // Equity
      expect(result.equity).toHaveLength(1);
      expect(result.equity[0].account).toBe('Retained Earnings');
      expect(result.totalEquity).toBe(60000);
    });

    it('excludes INCOME and EXPENSE sub-groups from equity', () => {
      // Arrange
      const entries: AccountBalanceEntry[] = [
        {
          id: '1',
          name: 'Common Stock',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'CAPITAL',
          balance: 100000,
          debitTotal: 0,
          creditTotal: 100000,
        },
        {
          id: '2',
          name: 'Sales Revenue',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'INCOME', // Should be excluded
          balance: 50000,
          debitTotal: 0,
          creditTotal: 50000,
        },
        {
          id: '3',
          name: 'Salaries Expense',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'EXPENSE', // Should be excluded
          balance: -20000,
          debitTotal: 20000,
          creditTotal: 0,
        },
      ];

      // Act
      const result = buildBalanceSheet(entries, '2026-12-31');

      // Assert - only Common Stock should be in equity
      expect(result.equity).toHaveLength(1);
      expect(result.equity[0].account).toBe('Common Stock');
      expect(result.totalEquity).toBe(100000);
    });

    it('handles nested children in accounts', () => {
      // Arrange
      const entries: AccountBalanceEntry[] = [
        {
          id: '1',
          name: 'Current Assets',
          ledgerGroup: 'ASSET',
          balance: 75000,
          debitTotal: 75000,
          creditTotal: 0,
          children: [
            {
              id: '1a',
              name: 'Cash',
              ledgerGroup: 'ASSET',
              balance: 50000,
              debitTotal: 50000,
              creditTotal: 0,
            },
            {
              id: '1b',
              name: 'Receivables',
              ledgerGroup: 'ASSET',
              balance: 25000,
              debitTotal: 25000,
              creditTotal: 0,
            },
          ],
        },
      ];

      // Act
      const result = buildBalanceSheet(entries, '2026-12-31');

      // Assert - children should be transformed
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].children).toHaveLength(2);
      expect(result.assets[0].children?.[0].account).toBe('Cash');
      expect(result.assets[0].children?.[1].balance).toBe(25000);
    });

    it('handles empty entries array', () => {
      // Act
      const result = buildBalanceSheet([], '2026-12-31');

      // Assert
      expect(result.asOf).toBe('2026-12-31');
      expect(result.assets).toEqual([]);
      expect(result.liabilities).toEqual([]);
      expect(result.equity).toEqual([]);
      expect(result.totalAssets).toBe(0);
      expect(result.totalLiabilities).toBe(0);
      expect(result.totalEquity).toBe(0);
    });
  });

  describe('buildProfitLoss', () => {
    it('builds Profit & Loss from account balance entries', () => {
      // Arrange
      const entries: AccountBalanceEntry[] = [
        // Income accounts (ledgerSubGroup: INCOME)
        {
          id: '1',
          name: 'Sales Revenue',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'INCOME',
          balance: 100000,
          debitTotal: 0,
          creditTotal: 100000,
        },
        {
          id: '2',
          name: 'Service Income',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'INCOME',
          balance: 25000,
          debitTotal: 0,
          creditTotal: 25000,
        },
        // Expense accounts (ledgerSubGroup: EXPENSE)
        {
          id: '3',
          name: 'Salaries',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'EXPENSE',
          balance: -50000, // Negative for expenses
          debitTotal: 50000,
          creditTotal: 0,
        },
        {
          id: '4',
          name: 'Rent Expense',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'EXPENSE',
          balance: -10000,
          debitTotal: 10000,
          creditTotal: 0,
        },
      ];

      // Act
      const result = buildProfitLoss(entries, '2026-01-01', '2026-12-31');

      // Assert
      expect(result.periodStart).toBe('2026-01-01');
      expect(result.periodEnd).toBe('2026-12-31');

      // Income
      expect(result.income).toHaveLength(2);
      expect(result.income[0].account).toBe('Sales Revenue');
      expect(result.income[0].amount).toBe(100000); // Uses Math.abs()
      expect(result.totalIncome).toBe(125000); // 100000 + 25000

      // Expenses
      expect(result.expenses).toHaveLength(2);
      expect(result.expenses[0].account).toBe('Salaries');
      expect(result.expenses[0].amount).toBe(50000); // Math.abs(-50000)
      expect(result.totalExpenses).toBe(60000); // 50000 + 10000

      // Net Profit
      expect(result.netProfit).toBe(65000); // 125000 - 60000
    });

    it('calculates net loss when expenses exceed income', () => {
      // Arrange
      const entries: AccountBalanceEntry[] = [
        {
          id: '1',
          name: 'Sales',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'INCOME',
          balance: 30000,
          debitTotal: 0,
          creditTotal: 30000,
        },
        {
          id: '2',
          name: 'Operating Expenses',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'EXPENSE',
          balance: -50000,
          debitTotal: 50000,
          creditTotal: 0,
        },
      ];

      // Act
      const result = buildProfitLoss(entries, '2026-01-01', '2026-03-31');

      // Assert
      expect(result.totalIncome).toBe(30000);
      expect(result.totalExpenses).toBe(50000);
      expect(result.netProfit).toBe(-20000); // Net loss
    });

    it('handles nested children in P&L items', () => {
      // Arrange
      const entries: AccountBalanceEntry[] = [
        {
          id: '1',
          name: 'Operating Expenses',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'EXPENSE',
          balance: -60000,
          debitTotal: 60000,
          creditTotal: 0,
          children: [
            {
              id: '1a',
              name: 'Salaries',
              ledgerGroup: 'EQUITY',
              ledgerSubGroup: 'EXPENSE',
              balance: -40000,
              debitTotal: 40000,
              creditTotal: 0,
            },
            {
              id: '1b',
              name: 'Utilities',
              ledgerGroup: 'EQUITY',
              ledgerSubGroup: 'EXPENSE',
              balance: -20000,
              debitTotal: 20000,
              creditTotal: 0,
            },
          ],
        },
      ];

      // Act
      const result = buildProfitLoss(entries, '2026-01-01', '2026-12-31');

      // Assert
      expect(result.expenses).toHaveLength(1);
      expect(result.expenses[0].children).toHaveLength(2);
      expect(result.expenses[0].children?.[0].account).toBe('Salaries');
      expect(result.expenses[0].children?.[0].amount).toBe(40000);
    });

    it('filters out non-income/expense accounts', () => {
      // Arrange
      const entries: AccountBalanceEntry[] = [
        {
          id: '1',
          name: 'Revenue',
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'INCOME',
          balance: 50000,
          debitTotal: 0,
          creditTotal: 50000,
        },
        {
          id: '2',
          name: 'Cash', // ASSET - should be excluded
          ledgerGroup: 'ASSET',
          balance: 100000,
          debitTotal: 100000,
          creditTotal: 0,
        },
        {
          id: '3',
          name: 'Common Stock', // EQUITY but not INCOME/EXPENSE
          ledgerGroup: 'EQUITY',
          ledgerSubGroup: 'CAPITAL',
          balance: 200000,
          debitTotal: 0,
          creditTotal: 200000,
        },
      ];

      // Act
      const result = buildProfitLoss(entries, '2026-01-01', '2026-12-31');

      // Assert - only income account should be included
      expect(result.income).toHaveLength(1);
      expect(result.income[0].account).toBe('Revenue');
      expect(result.expenses).toHaveLength(0);
      expect(result.totalIncome).toBe(50000);
      expect(result.totalExpenses).toBe(0);
      expect(result.netProfit).toBe(50000);
    });

    it('handles empty entries array', () => {
      // Act
      const result = buildProfitLoss([], '2026-01-01', '2026-12-31');

      // Assert
      expect(result.periodStart).toBe('2026-01-01');
      expect(result.periodEnd).toBe('2026-12-31');
      expect(result.income).toEqual([]);
      expect(result.expenses).toEqual([]);
      expect(result.totalIncome).toBe(0);
      expect(result.totalExpenses).toBe(0);
      expect(result.netProfit).toBe(0);
    });
  });
});
