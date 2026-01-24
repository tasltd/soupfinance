/**
 * Hook for fetching ledger accounts
 * Uses real API, fails on error, returns empty if no data
 *
 * Changed: Removed automatic mock data fallback
 * - Production: Always use real API, fail on error, empty if no data
 * - Development: Same as production UNLESS VITE_USE_MOCK_DATA=true
 * - Mock data ONLY when VITE_USE_MOCK_DATA=true explicitly
 */
import { useQuery } from '@tanstack/react-query';
import { listLedgerAccounts } from '../api/endpoints/ledger';
import type { LedgerAccount } from '../types';

// Mock accounts for explicit testing mode only (VITE_USE_MOCK_DATA=true)
// These match the structure from the Grails backend LedgerAccount domain
const MOCK_ACCOUNTS: LedgerAccount[] = [
  // Asset accounts (Bank/Cash)
  { id: '1', code: '1000', name: 'Petty Cash', ledgerGroup: 'ASSET', isActive: true, balance: 0 },
  { id: '2', code: '1010', name: 'Main Bank Account', ledgerGroup: 'ASSET', isActive: true, balance: 0 },
  { id: '3', code: '1020', name: 'Savings Account', ledgerGroup: 'ASSET', isActive: true, balance: 0 },
  { id: '4', code: '1100', name: 'Accounts Receivable', ledgerGroup: 'ASSET', isActive: true, balance: 0 },
  // Liability accounts
  { id: '5', code: '2000', name: 'Accounts Payable', ledgerGroup: 'LIABILITY', isActive: true, balance: 0 },
  { id: '6', code: '2100', name: 'Accrued Expenses', ledgerGroup: 'LIABILITY', isActive: true, balance: 0 },
  { id: '7', code: '2200', name: 'Notes Payable', ledgerGroup: 'LIABILITY', isActive: true, balance: 0 },
  // Equity accounts
  { id: '8', code: '3000', name: 'Common Stock', ledgerGroup: 'EQUITY', isActive: true, balance: 0 },
  { id: '9', code: '3100', name: 'Retained Earnings', ledgerGroup: 'EQUITY', isActive: true, balance: 0 },
  // Expense accounts
  { id: '10', code: '5000', name: 'Cost of Goods Sold', ledgerGroup: 'EXPENSE', isActive: true, balance: 0 },
  { id: '11', code: '5100', name: 'Salaries & Wages', ledgerGroup: 'EXPENSE', isActive: true, balance: 0 },
  { id: '12', code: '5200', name: 'Rent Expense', ledgerGroup: 'EXPENSE', isActive: true, balance: 0 },
  { id: '13', code: '5300', name: 'Utilities Expense', ledgerGroup: 'EXPENSE', isActive: true, balance: 0 },
  { id: '14', code: '5400', name: 'Office Supplies', ledgerGroup: 'EXPENSE', isActive: true, balance: 0 },
  { id: '15', code: '5500', name: 'Travel & Entertainment', ledgerGroup: 'EXPENSE', isActive: true, balance: 0 },
  { id: '16', code: '5600', name: 'Professional Fees', ledgerGroup: 'EXPENSE', isActive: true, balance: 0 },
  // Income accounts
  { id: '20', code: '4000', name: 'Sales Revenue', ledgerGroup: 'INCOME', isActive: true, balance: 0 },
  { id: '21', code: '4100', name: 'Service Revenue', ledgerGroup: 'INCOME', isActive: true, balance: 0 },
  { id: '22', code: '4200', name: 'Interest Income', ledgerGroup: 'INCOME', isActive: true, balance: 0 },
  { id: '23', code: '4300', name: 'Other Income', ledgerGroup: 'INCOME', isActive: true, balance: 0 },
];

// Changed: Mock data ONLY when explicitly enabled via environment variable
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true';

/**
 * Custom hook for fetching ledger accounts
 * Changed: Returns accounts from API, fails on error, empty if no data
 * Mock data only when VITE_USE_MOCK_DATA=true
 */
export function useLedgerAccounts() {
  return useQuery({
    queryKey: ['ledger-accounts'],
    queryFn: async () => {
      // Changed: Only use mock data when explicitly enabled
      if (USE_MOCK_DATA) {
        console.info('[useLedgerAccounts] Using mock data (VITE_USE_MOCK_DATA=true)');
        return MOCK_ACCOUNTS;
      }

      // Changed: Always use real API, let errors propagate, return empty if no data
      const accounts = await listLedgerAccounts();
      return accounts; // Return empty array if API returns empty - no fallback to mock
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
  });
}

/**
 * Get mock accounts directly (for testing)
 */
export function getMockAccounts(): LedgerAccount[] {
  return MOCK_ACCOUNTS;
}
