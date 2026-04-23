/**
 * Report Schedule API endpoints for SoupFinance
 * Maps to soupmarkets-web /rest/reportSchedule/* endpoints
 *
 * Added: CRUD operations for scheduled report configuration,
 * status toggling (pause/resume), and execution history tracking
 *
 * @see grails-app/domain/soupbroker/finance/ReportSchedule.groovy
 * @see grails-app/controllers/soupbroker/finance/ReportScheduleController.groovy
 */
import apiClient, { toFormData, toQueryString, getCsrfToken, getCsrfTokenForEdit, csrfQueryString } from '../client';

// =============================================================================
// Types
// =============================================================================

export type ReportType =
  | 'TRIAL_BALANCE'
  | 'INCOME_STATEMENT'
  | 'BALANCE_SHEET'
  | 'CASH_FLOW'
  | 'ACCOUNT_BALANCES'
  | 'ACCOUNT_TRANSACTIONS'
  | 'AR_AGING'
  | 'AP_AGING';

export type ScheduleFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type DateRangeType =
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'LAST_MONTH'
  | 'LAST_QUARTER'
  | 'LAST_YEAR'
  | 'YEAR_TO_DATE';

export type ScheduleStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export type ExportFormat = 'PDF' | 'XLSX' | 'CSV';
export type ExecutionStatus = 'SUCCESS' | 'FAILED';

/**
 * Report schedule domain response from backend
 */
export interface ReportSchedule {
  id: string;
  name: string;
  reportType: ReportType;
  frequency: ScheduleFrequency;
  recipients: string;
  dateRangeType: DateRangeType;
  exportFormat: ExportFormat;
  emailSubject?: string;
  emailMessage?: string;
  status: ScheduleStatus;
  lastExecutedAt?: string;
  nextExecutionAt?: string;
  lastExecutionStatus?: ExecutionStatus;
  dateCreated: string;
  lastUpdated: string;
  archived: boolean;
  quickReference?: string;
  serialised?: string;
  totalCount?: number;
}

/**
 * Report schedule execution history entry
 */
export interface ReportScheduleHistory {
  id: string;
  reportSchedule: { id: string; serialised?: string; quickReference?: string };
  reportType: ReportType;
  status: ExecutionStatus;
  exportFormat: ExportFormat;
  recipients: string;
  errorMessage?: string;
  reportFromDate?: string;
  reportToDate?: string;
  executedAt: string;
  dateCreated: string;
  lastUpdated: string;
  archived: boolean;
  serialised?: string;
  totalCount?: number;
}

/**
 * Request payload for creating/updating a schedule
 */
export interface SaveScheduleRequest {
  name: string;
  reportType: ReportType;
  frequency: ScheduleFrequency;
  recipients: string;
  dateRangeType: DateRangeType;
  exportFormat?: ExportFormat;
  emailSubject?: string;
  emailMessage?: string;
}

export interface UpdateScheduleRequest extends SaveScheduleRequest {
  id: string;
  version?: number;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * List all report schedules
 * GET /rest/reportSchedule/index.json
 */
export async function getSchedules(params?: {
  max?: number;
  offset?: number;
  sort?: string;
  order?: string;
  status?: ScheduleStatus;
  reportType?: ReportType;
}): Promise<ReportSchedule[]> {
  const query = params ? toQueryString(params as Record<string, unknown>) : '';
  const url = query ? `/reportSchedule/index.json?${query}` : '/reportSchedule/index.json';
  const response = await apiClient.get<ReportSchedule[]>(url);
  return response.data;
}

/**
 * Get a single report schedule
 * GET /rest/reportSchedule/show/{id}.json
 */
export async function getSchedule(id: string): Promise<ReportSchedule> {
  const response = await apiClient.get<ReportSchedule>(`/reportSchedule/show/${id}.json`);
  return response.data;
}

/**
 * Create a new report schedule
 * POST /rest/reportSchedule/save.json
 */
export async function createSchedule(data: SaveScheduleRequest): Promise<ReportSchedule> {
  const csrf = await getCsrfToken('reportSchedule');
  const formData = toFormData(data as unknown as Record<string, unknown>);
  const response = await apiClient.post<ReportSchedule>(
    `/reportSchedule/save.json?${csrfQueryString(csrf)}`,
    formData,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data;
}

/**
 * Update an existing report schedule
 * PUT /rest/reportSchedule/update/{id}.json
 */
export async function updateSchedule(data: UpdateScheduleRequest): Promise<ReportSchedule> {
  const csrf = await getCsrfTokenForEdit('reportSchedule', data.id);
  const formData = toFormData(data as unknown as Record<string, unknown>);
  const response = await apiClient.put<ReportSchedule>(
    `/reportSchedule/update/${data.id}.json?${csrfQueryString(csrf)}`,
    formData,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data;
}

/**
 * Toggle schedule status between ACTIVE and PAUSED
 * POST /rest/reportSchedule/toggleStatus/{id}.json
 */
export async function toggleScheduleStatus(id: string): Promise<ReportSchedule> {
  const csrf = await getCsrfTokenForEdit('reportSchedule', id);
  const response = await apiClient.post<ReportSchedule>(
    `/reportSchedule/toggleStatus/${id}.json?${csrfQueryString(csrf)}`
  );
  return response.data;
}

/**
 * Delete a report schedule
 * DELETE /rest/reportSchedule/delete/{id}.json
 */
export async function deleteSchedule(id: string): Promise<void> {
  await apiClient.delete(`/reportSchedule/delete/${id}.json`);
}

/**
 * Get execution history for a schedule
 * GET /rest/reportSchedule/history/{id}.json
 */
export async function getScheduleHistory(
  scheduleId: string,
  params?: { max?: number; offset?: number }
): Promise<ReportScheduleHistory[]> {
  const query = params ? toQueryString(params as Record<string, unknown>) : '';
  const url = query
    ? `/reportSchedule/history/${scheduleId}.json?${query}`
    : `/reportSchedule/history/${scheduleId}.json`;
  const response = await apiClient.get<ReportScheduleHistory[]>(url);
  return response.data;
}

/**
 * Get all execution history entries
 * GET /rest/reportScheduleHistory/index.json
 */
export async function getAllHistory(params?: {
  max?: number;
  offset?: number;
  sort?: string;
  order?: string;
  status?: ExecutionStatus;
}): Promise<ReportScheduleHistory[]> {
  const query = params ? toQueryString(params as Record<string, unknown>) : '';
  const url = query
    ? `/reportScheduleHistory/index.json?${query}`
    : '/reportScheduleHistory/index.json';
  const response = await apiClient.get<ReportScheduleHistory[]>(url);
  return response.data;
}

// =============================================================================
// Helpers
// =============================================================================

/** Human-readable labels for report types */
export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  TRIAL_BALANCE: 'Trial Balance',
  INCOME_STATEMENT: 'Income Statement',
  BALANCE_SHEET: 'Balance Sheet',
  CASH_FLOW: 'Cash Flow',
  ACCOUNT_BALANCES: 'Account Balances',
  ACCOUNT_TRANSACTIONS: 'Account Transactions',
  AR_AGING: 'A/R Aging',
  AP_AGING: 'A/P Aging',
};

/** Human-readable labels for frequencies */
export const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
};

/** Human-readable labels for date range types */
export const DATE_RANGE_LABELS: Record<DateRangeType, string> = {
  LAST_7_DAYS: 'Last 7 Days',
  LAST_30_DAYS: 'Last 30 Days',
  LAST_MONTH: 'Last Month',
  LAST_QUARTER: 'Last Quarter',
  LAST_YEAR: 'Last Year',
  YEAR_TO_DATE: 'Year to Date',
};
