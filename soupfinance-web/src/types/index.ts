/**
 * TypeScript type definitions for SoupFinance
 * Based on soupmarkets-web Grails domain classes
 */

// Base entity with common fields (mirrors SbDomain)
export interface BaseEntity {
  id: string; // UUID string
  archived?: boolean;
  dateCreated?: string;
  lastUpdated?: string;
  tenantId?: string;
}

// Pagination response wrapper
export interface PaginatedResponse<T> {
  content: T[];
  totalElements: number;
  page: number;
  size: number;
  totalPages: number;
}

// List params for paginated endpoints
export interface ListParams {
  max?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  [key: string]: unknown;
}

// =============================================================================
// Corporate KYC Types
// =============================================================================

export type BusinessCategory =
  | 'LIMITED_LIABILITY'
  | 'PARTNERSHIP'
  | 'SOLE_PROPRIETORSHIP'
  | 'PUBLIC_LIMITED'
  | 'NON_PROFIT';

export interface Corporate extends BaseEntity {
  name: string;
  certificateOfIncorporationNumber: string;
  registrationDate: string;
  businessCategory: BusinessCategory;
  taxIdentificationNumber?: string;
  email: string;
  phoneNumber: string;
  address?: string;
  kycStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface CorporateAccountPerson extends BaseEntity {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: 'DIRECTOR' | 'SIGNATORY' | 'BENEFICIAL_OWNER';
  corporate: { id: string };
}

export interface CorporateDocuments extends BaseEntity {
  documentType: 'CERTIFICATE_OF_INCORPORATION' | 'BOARD_RESOLUTION' | 'MEMORANDUM' | 'PROOF_OF_ADDRESS';
  fileName: string;
  fileUrl: string;
  corporate: { id: string };
}

// =============================================================================
// Finance Types - Client (Invoice Recipients)
// =============================================================================

// Added: Client type for invoice recipients
export interface Client extends BaseEntity {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  taxNumber?: string;
  notes?: string;
}

// =============================================================================
// Finance Types - Invoice
// =============================================================================

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface Invoice extends BaseEntity {
  invoiceNumber: string;
  client: { id: string; name?: string };
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  notes?: string;
  terms?: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem extends BaseEntity {
  invoice: { id: string };
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent: number;
  amount: number;
}

export interface InvoicePayment extends BaseEntity {
  invoice: { id: string };
  amount: number;
  paymentDate: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';
  reference?: string;
  notes?: string;
}

// =============================================================================
// Finance Types - Bill (Expenses)
// =============================================================================

export type BillStatus = 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface Bill extends BaseEntity {
  billNumber: string;
  vendor: { id: string; name?: string };
  issueDate: string;
  dueDate: string;
  status: BillStatus;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  notes?: string;
  items?: BillItem[];
}

export interface BillItem extends BaseEntity {
  bill: { id: string };
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
}

export interface BillPayment extends BaseEntity {
  bill: { id: string };
  amount: number;
  paymentDate: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';
  reference?: string;
  notes?: string;
}

// =============================================================================
// Finance Types - Ledger & Accounting Transactions
// =============================================================================

// Added: Ledger group classification for chart of accounts
// Changed: Added 'REVENUE' for backend compatibility (backend uses both INCOME and REVENUE)
export type LedgerGroup = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'REVENUE';

// Added: Journal entry modes - DOUBLE_ENTRY uses debit/credit accounts, SINGLE_ENTRY uses one account with direction
export type JournalEntryType = 'DOUBLE_ENTRY' | 'SINGLE_ENTRY';

// Added: Transaction direction for SINGLE_ENTRY mode
export type LedgerState = 'DEBIT' | 'CREDIT';

// Added: Voucher types for payment/receipt classification
export type VoucherType = 'PAYMENT' | 'DEPOSIT' | 'RECEIPT';

// Added: Voucher beneficiary types
export type VoucherTo = 'CLIENT' | 'VENDOR' | 'STAFF' | 'OTHER';

// Added: Ledger account category interface
export interface LedgerAccountCategory extends BaseEntity {
  name: string;
  code: string;
  ledgerGroup: LedgerGroup;
  description?: string;
}

export interface LedgerAccount extends BaseEntity {
  code: string;
  name: string;
  number?: string; // Added: account number for reporting
  description?: string;
  ledgerGroup: LedgerGroup;
  ledgerAccountCategory?: { id: string; name?: string }; // Added: category reference
  parentAccount?: { id: string; name?: string };
  isActive: boolean;
  balance: number;
}

// Added: Enhanced LedgerTransaction with full soupmarkets finance module support
export interface LedgerTransaction extends BaseEntity {
  transactionNumber: string;
  transactionDate: string;
  description: string;
  amount: number;
  reference?: string;
  status: 'PENDING' | 'POSTED' | 'REVERSED';

  // Double-entry mode fields
  debitLedgerAccount?: { id: string; name?: string; code?: string };
  creditLedgerAccount?: { id: string; name?: string; code?: string };

  // Single-entry mode fields
  ledgerAccount?: { id: string; name?: string; code?: string };
  transactionState?: LedgerState;

  // Journal entry type determines which fields are used
  journalEntryType: JournalEntryType;

  // Group reference for balanced entries
  ledgerTransactionGroup?: { id: string };

  // Legacy aliases for backwards compatibility
  debitAccount?: { id: string; name?: string };
  creditAccount?: { id: string; name?: string };
}

// Added: Transaction group for balanced multi-line journal entries
export interface LedgerTransactionGroup extends BaseEntity {
  description: string;
  groupDate: string;
  balanced: boolean;
  totalDebit: number;
  totalCredit: number;
  ledgerTransactionList: LedgerTransaction[];
  status: 'PENDING' | 'POSTED' | 'REVERSED';
  reference?: string; // Added: Optional reference for the transaction group
}

// Added: Voucher interface - wraps LedgerTransaction for payment/receipt flows
export interface Voucher extends BaseEntity {
  voucherNumber: string;
  voucherType: VoucherType;
  voucherTo: VoucherTo;
  voucherDate: string;

  // Beneficiary info
  beneficiaryName?: string;
  beneficiaryReference?: string;

  // Links to parties
  client?: { id: string; name?: string };
  vendor?: { id: string; name?: string };
  staff?: { id: string; name?: string };

  // Financial details (delegated from underlying ledgerTransaction)
  amount: number;
  description: string;
  reference?: string;

  // Bank/cash account for the payment/receipt
  // Changed: Added code for account lookups in transaction register
  cashAccount?: { id: string; name?: string; code?: string };

  // Expense/income account
  // Changed: Added code for account lookups in transaction register
  expenseAccount?: { id: string; name?: string; code?: string };
  incomeAccount?: { id: string; name?: string; code?: string }; // Added: For receipt vouchers

  // Underlying ledger transaction (shares same ID)
  ledgerTransaction?: LedgerTransaction;

  status: 'PENDING' | 'APPROVED' | 'POSTED' | 'CANCELLED';
}

// Added: Journal entry line item for UI forms
export interface JournalEntryLine {
  id?: string;
  accountId: string;
  accountName?: string;
  accountCode?: string;
  debitAmount: number;
  creditAmount: number;
  description?: string;
}

// Added: Journal entry for UI - grouped transaction with line items
export interface JournalEntry {
  id?: string;
  entryNumber?: string;
  entryDate: string;
  description: string;
  reference?: string;
  lines: JournalEntryLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  status: 'DRAFT' | 'PENDING' | 'POSTED' | 'REVERSED';
}

// Added: Create voucher request payload
export interface CreateVoucherRequest {
  voucherType: VoucherType;
  voucherTo: VoucherTo;
  voucherDate: string;
  amount: number;
  description: string;
  reference?: string;
  beneficiaryName?: string;
  clientId?: string;
  vendorId?: string;
  staffId?: string;
  cashAccountId: string; // Bank or cash account
  expenseAccountId?: string; // For payment vouchers
  incomeAccountId?: string; // For receipt vouchers
}

// Added: Create journal entry request payload (multi-line)
export interface CreateJournalEntryRequest {
  entryDate: string;
  description: string;
  reference?: string;
  lines: Array<{
    accountId: string;
    debitAmount: number;
    creditAmount: number;
    description?: string;
  }>;
}

// =============================================================================
// Finance Types - Vendor
// =============================================================================

export interface Vendor extends BaseEntity {
  name: string;
  email?: string;
  phoneNumber?: string;
  address?: string;
  taxIdentificationNumber?: string;
  paymentTerms?: number; // days
  notes?: string;
}

// =============================================================================
// Reports Types
// =============================================================================

export interface BalanceSheetItem {
  account: string;
  balance: number;
  children?: BalanceSheetItem[];
}

export interface BalanceSheet {
  asOf: string;
  assets: BalanceSheetItem[];
  liabilities: BalanceSheetItem[];
  equity: BalanceSheetItem[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export interface ProfitLossItem {
  account: string;
  amount: number;
  children?: ProfitLossItem[];
}

export interface ProfitLoss {
  periodStart: string;
  periodEnd: string;
  income: ProfitLossItem[];
  expenses: ProfitLossItem[];
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
}

export interface AgingItem {
  entity: { id: string; name: string };
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
}

export interface AgingReport {
  asOf: string;
  items: AgingItem[];
  totals: {
    current: number;
    days30: number;
    days60: number;
    days90: number;
    over90: number;
    total: number;
  };
}

// =============================================================================
// Added: Trial Balance Types
// =============================================================================

/**
 * Trial Balance item from backend /financeReports/trialBalance.json
 * Shows debit/credit ending balances for each account
 */
export interface TrialBalanceItem {
  id: string;
  name: string;
  currency: string;
  ledgerGroup: LedgerGroup;
  endingDebit: number;
  endingCredit: number;
}

/**
 * Trial Balance report structure grouped by ledger group
 * Changed: Uses Record type to support all LedgerGroup values
 */
export interface TrialBalance {
  asOf: string;
  accounts: Record<'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE', TrialBalanceItem[]>;
  totalDebit: number;
  totalCredit: number;
}

// =============================================================================
// Added: Cash Flow Statement Types
// =============================================================================

/**
 * Single cash flow activity line item
 */
export interface CashFlowActivity {
  description: string;
  amount: number;
}

/**
 * Cash Flow Statement report structure
 * Shows operating, investing, and financing activities
 */
export interface CashFlowStatement {
  periodStart: string;
  periodEnd: string;
  operatingActivities: CashFlowActivity[];
  totalOperatingCashFlow: number;
  investingActivities: CashFlowActivity[];
  totalInvestingCashFlow: number;
  financingActivities: CashFlowActivity[];
  totalFinancingCashFlow: number;
  netCashFlow: number;
  beginningCashBalance: number;
  endingCashBalance: number;
}

// =============================================================================
// Added: Backend Report Response Types (for API transformation)
// =============================================================================

/**
 * Backend account balance entry from /financeReports/accountBalances
 */
export interface BackendAccountBalance {
  id: string;
  name: string;
  nameLink?: string;
  currency: string;
  ledgerGroup: LedgerGroup;
  ledgerSubGroup?: string;
  startingBalance: number;
  calculatedDebitBalance: number;
  calculatedCreditBalance: number;
  netMovement: number;
  endingBalance: number;
}

/**
 * Backend aging report item from /financeReports/agedReceivables or agedPayables
 */
export interface BackendAgingItem {
  name: string;
  notYetOverdue: number;
  thirtyOrLess: number;
  thirtyOneToSixty: number;
  sixtyOneToNinety: number;
  ninetyOneOrMore: number;
  totalUnpaid: number;
  totalOverdue: number;
}
