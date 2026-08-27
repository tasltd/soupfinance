/**
 * Hook for fetching the backend TaxEntry catalogue.
 *
 * Added (SOUPFIN-47): line-item tax lives in `taxEntry*ItemList` join rows, which
 * carry only an id or a serialised label — a rate can only be named by matching
 * them against this catalogue. The PDF path had no catalogue at all, so the bill
 * template fell back to the non-existent `item.taxRate` and printed `0%` on every
 * line of every document sent to a vendor.
 *
 * The query key matches the one BillDetailPage already uses, so TanStack Query
 * serves both from a single cache entry rather than issuing a second request.
 */
import { useQuery } from '@tanstack/react-query';
import { listTaxRates } from '../api/endpoints/domainData';

export function useTaxRates() {
  return useQuery({
    queryKey: ['tax-rates'],
    queryFn: () => listTaxRates(),
    staleTime: 5 * 60 * 1000, // 5 minutes — the catalogue changes rarely
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

export default useTaxRates;
