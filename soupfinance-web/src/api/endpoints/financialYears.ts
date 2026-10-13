/**
 * Added (SOUPFIN-158): Financial years, the lock date and opening balances.
 *
 * `index`, `create` and `save` exist on FinancialYearController today. The rest
 * (closeChecklist, close, reopen, lockDate, openingBalances) are specified in
 * plans/soupfin-158-period-end-backend.md and answer 404 until it ships; the
 * pages surface that failure rather than hiding it.
 *
 * FinancialYearController sits behind FinanceModuleInterceptor, so a 403 here can
 * mean "Finance module not enabled" — parseApiError() reads the body to tell.
 */
import apiClient, { getCsrfToken, csrfQueryString, normalizeToArray } from '../client';
import { sanitizeDateInputValue } from '../../utils/date';
import type {
  FinancialYear,
  FinancialYearCloseChecklist,
  FinancialYearFormData,
  OpeningBalancesRequest,
  OpeningBalancesResponse,
} from '../../types/financialYear';

/**
 * Coerce a Grails date ("2025-12-31T00:00:00Z") to the YYYY-MM-DD the pages
 * compare and display. An unusable value stays as sent so a bad row is visible.
 */
function normalizeYear(raw: FinancialYear): FinancialYear {
  return {
    ...raw,
    fromDate: sanitizeDateInputValue(raw.fromDate) || raw.fromDate,
    toDate: sanitizeDateInputValue(raw.toDate) || raw.toDate,
  };
}

/**
 * GET /rest/financialYear/index.json
 * `max` is explicit: without it Grails returns the 10 newest rows only.
 * Newest year first.
 */
export async function listFinancialYears(): Promise<FinancialYear[]> {
  const response = await apiClient.get<FinancialYear[]>(
    '/financialYear/index.json?max=100&sort=fromDate&order=desc'
  );
  return normalizeToArray<FinancialYear>(response.data).map(normalizeYear);
}

/** POST /rest/financialYear/save.json (CSRF token from create.json first). */
export async function createFinancialYear(data: FinancialYearFormData): Promise<FinancialYear> {
  const csrf = await getCsrfToken('financialYear');
  const response = await apiClient.post<FinancialYear>(
    `/financialYear/save.json?${csrfQueryString(csrf)}`,
    {
      name: data.name.trim(),
      fromDate: data.fromDate,
      toDate: data.toDate,
      ...(data.notes?.trim() && { notes: data.notes.trim() }),
    }
  );
  return normalizeYear(response.data);
}

/** GET /rest/financialYear/closeChecklist/{id}.json (planned). */
export async function getCloseChecklist(id: string): Promise<FinancialYearCloseChecklist> {
  const response = await apiClient.get<FinancialYearCloseChecklist>(
    `/financialYear/closeChecklist/${id}.json`
  );
  const data = response.data;
  return {
    ...data,
    pendingEntries: Number(data.pendingEntries) || 0,
    netIncome: Number(data.netIncome) || 0,
    trialBalance: {
      totalDebit: Number(data.trialBalance?.totalDebit) || 0,
      totalCredit: Number(data.trialBalance?.totalCredit) || 0,
      balanced: data.trialBalance?.balanced === true,
    },
  };
}

/**
 * POST /rest/financialYear/close/{id}.json (planned).
 * The backend posts the closing entry (P&L to Retained Earnings), marks the year
 * CLOSED and moves the lock date to the year's last day.
 */
export async function closeFinancialYear(id: string): Promise<FinancialYear> {
  const response = await apiClient.post<FinancialYear>(`/financialYear/close/${id}.json`, {});
  return normalizeYear(response.data);
}

/** POST /rest/financialYear/reopen/{id}.json (planned, ROLE_ADMIN only). */
export async function reopenFinancialYear(id: string): Promise<FinancialYear> {
  const response = await apiClient.post<FinancialYear>(`/financialYear/reopen/${id}.json`, {});
  return normalizeYear(response.data);
}

/** GET /rest/financialYear/lockDate.json (planned) → YYYY-MM-DD or null when unlocked. */
export async function getLockDate(): Promise<string | null> {
  const response = await apiClient.get<{ lockDate?: string | null }>('/financialYear/lockDate.json');
  return sanitizeDateInputValue(response.data?.lockDate) || null;
}

/**
 * PUT /rest/financialYear/lockDate.json (planned, ROLE_ADMIN only).
 * Pass null to remove the lock. Returns the lock date the backend stored.
 */
export async function setLockDate(lockDate: string | null): Promise<string | null> {
  const response = await apiClient.put<{ lockDate?: string | null }>('/financialYear/lockDate.json', {
    lockDate,
  });
  return sanitizeDateInputValue(response.data?.lockDate) || null;
}

/**
 * POST /rest/financialYear/openingBalances.json (planned).
 * Rows with neither a debit nor a credit are dropped here; the caller has
 * already checked that what remains balances.
 */
export async function postOpeningBalances(request: OpeningBalancesRequest): Promise<OpeningBalancesResponse> {
  const lines = request.lines.filter((line) => line.debit > 0 || line.credit > 0);
  const response = await apiClient.post<OpeningBalancesResponse>('/financialYear/openingBalances.json', {
    asOfDate: request.asOfDate,
    lines,
  });
  return response.data;
}
