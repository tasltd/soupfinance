/**
 * Added (SOUPFIN-158): Financial years, the period lock date and opening balances.
 *
 * `FinancialYear` mirrors soupbroker.finance.FinancialYear (name, fromDate,
 * toDate, notes, archived, account). The status fields below it (status,
 * closedAt, closedBy, closingTransactionGroup) are added by the backend plan in
 * plans/soupfin-158-period-end-backend.md. Until that ships the backend omits
 * them, and an absent status means OPEN — see financialYearStatus().
 */

/** Grails FK reference: always an id, plus the serialised/class pair Grails adds. */
export interface DomainRef {
  id: string;
  serialised?: string;
  class?: string;
}

export type FinancialYearStatus = 'OPEN' | 'CLOSED';

export interface FinancialYear {
  id: string;
  /** e.g. "FY 2025" */
  name: string;
  /** First day of the year, inclusive. Grails may send a full ISO timestamp. */
  fromDate: string;
  /** Last day of the year, inclusive. */
  toDate: string;
  notes?: string | null;
  archived?: boolean;
  account?: DomainRef;
  dateCreated?: string;
  serialised?: string;
  class?: string;
  // ---- Planned by the SOUPFIN-158 backend plan ----
  status?: FinancialYearStatus;
  closedAt?: string | null;
  /** Username of whoever closed the year. */
  closedBy?: string | null;
  /** The year-end entry that moved profit and loss into Retained Earnings. */
  closingTransactionGroup?: DomainRef | null;
}

/** Fields the create form sends to /rest/financialYear/save.json. */
export interface FinancialYearFormData {
  name: string;
  fromDate: string;
  toDate: string;
  notes?: string;
}

/**
 * GET /rest/financialYear/closeChecklist/{id}.json (planned).
 * Everything the user must see before closing a year.
 */
export interface FinancialYearCloseChecklist {
  /** Drafts and unapproved entries dated inside the year. 0 means none. */
  pendingEntries: number;
  pendingEntriesDetail?: {
    draftInvoices?: number;
    draftBills?: number;
    pendingVouchers?: number;
    unpostedJournalEntries?: number;
  };
  /** Trial balance for the year's date range. */
  trialBalance: {
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  };
  /** Revenue minus expenses for the year; the closing entry moves this. */
  netIncome: number;
  /** Where the closing entry posts. Null when the chart has no Retained Earnings account. */
  retainedEarningsAccount?: { id: string; name: string } | null;
}

/** One row of the opening-balances grid, as sent to the backend. */
export interface OpeningBalanceLine {
  ledgerAccount: { id: string };
  debit: number;
  credit: number;
}

/** POST /rest/financialYear/openingBalances.json (planned). */
export interface OpeningBalancesRequest {
  /** The balances are as of the end of this day. */
  asOfDate: string;
  lines: OpeningBalanceLine[];
}

export interface OpeningBalancesResponse {
  ledgerTransactionGroup?: DomainRef;
  asOfDate: string;
  lineCount: number;
  totalDebit: number;
  totalCredit: number;
}

/** A year with no status field is open: the backend has not shipped close yet. */
export function financialYearStatus(year: Pick<FinancialYear, 'status'>): FinancialYearStatus {
  return year.status === 'CLOSED' ? 'CLOSED' : 'OPEN';
}
