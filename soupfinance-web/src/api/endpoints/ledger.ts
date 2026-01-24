/**
 * General Ledger API endpoints
 * Maps to soupmarkets-web /rest/ledgerAccount/*, /rest/ledgerTransaction/*, and /rest/voucher/* endpoints
 *
 * Added: Voucher support for payment/receipt workflows
 * Added: LedgerTransactionGroup support for balanced journal entries
 * Added: Journal entry creation with multiple line items
 */
import apiClient, { toFormData, toQueryString } from '../client';
import type {
  LedgerAccount,
  LedgerTransaction,
  LedgerTransactionGroup,
  Voucher,
  CreateVoucherRequest,
  CreateJournalEntryRequest,
  ListParams,
  LedgerGroup,
  VoucherType,
} from '../../types';

// =============================================================================
// Ledger Accounts (Chart of Accounts)
// =============================================================================

/**
 * List all ledger accounts
 * GET /rest/ledgerAccount/index.json
 */
export async function listLedgerAccounts(params?: ListParams): Promise<LedgerAccount[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<LedgerAccount[]>(`/ledgerAccount/index.json${query}`);
  return response.data;
}

/**
 * List ledger accounts by group (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE)
 * GET /rest/ledgerAccount/index.json?ledgerGroup=:group
 */
export async function listLedgerAccountsByGroup(group: LedgerGroup): Promise<LedgerAccount[]> {
  const response = await apiClient.get<LedgerAccount[]>(
    `/ledgerAccount/index.json?ledgerGroup=${group}`
  );
  return response.data;
}

/**
 * Get single ledger account by ID
 * GET /rest/ledgerAccount/show/:id.json
 */
export async function getLedgerAccount(id: string): Promise<LedgerAccount> {
  const response = await apiClient.get<LedgerAccount>(`/ledgerAccount/show/${id}.json`);
  return response.data;
}

/**
 * Create new ledger account
 * POST /rest/ledgerAccount/save.json
 */
export async function createLedgerAccount(data: Partial<LedgerAccount>): Promise<LedgerAccount> {
  const formData = toFormData(data as Record<string, unknown>);
  const response = await apiClient.post<LedgerAccount>('/ledgerAccount/save.json', formData);
  return response.data;
}

/**
 * Update existing ledger account
 * PUT /rest/ledgerAccount/update/:id.json
 */
export async function updateLedgerAccount(id: string, data: Partial<LedgerAccount>): Promise<LedgerAccount> {
  const formData = toFormData({ ...data, id } as Record<string, unknown>);
  const response = await apiClient.put<LedgerAccount>(`/ledgerAccount/update/${id}.json`, formData);
  return response.data;
}

/**
 * Delete ledger account (soft delete)
 * DELETE /rest/ledgerAccount/delete/:id.json
 */
export async function deleteLedgerAccount(id: string): Promise<void> {
  await apiClient.delete(`/ledgerAccount/delete/${id}.json`);
}

// =============================================================================
// Ledger Transactions
// =============================================================================

/**
 * List ledger transactions with pagination
 * GET /rest/ledgerTransaction/index.json
 */
export async function listLedgerTransactions(params?: ListParams & {
  startDate?: string;
  endDate?: string;
  accountId?: string;
}): Promise<LedgerTransaction[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<LedgerTransaction[]>(`/ledgerTransaction/index.json${query}`);
  return response.data;
}

/**
 * Get single ledger transaction by ID
 * GET /rest/ledgerTransaction/show/:id.json
 */
export async function getLedgerTransaction(id: string): Promise<LedgerTransaction> {
  const response = await apiClient.get<LedgerTransaction>(`/ledgerTransaction/show/${id}.json`);
  return response.data;
}

/**
 * Create new ledger transaction (journal entry)
 * POST /rest/ledgerTransaction/save.json
 */
export async function createLedgerTransaction(data: Partial<LedgerTransaction>): Promise<LedgerTransaction> {
  const formData = toFormData(data as Record<string, unknown>);
  const response = await apiClient.post<LedgerTransaction>('/ledgerTransaction/save.json', formData);
  return response.data;
}

/**
 * Post a pending transaction
 * POST /rest/ledgerTransaction/post/:id.json
 */
export async function postLedgerTransaction(id: string): Promise<LedgerTransaction> {
  const response = await apiClient.post<LedgerTransaction>(`/ledgerTransaction/post/${id}.json`);
  return response.data;
}

/**
 * Reverse a posted transaction
 * POST /rest/ledgerTransaction/reverse/:id.json
 */
export async function reverseLedgerTransaction(id: string): Promise<LedgerTransaction> {
  const response = await apiClient.post<LedgerTransaction>(`/ledgerTransaction/reverse/${id}.json`);
  return response.data;
}

/**
 * Delete ledger transaction (only pending)
 * DELETE /rest/ledgerTransaction/delete/:id.json
 */
export async function deleteLedgerTransaction(id: string): Promise<void> {
  await apiClient.delete(`/ledgerTransaction/delete/${id}.json`);
}

// =============================================================================
// Account Balances & Reports
// =============================================================================

/**
 * Get account balance as of a specific date
 * GET /rest/ledgerAccount/balance/:id.json?asOf=:date
 */
export async function getAccountBalance(accountId: string, asOf?: string): Promise<{ balance: number }> {
  const query = asOf ? `?asOf=${asOf}` : '';
  const response = await apiClient.get<{ balance: number }>(`/ledgerAccount/balance/${accountId}.json${query}`);
  return response.data;
}

/**
 * Get trial balance from ledger accounts
 * GET /rest/ledgerAccount/trialBalance.json?asOf=:date
 *
 * Changed: Renamed from getTrialBalance to avoid conflict with reports.ts version
 * Note: Use reports.getTrialBalance for the full finance reports version
 */
export async function getLedgerTrialBalance(asOf?: string): Promise<{
  accounts: Array<{
    account: LedgerAccount;
    debit: number;
    credit: number;
  }>;
  totalDebits: number;
  totalCredits: number;
}> {
  const query = asOf ? `?asOf=${asOf}` : '';
  const response = await apiClient.get(`/ledgerAccount/trialBalance.json${query}`);
  return response.data;
}

// =============================================================================
// Added: Vouchers (Payment/Receipt/Deposit)
// =============================================================================

/**
 * List vouchers with optional filters
 * GET /rest/voucher/index.json
 */
export async function listVouchers(params?: ListParams & {
  voucherType?: VoucherType;
  startDate?: string;
  endDate?: string;
  status?: string;
}): Promise<Voucher[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<Voucher[]>(`/voucher/index.json${query}`);
  return response.data;
}

/**
 * Get single voucher by ID
 * GET /rest/voucher/show/:id.json
 */
export async function getVoucher(id: string): Promise<Voucher> {
  const response = await apiClient.get<Voucher>(`/voucher/show/${id}.json`);
  return response.data;
}

/**
 * Create new voucher (payment, receipt, or deposit)
 * POST /rest/voucher/save.json
 *
 * Note: Voucher and underlying LedgerTransaction share the same ID.
 * The backend creates both atomically using a foreign key generator.
 */
export async function createVoucher(data: CreateVoucherRequest): Promise<Voucher> {
  // Added: Transform request to Grails-compatible FormData with nested field names
  const formDataObj: Record<string, unknown> = {
    voucherType: data.voucherType,
    voucherTo: data.voucherTo,
    voucherDate: data.voucherDate,
    amount: data.amount,
    description: data.description,
    reference: data.reference,
    beneficiaryName: data.beneficiaryName,
  };

  // Added: FK references use dot notation for Grails data binding
  if (data.clientId) formDataObj['client.id'] = data.clientId;
  if (data.vendorId) formDataObj['vendor.id'] = data.vendorId;
  if (data.staffId) formDataObj['staff.id'] = data.staffId;
  if (data.cashAccountId) formDataObj['cashAccount.id'] = data.cashAccountId;
  if (data.expenseAccountId) formDataObj['expenseAccount.id'] = data.expenseAccountId;
  if (data.incomeAccountId) formDataObj['incomeAccount.id'] = data.incomeAccountId;

  const formData = toFormData(formDataObj);
  const response = await apiClient.post<Voucher>('/voucher/save.json', formData);
  return response.data;
}

/**
 * Update existing voucher
 * PUT /rest/voucher/update/:id.json
 */
export async function updateVoucher(id: string, data: Partial<CreateVoucherRequest>): Promise<Voucher> {
  const formDataObj: Record<string, unknown> = { id, ...data };

  // Added: FK references use dot notation
  if (data.clientId) {
    formDataObj['client.id'] = data.clientId;
    delete formDataObj.clientId;
  }
  if (data.vendorId) {
    formDataObj['vendor.id'] = data.vendorId;
    delete formDataObj.vendorId;
  }
  if (data.cashAccountId) {
    formDataObj['cashAccount.id'] = data.cashAccountId;
    delete formDataObj.cashAccountId;
  }
  if (data.expenseAccountId) {
    formDataObj['expenseAccount.id'] = data.expenseAccountId;
    delete formDataObj.expenseAccountId;
  }

  const formData = toFormData(formDataObj);
  const response = await apiClient.put<Voucher>(`/voucher/update/${id}.json`, formData);
  return response.data;
}

/**
 * Approve a pending voucher
 * POST /rest/voucher/approve/:id.json
 */
export async function approveVoucher(id: string): Promise<Voucher> {
  const response = await apiClient.post<Voucher>(`/voucher/approve/${id}.json`);
  return response.data;
}

/**
 * Post an approved voucher to ledger
 * POST /rest/voucher/post/:id.json
 */
export async function postVoucher(id: string): Promise<Voucher> {
  const response = await apiClient.post<Voucher>(`/voucher/post/${id}.json`);
  return response.data;
}

/**
 * Cancel a voucher
 * POST /rest/voucher/cancel/:id.json
 */
export async function cancelVoucher(id: string): Promise<Voucher> {
  const response = await apiClient.post<Voucher>(`/voucher/cancel/${id}.json`);
  return response.data;
}

/**
 * Delete voucher (only pending)
 * DELETE /rest/voucher/delete/:id.json
 */
export async function deleteVoucher(id: string): Promise<void> {
  await apiClient.delete(`/voucher/delete/${id}.json`);
}

// =============================================================================
// Added: Ledger Transaction Groups (Multi-line Journal Entries)
// =============================================================================

/**
 * List transaction groups
 * GET /rest/ledgerTransactionGroup/index.json
 */
export async function listTransactionGroups(params?: ListParams & {
  startDate?: string;
  endDate?: string;
  status?: string;
}): Promise<LedgerTransactionGroup[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<LedgerTransactionGroup[]>(`/ledgerTransactionGroup/index.json${query}`);
  return response.data;
}

/**
 * Get single transaction group by ID
 * GET /rest/ledgerTransactionGroup/show/:id.json
 */
export async function getTransactionGroup(id: string): Promise<LedgerTransactionGroup> {
  const response = await apiClient.get<LedgerTransactionGroup>(`/ledgerTransactionGroup/show/${id}.json`);
  return response.data;
}

/**
 * Create new journal entry (multi-line balanced transaction)
 * POST /rest/ledgerTransaction/saveMultiple.json
 *
 * This creates a LedgerTransactionGroup with multiple LedgerTransaction entries.
 * Total debits must equal total credits for the entry to be valid.
 */
export async function createJournalEntry(data: CreateJournalEntryRequest): Promise<LedgerTransactionGroup> {
  // Added: Transform journal entry to Grails-compatible format with indexed fields
  const formDataObj: Record<string, unknown> = {
    groupDate: data.entryDate,
    description: data.description,
    reference: data.reference,
  };

  // Added: Each line item uses indexed notation for Grails list binding
  // Format: ledgerTransactionList[0].accountId, ledgerTransactionList[0].debitAmount, etc.
  data.lines.forEach((line, index) => {
    formDataObj[`ledgerTransactionList[${index}].ledgerAccount.id`] = line.accountId;
    formDataObj[`ledgerTransactionList[${index}].transactionDate`] = data.entryDate;
    formDataObj[`ledgerTransactionList[${index}].description`] = line.description || data.description;

    // Added: For double-entry, we use SINGLE_ENTRY mode where each line has either debit or credit
    if (line.debitAmount > 0) {
      formDataObj[`ledgerTransactionList[${index}].amount`] = line.debitAmount;
      formDataObj[`ledgerTransactionList[${index}].transactionState`] = 'DEBIT';
    } else {
      formDataObj[`ledgerTransactionList[${index}].amount`] = line.creditAmount;
      formDataObj[`ledgerTransactionList[${index}].transactionState`] = 'CREDIT';
    }
    formDataObj[`ledgerTransactionList[${index}].journalEntryType`] = 'SINGLE_ENTRY';
  });

  const formData = toFormData(formDataObj);
  const response = await apiClient.post<LedgerTransactionGroup>('/ledgerTransaction/saveMultiple.json', formData);
  return response.data;
}

/**
 * Post a pending transaction group to ledger
 * POST /rest/ledgerTransactionGroup/post/:id.json
 */
export async function postTransactionGroup(id: string): Promise<LedgerTransactionGroup> {
  const response = await apiClient.post<LedgerTransactionGroup>(`/ledgerTransactionGroup/post/${id}.json`);
  return response.data;
}

/**
 * Reverse a posted transaction group
 * POST /rest/ledgerTransactionGroup/reverse/:id.json
 */
export async function reverseTransactionGroup(id: string): Promise<LedgerTransactionGroup> {
  const response = await apiClient.post<LedgerTransactionGroup>(`/ledgerTransactionGroup/reverse/${id}.json`);
  return response.data;
}

/**
 * Delete transaction group (only pending)
 * DELETE /rest/ledgerTransactionGroup/delete/:id.json
 */
export async function deleteTransactionGroup(id: string): Promise<void> {
  await apiClient.delete(`/ledgerTransactionGroup/delete/${id}.json`);
}

// =============================================================================
// Added: Account Transaction History
// =============================================================================

/**
 * Get ledger transactions for a specific account
 * GET /rest/ledgerTransaction/byAccount/:accountId.json
 *
 * Note: Named differently from reports.getAccountTransactions to avoid export conflict
 */
export async function getLedgerTransactionsByAccount(accountId: string, params?: ListParams & {
  startDate?: string;
  endDate?: string;
}): Promise<LedgerTransaction[]> {
  const query = params ? `?${toQueryString(params)}` : '';
  const response = await apiClient.get<LedgerTransaction[]>(`/ledgerTransaction/byAccount/${accountId}.json${query}`);
  return response.data;
}
