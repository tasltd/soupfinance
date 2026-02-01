# Research: Soupmarkets Backend - Finance, KYC, and Multi-Tenancy Structure

**Date**: 2026-01-20
**Query**: Explore soupmarkets-web Grails backend for Finance module, Corporate KYC, Multi-tenancy, Spring Security REST, and Client user connections
**Duration**: ~45 minutes

## Executive Summary

The Soupmarkets Grails 6.2.3 backend implements a comprehensive financial brokerage platform with double-entry bookkeeping, discriminator-based multi-tenancy, and a sophisticated KYC workflow. SoupFinance integration will primarily interact with the finance module domains (Invoice, Bill, LedgerAccount, LedgerTransaction) and may need to understand the Corporate KYC structure for client invoicing.

---

## 1. Multi-Tenancy Implementation

### Base Class: `SbDomain`

All domain classes extend `SbDomain` which implements discriminator-based multi-tenancy.

**Location**: `grails-app/domain/soupbroker/SbDomain.groovy`

**Key Pattern**:
```groovy
class SbDomain implements MultiTenant<T> {
    String tenantId  // Discriminator column for tenant isolation
    String serialised  // Cached string representation
    Date dateCreated
    Date lastUpdated
}
```

### Tenant Context Resolution

**`Account.current()`** - Returns the current tenant's Account via ThreadLocal context.

```groovy
// Usage in domain classes
account = account ?: Account.current()
```

### Cross-Tenant Queries

```groovy
// Bypass tenant filtering for cross-tenant operations
Tenants.withoutId {
    return Individual.get(id) ?: Corporate.get(id)
}
```

### Active Tenants
- Demo Securities
- Strategic African Securities (SAS)
- Users can have agents in multiple tenants

---

## 2. Finance Module Structure

### 2.1 Chart of Accounts Hierarchy

```
LedgerGroup (enum)
    ├── ASSET (normal DEBIT balance)
    ├── LIABILITY (normal CREDIT balance)
    ├── EQUITY (normal CREDIT balance)
    │   ├── INCOME (sub-group, normal CREDIT)
    │   ├── EXPENSE (sub-group, normal DEBIT)
    │   ├── SHARES (sub-group, normal CREDIT)
    │   └── DIVIDENDS (sub-group, normal DEBIT)

LedgerAccountCategory
    └── LedgerAccount (individual accounts in Chart of Accounts)
        └── LedgerTransaction (double-entry journal entries)
```

### 2.2 Core Finance Domains

#### LedgerAccount (`soupbroker.finance.LedgerAccount`)
**Location**: `grails-app/domain/soupbroker/finance/LedgerAccount.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Account name (unique, required) |
| `number` | String | Optional account code for COA ordering |
| `description` | String | Account purpose description |
| `ledgerAccountCategory` | LedgerAccountCategory | Determines account group (ASSET/LIABILITY/etc) |
| `parentAccount` | LedgerAccount | Hierarchical parent for drill-down reporting |
| `currency` | Currency | Primary currency for the account |
| `systemAccount` | boolean | True if system-generated (non-editable) |
| `cashFlow` | boolean | True if appears in cash flow statements |
| `security` | Security | Optional linked security for trading accounts |

**Key Methods**:
- `getLedgerState()` - Returns normal balance (DEBIT/CREDIT)
- `getNetMovement()` - Calculates net change in balance
- `getCurrentExchangeRate()` - Gets currency conversion rate

#### LedgerAccountCategory (`soupbroker.finance.LedgerAccountCategory`)
**Location**: `grails-app/domain/soupbroker/finance/LedgerAccountCategory.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Category name (unique, required) |
| `ledgerGroup` | LedgerGroup | Main group (ASSET/LIABILITY/EQUITY) |
| `ledgerSubGroup` | LedgerSubGroup | Sub-group (INCOME/EXPENSE for EQUITY accounts) |
| `ledgerGroupType` | LedgerGroupType | Specific equity type (RETAINED_EARNINGS, etc.) |
| `parentCategory` | LedgerAccountCategory | Hierarchical parent |

#### LedgerTransaction (`soupbroker.finance.LedgerTransaction`)
**Location**: `grails-app/domain/soupbroker/finance/LedgerTransaction.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `journalEntryType` | JournalEntryType | DOUBLE_ENTRY or SINGLE_ENTRY |
| `debitLedgerAccount` | LedgerAccount | Debit side (for double-entry) |
| `creditLedgerAccount` | LedgerAccount | Credit side (for double-entry) |
| `ledgerAccount` | LedgerAccount | Account (for single-entry) |
| `transactionState` | LedgerState | DEBIT or CREDIT (for single-entry) |
| `amount` | Double | Transaction amount in currency |
| `baseAmount` | Double | Amount in base currency |
| `exchangeRate` | double | Currency conversion rate |
| `currency` | Currency | Transaction currency |
| `transactionDate` | Date | Date of transaction |
| `relatedToId` | String | UUID of source domain (e.g., Invoice, Bill) |
| `relatedToClass` | String | Class name of source domain |
| `relatedToProperty` | String | Property name for polymorphic linking |
| `status` | ApprovalState | PENDING, APPROVED, REJECTED |
| `verifiedTransaction` | boolean | True if verified/reconciled |

**Key Relationships**:
- `hasMany: [approvals: LedgerTransactionApproval]`

### 2.3 Accounts Receivable (Invoice)

#### Invoice (`soupbroker.finance.Invoice`)
**Location**: `grails-app/domain/soupbroker/finance/Invoice.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `accountServices` | AccountServices | Client account being invoiced (required) |
| `client` | Client | Client entity (optional) |
| `numberPrefix` | String | Invoice number prefix ("INV-") |
| `number` | Long | Sequential invoice number (unique) |
| `invoiceDate` | Date | Issue date (default: today) |
| `paymentDate` | Date | Due date (default: today + 30) |
| `currency` | Currency | Invoice currency |
| `exchangeRate` | double | Conversion to base currency |
| `status` | PaymentStatus | PENDING, PARTIAL, PAID |
| `notes` | String | Optional notes (TEXT) |
| `compliments` | String | Closing message (TEXT) |

**Relationships**:
- `hasMany: [invoiceItemList: InvoiceItem, invoicePaymentList: InvoicePayment, invoiceTaxEntryList: InvoiceTaxEntry]`

**Calculated Properties**:
- `getSubTotal()` - Sum of line item amounts
- `getTotal()` - Subtotal + tax
- `getPaidAmount()` - Sum of payments
- `getAmountDue()` - Total - paid

**Aging Methods** (for A/R reporting):
- `getNotYetOverdue(Date)`
- `getThirtyOrLessDaysOverdue(Date)`
- `getThirtyOneToSixtyDaysOverdue(Date)`
- `getSixtyOneToNinetyDaysOverdue(Date)`
- `getNinetyOneOrMoreDaysOverdue(Date)`

#### InvoiceItem (`soupbroker.finance.InvoiceItem`)
**Location**: `grails-app/domain/soupbroker/finance/InvoiceItem.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `invoice` | Invoice | Parent invoice (required) |
| `serviceDescription` | ServiceDescription | Service/product catalog item |
| `description` | String | Line item description |
| `quantity` | double | Quantity (default: 1.0) |
| `unitPrice` | BigDecimal | Unit price |
| `taxEntries` | Set<TaxEntry> | Applied tax rates |
| `priority` | int | Display order |

**Calculated Properties**:
- `getAmount()` - unitPrice * quantity
- `getTaxAmount()` - Sum of tax calculations
- `getTotalAmount()` - amount + taxAmount

### 2.4 Accounts Payable (Bill)

#### Bill (`soupbroker.finance.Bill`)
**Location**: `grails-app/domain/soupbroker/finance/Bill.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `vendor` | Vendor | Vendor who issued the bill (required) |
| `numberPrefix` | String | Bill number prefix |
| `number` | Long | Sequential bill number (unique per prefix) |
| `billDate` | Date | Receipt/issue date (default: today) |
| `paymentDate` | Date | Due date (default: today + 30) |
| `currency` | Currency | Bill currency |
| `exchangeRate` | double | Conversion to base currency |
| `status` | PaymentStatus | PENDING, PARTIAL, PAID |
| `accountServices` | AccountServices | Client account for expense attribution |
| `feeType` | SchemeFeeType | Type of fee (for fund management) |

**Relationships**:
- `hasMany: [billItemList: BillItem, billPaymentList: BillPayment, attachedFileList: BillAttachedFile, billTaxEntryList: BillTaxEntry]`

**Aging Methods** (for A/P reporting): Same pattern as Invoice

### 2.5 Vouchers (Deposits/Payments)

#### Voucher (`soupbroker.finance.Voucher`)
**Location**: `grails-app/domain/soupbroker/finance/Voucher.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `voucherTo` | VoucherTo | CLIENT, VENDOR, STAFF, OTHER |
| `voucherType` | VoucherType | DEPOSIT, PAYMENT, RECEIPT |
| `vendor` | Vendor | If voucher is to vendor |
| `staff` | Agent | If voucher is to staff |
| `accountServices` | AccountServices | Client account |
| `requestChannel` | RequestChannel | Source channel |

### 2.6 Key Finance Enums

```groovy
// Location: src/main/groovy/soupbroker/finance/

enum LedgerGroup {
    ASSET(LedgerState.DEBIT),
    LIABILITY(LedgerState.CREDIT),
    EQUITY(LedgerState.CREDIT),
    INCOME(LedgerState.CREDIT, EQUITY),
    EXPENSE(LedgerState.DEBIT, EQUITY),
    SHARES(LedgerState.CREDIT, EQUITY),
    DIVIDENDS(LedgerState.DEBIT, EQUITY)
}

enum LedgerState { DEBIT, CREDIT }

enum PaymentStatus { PENDING, PROCESSING, PARTIAL, PAID, FAILED, EXPIRED }

enum JournalEntryType { DOUBLE_ENTRY, SINGLE_ENTRY }

enum VoucherType { DEPOSIT, PAYMENT, RECEIPT }

enum VoucherTo { CLIENT, VENDOR, STAFF, OTHER }
```

---

## 3. Corporate KYC Structure

### Client Inheritance Pattern

```
Client (base class)
    ├── Individual (person clients)
    ├── Corporate (company clients)
    └── InTrustForClient (trust account clients)
```

Uses **foreign key ID mapping** - Corporate and Client share the same primary key.

### Client (`soupbroker.kyc.Client`)
**Location**: `grails-app/domain/soupbroker/kyc/Client.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `account` | Account | Tenant (brokerage firm) |
| `state` | ApprovalState | Workflow state |
| `CSD_ID` | String | Central Securities Depository ID |
| `investmentFundAccount` | LedgerAccount | Client cash deposits (LIABILITY) |
| `investmentSecurityAccount` | LedgerAccount | Client security holdings (LIABILITY) |
| `pinCode` | String | Hashed PIN for auth |
| `riskProfile` | RiskProfile | Investment risk tolerance |
| `relationshipManager` | Agent | Assigned agent |
| `deleted` | boolean | Hard delete flag |
| `extReference` | String | External system ID (unique) |

**Key Relationships**:
- `hasMany: [clientContactList: ClientContact, bankDetailsList: ClientBankDetails, portfolioList: ClientPortfolio, invoiceList: Invoice, ...]`

**Key Methods**:
- `getSpecClient()` - Returns Individual, Corporate, or InTrustForClient
- `getName()` - Display name from spec client
- `getCurrentBalance()` - Cash balance
- `getInvestmentFundCurrentBalance()` - Investment fund balance

### Corporate (`soupbroker.kyc.Corporate`)
**Location**: `grails-app/domain/soupbroker/kyc/Corporate.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `client` | Client | Base client record (shared ID) |
| `name` | String | Registered company name (required) |
| `businessCategory` | BusinessCategory | Entity type (LIMITED_LIABILITY, etc.) |
| `certificateOfIncorporationNumber` | String | Registration number |
| `registrationDate` | Date | Incorporation date |
| `taxIdentificationNumber` | String | Tax ID / VAT number |
| `countryOfIncorporation` | String | ISO country code |
| `natureOfBusiness` | String | Business description |
| `industry` | ClientIndustry | Industry classification |
| `annualTurnOver` | AnnualTurnOver | Revenue bracket |
| `is_FATCA_Applicable` | boolean | US tax compliance flag |
| `accountMandateRule` | AccountMandateRule | Signing authority rules |
| `corporateDocuments` | CorporateDocuments | Document uploads (embedded) |
| `vendor` | Vendor | If also a trading counterparty |

**Relationships**:
- `hasMany: [signatoriesAndDirectorsList: CorporateAccountPerson]`

**Property Delegation**: Corporate implements `propertyMissing` to delegate to Client.

### ApprovalState Workflow

```groovy
enum ApprovalState {
    REJECTED(-1),
    BLOCKED(0),
    PENDING(1),
    UPDATED(2),
    CHECKED(3),
    APPROVED(4),
    COMPLIANCE(5),
    EXECUTIVE(6),
    ALL(7)
}
```

**Workflow**: PENDING -> CHECKED -> APPROVED -> COMPLIANCE -> EXECUTIVE

---

## 4. Authentication Structure

### Agent vs ClientContact

| Type | Domain | Purpose |
|------|--------|---------|
| `Agent` | `soupbroker.security.Agent` | Staff/admin users with roles and permissions |
| `ClientContact` | `soupbroker.kyc.ClientContact` | Client users for client portal |

### Agent (`soupbroker.security.Agent`)
**Location**: `grails-app/domain/soupbroker/security/Agent.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `userAccess` | SbUser | Login credentials |
| `department` | Department | Module access control |
| `authorities` | Set<SbRole> | Direct role assignments |
| `groupAuthorities` | Set<SbRoleGroup> | Role group memberships |
| `theme` | Theme | UI theme preference |
| `disabled` | boolean | Account disabled flag |

**Key Methods**:
- `hasModuleAccess(String moduleName)` - Check department access
- `hasPermission(String domainClassName, String permissionType)` - Check CRUD permissions
- `getEffectiveRoles()` - Combines direct and group roles

### Authentication Flow (`AuthenticatorController`)
**Location**: `grails-app/controllers/soupbroker/AuthenticatorController.groovy`

1. **`/authenticator/user`** - Identifies user type (AGENT or CLIENT)
2. **`/authenticator/verification`** - Generates 2FA OTP via OtpService
3. **`/authenticator/verifyCode`** - Validates OTP, handles multi-tenant selection

### Multi-Tenant Login

When a user has agents in multiple tenants:
1. `verifyCode` returns `tenantSelection: true` with list of tenants
2. User selects tenant
3. Agent is loaded for selected tenant

---

## 5. Vendor Domain (Trading Counterparty)

### Vendor (`soupbroker.trading.Vendor`)
**Location**: `grails-app/domain/soupbroker/trading/Vendor.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Vendor name (required) |
| `symbol` | String | Short identifier |
| `vendorType` | VendorType | BROKER, MARKET_MAKER, CUSTODIAN, SUPPLIER |
| `ledgerAccount` | LedgerAccount | Auto-created A/P ledger account |

**Relationships**:
- `hasMany: [billList: Bill, vendorBankDetailsList: VendorBankDetails]`

**Key Methods**:
- `initiateLedgerAccount()` - Creates/links A/P ledger account
- A/P aging methods (same pattern as Invoice/Bill)

---

## 6. API Endpoint Structure

### URL Mappings
**Location**: `grails-app/controllers/soupbroker/UrlMappings.groovy`

**REST API Pattern** (when SPA_ENABLED):
```
/rest/api/login
/rest/api/logout
/rest/api/validate
/rest/$controller/$action?/$id?(.$format)?
/rest/$module/$controller/$action?/$id?(.$format)?
```

**Modules**: `trading`, `finance`, `funds`, `setting`, `tools`, `sales`, `kyc`, `clients`, `admin`, `staff`

### Finance Controllers (33 total)
**Location**: `grails-app/controllers/soupbroker/finance/`

| Controller | Domain |
|------------|--------|
| `InvoiceController` | Invoice |
| `InvoiceItemController` | InvoiceItem |
| `InvoicePaymentController` | InvoicePayment |
| `BillController` | Bill |
| `BillItemController` | BillItem |
| `BillPaymentController` | BillPayment |
| `VoucherController` | Voucher |
| `LedgerAccountController` | LedgerAccount |
| `LedgerAccountCategoryController` | LedgerAccountCategory |
| `LedgerTransactionController` | LedgerTransaction |
| `TaxEntryController` | TaxEntry |
| `ExchangeRateController` | ExchangeRate |
| `FinanceReportsController` | Financial reports |
| `ServiceDescriptionController` | Service/product catalog |

---

## 7. Double-Entry Accounting Flows

### Invoice Creation (A/R)
```
Debit: Accounts Receivable (ASSET)
Credit: Revenue/Income (INCOME)
```

### Invoice Payment Received
```
Debit: Bank (ASSET)
Credit: Accounts Receivable (ASSET)
```

### Bill Creation (A/P)
```
Debit: Expense (EXPENSE)
Credit: Accounts Payable (LIABILITY)
```

### Bill Payment Made
```
Debit: Accounts Payable (LIABILITY)
Credit: Bank (ASSET)
```

### Client Deposit for Investment
```
Debit: Client Deposits/Bank (ASSET)
Credit: Client Investment Fund (LIABILITY)
```

---

## 8. Key Integration Points for SoupFinance

### Finance Module Integration

| SoupFinance Feature | Soupmarkets Domain | API Endpoint Pattern |
|---------------------|-------------------|---------------------|
| Invoices | Invoice, InvoiceItem | `/rest/finance/invoice/*` |
| Bills | Bill, BillItem | `/rest/finance/bill/*` |
| Payments | InvoicePayment, BillPayment | `/rest/finance/invoicePayment/*` |
| Chart of Accounts | LedgerAccount, LedgerAccountCategory | `/rest/finance/ledgerAccount/*` |
| Journal Entries | LedgerTransaction | `/rest/finance/ledgerTransaction/*` |
| Vendors | Vendor | `/rest/trading/vendor/*` |
| Services Catalog | ServiceDescription | `/rest/finance/serviceDescription/*` |
| Tax Rates | TaxEntry | `/rest/finance/taxEntry/*` |
| Exchange Rates | ExchangeRate | `/rest/finance/exchangeRate/*` |

### Client/Corporate Integration

| SoupFinance Feature | Soupmarkets Domain | API Endpoint Pattern |
|---------------------|-------------------|---------------------|
| Customer List | Client, Corporate, Individual | `/rest/kyc/client/*`, `/rest/kyc/corporate/*` |
| Customer Balance | Client.getCurrentBalance() | Via client detail endpoint |
| Invoice Assignment | AccountServices | Via invoice create |

### Authentication Integration

| Feature | Endpoint | Notes |
|---------|----------|-------|
| Login | `/rest/api/login` | Returns JWT token |
| Logout | `/rest/api/logout` | Invalidates token |
| Validate | `/rest/api/validate` | Validates current session |
| 2FA | `/authenticator/*` | Multi-tenant aware |

---

## 9. Data Patterns

### All IDs are UUIDs
```groovy
String id  // UUID string, never integer
```

### Soft Delete Pattern
```groovy
boolean archived = false  // Soft delete flag
```

### FormData Binding (NOT JSON)
POST/PUT requests use FormData serialization with FK binding:
```
"client.id": uuid
"vendor.id": uuid
```

### Pagination Pattern
```groovy
static searchList = { params = [:], Closure closure = {} ->
    SoupResultTransformer.transformList owner, Boolean.valueOf(params.projectionsOnly?:false),
        createCriteria().list(params) {
            projections { distinct("id") }
            eq('archived', false)
            // ... filters
        }
}
```

---

## 10. Files Examined

### Finance Domains
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/Invoice.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/InvoiceItem.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/Bill.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/LedgerAccount.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/LedgerAccountCategory.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/LedgerTransaction.groovy` (from summary)
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/finance/Voucher.groovy` (from summary)

### KYC Domains
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/kyc/Client.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/kyc/Corporate.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/kyc/ClientContact.groovy`

### Security/Auth
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/security/Agent.groovy` (from summary)
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/AuthenticatorController.groovy` (from summary)

### Trading
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/trading/Vendor.groovy` (from summary)

### Enums
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/src/main/groovy/soupbroker/finance/LedgerGroup.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/src/main/groovy/soupbroker/finance/LedgerState.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/src/main/groovy/soupbroker/finance/PaymentStatus.groovy`
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/src/main/groovy/soupbroker/kyc/ApprovalState.groovy`

### Configuration
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/UrlMappings.groovy`

---

## 11. Recommendations for SoupFinance

1. **API Integration**: Use REST endpoints at `/rest/finance/*` for invoice/bill CRUD operations

2. **Authentication**: Implement JWT auth flow via `/rest/api/login` with 2FA support

3. **Multi-Tenancy**: Include tenant context in all requests (via JWT or header)

4. **Data Binding**: Use FormData for POST/PUT, with FK binding pattern `"entity.id": uuid`

5. **Pagination**: Expect `searchList` pattern responses with distinct ID projections

6. **Aging Reports**: Leverage existing aging calculation methods on Invoice/Bill domains

7. **Chart of Accounts**: Use existing LedgerAccountCategory/LedgerAccount hierarchy

8. **Currency**: Support multi-currency with `exchangeRate` field pattern

9. **Client/Customer**: Use Corporate/Individual via Client base class pattern

10. **Soft Delete**: Respect `archived` flag in all queries
