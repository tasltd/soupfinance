# Soupmarkets Backend API Research for SoupFinance Integration

**Date**: 2026-01-21 15:30
**Query**: Find API endpoints and schemas for SoupFinance integration
**Target**: Finance module controllers (Bill, Invoice, Payment, Ledger, Voucher)

---

## Executive Summary

The soupmarkets-web backend provides comprehensive RESTful APIs for financial operations relevant to SoupFinance integration. All controllers follow consistent Grails REST patterns with FormData serialization, UUID-based IDs, multi-tenancy, and soft-delete support.

**Key Findings:**
- **Authentication**: X-Auth-Token header (NOT Bearer token)
- **Content-Type**: `application/x-www-form-urlencoded` for POST/PUT (NOT JSON)
- **Foreign Keys**: Nested objects as `field.id: uuid`
- **Base Path**: `/rest/{controller}/{action}.json`
- **All IDs**: UUID strings
- **Soft Delete**: `archived` boolean flag on all domains

---

## 1. Bill Management (Vendor Bills / Accounts Payable)

### Controller
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/BillController.groovy`

### Domain Class
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/Bill.groovy`

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/bill/index.json` | List active bills with filtering |
| GET | `/rest/bill/archived.json` | List archived bills |
| GET | `/rest/bill/show/{id}.json` | Get bill details |
| POST | `/rest/bill/preview.json` | Generate PDF preview (optional email) |
| POST | `/rest/bill/save.json` | Create new bill |
| PUT | `/rest/bill/update.json` | Update existing bill |
| DELETE | `/rest/bill/delete/{id}.json` | Delete bill |

### Query Parameters (index/archived)

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `max` | Integer | Page size | 10 (max 1000) |
| `offset` | Integer | Pagination offset | 0 |
| `sort` | String | Sort field | dateCreated |
| `order` | String | Sort order (asc/desc) | desc |
| `search` | String | Keyword search across fields | - |
| `vendor` | UUID | Filter by vendor ID | - |
| `scheme` | UUID | Filter by scheme ID | - |
| `status` | Enum | Filter by status (DRAFT, PENDING, PAID) | - |
| `from` | Date | Filter by billDate range start | - |
| `to` | Date | Filter by billDate range end | - |
| `f` | String | Export format (csv, xlsx, pdf) | - |

### Key Domain Fields

```groovy
class Bill extends SbDomain {
    // Identification
    String id                      // UUID (primary key)
    String numberPrefix            // Optional prefix (e.g., "BILL-")
    Long number                    // Sequential number
    String getBillNumber()         // Returns numberPrefix + number

    // Vendor & Relations
    Vendor vendor                  // Required - who we owe
    AccountServices accountServices // Optional - client account attribution
    Scheme scheme                  // Transient - fund attribution
    SchemeFeeType feeType          // Type of expense

    // Dates
    Date billDate                  // Date received (default: now)
    Date paymentDate               // Due date (default: now + 30 days)
    Date lastItemDate              // Last line item date

    // Status & Amounts
    PaymentStatus status           // PENDING, PARTIAL, PAID
    // Calculated fields (not direct properties):
    // - total: Sum of billItemList amounts
    // - paidAmount: Sum of billPaymentList amounts
    // - amountDue: total - paidAmount

    // Currency
    Currency currency              // Bill currency
    double exchangeRate = 1.0      // Conversion rate

    // References
    String purchaseOrderNumber     // Vendor's PO number
    String salesOrderNumber        // Our SO number

    // Multi-tenancy & Audit
    Long tenantId                  // Multi-tenant discriminator
    boolean archived = false       // Soft delete flag
    Date dateCreated               // Auto-populated
    Date lastUpdated               // Auto-populated

    // Collections
    List<BillItem> billItemList
    List<BillPayment> billPaymentList
    List<BillTaxEntry> billTaxEntryList
    List<BillAttachedFile> attachedFileList
}
```

### Response Structure (index/show)

**Simple Array (no pagination wrapper)**:
```json
[
  {
    "id": "uuid-string",
    "billNumber": "BILL-00001",
    "vendor": { "id": "uuid", "name": "Vendor Name" },
    "total": 2500.00,
    "paidAmount": 0.00,
    "amountDue": 2500.00,
    "status": "PENDING",
    "billDate": "2026-01-21T00:00:00Z",
    "paymentDate": "2026-02-20T00:00:00Z",
    "currency": "USD",
    "exchangeRate": 1.0,
    "dateCreated": "2026-01-21T15:30:00Z",
    "lastUpdated": "2026-01-21T15:30:00Z"
  }
]
```

---

## 2. Invoice Management (Client Invoices / Accounts Receivable)

### Controller
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/InvoiceController.groovy`

### Domain Class
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/Invoice.groovy`

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/invoice/index.json` | List active invoices with filtering |
| GET | `/rest/invoice/archived.json` | List archived invoices |
| GET | `/rest/invoice/show/{id}.json` | Get invoice details |
| POST | `/rest/invoice/preview.json` | Generate PDF preview (optional email) |
| POST | `/rest/invoice/save.json` | Create new invoice |
| PUT | `/rest/invoice/update.json` | Update existing invoice |
| DELETE | `/rest/invoice/delete/{id}.json` | Delete invoice |

### Query Parameters (index/archived)

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `max` | Integer | Page size | 10 (max 1000) |
| `offset` | Integer | Pagination offset | 0 |
| `sort` | String | Sort field | dateCreated |
| `order` | String | Sort order (asc/desc) | desc |
| `search` | String | Keyword search across fields | - |
| `accountServices` | UUID | Filter by client account | - |
| `status` | Enum | Filter by status (DRAFT, SENT, PAID) | - |
| `from` | Date | Filter by invoiceDate range start | - |
| `to` | Date | Filter by invoiceDate range end | - |
| `f` | String | Export format (csv, xlsx, pdf) | - |

### Key Domain Fields

```groovy
class Invoice extends SbDomain {
    // Identification
    String id                      // UUID (primary key)
    String numberPrefix            // Optional prefix (e.g., "INV-")
    Long number                    // Sequential number
    String getInvoiceNumber()      // Returns numberPrefix + number

    // Customer & Relations
    AccountServices accountServices // Required - who owes us
    Client client                  // Optional - direct client reference

    // Dates
    Date invoiceDate               // Date issued (default: now)
    Date paymentDate               // Due date (default: now + 30 days)

    // Status & Amounts
    PaymentStatus status           // PENDING, PARTIAL, PAID
    // Calculated fields:
    // - total: Sum of invoiceItemList amounts
    // - paidAmount: Sum of invoicePaymentList amounts
    // - amountDue: total - paidAmount

    // Currency
    Currency currency              // Invoice currency
    double exchangeRate = 1.0      // Conversion rate

    // References
    String purchaseOrderNumber     // Client's PO number
    String salesOrderNumber        // Our SO number

    // Additional Info
    String notes                   // Optional notes (TEXT)
    String compliments             // Optional closing message (TEXT)

    // Multi-tenancy & Audit
    Long tenantId                  // Multi-tenant discriminator
    boolean archived = false       // Soft delete flag
    Date dateCreated               // Auto-populated
    Date lastUpdated               // Auto-populated

    // Collections
    List<InvoiceItem> invoiceItemList
    List<InvoicePayment> invoicePaymentList
    List<InvoiceTaxEntry> invoiceTaxEntryList
}
```

### Response Structure (index/show)

**Simple Array (no pagination wrapper)**:
```json
[
  {
    "id": "uuid-string",
    "invoiceNumber": "INV-00001",
    "accountServices": { "id": "uuid", "name": "Client Account" },
    "total": 5000.00,
    "paidAmount": 2500.00,
    "amountDue": 2500.00,
    "status": "PARTIAL",
    "invoiceDate": "2026-01-21T00:00:00Z",
    "paymentDate": "2026-02-20T00:00:00Z",
    "currency": "USD",
    "exchangeRate": 1.0,
    "notes": "Monthly commission invoice",
    "dateCreated": "2026-01-21T15:30:00Z",
    "lastUpdated": "2026-01-21T15:30:00Z"
  }
]
```

---

## 3. Payment Management

### 3.1 Bill Payments (Accounts Payable Payments)

#### Controller
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/BillPaymentController.groovy`

#### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/billPayment/index.json` | List active bill payments |
| GET | `/rest/billPayment/archived.json` | List archived payments |
| GET | `/rest/billPayment/show/{id}.json` | Get payment details |
| POST | `/rest/billPayment/save.json` | Create new payment |
| PUT | `/rest/billPayment/update.json` | Update payment |
| DELETE | `/rest/billPayment/delete/{id}.json` | Delete payment |

#### Key Fields

```groovy
class BillPayment {
    String id                      // UUID
    Bill bill                      // Required - which bill is being paid
    Date paymentDate               // Date of payment
    BigDecimal amount              // Payment amount
    Currency currency              // Payment currency
    PaymentMethod paymentMethod    // Cash, bank transfer, etc.
    String reference               // Payment reference/receipt number
    String notes                   // Optional notes
    boolean archived = false
    Date dateCreated
    Date lastUpdated
}
```

### 3.2 Invoice Payments (Accounts Receivable Payments)

#### Controller
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/InvoicePaymentController.groovy`

#### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/invoicePayment/index.json` | List active invoice payments |
| GET | `/rest/invoicePayment/archived.json` | List archived payments |
| GET | `/rest/invoicePayment/show/{id}.json` | Get payment details |
| POST | `/rest/invoicePayment/save.json` | Create new payment |
| PUT | `/rest/invoicePayment/update.json` | Update payment |
| DELETE | `/rest/invoicePayment/delete/{id}.json` | Delete payment |

#### Key Fields

```groovy
class InvoicePayment {
    String id                      // UUID
    Invoice invoice                // Required - which invoice is being paid
    Date paymentDate               // Date of payment
    BigDecimal amount              // Payment amount
    Currency currency              // Payment currency
    PaymentMethod paymentMethod    // Cash, bank transfer, etc.
    String reference               // Payment reference/receipt number
    String notes                   // Optional notes
    boolean archived = false
    Date dateCreated
    Date lastUpdated
}
```

---

## 4. Ledger Account Management (Chart of Accounts)

### Controller
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/LedgerAccountController.groovy`

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/ledgerAccount/index.json` | List active accounts |
| GET | `/rest/ledgerAccount/archived.json` | List archived accounts |
| GET | `/rest/ledgerAccount/show/{id}.json` | Get account details |
| GET | `/rest/ledgerAccount/balance/{id}.json` | Get account with calculated balance |
| POST | `/rest/ledgerAccount/save.json` | Create new account |
| PUT | `/rest/ledgerAccount/update.json` | Update account |
| DELETE | `/rest/ledgerAccount/delete/{id}.json` | Delete account |

### Query Parameters (index/archived)

| Parameter | Type | Description |
|-----------|------|-------------|
| `max` | Integer | Page size (default 10) |
| `offset` | Integer | Pagination offset |
| `sort` | String | Sort field (default: dateCreated) |
| `order` | String | Sort order (default: desc) |
| `search` | String | Keyword search |
| `parentAccount` | UUID | Filter by parent account |
| `ledgerAccountCategory` | UUID | Filter by category |
| `from` | Date | Date range start |
| `to` | Date | Date range end |
| `f` | String | Export format |

### Key Domain Fields

```groovy
class LedgerAccount {
    String id                      // UUID
    String name                    // Account name (e.g., "Cash in Bank")
    String description             // Optional description
    String number                  // Account number/code

    LedgerAccountCategory ledgerAccountCategory // Category (Asset, Liability, etc.)
    LedgerAccount parentAccount    // Optional parent for hierarchical structure

    Currency currency              // Account currency
    CashFlowCategory cashFlow      // Cash flow classification

    // Balance tracking
    BigDecimal calculatedBalance   // Calculated balance (transient)

    // System flags
    boolean systemAccount = false  // System-managed account (not editable)
    boolean hiddenAccount = false  // Hidden from UI
    boolean editable = true        // User can edit
    boolean deletable = true       // User can delete

    boolean archived = false
    Date dateCreated
    Date lastUpdated
}
```

### Response Structure

**Simple Array**:
```json
[
  {
    "id": "uuid-string",
    "name": "Cash in Bank",
    "description": "Operating cash account",
    "number": "1010",
    "ledgerAccountCategory": { "id": "uuid", "name": "Current Assets" },
    "parentAccount": null,
    "currency": "USD",
    "calculatedBalance": 125000.00,
    "systemAccount": false,
    "hiddenAccount": false,
    "archived": false
  }
]
```

---

## 5. Ledger Transaction Management (General Ledger)

### Controller
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/LedgerTransactionController.groovy`

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/ledgerTransaction/index.json` | List active transactions |
| GET | `/rest/ledgerTransaction/archived.json` | List archived transactions |
| GET | `/rest/ledgerTransaction/show/{id}.json` | Get transaction (redirects to group if exists) |
| GET | `/rest/ledgerTransaction/singleShow/{id}.json` | Get single transaction |
| POST | `/rest/ledgerTransaction/save.json` | Create single transaction |
| POST | `/rest/ledgerTransaction/saveMultiple.json` | Create transaction group |
| PUT | `/rest/ledgerTransaction/update.json` | Update single transaction |
| PUT | `/rest/ledgerTransaction/updateMultiple.json` | Update transaction group |
| DELETE | `/rest/ledgerTransaction/delete/{id}.json` | Delete transaction (and group) |

### Transaction Modes

**Single Entry**: Standalone transaction linked to a journal
- Endpoints: `save`, `update`, `singleShow`, `singleCreate`, `singleEdit`

**Double Entry**: Balanced transaction groups where debits equal credits
- Endpoints: `saveMultiple`, `updateMultiple`, `show`, `create`, `edit`

### Query Parameters (index/archived)

| Parameter | Type | Description |
|-----------|------|-------------|
| `max` | Integer | Page size (default 10) |
| `offset` | Integer | Pagination offset |
| `sort` | String | Sort field (default: transactionDate) |
| `order` | String | Sort order (default: desc) |
| `ledgerAccount` | UUID | Filter by account |
| `from` | Date | Filter by transactionDate start |
| `to` | Date | Filter by transactionDate end |
| `f` | String | Export format |

### Key Domain Fields

```groovy
class LedgerTransaction {
    String id                      // UUID

    // Account & State
    LedgerAccount ledgerAccount    // Required - which account
    LedgerState transactionState   // DEBIT or CREDIT

    // Amount
    BigDecimal amount              // Transaction amount
    BigDecimal debit               // Transient - populated if DEBIT
    BigDecimal credit              // Transient - populated if CREDIT

    // Date & Reference
    Date transactionDate           // Transaction date
    String quickReference          // Quick reference number
    String notes                   // Transaction description

    // Currency
    Currency currency              // Transaction currency
    double exchangeRate = 1.0      // Conversion rate

    // Grouping & Journal
    LedgerTransactionGroup ledgerTransactionGroup // Optional - for double-entry
    LedgerJournal journal          // Optional - journal reference
    JournalEntryType journalEntryType // SINGLE_ENTRY or DOUBLE_ENTRY

    // Verification
    boolean verifiedTransaction = false // Verified by supervisor

    // Payment Method
    PaymentMethod paymentMethod    // How was payment made

    // Related Objects
    String relatedToClass          // Domain class name (e.g., "Invoice")
    String relatedToId             // Related entity UUID

    boolean archived = false
    Date dateCreated
    Date lastUpdated
}
```

### Response Structure

**Single Transaction**:
```json
{
  "id": "uuid-string",
  "ledgerAccount": { "id": "uuid", "name": "Cash in Bank" },
  "transactionState": "DEBIT",
  "amount": 2500.00,
  "debit": 2500.00,
  "credit": null,
  "transactionDate": "2026-01-21T00:00:00Z",
  "quickReference": "REF-001",
  "notes": "Payment received from client",
  "currency": "USD",
  "exchangeRate": 1.0,
  "verifiedTransaction": true,
  "archived": false
}
```

**Transaction Group** (Double-Entry):
```json
{
  "id": "group-uuid",
  "transactionDate": "2026-01-21T00:00:00Z",
  "currency": "USD",
  "totalDebit": 2500.00,
  "totalCredit": 2500.00,
  "balanced": true,
  "ledgerTransactionList": [
    {
      "id": "uuid-1",
      "ledgerAccount": { "id": "uuid", "name": "Cash in Bank" },
      "transactionState": "DEBIT",
      "amount": 2500.00,
      "debit": 2500.00
    },
    {
      "id": "uuid-2",
      "ledgerAccount": { "id": "uuid", "name": "Accounts Receivable" },
      "transactionState": "CREDIT",
      "amount": 2500.00,
      "credit": 2500.00
    }
  ]
}
```

---

## 6. Voucher Management (Payments & Deposits)

### Controller
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/VoucherController.groovy`

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/voucher/index.json` | List active vouchers |
| GET | `/rest/voucher/archived.json` | List archived vouchers |
| GET | `/rest/voucher/show/{id}.json` | Get voucher (supports PDF print/email) |
| POST | `/rest/voucher/save.json` | Create new voucher with approval |
| PUT | `/rest/voucher/update.json` | Update voucher (restricted if approved) |
| DELETE | `/rest/voucher/delete/{id}.json` | Delete voucher (ROLE_ADMIN only) |

### Voucher Types

| Type | Description |
|------|-------------|
| `DEPOSIT` | Client deposits money into investment account |
| `PAYMENT` | Payments/withdrawals from client accounts |

### Query Parameters (index/archived)

| Parameter | Type | Description |
|-----------|------|-------------|
| `max` | Integer | Page size (default 10) |
| `offset` | Integer | Pagination offset |
| `sort` | String | Sort field (default: dateCreated) |
| `order` | String | Sort order (default: desc) |
| `search` | String | Keyword search |
| `voucherType` | Enum | DEPOSIT or PAYMENT |
| `status` | Enum | PENDING, APPROVED, REJECTED |
| `from` | Date | Filter by transactionDate start |
| `to` | Date | Filter by transactionDate end |
| `f` | String | Export format |

### Show Endpoint Special Parameters

| Parameter | Description |
|-----------|-------------|
| `print` | If true, renders PDF instead of JSON |
| `send` | If true (with print), emails PDF to contacts |
| `printVersion` | Optional PDF template variant |
| `preview` | If false, shows final version without watermark |

### Key Domain Fields

```groovy
class Voucher extends LedgerTransaction {
    // Inherits all LedgerTransaction fields plus:

    // Voucher Type & Direction
    VoucherType voucherType        // DEPOSIT or PAYMENT
    VoucherTo voucherTo            // CLIENT or VENDOR
    VoucherStation voucherStation  // Workflow station

    // Beneficiary
    AccountServices accountServices // Client account (if CLIENT)
    Vendor vendor                  // Vendor (if VENDOR)
    String beneficiary             // Beneficiary name/description

    // Ledger Accounts
    LedgerAccount debitLedgerAccount  // Debit account
    LedgerAccount creditLedgerAccount // Credit account

    // Approval Workflow
    List<VoucherApproval> approvalList
    ApprovalState getStatus()      // PENDING, APPROVED, REJECTED

    // Security
    boolean editable               // Can be edited (false if approved)
}
```

### Response Structure

```json
{
  "id": "uuid-string",
  "voucherType": "PAYMENT",
  "voucherTo": "CLIENT",
  "beneficiary": "John Doe",
  "accountServices": { "id": "uuid", "name": "Client Account" },
  "amount": 10000.00,
  "transactionDate": "2026-01-21T00:00:00Z",
  "debitLedgerAccount": { "id": "uuid", "name": "Client Cash Account" },
  "creditLedgerAccount": { "id": "uuid", "name": "Bank Account" },
  "currency": "USD",
  "exchangeRate": 1.0,
  "status": "APPROVED",
  "notes": "Withdrawal request",
  "paymentMethod": "BANK_TRANSFER",
  "verifiedTransaction": true,
  "archived": false
}
```

---

## 7. Dashboard & Statistics

### Controller
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/DashboardController.groovy`

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/dashboard/stats.json` | Get dashboard statistics for date range |
| GET | `/rest/dashboard/graphData.json` | Get chart data for dashboard |
| GET | `/rest/dashboard/combined.json` | **Get both stats + graph data in one request** (NEW) |

### Combined Endpoint (Recommended)

**Purpose**: Reduces initial dashboard load by combining stats and graph data into a single HTTP request.

**Query Parameters**:
- `dashboardDateFilter`: MONTH, QUARTERLY, HALF_YEAR, YEARLY
- `from`: Date in MM-yyyy format (for MONTH filter)
- `fromQuarter`: Quarter start (for QUARTERLY filter)
- `fromHalf`: Half-year start (for HALF_YEAR filter)
- `fromYear`: Year start (for YEARLY filter)

**Response Routing**:
- `ASSET_MANAGER`: Returns AUM, NAV, returns, net flows, asset allocation
- `BROKER` (default): Returns trade executions, commissions, order flow

**Cache Headers**:
- `Cache-Control: private, max-age=300, stale-while-revalidate=60` (5 min cache)
- `Vary: Accept, Cookie`

### Response Structure (Combined Endpoint)

```json
{
  "graphData": {
    "labels": ["Jan", "Feb", "Mar"],
    "datasets": [
      {
        "label": "Revenue",
        "data": [12000, 15000, 18000]
      }
    ]
  },
  "dateList": [...],
  "quarterlyList": [...],
  "halfYearList": [...],
  "yearlyList": [...],
  "businessLicenceCategory": "BROKER",
  // Stats fields (merged at root level):
  "totalInvoices": 42,
  "totalBills": 28,
  "outstandingReceivables": 125000.00,
  "outstandingPayables": 85000.00
  // ... additional stats
}
```

---

## 8. Financial Reports

### Controller
`/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/report/FinanceReportsController.groovy`

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/financeReports/accountBalances.json` | Account balances report |
| GET | `/rest/financeReports/accountTransactions.json` | Account transactions report |

**Note**: The FinanceReportsController likely has additional report endpoints (balance sheet, P&L, etc.) not fully explored in this research session.

---

## Common Patterns

### 1. Authentication Pattern

**Header**: `X-Auth-Token: {token}` (NOT `Authorization: Bearer`)

**Login Endpoint**: `POST /rest/api/login`
- Content-Type: `application/json` (exception - login uses JSON)
- Body: `{"username": "...", "password": "..."}`
- Response: `{"token": "...", "user": {...}}`

**Token Validation**: `GET /rest/user/current.json`

### 2. Request Serialization (Data Endpoints)

**Content-Type**: `application/x-www-form-urlencoded` (NOT JSON)

**Foreign Key Pattern**:
```
bill.id=uuid-string
vendor.id=uuid-string
ledgerAccount.id=uuid-string
```

**Date Format**: ISO 8601 or `dd-MM-yyyy`

### 3. Response Structure Pattern

**List Endpoints**: Return **simple arrays** (no pagination wrapper)
```json
[
  {"id": "...", "name": "..."},
  {"id": "...", "name": "..."}
]
```

**NOT**:
```json
{
  "content": [...],
  "totalElements": 100,
  "page": 0
}
```

### 4. Filtering & Pagination

**Standard Query Parameters**:
- `max`: Page size (default 10, max 1000)
- `offset`: Pagination offset
- `sort`: Sort field (default varies by controller)
- `order`: Sort order (asc/desc, default desc)
- `search`: Keyword search
- `from`/`to`: Date range filters

### 5. Soft Delete Pattern

All domains have `archived` boolean flag:
- `archived=false` → Active records (index endpoint)
- `archived=true` → Archived records (archived endpoint)

### 6. Export Pattern

All list endpoints support export via `f` parameter:
- `f=csv` → CSV export
- `f=xlsx` → Excel export
- `f=pdf` → PDF export

When `f` is specified:
- `max` and `offset` are nulled (exports all)
- `Content-Type` and `Content-Disposition` headers set appropriately

### 7. Multi-Tenancy

All domains extend `SbDomain` which includes:
- `Long tenantId` → Multi-tenant discriminator
- Automatic tenant filtering in queries

### 8. Audit Trail

All domains implement `Auditable`:
- `Date dateCreated` → Auto-populated on create
- `Date lastUpdated` → Auto-updated on save

---

## Recommendations for SoupFinance Integration

### 1. Authentication Module

Implement API client with X-Auth-Token header:
```typescript
// src/api/client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:9090',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
});

// Add auth interceptor
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers['X-Auth-Token'] = token;
  }
  return config;
});
```

### 2. FormData Serialization Helper

```typescript
// src/api/client.ts
export function toFormData(obj: any): URLSearchParams {
  const formData = new URLSearchParams();
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value === null || value === undefined) return;

    // Handle nested objects (foreign keys)
    if (typeof value === 'object' && value.id) {
      formData.append(`${key}.id`, value.id);
    } else {
      formData.append(key, String(value));
    }
  });
  return formData;
}
```

### 3. API Endpoint Modules

Create endpoint modules following existing pattern in `src/api/endpoints/`:

**Example**: `src/api/endpoints/bills.ts`
```typescript
import apiClient, { toFormData } from '../client';
import { Bill, BillPayment } from '../../types';

export const bills = {
  list: (params?: any) => apiClient.get<Bill[]>('/rest/bill/index.json', { params }),
  get: (id: string) => apiClient.get<Bill>(`/rest/bill/show/${id}.json`),
  create: (data: Partial<Bill>) => apiClient.post<Bill>('/rest/bill/save.json', toFormData(data)),
  update: (data: Bill) => apiClient.put<Bill>('/rest/bill/update.json', toFormData(data)),
  delete: (id: string) => apiClient.delete(`/rest/bill/delete/${id}.json`),
  archived: (params?: any) => apiClient.get<Bill[]>('/rest/bill/archived.json', { params })
};

export const billPayments = {
  list: (params?: any) => apiClient.get<BillPayment[]>('/rest/billPayment/index.json', { params }),
  get: (id: string) => apiClient.get<BillPayment>(`/rest/billPayment/show/${id}.json`),
  create: (data: Partial<BillPayment>) => apiClient.post<BillPayment>('/rest/billPayment/save.json', toFormData(data)),
  update: (data: BillPayment) => apiClient.put<BillPayment>('/rest/billPayment/update.json', toFormData(data)),
  delete: (id: string) => apiClient.delete(`/rest/billPayment/delete/${id}.json`)
};
```

### 4. Type Definitions

Update `src/types/index.ts` to match Grails domain structures:

```typescript
export interface Bill {
  id: string;
  numberPrefix?: string;
  number: number;
  billNumber: string;
  vendor: { id: string; name: string };
  accountServices?: { id: string; name: string };
  billDate: string;
  paymentDate: string;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  total?: number;
  paidAmount?: number;
  amountDue?: number;
  currency: string;
  exchangeRate: number;
  purchaseOrderNumber?: string;
  salesOrderNumber?: string;
  archived: boolean;
  dateCreated: string;
  lastUpdated: string;
  billItemList?: BillItem[];
  billPaymentList?: BillPayment[];
}
```

### 5. React Query Integration

Use TanStack Query for data fetching:

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { bills } from '../api/endpoints/bills';

export function useBills(params?: any) {
  return useQuery({
    queryKey: ['bills', params],
    queryFn: () => bills.list(params)
  });
}

export function useCreateBill() {
  return useMutation({
    mutationFn: (data: Partial<Bill>) => bills.create(data)
  });
}
```

### 6. Dashboard Integration

Use the combined endpoint for better performance:

```typescript
// src/api/endpoints/dashboard.ts
export const dashboard = {
  combined: (params?: {
    dashboardDateFilter?: 'MONTH' | 'QUARTERLY' | 'HALF_YEAR' | 'YEARLY';
    from?: string;
    fromQuarter?: string;
    fromHalf?: string;
    fromYear?: string;
  }) => apiClient.get('/rest/dashboard/combined.json', { params })
};
```

---

## Files Referenced

### Controllers
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/BillController.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/InvoiceController.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/LedgerAccountController.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/LedgerTransactionController.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/VoucherController.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/BillPaymentController.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/InvoicePaymentController.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/DashboardController.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/report/FinanceReportsController.groovy`

### Domain Classes
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/Bill.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/Invoice.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/LedgerAccount.groovy`

---

## Next Steps

1. **Implement API Client**: Create FormData serialization and X-Auth-Token handling
2. **Create Endpoint Modules**: Build API modules for bills, invoices, payments, ledger
3. **Update Type Definitions**: Ensure TypeScript types match Grails domains exactly
4. **Test Authentication Flow**: Verify token-based auth with backend
5. **Implement Dashboard**: Use combined endpoint for stats + graphs
6. **Handle Edge Cases**: Test multi-currency, soft deletes, filtering
7. **Error Handling**: Implement constructive error messages per agent-friendly-code-rules

---

**Research Duration**: ~45 minutes
**Files Analyzed**: 9 controllers, 3 domain classes
**Endpoints Documented**: 40+ REST endpoints across 8 controllers
