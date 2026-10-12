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
import type { LedgerTransactionGroup, Voucher, VoucherType } from '../types';
// Added (SOUPFIN-157): DEPOSIT → RECEIPT normalisation for voucher rows
import { normalizeVoucherType } from '../features/accounting/voucherTypes';

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
  // Changed (SOUPFIN-157): JOURNAL_ENTRY is a multi-line journal entry;
  // the other four are voucher types (JOURNAL is a journal voucher)
  type: 'JOURNAL_ENTRY' | VoucherType;
  sourceId: string;
}

// Added (SOUPFIN-157): register labels for each transaction type
export const TRANSACTION_TYPE_LABELS: Record<UnifiedTransaction['type'], string> = {
  JOURNAL_ENTRY: 'Journal Entry',
  PAYMENT: 'Payment',
  RECEIPT: 'Receipt',
  CONTRA: 'Contra',
  JOURNAL: 'Journal Voucher',
};

// Added (SOUPFIN-157): voucher number prefix when the backend sends none
const VOUCHER_PREFIX: Record<VoucherType, string> = {
  PAYMENT: 'PV',
  RECEIPT: 'RV',
  CONTRA: 'CV',
  JOURNAL: 'JV',
};

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
 *
 * Changed (SOUPFIN-157): every voucher type debits one account and credits
 * another. The backend sends them as debitLedgerAccount/creditLedgerAccount,
 * at the top level or under ledgerTransaction; the legacy flattened names
 * (cashAccount, expenseAccount, incomeAccount) are read only as a fallback.
 * Before this, real vouchers from the backend produced no rows at all.
 */
type AccountRef = { id?: string; code?: string; name?: string } | null | undefined;

export function transformVoucher(voucher: Voucher): UnifiedTransaction[] {
  const lt = (voucher.ledgerTransaction ?? {}) as Partial<Voucher['ledgerTransaction']> & {
    notes?: string;
  };
  const loose = voucher as Voucher & { transactionDate?: string; notes?: string };

  // Added: Map voucher type to transaction type (legacy DEPOSIT reads as RECEIPT)
  const txType: VoucherType = normalizeVoucherType(voucher.voucherType) ?? 'PAYMENT';

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
  const txId = voucher.voucherNumber || `${VOUCHER_PREFIX[txType]}-${voucher.id?.slice(0, 5).toUpperCase() || '00000'}`;

  const isPayment = txType === 'PAYMENT';
  const debitAccount: AccountRef = voucher.debitLedgerAccount ?? lt?.debitLedgerAccount
    ?? (isPayment ? voucher.expenseAccount : voucher.cashAccount);
  const creditAccount: AccountRef = voucher.creditLedgerAccount ?? lt?.creditLedgerAccount
    ?? (isPayment ? voucher.cashAccount : voucher.incomeAccount);

  const amount = Number(voucher.amount ?? lt?.amount ?? 0) || 0;
  const date = voucher.voucherDate || loose.transactionDate || lt?.transactionDate || '';
  const description = voucher.description || loose.notes || lt?.notes || lt?.description || '';
  const status = mapStatus(voucher.status);

  const entries: UnifiedTransaction[] = [];
  const addEntry = (side: 'debit' | 'credit', account: AccountRef) => {
    if (!account) return;
    entries.push({
      id: `${voucher.id}-${side}`,
      date,
      transactionId: txId,
      description,
      accountCode: account.code || '',
      accountName: account.name || '',
      debitAmount: side === 'debit' ? amount : 0,
      creditAmount: side === 'credit' ? amount : 0,
      status,
      type: txType,
      sourceId: voucher.id || '',
    });
  };
  addEntry('debit', debitAccount);
  addEntry('credit', creditAccount);

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
