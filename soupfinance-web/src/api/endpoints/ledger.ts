/**
 * General Ledger API endpoints
 * Maps to soupmarkets-web /rest/ledgerAccount/*, /rest/ledgerTransaction/*, and /rest/voucher/* endpoints
 *
 * Added: Voucher support for payment/receipt workflows
 * Added: LedgerTransactionGroup support for balanced journal entries
 * Added: Journal entry creation with multiple line items
 *
 * CSRF Token Pattern:
 * POST/PUT/DELETE operations require CSRF token from create.json or edit.json endpoint.
 * The TokenWithFormInterceptor adds SYNCHRONIZER_TOKEN and SYNCHRONIZER_URI to these responses.
 */
import apiClient, { toQueryString, getCsrfToken, getCsrfTokenForEdit } from '../client';
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
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function createLedgerAccount(data: Partial<LedgerAccount>): Promise<LedgerAccount> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('ledgerAccount');

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.post<LedgerAccount>('/ledgerAccount/save.json', {
    ...data,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  return response.data;
}

/**
 * Update existing ledger account
 * PUT /rest/ledgerAccount/update/:id.json
 *
 * CSRF Token Required: Calls edit.json first to get SYNCHRONIZER_TOKEN
 */
export async function updateLedgerAccount(id: string, data: Partial<LedgerAccount>): Promise<LedgerAccount> {
  // Step 1: Get CSRF token from edit endpoint
  const csrf = await getCsrfTokenForEdit('ledgerAccount', id);

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.put<LedgerAccount>(`/ledgerAccount/update/${id}.json`, {
    ...data,
    id,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
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
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function createLedgerTransaction(data: Partial<LedgerTransaction>): Promise<LedgerTransaction> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('ledgerTransaction');

  // Step 2: Include CSRF token in JSON body
  const response = await apiClient.post<LedgerTransaction>('/ledgerTransaction/save.json', {
    ...data,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
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
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function createVoucher(data: CreateVoucherRequest): Promise<Voucher> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('voucher');

  // Step 2: Build JSON body with nested objects for foreign keys
  const body: Record<string, unknown> = {
    voucherType: data.voucherType,
    voucherTo: data.voucherTo,
    voucherDate: data.voucherDate,
    amount: data.amount,
    description: data.description,
    reference: data.reference,
    beneficiaryName: data.beneficiaryName,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  };

  // FK references as nested objects for JSON binding
  if (data.clientId) body.client = { id: data.clientId };
  if (data.vendorId) body.vendor = { id: data.vendorId };
  if (data.staffId) body.staff = { id: data.staffId };
  if (data.cashAccountId) body.cashAccount = { id: data.cashAccountId };
  if (data.expenseAccountId) body.expenseAccount = { id: data.expenseAccountId };
  if (data.incomeAccountId) body.incomeAccount = { id: data.incomeAccountId };

  const response = await apiClient.post<Voucher>('/voucher/save.json', body);
  return response.data;
}

/**
 * Update existing voucher
 * PUT /rest/voucher/update/:id.json
 *
 * CSRF Token Required: Calls edit.json first to get SYNCHRONIZER_TOKEN
 */
export async function updateVoucher(id: string, data: Partial<CreateVoucherRequest>): Promise<Voucher> {
  // Step 1: Get CSRF token from edit endpoint
  const csrf = await getCsrfTokenForEdit('voucher', id);

  // Step 2: Build JSON body with nested objects for foreign keys
  const { clientId, vendorId, cashAccountId, expenseAccountId, ...rest } = data;
  const body: Record<string, unknown> = {
    id,
    ...rest,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  };

  // FK references as nested objects for JSON binding
  if (clientId) body.client = { id: clientId };
  if (vendorId) body.vendor = { id: vendorId };
  if (cashAccountId) body.cashAccount = { id: cashAccountId };
  if (expenseAccountId) body.expenseAccount = { id: expenseAccountId };

  const response = await apiClient.put<Voucher>(`/voucher/update/${id}.json`, body);
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
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN
 */
export async function createJournalEntry(data: CreateJournalEntryRequest): Promise<LedgerTransactionGroup> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('ledgerTransaction');

  // Step 2: Build JSON body with array of line items
  const ledgerTransactionList = data.lines.map((line) => ({
    ledgerAccount: { id: line.accountId },
    transactionDate: data.entryDate,
    description: line.description || data.description,
    amount: line.debitAmount > 0 ? line.debitAmount : line.creditAmount,
    transactionState: line.debitAmount > 0 ? 'DEBIT' : 'CREDIT',
    journalEntryType: 'SINGLE_ENTRY',
  }));

  const body = {
    groupDate: data.entryDate,
    description: data.description,
    reference: data.reference,
    ledgerTransactionList,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  };

  const response = await apiClient.post<LedgerTransactionGroup>('/ledgerTransaction/saveMultiple.json', body);
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
