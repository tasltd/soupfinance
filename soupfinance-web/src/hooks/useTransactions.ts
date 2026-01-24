/**
 * Hook for fetching unified transactions (journal entries + vouchers)
 * Combines data from LedgerTransactionGroup and Voucher APIs
 *
 * Added: Environment-aware transaction fetching
 * - Production: Always use real API, fail on error, empty if no data
 * - Development: Use real API, fall back to mock on API error only
 */
import { useQuery } from '@tanstack/react-query';
import { listTransactionGroups, listVouchers } from '../api/endpoints/ledger';
import type { LedgerTransactionGroup, Voucher } from '../types';

// Added: Unified transaction type for display in Transaction Register
export interface UnifiedTransaction {
  id: string;
  date: string;
  transactionId: string;
  description: string;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  status: 'DRAFT' | 'PENDING' | 'POSTED' | 'REVERSED';
  type: 'JOURNAL_ENTRY' | 'PAYMENT' | 'RECEIPT';
  sourceId: string;
}

// Added: Mock transactions for development when API is unavailable
const MOCK_TRANSACTIONS: UnifiedTransaction[] = [
  {
    id: '1',
    date: '2023-10-26',
    transactionId: 'JE-00001',
    description: 'Office Supplies Purchase',
    accountCode: '6010',
    accountName: 'Office Expenses',
    debitAmount: 500.00,
    creditAmount: 0,
    status: 'DRAFT',
    type: 'JOURNAL_ENTRY',
    sourceId: '1',
  },
  {
    id: '2',
    date: '2023-10-25',
    transactionId: 'RV-00042',
    description: 'Client Payment Received - Invoice INV-2023-089',
    accountCode: '1010',
    accountName: 'Cash',
    debitAmount: 2500.00,
    creditAmount: 0,
    status: 'POSTED',
    type: 'RECEIPT',
    sourceId: '2',
  },
  {
    id: '3',
    date: '2023-10-25',
    transactionId: 'RV-00042',
    description: 'Client Payment Received - Invoice INV-2023-089',
    accountCode: '4010',
    accountName: 'Sales Revenue',
    debitAmount: 0,
    creditAmount: 2500.00,
    status: 'POSTED',
    type: 'RECEIPT',
    sourceId: '2',
  },
  {
    id: '4',
    date: '2023-10-24',
    transactionId: 'PV-00078',
    description: 'Software Subscription - Adobe Creative Cloud',
    accountCode: '6020',
    accountName: 'Software Expenses',
    debitAmount: 150.00,
    creditAmount: 0,
    status: 'DRAFT',
    type: 'PAYMENT',
    sourceId: '4',
  },
  {
    id: '5',
    date: '2023-10-24',
    transactionId: 'PV-00078',
    description: 'Software Subscription - Adobe Creative Cloud',
    accountCode: '1010',
    accountName: 'Cash',
    debitAmount: 0,
    creditAmount: 150.00,
    status: 'DRAFT',
    type: 'PAYMENT',
    sourceId: '4',
  },
  {
    id: '6',
    date: '2023-10-23',
    transactionId: 'JE-00002',
    description: 'Monthly Depreciation Entry',
    accountCode: '5400',
    accountName: 'Depreciation Expense',
    debitAmount: 1200.00,
    creditAmount: 0,
    status: 'POSTED',
    type: 'JOURNAL_ENTRY',
    sourceId: '6',
  },
  {
    id: '7',
    date: '2023-10-23',
    transactionId: 'JE-00002',
    description: 'Monthly Depreciation Entry',
    accountCode: '1500',
    accountName: 'Accumulated Depreciation',
    debitAmount: 0,
    creditAmount: 1200.00,
    status: 'POSTED',
    type: 'JOURNAL_ENTRY',
    sourceId: '6',
  },
  {
    id: '8',
    date: '2023-10-21',
    transactionId: 'PV-00077',
    description: 'Rent Payment - October 2023',
    accountCode: '6040',
    accountName: 'Rent Expense',
    debitAmount: 2000.00,
    creditAmount: 0,
    status: 'PENDING',
    type: 'PAYMENT',
    sourceId: '8',
  },
  {
    id: '9',
    date: '2023-10-21',
    transactionId: 'PV-00077',
    description: 'Rent Payment - October 2023',
    accountCode: '1010',
    accountName: 'Cash',
    debitAmount: 0,
    creditAmount: 2000.00,
    status: 'PENDING',
    type: 'PAYMENT',
    sourceId: '8',
  },
  {
    id: '10',
    date: '2023-10-20',
    transactionId: 'JE-00003',
    description: 'Accrued Interest Reversal',
    accountCode: '2200',
    accountName: 'Accrued Interest',
    debitAmount: 350.00,
    creditAmount: 0,
    status: 'REVERSED',
    type: 'JOURNAL_ENTRY',
    sourceId: '10',
  },
];

// Added: Check if mock data should be used (only in development)
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true';

/**
 * Transform a LedgerTransactionGroup to UnifiedTransaction entries
 * Each transaction in the group becomes a row in the register
 */
function transformTransactionGroup(group: LedgerTransactionGroup): UnifiedTransaction[] {
  // Added: Map status values to UnifiedTransaction status
  const mapStatus = (status?: string): UnifiedTransaction['status'] => {
    switch (status?.toUpperCase()) {
      case 'DRAFT':
        return 'DRAFT';
      case 'PENDING':
        return 'PENDING';
      case 'POSTED':
        return 'POSTED';
      case 'REVERSED':
        return 'REVERSED';
      default:
        return 'DRAFT';
    }
  };

  // Added: Each transaction in the group becomes a row
  // Changed: Use ledgerTransactionList (correct property name per LedgerTransactionGroup type)
  if (!group.ledgerTransactionList || group.ledgerTransactionList.length === 0) {
    return [];
  }

  return group.ledgerTransactionList.map((tx, index) => ({
    id: `${group.id}-${index}`,
    date: group.groupDate || tx.transactionDate || '',
    transactionId: group.reference || `JE-${group.id?.slice(0, 5).toUpperCase() || '00000'}`,
    description: tx.description || group.description || '',
    accountCode: tx.ledgerAccount?.code || '',
    accountName: tx.ledgerAccount?.name || '',
    debitAmount: tx.transactionState === 'DEBIT' ? (tx.amount || 0) : 0,
    creditAmount: tx.transactionState === 'CREDIT' ? (tx.amount || 0) : 0,
    status: mapStatus(group.status || tx.status),
    type: 'JOURNAL_ENTRY' as const,
    sourceId: group.id || '',
  }));
}

/**
 * Transform a Voucher to UnifiedTransaction entries
 * Creates debit and credit entries for the voucher
 */
function transformVoucher(voucher: Voucher): UnifiedTransaction[] {
  // Added: Map voucher type to transaction type
  const txType: UnifiedTransaction['type'] =
    voucher.voucherType === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT';

  // Added: Map status
  const mapStatus = (status?: string): UnifiedTransaction['status'] => {
    switch (status?.toUpperCase()) {
      case 'DRAFT':
        return 'DRAFT';
      case 'PENDING':
        return 'PENDING';
      case 'POSTED':
        return 'POSTED';
      case 'CANCELLED':
      case 'REVERSED':
        return 'REVERSED';
      default:
        return 'DRAFT';
    }
  };

  // Added: Generate transaction ID prefix based on type
  const prefix = voucher.voucherType === 'RECEIPT' ? 'RV' : 'PV';
  const txId = voucher.voucherNumber || `${prefix}-${voucher.id?.slice(0, 5).toUpperCase() || '00000'}`;

  const entries: UnifiedTransaction[] = [];

  // Added: Cash/Bank account entry
  if (voucher.cashAccount) {
    entries.push({
      id: `${voucher.id}-cash`,
      date: voucher.voucherDate || '',
      transactionId: txId,
      description: voucher.description || '',
      accountCode: voucher.cashAccount.code || '',
      accountName: voucher.cashAccount.name || '',
      debitAmount: voucher.voucherType === 'RECEIPT' ? (voucher.amount || 0) : 0,
      creditAmount: voucher.voucherType === 'PAYMENT' ? (voucher.amount || 0) : 0,
      status: mapStatus(voucher.status),
      type: txType,
      sourceId: voucher.id || '',
    });
  }

  // Added: Expense/Income account entry
  if (voucher.voucherType === 'PAYMENT' && voucher.expenseAccount) {
    entries.push({
      id: `${voucher.id}-expense`,
      date: voucher.voucherDate || '',
      transactionId: txId,
      description: voucher.description || '',
      accountCode: voucher.expenseAccount.code || '',
      accountName: voucher.expenseAccount.name || '',
      debitAmount: voucher.amount || 0,
      creditAmount: 0,
      status: mapStatus(voucher.status),
      type: txType,
      sourceId: voucher.id || '',
    });
  } else if (voucher.voucherType === 'RECEIPT' && voucher.incomeAccount) {
    entries.push({
      id: `${voucher.id}-income`,
      date: voucher.voucherDate || '',
      transactionId: txId,
      description: voucher.description || '',
      accountCode: voucher.incomeAccount.code || '',
      accountName: voucher.incomeAccount.name || '',
      debitAmount: 0,
      creditAmount: voucher.amount || 0,
      status: mapStatus(voucher.status),
      type: txType,
      sourceId: voucher.id || '',
    });
  }

  return entries;
}

/**
 * Fetch and combine transactions from API
 */
async function fetchTransactions(): Promise<UnifiedTransaction[]> {
  // Added: Fetch both transaction groups (journal entries) and vouchers (payments/receipts) in parallel
  const [groups, vouchers] = await Promise.all([
    listTransactionGroups({ max: 500 }),
    listVouchers({ max: 500 }),
  ]);

  // Added: Transform API responses to unified format
  const journalEntries = groups.flatMap(transformTransactionGroup);
  const voucherEntries = vouchers.flatMap(transformVoucher);

  // Added: Combine and sort by date descending
  const allTransactions = [...journalEntries, ...voucherEntries];
  allTransactions.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA; // Descending order
  });

  return allTransactions;
}

/**
 * Custom hook for fetching unified transactions
 * Changed: Returns transactions from API, fails on error, empty if no data
 * Mock data only when VITE_USE_MOCK_DATA=true
 */
export function useTransactions() {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      // Changed: Only use mock data when explicitly enabled
      if (USE_MOCK_DATA) {
        console.info('[useTransactions] Using mock data (VITE_USE_MOCK_DATA=true)');
        return MOCK_TRANSACTIONS;
      }

      // Changed: Always use real API, let errors propagate, return empty if no data
      return await fetchTransactions();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes (transactions update frequently)
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Get mock transactions directly (for testing)
 */
export function getMockTransactions(): UnifiedTransaction[] {
  return MOCK_TRANSACTIONS;
}
