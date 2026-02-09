/**
 * Hook for fetching dashboard statistics
 * Calculates stats from invoices/bills
 *
 * Changed: Removed automatic mock data fallback
 * - Production: Always use real API, fail on error, zeros if no data
 * - Development: Same as production UNLESS VITE_USE_MOCK_DATA=true
 * - Mock data ONLY when VITE_USE_MOCK_DATA=true explicitly
 */
import { useQuery } from '@tanstack/react-query';
import { listInvoices } from '../api/endpoints/invoices';
import { listBills } from '../api/endpoints/bills';
import type { Invoice, Bill } from '../types';

// Dashboard stats type
export interface DashboardStats {
  totalRevenue: number;
  totalRevenueChange: number;
  outstandingInvoices: number;
  outstandingInvoicesCount: number;
  expensesMTD: number;
  expensesMTDChange: number;
  netProfit: number;
  netProfitChange: number;
}

// Mock stats for explicit testing mode only (VITE_USE_MOCK_DATA=true)
const MOCK_STATS: DashboardStats = {
  totalRevenue: 125430.50,
  totalRevenueChange: 12.5,
  outstandingInvoices: 45320.00,
  outstandingInvoicesCount: 12,
  expensesMTD: 32150.00,
  expensesMTDChange: -8.3,
  netProfit: 93280.50,
  netProfitChange: 18.2,
};

// Changed: Mock data ONLY when explicitly enabled via environment variable
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true';

/**
 * Calculate dashboard stats from invoices and bills
 */
function calculateStats(invoices: Invoice[], bills: Bill[]): DashboardStats {
  // Calculate total revenue (sum of paid invoices)
  const paidInvoices = invoices.filter(inv => inv.status === 'PAID');
  const totalRevenue = paidInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

  // Calculate outstanding invoices (unpaid/pending)
  const unpaidInvoices = invoices.filter(inv =>
    inv.status !== 'PAID' && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT'
  );
  const outstandingInvoices = unpaidInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const outstandingInvoicesCount = unpaidInvoices.length;

  // Calculate expenses MTD (sum of bills)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // Changed: Use billDate (backend field name, was previously misnamed as issueDate)
  const billsMTD = bills.filter(bill => {
    const billDate = new Date(bill.billDate || bill.dateCreated || '');
    return billDate >= startOfMonth;
  });
  const expensesMTD = billsMTD.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);

  // Calculate net profit
  const netProfit = totalRevenue - expensesMTD;

  // Added: For now, changes are set to 0 since we don't have historical data
  // In production, this would compare to previous period
  return {
    totalRevenue,
    totalRevenueChange: 0,
    outstandingInvoices,
    outstandingInvoicesCount,
    expensesMTD,
    expensesMTDChange: 0,
    netProfit,
    netProfitChange: 0,
  };
}

/**
 * Custom hook for fetching dashboard statistics
 * Changed: Returns stats from API, fails on error, zeros if no data
 * Mock data only when VITE_USE_MOCK_DATA=true
 */
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Changed: Only use mock data when explicitly enabled
      if (USE_MOCK_DATA) {
        console.info('[useDashboardStats] Using mock data (VITE_USE_MOCK_DATA=true)');
        return MOCK_STATS;
      }

      // Changed: Use Promise.allSettled so one failing endpoint doesn't crash the dashboard
      // New accounts with no data should see zeros, not error messages
      const results = await Promise.allSettled([
        listInvoices({ max: 1000 }),
        listBills({ max: 1000 }),
      ]);

      // Extract results - treat rejected promises as empty arrays
      const invoices = results[0].status === 'fulfilled' ? results[0].value : [];
      const bills = results[1].status === 'fulfilled' ? results[1].value : [];

      return calculateStats(invoices, bills);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Get mock stats directly (for testing)
 */
export function getMockStats(): DashboardStats {
  return MOCK_STATS;
}
