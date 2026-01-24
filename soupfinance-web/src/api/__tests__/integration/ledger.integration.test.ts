/**
 * Integration tests for ledger API module
 * Tests Ledger Accounts (Chart of Accounts), Transactions, and Reports endpoints
 * with proper URL construction, query params, and FormData serialization
 *
 * Added: Integration test suite for ledger.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Mock axios at module level
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    })),
  },
}));

describe('Ledger API Integration', () => {
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockAxiosInstance,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    });
  });

  // =============================================================================
  // Ledger Accounts (Chart of Accounts)
  // =============================================================================

  describe('listLedgerAccounts', () => {
    it('fetches all ledger accounts without params', async () => {
      // Arrange
      const mockAccounts = [
        { id: 'acc-1', code: '1010', name: 'Cash on Hand', ledgerGroup: 'ASSET' },
        { id: 'acc-2', code: '2010', name: 'Accounts Payable', ledgerGroup: 'LIABILITY' },
        { id: 'acc-3', code: '4010', name: 'Sales Revenue', ledgerGroup: 'INCOME' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockAccounts });

      vi.resetModules();
      const { listLedgerAccounts } = await import('../../endpoints/ledger');

      // Act
      const result = await listLedgerAccounts();

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ledgerAccount/index.json');
      expect(result).toHaveLength(3);
      expect(result[0].code).toBe('1010');
    });

    it('fetches accounts with pagination params', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listLedgerAccounts } = await import('../../endpoints/ledger');

      // Act
      await listLedgerAccounts({ max: 50, offset: 0, sort: 'code', order: 'asc' });

      // Assert
      const callUrl = mockAxiosInstance.get.mock.calls[0][0] as string;
      expect(callUrl).toContain('/ledgerAccount/index.json?');
      expect(callUrl).toContain('max=50');
      expect(callUrl).toContain('sort=code');
    });
  });

  describe('listLedgerAccountsByGroup', () => {
    it('fetches accounts by ASSET group', async () => {
      // Arrange
      const mockAssets = [
        { id: 'acc-1', code: '1010', name: 'Cash', ledgerGroup: 'ASSET' },
        { id: 'acc-2', code: '1020', name: 'Bank', ledgerGroup: 'ASSET' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockAssets });

      vi.resetModules();
      const { listLedgerAccountsByGroup } = await import('../../endpoints/ledger');

      // Act
      const result = await listLedgerAccountsByGroup('ASSET');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ledgerAccount/index.json?ledgerGroup=ASSET'
      );
      expect(result).toHaveLength(2);
      expect(result.every(acc => acc.ledgerGroup === 'ASSET')).toBe(true);
    });

    it('fetches accounts by LIABILITY group', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listLedgerAccountsByGroup } = await import('../../endpoints/ledger');

      // Act
      await listLedgerAccountsByGroup('LIABILITY');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ledgerAccount/index.json?ledgerGroup=LIABILITY'
      );
    });

    it('fetches accounts by EQUITY group', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listLedgerAccountsByGroup } = await import('../../endpoints/ledger');

      // Act
      await listLedgerAccountsByGroup('EQUITY');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ledgerAccount/index.json?ledgerGroup=EQUITY'
      );
    });

    it('fetches accounts by INCOME group', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listLedgerAccountsByGroup } = await import('../../endpoints/ledger');

      // Act
      await listLedgerAccountsByGroup('INCOME');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ledgerAccount/index.json?ledgerGroup=INCOME'
      );
    });

    it('fetches accounts by EXPENSE group', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listLedgerAccountsByGroup } = await import('../../endpoints/ledger');

      // Act
      await listLedgerAccountsByGroup('EXPENSE');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ledgerAccount/index.json?ledgerGroup=EXPENSE'
      );
    });
  });

  describe('getLedgerAccount', () => {
    it('fetches single account by UUID', async () => {
      // Arrange
      const mockAccount = {
        id: 'acc-uuid-123',
        code: '1010',
        name: 'Cash on Hand',
        ledgerGroup: 'ASSET',
        balance: 50000.00,
        isActive: true,
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockAccount });

      vi.resetModules();
      const { getLedgerAccount } = await import('../../endpoints/ledger');

      // Act
      const result = await getLedgerAccount('acc-uuid-123');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ledgerAccount/show/acc-uuid-123.json');
      expect(result.code).toBe('1010');
      expect(result.balance).toBe(50000.00);
    });
  });

  describe('createLedgerAccount', () => {
    it('creates account with FormData serialization', async () => {
      // Arrange
      const newAccount = {
        code: '1030',
        name: 'Petty Cash',
        description: 'Office petty cash fund',
        ledgerGroup: 'ASSET' as const,
        isActive: true,
      };

      const mockResponse = { id: 'new-acc-uuid', ...newAccount, balance: 0 };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { createLedgerAccount } = await import('../../endpoints/ledger');

      // Act
      const result = await createLedgerAccount(newAccount);

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/ledgerAccount/save.json',
        expect.any(URLSearchParams)
      );

      const formData = mockAxiosInstance.post.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('code')).toBe('1030');
      expect(formData.get('name')).toBe('Petty Cash');
      expect(formData.get('ledgerGroup')).toBe('ASSET');
      expect(formData.get('isActive')).toBe('true');

      expect(result.id).toBe('new-acc-uuid');
    });

    it('creates account with parent account reference', async () => {
      // Arrange
      const newAccount = {
        code: '1011',
        name: 'Cash - USD',
        ledgerGroup: 'ASSET' as const,
        parentAccount: { id: 'parent-acc-uuid' },
      };

      mockAxiosInstance.post.mockResolvedValue({ data: { id: 'new-uuid', ...newAccount } });

      vi.resetModules();
      const { createLedgerAccount } = await import('../../endpoints/ledger');

      // Act
      await createLedgerAccount(newAccount);

      // Assert - verify FK serialization
      const formData = mockAxiosInstance.post.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('parentAccount.id')).toBe('parent-acc-uuid');
    });
  });

  describe('updateLedgerAccount', () => {
    it('updates account with ID in FormData', async () => {
      // Arrange
      const accountId = 'acc-uuid-456';
      const updateData = { name: 'Updated Cash Account', description: 'Updated description' };

      mockAxiosInstance.put.mockResolvedValue({ data: { id: accountId, ...updateData } });

      vi.resetModules();
      const { updateLedgerAccount } = await import('../../endpoints/ledger');

      // Act
      const result = await updateLedgerAccount(accountId, updateData);

      // Assert
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/ledgerAccount/update/${accountId}.json`,
        expect.any(URLSearchParams)
      );

      const formData = mockAxiosInstance.put.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('id')).toBe(accountId);
      expect(formData.get('name')).toBe('Updated Cash Account');

      expect(result.name).toBe('Updated Cash Account');
    });
  });

  describe('deleteLedgerAccount', () => {
    it('soft deletes account by ID', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteLedgerAccount } = await import('../../endpoints/ledger');

      // Act
      await deleteLedgerAccount('acc-to-delete');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/ledgerAccount/delete/acc-to-delete.json'
      );
    });
  });

  // =============================================================================
  // Ledger Transactions
  // =============================================================================

  describe('listLedgerTransactions', () => {
    it('fetches transactions without params', async () => {
      // Arrange
      const mockTxns = [
        { id: 'txn-1', transactionNumber: 'JE-001', amount: 5000, status: 'POSTED' },
        { id: 'txn-2', transactionNumber: 'JE-002', amount: 3000, status: 'PENDING' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockTxns });

      vi.resetModules();
      const { listLedgerTransactions } = await import('../../endpoints/ledger');

      // Act
      const result = await listLedgerTransactions();

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ledgerTransaction/index.json');
      expect(result).toHaveLength(2);
    });

    it('fetches transactions with date range filters', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listLedgerTransactions } = await import('../../endpoints/ledger');

      // Act
      await listLedgerTransactions({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        max: 100,
      });

      // Assert
      const callUrl = mockAxiosInstance.get.mock.calls[0][0] as string;
      expect(callUrl).toContain('startDate=2026-01-01');
      expect(callUrl).toContain('endDate=2026-01-31');
      expect(callUrl).toContain('max=100');
    });

    it('fetches transactions by account ID', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      vi.resetModules();
      const { listLedgerTransactions } = await import('../../endpoints/ledger');

      // Act
      await listLedgerTransactions({ accountId: 'acc-uuid-789' });

      // Assert
      const callUrl = mockAxiosInstance.get.mock.calls[0][0] as string;
      expect(callUrl).toContain('accountId=acc-uuid-789');
    });
  });

  describe('getLedgerTransaction', () => {
    it('fetches single transaction by UUID', async () => {
      // Arrange
      const mockTxn = {
        id: 'txn-uuid-123',
        transactionNumber: 'JE-001',
        transactionDate: '2026-01-15',
        description: 'Office supplies purchase',
        debitAccount: { id: 'acc-1', name: 'Supplies Expense' },
        creditAccount: { id: 'acc-2', name: 'Cash' },
        amount: 500,
        status: 'POSTED',
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockTxn });

      vi.resetModules();
      const { getLedgerTransaction } = await import('../../endpoints/ledger');

      // Act
      const result = await getLedgerTransaction('txn-uuid-123');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ledgerTransaction/show/txn-uuid-123.json');
      expect(result.transactionNumber).toBe('JE-001');
      // Fix: Added optional chaining since debitAccount is optional in the updated LedgerTransaction type
      expect(result.debitAccount?.name).toBe('Supplies Expense');
    });
  });

  describe('createLedgerTransaction', () => {
    it('creates journal entry with FormData serialization', async () => {
      // Arrange
      const newTxn = {
        transactionDate: '2026-01-20',
        description: 'Rent payment for January',
        debitAccount: { id: 'expense-acc-uuid' },
        creditAccount: { id: 'cash-acc-uuid' },
        amount: 10000,
        reference: 'RENT-2026-01',
      };

      const mockResponse = { id: 'new-txn-uuid', ...newTxn, status: 'PENDING' };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { createLedgerTransaction } = await import('../../endpoints/ledger');

      // Act
      const result = await createLedgerTransaction(newTxn);

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/ledgerTransaction/save.json',
        expect.any(URLSearchParams)
      );

      const formData = mockAxiosInstance.post.mock.calls[0][1] as URLSearchParams;
      expect(formData.get('transactionDate')).toBe('2026-01-20');
      expect(formData.get('debitAccount.id')).toBe('expense-acc-uuid');
      expect(formData.get('creditAccount.id')).toBe('cash-acc-uuid');
      expect(formData.get('amount')).toBe('10000');

      expect(result.id).toBe('new-txn-uuid');
      expect(result.status).toBe('PENDING');
    });
  });

  describe('postLedgerTransaction', () => {
    it('posts pending transaction', async () => {
      // Arrange
      const mockResponse = { id: 'txn-uuid', status: 'POSTED' };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { postLedgerTransaction } = await import('../../endpoints/ledger');

      // Act
      const result = await postLedgerTransaction('txn-uuid');

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/ledgerTransaction/post/txn-uuid.json');
      expect(result.status).toBe('POSTED');
    });
  });

  describe('reverseLedgerTransaction', () => {
    it('reverses posted transaction', async () => {
      // Arrange
      const mockResponse = { id: 'txn-uuid', status: 'REVERSED' };
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      vi.resetModules();
      const { reverseLedgerTransaction } = await import('../../endpoints/ledger');

      // Act
      const result = await reverseLedgerTransaction('txn-uuid');

      // Assert
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/ledgerTransaction/reverse/txn-uuid.json');
      expect(result.status).toBe('REVERSED');
    });
  });

  describe('deleteLedgerTransaction', () => {
    it('deletes pending transaction', async () => {
      // Arrange
      mockAxiosInstance.delete.mockResolvedValue({});

      vi.resetModules();
      const { deleteLedgerTransaction } = await import('../../endpoints/ledger');

      // Act
      await deleteLedgerTransaction('pending-txn-uuid');

      // Assert
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/ledgerTransaction/delete/pending-txn-uuid.json'
      );
    });
  });

  // =============================================================================
  // Account Balances & Reports
  // =============================================================================

  describe('getAccountBalance', () => {
    it('fetches account balance without date', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: { balance: 75000.50 } });

      vi.resetModules();
      const { getAccountBalance } = await import('../../endpoints/ledger');

      // Act
      const result = await getAccountBalance('acc-uuid-123');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ledgerAccount/balance/acc-uuid-123.json');
      expect(result.balance).toBe(75000.50);
    });

    it('fetches account balance as of specific date', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: { balance: 50000 } });

      vi.resetModules();
      const { getAccountBalance } = await import('../../endpoints/ledger');

      // Act
      const result = await getAccountBalance('acc-uuid-123', '2026-01-31');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ledgerAccount/balance/acc-uuid-123.json?asOf=2026-01-31'
      );
      expect(result.balance).toBe(50000);
    });
  });

  // Changed: Renamed from getTrialBalance to getLedgerTrialBalance to avoid conflict with reports.ts
  describe('getLedgerTrialBalance', () => {
    it('fetches trial balance without date', async () => {
      // Arrange
      const mockTrialBalance = {
        accounts: [
          { account: { id: '1', name: 'Cash' }, debit: 50000, credit: 0 },
          { account: { id: '2', name: 'Revenue' }, debit: 0, credit: 50000 },
        ],
        totalDebits: 50000,
        totalCredits: 50000,
      };
      mockAxiosInstance.get.mockResolvedValue({ data: mockTrialBalance });

      vi.resetModules();
      const { getLedgerTrialBalance } = await import('../../endpoints/ledger');

      // Act
      const result = await getLedgerTrialBalance();

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ledgerAccount/trialBalance.json');
      expect(result.totalDebits).toBe(50000);
      expect(result.totalCredits).toBe(50000);
    });

    it('fetches trial balance as of specific date', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: { accounts: [], totalDebits: 0, totalCredits: 0 } });

      vi.resetModules();
      const { getLedgerTrialBalance } = await import('../../endpoints/ledger');

      // Act
      await getLedgerTrialBalance('2026-12-31');

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ledgerAccount/trialBalance.json?asOf=2026-12-31'
      );
    });
  });

  // =============================================================================
  // Error Handling
  // =============================================================================

  describe('Error handling', () => {
    it('propagates validation errors for duplicate account codes', async () => {
      // Arrange
      const mockError = {
        response: {
          status: 422,
          data: { errors: [{ field: 'code', message: 'Account code already exists' }] },
        },
      };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      vi.resetModules();
      const { createLedgerAccount } = await import('../../endpoints/ledger');

      // Act & Assert
      await expect(createLedgerAccount({ code: '1010', name: 'Duplicate' })).rejects.toEqual(mockError);
    });

    it('propagates business rule errors for deleting posted transactions', async () => {
      // Arrange
      const mockError = {
        response: {
          status: 400,
          data: { message: 'Cannot delete posted transaction' },
        },
      };
      mockAxiosInstance.delete.mockRejectedValue(mockError);

      vi.resetModules();
      const { deleteLedgerTransaction } = await import('../../endpoints/ledger');

      // Act & Assert
      await expect(deleteLedgerTransaction('posted-txn')).rejects.toEqual(mockError);
    });
  });
});
