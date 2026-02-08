/**
 * Hook for fetching payment methods from backend
 * PaymentMethod is a domain class (soupbroker.finance.PaymentMethod), NOT an enum
 *
 * Added: Replaces hardcoded string options with dynamic backend data
 */
import { useQuery } from '@tanstack/react-query';
import { listPaymentMethods } from '../api/endpoints/domainData';

/**
 * Custom hook for fetching payment methods
 * Returns PaymentMethod domain records with id + name
 */
export function usePaymentMethods() {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => listPaymentMethods({ max: 100 }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
