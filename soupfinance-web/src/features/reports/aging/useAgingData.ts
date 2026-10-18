/**
 * Added (SOUPFIN-105): the queries behind the aging, Open Invoices and Unpaid
 * Bills reports.
 *
 * The raw invoices/bills and payments are fetched once per side and cached;
 * changing the as-of date or the aging periods re-buckets them in memory
 * instead of downloading everything again.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchClientIdsByAccountServices,
  fetchControlAccountSource,
  fetchPayablesSource,
  fetchReceivablesSource,
} from '../../../api/endpoints/aging';
import {
  buildOpenBills,
  buildOpenInvoices,
  resolveControlAccount,
  type AgingSide,
  type ControlAccountBalance,
  type OpenDocument,
} from './agingEngine';

const STALE_TIME = 5 * 60 * 1000;

export interface AgingDocumentsState {
  documents: OpenDocument[];
  /** More than AGING_MAX_PAGES pages exist; the totals may be short. */
  truncated: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  /** True once data has arrived (an empty list is still loaded). */
  isLoaded: boolean;
}

/** Open documents on the as-of date, for one side of the ledger. */
export function useAgingDocuments(side: AgingSide, asOf: string, enabled = true): AgingDocumentsState {
  const receivables = useQuery({
    queryKey: ['agingSource', 'receivables'],
    queryFn: fetchReceivablesSource,
    staleTime: STALE_TIME,
    enabled: enabled && side === 'receivables',
  });
  const payables = useQuery({
    queryKey: ['agingSource', 'payables'],
    queryFn: fetchPayablesSource,
    staleTime: STALE_TIME,
    enabled: enabled && side === 'payables',
  });

  const query = side === 'receivables' ? receivables : payables;
  const receivablesData = receivables.data;
  const payablesData = payables.data;

  const documents = useMemo<OpenDocument[]>(() => {
    if (side === 'receivables') {
      return receivablesData ? buildOpenInvoices(receivablesData.invoices, receivablesData.payments, asOf) : [];
    }
    return payablesData ? buildOpenBills(payablesData.bills, payablesData.payments, asOf) : [];
  }, [side, receivablesData, payablesData, asOf]);

  return {
    documents,
    truncated: Boolean(query.data?.truncated),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
    isLoaded: Boolean(query.data),
  };
}

export interface ControlAccountState {
  control: ControlAccountBalance | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/** The Balance Sheet balance of the A/R or A/P control account on the as-of date. */
export function useControlAccount(side: AgingSide, asOf: string, enabled = true): ControlAccountState {
  const query = useQuery({
    queryKey: ['agingControlAccounts', asOf],
    queryFn: () => fetchControlAccountSource(asOf),
    staleTime: STALE_TIME,
    enabled,
  });

  const control = useMemo(() => {
    if (!query.data) return null;
    const { account, ledgerAccounts } = query.data;
    const defaultId =
      side === 'receivables' ? account.defaultReceivableAccount?.id : account.defaultPayableAccount?.id;
    return resolveControlAccount(ledgerAccounts, side, defaultId);
  }, [query.data, side]);

  return {
    control,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

/**
 * AccountServices id -> Client id, for linking an invoice's customer to the
 * client page. A failure here only costs the links, so the page renders names
 * as plain text when `isError` is true; it never hides the report.
 */
export function useClientLinks(enabled: boolean) {
  return useQuery({
    queryKey: ['agingClientLinks'],
    queryFn: fetchClientIdsByAccountServices,
    staleTime: STALE_TIME,
    enabled,
  });
}
