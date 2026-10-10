/**
 * Added (SOUPFIN-105): the words and links that differ between the
 * receivables (A/R) and payables (A/P) versions of each report.
 */
import type { AgingSide } from './agingEngine';

export interface AgingSideConfig {
  side: AgingSide;
  /** "A/R" | "A/P" — cased content, never derived (SOUPFIN-35). */
  shortLabel: string;
  partyLabel: string;
  partyPlural: string;
  documentLabel: string;
  documentPlural: string;
  /** Registry ids of the three reports on this side. */
  reportIds: { summary: string; detail: string; open: string };
  paths: { summary: string; detail: string; open: string };
  /** Labels for the three tabs. */
  tabLabels: { summary: string; detail: string; open: string };
  documentPath: (id: string) => string;
  balanceSheetAccountLabel: string;
}

export const AGING_SIDES: Record<AgingSide, AgingSideConfig> = {
  receivables: {
    side: 'receivables',
    shortLabel: 'A/R',
    partyLabel: 'Customer',
    partyPlural: 'customers',
    documentLabel: 'Invoice',
    documentPlural: 'invoices',
    reportIds: { summary: 'ar-aging', detail: 'ar-aging-detail', open: 'open-invoices' },
    paths: {
      summary: '/reports/aging/receivables',
      detail: '/reports/aging/receivables/detail',
      open: '/reports/open-invoices',
    },
    tabLabels: { summary: 'Summary', detail: 'Detail', open: 'Open invoices' },
    documentPath: (id) => `/invoices/${id}`,
    balanceSheetAccountLabel: 'Accounts receivable on the Balance Sheet',
  },
  payables: {
    side: 'payables',
    shortLabel: 'A/P',
    partyLabel: 'Vendor',
    partyPlural: 'vendors',
    documentLabel: 'Bill',
    documentPlural: 'bills',
    reportIds: { summary: 'ap-aging', detail: 'ap-aging-detail', open: 'unpaid-bills' },
    paths: {
      summary: '/reports/aging/payables',
      detail: '/reports/aging/payables/detail',
      open: '/reports/unpaid-bills',
    },
    tabLabels: { summary: 'Summary', detail: 'Detail', open: 'Unpaid bills' },
    documentPath: (id) => `/bills/${id}`,
    balanceSheetAccountLabel: 'Accounts payable on the Balance Sheet',
  },
};

/**
 * Where a customer/vendor name links to. Vendors link by id. A customer is an
 * invoice's AccountServices, so it links to the Client that owns it, when known.
 */
export function partyPathFor(
  side: AgingSide,
  partyId: string,
  clientIdsByAccountServices?: Record<string, string>
): string | null {
  if (!partyId) return null;
  if (side === 'payables') return `/vendors/${partyId}`;
  const clientId = clientIdsByAccountServices?.[partyId];
  return clientId ? `/clients/${clientId}` : null;
}
