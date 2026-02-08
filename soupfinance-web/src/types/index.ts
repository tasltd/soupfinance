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
// Finance Types - Account Services (Invoice Recipients)
// =============================================================================

/**
 * AccountServices - portfolio connected to a broker KYC client.
 * Used as the invoice recipient (replaces the non-existent invoiceClient domain).
 * Backend domain: soupbroker.kyc.AccountServices
 *
 * Each broker client has at least one AccountServices. Invoices are created
 * against an AccountServices (not directly against a client).
 *
 * The `serialised` field serves as the display name, e.g.:
 *   "Direct Account : Corporate(Acme Corp) | Growth Portfolio"
 */
export interface AccountServices extends BaseEntity {
  client?: { id: string; serialised?: string; class?: string };
  serialised: string;
  simpleName?: string;
  simpleNameWithoutIo?: string;
  customName?: string;
  currency?: string;
  baseCurrency?: string;
  investmentObjective?: string;
  investmentHorizon?: string;
  portfolioList?: Array<{ id: string; serialised?: string; class?: string }>;
}

// =============================================================================
// KYC Client Types (tenant's billing recipients)
// =============================================================================

/**
 * Client - the tenant's customer for billing purposes.
 * Backend domain: soupbroker.kyc.Client
 *
 * A Client holds the metadata needed to populate invoice recipient fields
 * (name, email, address, tax number). Each Client is linked to an AccountServices
 * which provides the FK reference for invoices.
 *
 * Endpoints: `/rest/client/index.json`, `/rest/client/show/:id.json`
 */
export type ClientType = 'INDIVIDUAL' | 'CORPORATE';

export interface Client extends BaseEntity {
  name: string;
  clientType: ClientType;
  email?: string;
  phone?: string;
  address?: string;
  // Individual fields (from KYC Individual)
  firstName?: string;
  lastName?: string;
  // Corporate fields (from KYC Corporate)
  companyName?: string;
  contactPerson?: string;
  registrationNumber?: string;
  taxNumber?: string;
  // Fix: Client has portfolioList (hasMany: ClientPortfolio), each with accountServices FK
  // Resolve accountServicesId via: client.portfolioList[0].accountServices.id
  portfolioList?: Array<{
    id: string;
    accountServices?: { id: string; serialised?: string; class?: string };
    serialised?: string;
    class?: string;
  }>;
  // NOTE: accountServices is NOT a direct field on Client in the backend.
  // Kept for backward compatibility but portfolioList is the correct resolution path.
  accountServices?: { id: string; serialised?: string; class?: string };
}

// =============================================================================
// Finance Types - Invoice
// =============================================================================

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

/**
 * Invoice domain model matching soupbroker.finance.Invoice.
 *
 * Backend field mapping:
 *   - number (int)         → invoice number, displayed as string
 *   - accountServices (FK) → invoice recipient (portfolio/account)
 *   - invoiceDate          → date the invoice was issued
 *   - paymentDate          → due date for payment
 *   - invoiceItemList      → line items (may be references or full objects)
 *   - invoicePaymentList   → recorded payments
 *
 * Computed fields (calculated by API transform layer from invoiceItemList):
 *   - status, subtotal, taxAmount, discountAmount, totalAmount, amountPaid, amountDue
 */
export interface Invoice extends BaseEntity {
  // Backend fields (from /rest/invoice/)
  number: number;
  numberPrefix?: string; // Added: Invoice number prefix (e.g., "INV-")
  accountServices: { id: string; serialised?: string; class?: string };
  invoiceDate: string;
  paymentDate: string;
  currency: string;
  baseCurrency?: string;
  exchangeRate?: number;
  notes?: string;
  purchaseOrderNumber?: string;
  salesOrderNumber?: string; // Added: Sales order number reference
  // Added: Optional closing remarks (from backend Invoice.compliments)
  compliments?: string;
  quickReference?: string;
  invoiceItemList?: InvoiceItem[];
  invoicePaymentList?: InvoicePayment[] | null;
  invoiceTaxEntryList?: unknown[] | null;
  serialised?: string;
  totalCount?: number;

  // Computed fields (added by API transform layer)
  status?: InvoiceStatus;
  subtotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount?: number;
  amountPaid?: number;
  amountDue?: number;
}

/**
 * InvoiceItem domain model matching soupbroker.finance.InvoiceItem.
 *
 * Backend fields:
 *   - description (string)       → line item description text
 *   - quantity (number)          → quantity
 *   - unitPrice (number)         → price per unit
 *   - serviceDescription (FK)    → reference to predefined service type
 *   - priority (int)             → sort order
 *   - taxEntryInvoiceItemList    → tax entries for this item
 *
 * Note: taxRate and discountPercent are NOT first-class backend fields.
 * Tax is handled via taxEntryInvoiceItemList (separate entities).
 * Discount is not a backend concept.
 */
export interface InvoiceItem extends BaseEntity {
  invoice?: { id: string; serialised?: string; class?: string };
  serviceDescription?: { id: string; serialised?: string; class?: string; name?: string };
  description: string;
  quantity: number;
  unitPrice: number;
  priority?: number;
  taxEntryInvoiceItemList?: unknown[] | null;
  serialised?: string;
  // Computed/UI-only fields (not from backend)
  taxRate?: number;
  discountPercent?: number;
  amount?: number;
}

export interface InvoicePayment extends BaseEntity {
  invoice: { id: string };
  amount: number;
  paymentDate: string;
  // Changed: PaymentMethod is a domain class FK, not a string enum
  paymentMethod?: { id: string; name?: string; serialised?: string; class?: string };
  payInAccount?: { id: string; name?: string; code?: string }; // Added: Bank/cash account for deposit
  currency?: string; // Added: Payment currency
  reference?: string;
  notes?: string;
}

// =============================================================================
// Finance Types - Bill (Expenses)
// =============================================================================

export type BillStatus = 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface Bill extends BaseEntity {
  number?: number; // Added: Bill number (backend field)
  numberPrefix?: string; // Added: Bill number prefix
  billNumber: string; // Display-friendly bill number
  vendor: { id: string; name?: string; serialised?: string; class?: string };
  billDate: string; // Changed: Backend uses billDate (not issueDate)
  issueDate: string; // NOTE: Legacy alias kept for backward compatibility
  paymentDate: string; // Changed: Backend uses paymentDate (not dueDate)
  dueDate: string; // NOTE: Legacy alias kept for backward compatibility
  currency?: string; // Added: Transaction currency
  exchangeRate?: number; // Added: Exchange rate when currency != account default
  purchaseOrderNumber?: string; // Added: PO number reference
  salesOrderNumber?: string; // Added: SO number reference
  status: BillStatus;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  notes?: string;
  items?: BillItem[];
  billItemList?: BillItem[]; // Added: Backend field name for bill items
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
  // Changed: PaymentMethod is a domain class FK, not a string enum
  paymentMethod?: { id: string; name?: string; serialised?: string; class?: string };
  payOutAccount?: { id: string; name?: string; code?: string }; // Added: Bank/cash account for payment
  paymentReceipt?: string; // Added: File upload reference for payment receipt
  currency?: string; // Added: Payment currency
  reference?: string;
  notes?: string;
}

// =============================================================================
// Finance Types - Payment Method (domain class, not enum)
// Mirrors: soupbroker.finance.PaymentMethod
// =============================================================================

// Added: PaymentMethod is a domain class with id+name, NOT an enum
export interface PaymentMethod extends BaseEntity {
  name: string;
  account?: { id: string; serialised?: string; class?: string };
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
  ledgerAccountCategory?: { id: string; name?: string; class?: string }; // Added: category reference
  parentAccount?: { id: string; name?: string; class?: string }; // Added: class field for Grails FK
  currency?: string; // Added: Account currency
  cashFlow?: string; // Added: Cash flow classification
  hiddenAccount?: boolean; // Added: Hide from account lists
  editable?: boolean; // Added: Can be edited
  deletable?: boolean; // Added: Can be deleted
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
  // Changed: PaymentMethod is a domain class FK (delegated from LedgerTransaction)
  paymentMethod?: { id: string; name?: string; serialised?: string; class?: string };
  currency?: string; // Added: Transaction currency
  exchangeRate?: number; // Added: Exchange rate

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
  transactionDate: string; // Changed: Backend uses transactionDate (not voucherDate)
  amount: number;
  notes: string; // Changed: Backend uses notes (not description)
  reference?: string;
  beneficiaryName?: string;
  clientId?: string;
  vendorId?: string;
  staffId?: string;
  cashAccountId: string; // Bank or cash account
  expenseAccountId?: string; // For payment vouchers
  incomeAccountId?: string; // For receipt vouchers
  // Changed: PaymentMethod is a domain class FK, send ID for binding
  paymentMethodId?: string;
  currency?: string; // Added: Transaction currency
  exchangeRate?: number; // Added: Exchange rate when currency != account default
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
  symbol?: string; // Added: Unique short code/symbol
  email?: string;
  phoneNumber?: string;
  address?: string; // Residential address
  postalAddress?: string; // Added: Separate postal address
  taxIdentificationNumber?: string;
  paymentTerms?: number; // days
  notes?: string;
  ledgerAccount?: { id: string; name?: string; code?: string }; // Added: Linked ledger account
  vendorType?: string; // Added: Vendor type classification
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
