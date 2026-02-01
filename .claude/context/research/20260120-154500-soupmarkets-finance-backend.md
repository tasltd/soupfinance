# Research: Soupmarkets Finance Backend Modules

**Date**: 2026-01-20 15:45:00
**Query**: Research finance modules in soupmarkets-web Grails backend for domain model, API patterns, and multi-tenancy
**Duration**: ~15 minutes
**Backend Path**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web`

## Executive Summary

The Soupmarkets Grails backend has a comprehensive double-entry bookkeeping finance module with **33 domain classes** covering invoicing, bill payments, ledger transactions, and vouchers. All domains extend `SbDomain` which provides UUID primary keys and multi-tenancy via a `tenantId` discriminator column. The finance module follows standard Grails REST patterns with `/rest/{domain}/index.json` endpoints using FormData serialization for POST/PUT operations.

---

## Core Finance Domain Classes

### 1. Ledger & Chart of Accounts

| Domain | Purpose | Key Fields | Relationships |
|--------|---------|------------|---------------|
| **LedgerAccount** | Chart of accounts entry for double-entry bookkeeping | `name`, `number`, `ledgerAccountCategory`, `currency`, `parentAccount`, `security`, `cashFlow`, `systemAccount` | `hasMany: ledgerAccountBalanceHistoryList`, `hasOne: accountBankDetails` |
| **LedgerAccountCategory** | Account category (determines debit/credit behavior) | `name`, `ledgerGroup` (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE), `ledgerSubGroup`, `ledgerGroupType` | - |
| **LedgerJournal** | Journal entry for period-end closing and balance snapshots | `description`, `journalDate`, `account` | `hasMany: journalTransactionList` |
| **LedgerTransaction** | Individual transaction in double-entry system | `amount`, `baseAmount`, `currency`, `exchangeRate`, `transactionDate`, `debitLedgerAccount`, `creditLedgerAccount`, `ledgerAccount` (single-entry), `transactionState` (DEBIT/CREDIT), `journalEntryType` (DOUBLE_ENTRY/SINGLE_ENTRY), `verifiedTransaction`, `paymentMethod`, `relatedToId`, `relatedToClass` | `hasMany: approvals` (LedgerTransactionApproval) |
| **LedgerTransactionGroup** | Groups related transactions | - | - |
| **LedgerAccountBalanceHistory** | Historical balance snapshots | - | - |
| **PaymentMethod** | Payment methods (Bank Transfer, Check, Cash, etc.) | `name`, `description` | - |

**Ledger Groups** (via `LedgerGroup` enum):
- **ASSET** - Debit normal balance (Cash, Receivables, Inventory, Securities)
- **LIABILITY** - Credit normal balance (Payables, Client Deposits)
- **EQUITY** - Credit normal balance (Capital, Retained Earnings)
- **INCOME** - Credit normal balance (Fees, Commissions, Interest)
- **EXPENSE** - Debit normal balance (Salaries, Operations, COGS)
- **SHARES** - Stock/equity instruments
- **DIVIDENDS** - Distributions to shareholders

**Transaction States** (via `LedgerState` enum):
- **DEBIT** - Increases assets/expenses, decreases liabilities/equity/income
- **CREDIT** - Increases liabilities/equity/income, decreases assets/expenses

**Entry Types** (via `JournalEntryType` enum):
- **DOUBLE_ENTRY** - Traditional accounting (requires `debitLedgerAccount` and `creditLedgerAccount`)
- **SINGLE_ENTRY** - Simplified entry (uses `ledgerAccount` + `transactionState`)

---

### 2. Invoicing (Accounts Receivable)

| Domain | Purpose | Key Fields | Relationships |
|--------|---------|------------|---------------|
| **Invoice** | Client invoices for billing services/fees | `numberPrefix`, `number`, `accountServices` (client), `client`, `invoiceDate`, `paymentDate`, `currency`, `exchangeRate`, `status` (PENDING/PARTIAL/PAID), `purchaseOrderNumber`, `salesOrderNumber`, `notes`, `compliments` | `hasMany: invoiceItemList, invoicePaymentList, invoiceTaxEntryList` |
| **InvoiceItem** | Line items on invoice | `invoice`, `serviceDescription`, `description`, `quantity`, `unitPrice`, `incomeLedgerTransaction`, `priority` | `hasMany: taxEntryInvoiceItemList` |
| **InvoicePayment** | Payments received against invoice | `invoice`, `amount`, `baseAmount`, `paymentMethod`, `paymentDate`, `payInAccount` (LedgerAccount), `currency`, `exchangeRate`, `invoicePaymentLedgerTransaction` (Voucher), `notes` | - |
| **InvoiceTaxEntry** | Tax calculations for invoice | `invoice`, `taxEntry`, `taxAmount` | - |

**Calculated Properties**:
- `Invoice.subTotal` - Sum of invoiceItem amounts
- `Invoice.totalTaxAmount` - Sum of invoiceItem tax amounts
- `Invoice.total` - subTotal + totalTaxAmount
- `Invoice.paidAmount` - Sum of invoicePayment amounts
- `Invoice.amountDue` - total - paidAmount

**Aging Buckets** (for A/R reporting):
- Not yet overdue (payment date in future)
- 0-30 days overdue
- 31-60 days overdue
- 61-90 days overdue
- 90+ days overdue

**Double-Entry Accounting**:
- **Invoice Creation**: Debit Accounts Receivable (Asset) / Credit Revenue (Income)
- **Payment Received**: Debit Bank (Asset) / Credit Accounts Receivable (Asset)

---

### 3. Bills (Accounts Payable)

| Domain | Purpose | Key Fields | Relationships |
|--------|---------|------------|---------------|
| **Bill** | Vendor bills for expense tracking | `vendor`, `numberPrefix`, `number`, `billDate`, `paymentDate`, `currency`, `exchangeRate`, `status` (PENDING/PARTIAL/PAID), `accountServices` (for fund attribution), `feeType` (SchemeFeeType), `purchaseOrderNumber`, `salesOrderNumber`, `lastItemDate` | `hasMany: billItemList, billPaymentList, attachedFileList, billTaxEntryList` |
| **BillItem** | Line items on bill | `bill`, `serviceDescription`, `description`, `quantity`, `unitPrice`, `expenseLedgerTransaction`, `priority` | `hasMany: taxEntryBillItemList` |
| **BillPayment** | Payments made against bill | `bill`, `amount`, `baseAmount`, `paymentMethod`, `paymentDate`, `payFromAccount` (LedgerAccount), `currency`, `exchangeRate`, `billPaymentLedgerTransaction` (Voucher), `notes` | - |
| **BillTaxEntry** | Tax calculations for bill | `bill`, `taxEntry`, `taxAmount` | - |
| **BillAttachedFile** | File attachments (receipts, documents) | `bill`, `fileUrl`, `fileName`, `fileType` | - |

**Calculated Properties**:
- `Bill.subTotal` - Sum of billItem amounts
- `Bill.totalTaxAmount` - Sum of billItem tax amounts
- `Bill.total` - subTotal + totalTaxAmount
- `Bill.paidAmount` - Sum of billPayment amounts
- `Bill.amountDue` - total - paidAmount

**Double-Entry Accounting**:
- **Bill Creation**: Debit Expense (Expense) / Credit Accounts Payable (Liability)
- **Payment Made**: Debit Accounts Payable (Liability) / Credit Bank (Asset)

---

### 4. Vouchers (Receipts & Payments)

| Domain | Purpose | Key Fields | Relationships |
|--------|---------|------------|---------------|
| **Voucher** | Financial voucher for deposits/payments with approval workflow | `ledgerTransaction` (shared ID pattern), `voucherType` (DEPOSIT/PAYMENT/RECEIPT), `voucherTo` (CLIENT/VENDOR/STAFF/OTHER), `vendor`, `staff` (Agent), `beneficiaryInfo`, `accountServices`, `status` (PENDING/APPROVED/REJECTED), `requestChannel`, `voucherStation` (for trading workflows), `security`, `nextCouponState` | `hasMany: approvalList` (VoucherApproval), delegates properties to ledgerTransaction |
| **VoucherApproval** | Approval records for voucher workflow | `voucher`, `agent` (approver), `approvalDate`, `status`, `comments` | - |

**Voucher Types** (via `VoucherType` enum):
- **DEPOSIT/RECEIPT** - Money received (creates CREDIT entry)
- **PAYMENT** - Money paid out (creates DEBIT entry)

**Beneficiary Types** (via `VoucherTo` enum):
- **CLIENT** - Payment to/from client account (`accountServices`)
- **VENDOR** - Payment to/from vendor
- **STAFF** - Payment to/from employee
- **OTHER** - Miscellaneous payment (`beneficiaryInfo` text)

**Voucher Stations** (for trading workflows):
- **DEPOSIT_FOR_INVESTMENT** - Client deposit for new order
- **WITHDRAWAL_FROM_INVESTMENT** - Client withdrawal from investment

**Delegation Pattern**: Voucher uses shared-ID pattern where `voucher.id == ledgerTransaction.id` and delegates most properties/methods to the embedded `ledgerTransaction` object.

---

### 5. Supporting Entities

| Domain | Purpose | Key Fields |
|--------|---------|------------|
| **ServiceDescription** | Service catalog for invoicing/billing | `name`, `description`, `type` (ItemType.INVOICE/BILL), `defaultPrice`, `taxable`, `ledgerAccount` |
| **TaxEntry** | Tax rates and configurations | `name`, `abbreviation`, `rate`, `isWithholdingTax`, `ledgerAccount` (for tax liability) |
| **TaxEntryInvoiceItem** | Link table for invoice item taxes | `invoiceItem`, `taxEntry`, `taxAmount`, `ledgerTransaction` |
| **TaxEntryBillItem** | Link table for bill item taxes | `billItem`, `taxEntry`, `taxAmount`, `ledgerTransaction` |
| **ExchangeRate** | Currency conversion rates | `fromCurrency`, `toCurrency`, `rate`, `startDate`, `endDate` |
| **FinancialYear** | Financial year definitions | `startDate`, `endDate`, `name`, `account` |
| **Budget** | Budget planning | `name`, `financialYear`, `description` |
| **BudgetCategory** | Budget categories | `name`, `description`, `ledgerAccountCategory` |
| **BudgetEntry** | Budget line items | `budget`, `budgetCategory`, `amount` |
| **DomainFinanceLink** | Links domains to their ledger transactions | `domainClass`, `domainId`, `ledgerTransactionId`, `linkType` |
| **LedgerTransactionApproval** | Transaction approval workflow | `ledgerTransaction`, `agent`, `approvalDate`, `status`, `comments` |
| **TradeBankRecon** | Trade bank reconciliation | - |
| **TradeBankReconSuccess** | Successful reconciliation records | - |
| **TradeBankReconFailed** | Failed reconciliation records | - |

---

## Multi-Tenancy Implementation

### SbDomain Base Class

All finance domains extend `SbDomain` (located at `src/main/groovy/soupbroker/SbDomain.groovy`):

```groovy
abstract class SbDomain implements CommonMethods {
    String tenantId      // Multi-tenancy discriminator
    String id            // UUID primary key
    String serialised    // Cached toString() for search
    String notes         // Generic notes field
    Date dateCreated
    Date lastUpdated
    boolean archived     // Soft-delete flag

    static mapping = {
        id generator: 'uuid', type: "string"
        archived column:'archived', defaultValue:"0"
        serialised column: "serialised", sqlType: "longtext", index:"serialised"
    }
}
```

### Multi-Tenancy Pattern

- **Discriminator-based**: All domains have a `tenantId` column (String UUID)
- **GORM Multi-Tenant trait**: Domains implement `MultiTenant<DomainClass>`
- **Current tenant**: Retrieved via `Account.current()` which uses `grails.gorm.multitenancy.Tenants.currentId()`
- **Automatic filtering**: GORM queries automatically filter by current `tenantId`
- **Shared ID space**: IDs are UUIDs so they're globally unique across tenants

**Example**:
```groovy
class Invoice extends SbDomain implements MultiTenant<Invoice> {
    // Automatically filtered by tenantId in all queries
}

// Querying automatically scopes to current tenant
Invoice.searchList([max: 10]) // Only returns invoices for current tenant
```

---

## API Endpoint Patterns

### Standard REST Endpoints

All finance controllers follow this pattern:

| Endpoint | HTTP Method | Purpose | Returns |
|----------|-------------|---------|---------|
| `/rest/{domain}/index.json` | GET | List active (non-archived) records | `{ content: [...], totalCount: N }` or `[...]` |
| `/rest/{domain}/archived.json` | GET | List archived records | Same as index |
| `/rest/{domain}/show/{id}.json` | GET | Get single record details | `{ ...domain fields }` |
| `/rest/{domain}/save.json` | POST | Create new record | `{ ...saved record }` |
| `/rest/{domain}/update.json` | PUT | Update existing record | `{ ...updated record }` |
| `/rest/{domain}/delete/{id}.json` | DELETE | Delete record (soft or hard) | `{ message: "Deleted" }` |

**Pagination Query Params**:
- `max` - Page size (default 10, max 1000)
- `offset` - Pagination offset
- `sort` - Sort field (default: `dateCreated`)
- `order` - Sort order (default: `desc`)

**Filter Query Params** (domain-specific):
- `search` - Keyword search across `id`, `serialised`, `notes`
- `from`/`to` - Date range filters
- Domain-specific filters (e.g., `accountServices`, `vendor`, `status`)

**Export Formats**:
- `f=csv` - CSV export
- `f=xlsx` - Excel export
- `f=pdf` - PDF export

### FormData Serialization (POST/PUT)

**CRITICAL**: The backend uses FormData (application/x-www-form-urlencoded), NOT JSON.

**Foreign Key References**: Nested objects serialize as `field.id`:
```javascript
// CORRECT FormData serialization
const formData = new FormData();
formData.append('accountServices.id', 'uuid-here'); // FK reference
formData.append('currency', 'USD');
formData.append('amount', '1000.00');
```

**SoupFinance React app must use `toFormData` helper** from `src/api/client.ts`:
```typescript
import { toFormData } from '@/api/client';

const invoiceData = {
  accountServices: { id: 'uuid' },
  currency: 'USD',
  amount: 1000
};

await apiClient.post('/rest/invoice/save.json', toFormData(invoiceData));
```

---

## Transaction Recording Patterns

### Invoice Workflow

```
1. Create Invoice
   → POST /rest/invoice/save.json
   → Ledger: Debit Accounts Receivable (Asset) / Credit Revenue (Income)

2. Record Payment
   → POST /rest/invoicePayment/save.json
   → Ledger: Debit Bank (Asset) / Credit Accounts Receivable (Asset)
   → Invoice.status auto-updates to PARTIAL or PAID

3. Invoice Status Calculation (automatic)
   - PENDING: paidAmount == 0
   - PARTIAL: paidAmount < total
   - PAID: paidAmount == total
```

### Bill Workflow

```
1. Create Bill
   → POST /rest/bill/save.json
   → Ledger: Debit Expense (Expense) / Credit Accounts Payable (Liability)

2. Record Payment
   → POST /rest/billPayment/save.json
   → Ledger: Debit Accounts Payable (Liability) / Credit Bank (Asset)
   → Bill.status auto-updates to PARTIAL or PAID

3. Bill Status Calculation (automatic)
   - PENDING: paidAmount == 0
   - PARTIAL: paidAmount < total
   - PAID: paidAmount == total
```

### Voucher Workflow

```
1. Create Voucher
   → POST /rest/voucher/save.json
   → voucherType = DEPOSIT: Debit Bank (Asset) / Credit Liability (Client Fund)
   → voucherType = PAYMENT: Debit Expense / Credit Bank (Asset)
   → status = PENDING

2. Approve Voucher
   → POST /rest/voucherApproval/save.json
   → voucher.status → APPROVED
   → ledgerTransaction.verifiedTransaction → true

3. Reject Voucher
   → voucherApproval.status → REJECTED
   → voucher.status → REJECTED
   → Transaction not verified
```

### Ledger Transaction Direct Entry

```
1. Double-Entry Mode
   → POST /rest/ledgerTransaction/save.json
   → Required: debitLedgerAccount, creditLedgerAccount, amount
   → journalEntryType = DOUBLE_ENTRY

2. Single-Entry Mode
   → Required: ledgerAccount, transactionState (DEBIT/CREDIT), amount
   → journalEntryType = SINGLE_ENTRY
```

---

## Key Domain Relationships

```
Invoice (1) ──< (N) InvoiceItem
Invoice (1) ──< (N) InvoicePayment
Invoice (1) ──< (N) InvoiceTaxEntry

Bill (1) ──< (N) BillItem
Bill (1) ──< (N) BillPayment
Bill (1) ──< (N) BillTaxEntry
Bill (1) ──< (N) BillAttachedFile

LedgerAccount (1) ──< (N) LedgerTransaction (as debitLedgerAccount)
LedgerAccount (1) ──< (N) LedgerTransaction (as creditLedgerAccount)
LedgerAccount (1) ──< (N) LedgerAccountBalanceHistory

LedgerJournal (1) ──< (N) LedgerTransaction

Voucher (1) ─── (1) LedgerTransaction (shared ID)
Voucher (1) ──< (N) VoucherApproval

ServiceDescription (1) ──< (N) InvoiceItem
ServiceDescription (1) ──< (N) BillItem

TaxEntry (1) ──< (N) TaxEntryInvoiceItem
TaxEntry (1) ──< (N) TaxEntryBillItem

AccountServices (1) ──< (N) Invoice
Vendor (1) ──< (N) Bill

LedgerTransaction (1) ──< (N) LedgerTransactionApproval
```

---

## Service Layer Operations

### FinanceService

Key methods from `grails-app/services/soupbroker/finance/FinanceService.groovy`:

```groovy
class FinanceService {
    // Calculate financial totals for date range
    Map calculateFinancialTotals(Date fromDate, Date toDate)

    // Generate financial statements
    Map generateFinancialStatements(Date asOfDate = new Date())
    Map generateIncomeStatement(Date fromDate, Date toDate, Map params = [:])
    Map generateBalanceSheet(Date asOfDate)
    Map generateCashFlowStatement(Date fromDate, Date toDate)

    // Get start of financial year
    Date getStartOfFinancialYear(Date asOfDate)
}
```

### LedgerAccountService

```groovy
class LedgerAccountService {
    // Get accounts by group (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE)
    List<LedgerAccount> getAccountsByGroup(LedgerGroup group, Map params = [:])

    // Calculate account balance as of specific date
    BigDecimal calculateBalanceAsOf(LedgerAccount account, Date asOfDate)

    // Calculate balance for date range
    BigDecimal calculateBalance(LedgerAccount account, Date fromDate, Date toDate)
}
```

---

## Field Type Notes

### UUID String IDs

All domains use UUID string IDs:
```groovy
static mapping = {
    id generator: 'uuid', type: "string"
}
```

**React app must treat all IDs as strings**, never integers.

### Currency Fields

Currencies use Java `Currency` type (ISO 4217 codes):
```groovy
Currency currency          // Stores as VARCHAR(3) - e.g., "USD", "EUR", "GHS"
```

### BigDecimal for Money

All monetary amounts use `BigDecimal` for precision:
```groovy
BigDecimal amount          // Precise decimal for money
BigDecimal exchangeRate    // Precision for rates
```

### Date Fields

```groovy
Date transactionDate       // java.util.Date - includes time
Date invoiceDate          // Usually date-only
Date paymentDate          // Due date
Date dateCreated          // Audit - auto-populated
Date lastUpdated          // Audit - auto-updated
```

---

## Security & Authorization

All finance controllers use:
```groovy
@Secured(["ROLE_ADMIN", "ROLE_USER"])
```

**Authentication**: Bearer token in `Authorization` header
- Token stored in `localStorage` as `access_token`
- Auto-attached by `src/api/client.ts` in React app

**401 Handling**: Auto-redirects to `/login` and clears credentials

---

## JSON Rendering Structure

Based on existing Soupmarkets patterns, the backend uses **simple array structure** (no pagination wrapper):

```json
[
  { "id": "uuid1", "name": "Invoice 1", ... },
  { "id": "uuid2", "name": "Invoice 2", ... }
]
```

NOT:
```json
{
  "content": [...],
  "totalElements": 100
}
```

**Note**: See `~/.claude/rules/grails-json-rendering.md` - must match existing codebase pattern.

---

## Recommendations for SoupFinance React App

### 1. API Client Setup

- ✅ Use FormData serialization (already implemented in `src/api/client.ts`)
- ✅ Use `toFormData` helper for nested objects with `.id` foreign keys
- ✅ Expect simple array responses (no pagination wrapper)
- ✅ Store bearer token in localStorage as `access_token`

### 2. Domain Model Mapping

Create TypeScript interfaces matching Grails domains:

```typescript
// src/types/finance.ts
export interface Invoice {
  id: string;                    // UUID string
  numberPrefix?: string;
  number: number;
  accountServices: AccountServices;
  client?: Client;
  invoiceDate: string;           // ISO date string
  paymentDate: string;
  currency: string;              // ISO 4217 code
  exchangeRate: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  subTotal: number;
  totalTaxAmount: number;
  total: number;
  paidAmount: number;
  amountDue: number;
  notes?: string;
  compliments?: string;
  invoiceItemList: InvoiceItem[];
  invoicePaymentList: InvoicePayment[];
}

export interface LedgerAccount {
  id: string;
  name: string;
  number?: string;
  description?: string;
  ledgerAccountCategory: LedgerAccountCategory;
  parentAccount?: LedgerAccount;
  currency: string;
  cashFlow: boolean;
  systemAccount: boolean;
  hiddenAccount: boolean;
  editable: boolean;
  deletable: boolean;
}
```

### 3. API Endpoint Modules

Organize by domain:

```typescript
// src/api/endpoints/invoices.ts
export const invoicesApi = {
  list: (params?: QueryParams) =>
    apiClient.get('/rest/invoice/index.json', { params }),

  get: (id: string) =>
    apiClient.get(`/rest/invoice/show/${id}.json`),

  create: (data: InvoiceCreate) =>
    apiClient.post('/rest/invoice/save.json', toFormData(data)),

  update: (data: InvoiceUpdate) =>
    apiClient.put('/rest/invoice/update.json', toFormData(data)),

  delete: (id: string) =>
    apiClient.delete(`/rest/invoice/delete/${id}.json`)
};
```

### 4. Multi-Currency Handling

All financial displays should support multi-currency:
```typescript
function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
}
```

### 5. Aging Calculations

Invoice/Bill aging is calculated server-side but can be displayed client-side:
```typescript
function getAgingBucket(paymentDate: Date, referenceDate: Date = new Date()) {
  const daysOverdue = differenceInDays(referenceDate, paymentDate);

  if (daysOverdue < 0) return 'Not Yet Due';
  if (daysOverdue <= 30) return '0-30 Days';
  if (daysOverdue <= 60) return '31-60 Days';
  if (daysOverdue <= 90) return '61-90 Days';
  return '90+ Days';
}
```

---

## Next Steps for Implementation

1. **Create TypeScript types** for all finance domains (Invoice, Bill, Ledger, etc.)
2. **Build API client modules** in `src/api/endpoints/` for each domain
3. **Implement query hooks** using TanStack Query for data fetching
4. **Build form components** using React Hook Form + Zod validation
5. **Test FormData serialization** with foreign key references (`client.id`)
6. **Implement multi-currency display** using Intl.NumberFormat
7. **Build ledger transaction entry** forms (double-entry and single-entry modes)
8. **Implement invoice/bill workflows** with status tracking
9. **Add voucher approval workflows** with pending/approved/rejected states
10. **Build financial reports** (P&L, Balance Sheet, Cash Flow, Aging)

---

## Raw Data - All Finance Domain Files

### Domain Classes (33 total)

Located in `grails-app/domain/soupbroker/finance/`:

1. Bill.groovy
2. BillAttachedFile.groovy
3. BillItem.groovy
4. BillPayment.groovy
5. BillTaxEntry.groovy
6. Budget.groovy
7. BudgetCategory.groovy
8. BudgetEntry.groovy
9. DomainFinanceLink.groovy
10. ExchangeRate.groovy
11. FinancialYear.groovy
12. Invoice.groovy
13. InvoiceItem.groovy
14. InvoicePayment.groovy
15. InvoiceTaxEntry.groovy
16. LedgerAccount.groovy
17. LedgerAccountBalanceHistory.groovy
18. LedgerAccountCategory.groovy
19. LedgerJournal.groovy
20. LedgerTransaction.groovy
21. LedgerTransactionApproval.groovy
22. LedgerTransactionGroup.groovy
23. LedgerTransactionReport.groovy
24. PaymentMethod.groovy
25. ServiceDescription.groovy
26. TaxEntry.groovy
27. TaxEntryBillItem.groovy
28. TaxEntryInvoiceItem.groovy
29. TradeBankRecon.groovy
30. TradeBankReconFailed.groovy
31. TradeBankReconSuccess.groovy
32. Voucher.groovy
33. VoucherApproval.groovy

### Controllers (30+ total)

Located in `grails-app/controllers/soupbroker/finance/`:

1. BillAttachedFileController.groovy
2. BillController.groovy
3. BillItemController.groovy
4. BillPaymentController.groovy
5. BudgetCategoryController.groovy
6. BudgetController.groovy
7. BudgetEntryController.groovy
8. DomainFinanceLinkController.groovy
9. ExchangeRateController.groovy
10. FinancialYearController.groovy
11. InvoiceController.groovy
12. InvoiceItemController.groovy
13. InvoicePaymentController.groovy
14. InvoiceTaxEntryController.groovy
15. LedgerAccountBalanceHistoryController.groovy
16. LedgerAccountCategoryController.groovy
17. LedgerAccountController.groovy
18. LedgerJournalController.groovy
19. LedgerTransactionApprovalController.groovy
20. LedgerTransactionController.groovy
21. LedgerTransactionGroupController.groovy
22. PaymentMethodController.groovy
23. PendingPaymentController.groovy
24. ServiceDescriptionController.groovy
25. TaxEntryBillItemController.groovy
26. TaxEntryController.groovy
27. TaxEntryInvoiceItemController.groovy
28. TradeBankReconController.groovy
29. TradeBankReconFailedController.groovy
30. TradeBankReconSuccessController.groovy
31. VoucherApprovalController.groovy
32. VoucherController.groovy

### Services (5+ total)

Located in `grails-app/services/soupbroker/finance/`:

1. BudgetAlertService.groovy
2. DomainFinanceLinkService.groovy
3. FinanceService.groovy
4. LedgerAccountService.groovy (referenced but not in glob results)
5. LedgerTransactionApprovalService.groovy

### Enums & Value Objects

Located in `src/main/groovy/soupbroker/finance/`:

1. FinancialReportType.groovy
2. ItemType.groovy
3. JournalEntryType.groovy
4. LedgerState.groovy
5. LedgerSubGroup.groovy
6. ParentChildLedger.groovy
7. PaymentStatus.groovy
8. ReportPeriod.groovy
9. VoucherTo.groovy
10. VoucherType.groovy

---

## File Locations Reference

- **Domains**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/`
- **Controllers**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/`
- **Services**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/services/soupbroker/finance/`
- **Enums**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/src/main/groovy/soupbroker/finance/`
- **Base Domain**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/src/main/groovy/soupbroker/SbDomain.groovy`
