# SSR → SPA Gap Analysis & Implementation Plan

**Date**: 2026-02-07
**Status**: DRAFT - Pending Review (Design Cross-Reference Complete)
**Scope**: All finance modules in soupmarkets-web SSR vs soupfinance-web SPA
**Design Files**: 43 design screens in `/soupfinance-designs/` cross-referenced in §8

---

## Executive Summary

The backend SSR (Grails GSP) has **20 finance menu items** and **9 report types**. The SPA currently implements the core modules but is missing several modules and has field-level gaps in existing pages. This plan documents every gap and proposes implementation priorities.

**Dashboard is excluded** from this analysis per user instruction - current SPA dashboard implementation is kept as-is.

---

## 1. MODULE-LEVEL GAP ANALYSIS

### Legend
- **FULL** = SPA has complete parity with SSR
- **PARTIAL** = SPA exists but missing fields/features
- **MISSING** = No SPA implementation exists
- **N/A** = Not applicable to SoupFinance (trading-specific)

### Finance Modules (SSR Sidebar → SPA)

| # | SSR Module | SSR Controller | SPA Route | Status | Priority |
|---|-----------|----------------|-----------|--------|----------|
| 1 | Financial Year | `financialYear` | -- | **MISSING** | P1 |
| 2 | Chart of Accounts | `ledgerAccount` | `/ledger/accounts` | **PARTIAL** | P1 |
| 3 | Transactions | `ledgerTransaction` | `/ledger/transactions`, `/accounting/transactions` | **PARTIAL** | P1 |
| 4 | Account Category | `ledgerAccountCategory` | -- | **MISSING** | P2 |
| 5 | Journal | `ledgerJournal` | `/accounting/journal-entry` | **PARTIAL** | P1 |
| 6 | Voucher | `voucher` | `/accounting/voucher/*` | **PARTIAL** | P1 |
| 7 | Coupons & Maturities | `orderRequest` | -- | **N/A** | -- |
| 8 | Pending Settlement | `orderRequest` | -- | **N/A** | -- |
| 9 | Invoice | `invoice` | `/invoices/*` | **PARTIAL** | P1 |
| 10 | Invoice Item | `invoiceItem` | (inline in invoice form) | **PARTIAL** | P2 |
| 11 | Invoice Payment | `invoicePayment` | `/payments/new` | **PARTIAL** | P1 |
| 12 | Bill | `bill` | `/bills/*` | **PARTIAL** | P1 |
| 13 | Bill Item | `billItem` | (inline in bill form) | **PARTIAL** | P2 |
| 14 | Bill Payment | `billPayment` | `/payments/new` | **PARTIAL** | P1 |
| 15 | Supplier/Vendor | `supplier` | `/vendors/*` | **PARTIAL** | P1 |
| 16 | Invoice/Bill Services | `serviceDescription` | -- | **MISSING** | P1 |
| 17 | Exchange Rate | `exchangeRate` | -- | **MISSING** | P2 |
| 18 | Tax Entry | `taxEntry` | -- | **MISSING** | P1 |
| 19 | Budget | `budget` | -- | **MISSING** | P2 |
| 20 | Budget Category | `budgetCategory` | -- | **MISSING** | P2 |
| 21 | Budget Entry | `budgetEntry` | -- | **MISSING** | P2 |
| 22 | Finance Data Sync | `tradeFinanceSync` | -- | **N/A** | -- |

### Finance Reports (SSR → SPA)

| # | SSR Report | SSR Action | SPA Route | Status | Priority |
|---|-----------|------------|-----------|--------|----------|
| 1 | Account Balances | `accountBalances` | -- | **MISSING** | P1 |
| 2 | Account Transactions | `accountTransactions` | -- | **MISSING** | P1 |
| 3 | Trial Balance | `trialBalance` | `/reports/trial-balance` | **PARTIAL** | P1 |
| 4 | Balance Sheet | `balanceSheet` | `/reports/balance-sheet` | **PARTIAL** | P1 |
| 5 | Income Statement | `incomeStatement` | `/reports/pnl` | **PARTIAL** | P1 |
| 6 | Income By Client | `clientIncome` | -- | **MISSING** | P2 |
| 7 | Aged Receivables | `agedReceivables` | `/reports/aging` (combined) | **PARTIAL** | P1 |
| 8 | Purchases By Vendors | `vendorPurchases` | -- | **MISSING** | P2 |
| 9 | Aged Payables | `agedPayables` | `/reports/aging` (combined) | **PARTIAL** | P1 |

### Settings/Account (SSR → SPA)

| # | SSR Module | SSR Controller | SPA Route | Status | Priority |
|---|-----------|----------------|-----------|--------|----------|
| 1 | Account Settings | `account` | `/settings/account` | **PARTIAL** | P1 |
| 2 | Bank Details | `accountBankDetails` | `/settings/bank-accounts/*` | **PARTIAL** | P1 |
| 3 | Staff/Team | `accountPerson` | (via `/settings/users`) | **PARTIAL** | P1 |
| 4 | Users/Agents | `agent` | `/settings/users/*` | **PARTIAL** | P1 |
| 5 | Account Services | `accountServices` | -- | **N/A** | -- |
| 6 | Account Modules | `accountModule` | -- | **N/A** | -- |
| 7 | Clients | `client` | `/clients/*` | **PARTIAL** | P1 |

---

## 2. FIELD-LEVEL GAP ANALYSIS (Existing Pages)

### 2.1 Invoice Form (`/invoices/new`, `/invoices/:id/edit`)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `accountServices` (dropdown) | Client dropdown → resolves to `accountServices.id` | DONE | SPA uses Client as proxy |
| `numberPrefix` | -- | **MISSING** | Text field for invoice number prefix |
| `number` | -- | **MISSING** | Auto-generated but editable in SSR |
| `purchaseOrderNumber` | PO Number | DONE | |
| `salesOrderNumber` | -- | **MISSING** | Text field |
| `invoiceDate` | Invoice Date | DONE | |
| `paymentDate` | Due Date | DONE | |
| `currency` | -- | **MISSING** | Currency selector (defaults to account currency) |
| `exchangeRate` | -- | **MISSING** | Number, shown when currency != account currency |
| `notes` | Notes | DONE | |

**Invoice Item (line items) gaps:**

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `serviceDescription` (dropdown) | Service/Product dropdown | DONE | Added in recent session |
| `description` | Description | DONE | |
| `quantity` | Qty | DONE | |
| `unitPrice` | Unit Price | DONE | |
| `priority` | -- | **MISSING** | Sort order for line items |
| `taxEntries` (multi-select) | Tax % (single rate) | **PARTIAL** | SSR allows MULTIPLE tax entries per item; SPA only has single tax rate |
| `totalExpectation` | -- | **MISSING** | Transient expected total field |

### 2.2 Bill Form (`/bills/new`, `/bills/:id/edit`)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `vendor` (dropdown) | Vendor dropdown | DONE | |
| `numberPrefix` | -- | **MISSING** | Text field for bill number prefix |
| `number` | -- | **MISSING** | Auto-generated but editable |
| `purchaseOrderNumber` | -- | **MISSING** | Text field |
| `salesOrderNumber` | -- | **MISSING** | Text field |
| `billDate` | Issue Date | DONE | Field name mismatch: SSR=`billDate`, SPA=`issueDate` |
| `paymentDate` | Due Date | DONE | |
| `currency` | -- | **MISSING** | Currency selector |
| `exchangeRate` | -- | **MISSING** | Number field |
| `notes` | Notes | DONE | |
| `accountAttributed` | -- | **N/A** | Trading-specific (attribute bill to client account) |
| `scheme` | -- | **N/A** | Trading-specific |
| `feeType` | -- | **N/A** | Trading-specific |

**Bill Item (line items) gaps:** Same as Invoice Item gaps above (multi-select `taxEntries`, `priority`).

### 2.3 Vendor/Supplier Form (`/vendors/new`, `/vendors/:id/edit`)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `name` | `name` | DONE | |
| `symbol` | -- | **MISSING** | Unique symbol/short code |
| `csdIdPrefix` | -- | **N/A** | Trading-specific (CSD = Central Securities Depository) |
| `vendorType` | -- | **MISSING** | Vendor type enum (if applicable) |
| `residentialAddress` | `address` | PARTIAL | SSR has `residentialAddress` AND `postalAddress` |
| `postalAddress` | -- | **MISSING** | Separate postal address |
| `market` | -- | **N/A** | Trading-specific |
| `exchange` | -- | **N/A** | Trading-specific |
| `marketParticipant` | -- | **N/A** | Trading-specific |
| `primaryDealing` | -- | **N/A** | Trading-specific |
| `ledgerAccount` | -- | **MISSING** | FK to LedgerAccount (edit only) |
| `archived` | -- | **MISSING** | Soft-delete toggle (edit only) |
| `emailContacts` | -- | **MISSING** | Related list of email contacts |
| `phoneContacts` | -- | **MISSING** | Related list of phone contacts |
| `email` | `email` | DONE | SPA has single email field |
| `phoneNumber` | `phoneNumber` | DONE | SPA has single phone field |
| `taxIdentificationNumber` | `taxIdentificationNumber` | DONE | |
| `paymentTerms` | `paymentTerms` | DONE | |
| `notes` | `notes` | DONE | |

### 2.4 Client Form (`/clients/new`, `/clients/:id/edit`)

SSR uses `<f:all bean="client"/>` (auto-renders all domain fields). The Client domain is complex (base class for Individual/Corporate/InTrustForClient). SPA has a simplified form with clientType toggle.

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `clientType` toggle | `clientType` (INDIVIDUAL/CORPORATE) | DONE | |
| `firstName` | `firstName` | DONE | Individual only |
| `lastName` | `lastName` | DONE | Individual only |
| `companyName` | `companyName` | DONE | Corporate only |
| `contactPerson` | `contactPerson` | DONE | Corporate only |
| `registrationNumber` | `registrationNumber` | DONE | Corporate only |
| `taxNumber` | `taxNumber` | DONE | Corporate only |
| `email` | `email` | DONE | |
| `phone` | `phone` | DONE | |
| `address` | `address` | DONE | |
| `CSD_ID` | -- | **N/A** | Trading-specific |
| `state` (ApprovalState) | -- | **N/A** | Trading-specific |

Client form appears relatively complete for finance use cases.

### 2.5 Invoice Payment (`/payments/new` for invoices)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `invoice` (dropdown) | Invoice dropdown | DONE | SPA filters to unpaid only |
| `amount` | Amount | DONE | |
| `paymentDate` | Payment Date | DONE | |
| `paymentMethod` | Payment Method | DONE | |
| `payInAccount` (ledger account) | -- | **MISSING** | Dropdown filtered to bank detail ledger accounts |
| `notes` | Notes | DONE | |

### 2.6 Bill Payment (`/payments/new` for bills)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `bill` (dropdown) | Bill dropdown | DONE | |
| `amount` | Amount | DONE | |
| `paymentDate` | Payment Date | DONE | |
| `paymentMethod` | Payment Method | DONE | |
| `payOutAccount` (ledger account) | -- | **MISSING** | Dropdown filtered to bank detail ledger accounts |
| `paymentReceipt` (file upload) | -- | **MISSING** | File upload for payment receipt |
| `notes` | Notes | DONE | |

### 2.7 Voucher Form (`/accounting/voucher/*`)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `voucherType` (DEPOSIT/PAYMENT/RECEIPT) | `voucherType` tab selector | DONE | |
| `voucherTo` (CLIENT/VENDOR/STAFF/OTHER) | `voucherTo` radio | DONE | |
| `currency` | -- | **MISSING** | Currency selector |
| `exchangeRate` | -- | **MISSING** | Number field |
| `amount` | `amount` | DONE | |
| `paymentMethod` | -- | **MISSING** | Payment method dropdown |
| `transactionDate` | `voucherDate` | DONE | Different field name |
| `notes` | `description` | DONE | Different field name |
| `voucherStation` | -- | **N/A** | Trading-specific |
| `debitLedgerAccount` | `cashAccountId` + `expenseAccountId` | PARTIAL | SSR shows balance; SPA doesn't |
| `creditLedgerAccount` | `incomeAccountId` | PARTIAL | SSR shows balance; SPA doesn't |
| `beneficiaryInfo` (for OTHER) | conditional field | DONE | |
| Account balance display | -- | **MISSING** | SSR shows read-only balance for selected ledger accounts |

### 2.8 Ledger Account Form (`/ledger/accounts`)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `name` | `name` | DONE | |
| `description` | `description` | DONE | |
| `number` | `number` | DONE | |
| `ledgerAccountCategory` | `ledgerAccountCategory` | DONE | |
| `parentAccount` | -- | **MISSING** | Parent account for hierarchy |
| `currency` | -- | **MISSING** | Currency for the account |
| `cashFlow` | -- | **MISSING** | Cash flow classification |
| `hiddenAccount` | -- | **MISSING** | Boolean to hide from lists |
| `editable` | -- | **MISSING** | Boolean - can be edited |
| `deletable` | -- | **MISSING** | Boolean - can be deleted |
| `archived` | -- | **MISSING** | Soft-delete (edit only) |
| `security` | -- | **N/A** | Trading-specific |

### 2.9 Ledger Transaction (Batch Create)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `currency` | -- | **MISSING** | Currency for the transaction group |
| `exchangeRate` | -- | **MISSING** | Exchange rate if different currency |
| `transactionDate` | `entryDate` | DONE | Different field name |
| `useDifferentLedgerTransactionDates` | -- | **MISSING** | Toggle for per-entry dates |
| Per-entry: `notes` | Per-entry: `description` | DONE | Different field name |
| Per-entry: `ledgerAccount` | Per-entry: `account` | DONE | |
| Per-entry: `debit` | Per-entry: `debit` | DONE | |
| Per-entry: `credit` | Per-entry: `credit` | DONE | |
| Per-entry: `transactionDate` | -- | **MISSING** | Only if `useDifferentDates` is on |
| Balance check (totalDebit == totalCredit) | Balance check | DONE | |

### 2.10 Account Settings (`/settings/account`)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `name` | `name` | DONE | |
| `currency` | `currency` | DONE | |
| `address` | `address` | DONE | |
| `website` | `website` | DONE | |
| `location` | `location` | DONE | |
| `countryOfOrigin` | `countryOfOrigin` | DONE | |
| `logo` | -- | **MISSING** | Image upload |
| `favicon` | -- | **MISSING** | Image upload |
| `designation` | `designation` | DONE | |
| `slogan` | `slogan` | DONE | |
| `emailSubjectPrefix` | `emailSubjectPrefix` | DONE | |
| `smsIdPrefix` | `smsIdPrefix` | DONE | |
| `preferredTemplateLayout` | -- | **EXCLUDED** | Fixed at Vertical per decision - not configurable |
| `startOfFiscalYear` | -- | **MISSING** | Date field for fiscal year start |
| `businessLicenceCategory` | `businessLicenceCategory` | DONE | |
| `emailContacts` | -- | **MISSING** | Multi-contact with priority |
| `phoneContacts` | -- | **MISSING** | Multi-contact with priority |

### 2.11 Bank Details Form (`/settings/bank-accounts/*`)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `priority` | `priority` (PRIMARY/SECONDARY) | DONE | |
| `bank` | `bankId` | DONE | |
| `bankForOtherOption` | `bankForOtherOption` | DONE | |
| `accountName` | `accountName` | DONE | |
| `bankBranch` | `bankBranch` | DONE | |
| `accountNumber` | `accountNumber` | DONE | |
| `currency` | `currency` | DONE | |
| `ledgerAccount` | `ledgerAccountId` | DONE | Filtered to ASSET group |
| `defaultClientDebtAccount` | `defaultClientDebtAccount` | DONE | |
| `defaultClientEquityAccount` | `defaultClientEquityAccount` | DONE | |

Bank details form appears complete.

### 2.12 User/Agent Form (`/settings/users/*`)

| SSR Field | SPA Field | Status | Notes |
|-----------|-----------|--------|-------|
| `firstName` | `firstName` | DONE | |
| `lastName` | `lastName` | DONE | |
| `otherNames` | `otherNames` | DONE | |
| `designation` | `designation` | DONE | |
| `address` | `address` | DONE | |
| `email` | `email` | DONE | SSR: comma-separated list; SPA: single |
| `phone` | `phone` | DONE | SSR: comma-separated list; SPA: single |
| `username` | `username` | DONE | |
| `password` | `password` | DONE | |
| `profile` | -- | **MISSING** | Agent profile/type |
| `userAccess` | -- | **MISSING** | User access level |
| `theme` | -- | **MISSING** | UI theme preference |
| `daylightChanges` | -- | **MISSING** | Timezone/daylight savings |
| `accountPerson` | Account Person section | PARTIAL | SPA has some fields |
| `showOnFlows` | -- | **N/A** | Trading-specific |
| `traderCode` | -- | **N/A** | Trading-specific |
| `archived` | -- | **MISSING** | Soft-delete toggle |
| `disabled` | -- | **MISSING** | Disable user access |
| Roles | Roles checkboxes | DONE | |

### 2.13 Finance Reports Filter Gaps

| Report | SSR Filters | SPA Filters | Missing |
|--------|------------|-------------|---------|
| **Trial Balance** | dateRange, from, to, security, verifiedTransaction, isParentChecked | from, to | dateRange preset, verifiedTransaction, isParentChecked |
| **Balance Sheet** | dateRange, to, isParentChecked, verifiedTransaction | asOf (to) | dateRange preset, isParentChecked, verifiedTransaction |
| **Income Statement** | dateRange, from, to, verifiedTransaction, isParentChecked | from, to | dateRange preset, verifiedTransaction, isParentChecked |
| **Aging (AR/AP)** | to | asOf (to) | Minimal gap - SPA is adequate |
| **Account Balances** | dateRange, from, to, ledgerAccount, verifiedTransaction, isParentChecked | -- | **Entire report missing** |
| **Account Transactions** | ledgerAccount, dateRange, from, to, verifiedTransaction, relatedToClass, relatedToId | -- | **Entire report missing** |
| **Client Income** | dateRange, from, to, accountServices | -- | **Entire report missing** |
| **Vendor Purchases** | dateRange, from, to | -- | **Entire report missing** |

Common missing filter: **`dateRange` preset dropdown** (e.g., "This Month", "Last Quarter", "This Year") - SSR has this on ALL reports.

---

## 3. MISSING MODULES - FULL SPECIFICATIONS

### 3.1 Financial Year (P1)

**Purpose**: Define accounting periods for the organization. Each FY belongs to the tenant's Account.

**Form Fields**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | text | Yes | e.g., "FY 2026" |
| `fromDate` | date | Yes | Start of fiscal year |
| `toDate` | date | Yes | End of fiscal year |
| `notes` | textarea | No | |
| `account` | -- | Auto (hidden) | Backend auto-sets from authenticated session (SbDomain base class) |

**Routes**: `/settings/financial-years`, `/settings/financial-years/new`, `/settings/financial-years/:id/edit`
**API**: GET/POST/PUT/DELETE `/rest/financialYear/*.json` (endpoint EXISTS and works)

### 3.2 Service Description (Invoice/Bill Services) (P1)

**Purpose**: Predefined line items for invoices and bills with default pricing.

**Form Fields**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | text | Yes | Service name |
| `description` | textarea | No | |
| `unitPrice` | number | No | Default unit price |
| `type` | select | Yes | INVOICE or BILL |

**Routes**: `/settings/services`, `/settings/services/new`, `/settings/services/:id/edit`
**API**: GET/POST/PUT/DELETE `/rest/serviceDescription/*.json`
**Note**: Already used by invoice/bill forms for Service/Product dropdown. This page manages the list itself.

### 3.3 Tax Entry (P1)

**Purpose**: Define tax rates for invoices and bills. Replaces current hardcoded `DEFAULT_TAX_RATES`.

**Form Fields**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | text | Yes | e.g., "VAT 15%" |
| `abbreviation` | text | Yes | e.g., "VAT" |
| `description` | textarea | No | |
| `taxNumber` | text | No | Tax registration number |
| `taxRate` | number | Yes | Percentage (default: 1.0) |
| `showTaxNumberOnInvoice` | checkbox | No | |
| `isRecoverable` | checkbox | No | Can be reclaimed |
| `isTaxable` | checkbox | No | Subject to further tax |
| `isCompoundTax` | checkbox | No | Calculated on tax-inclusive amount |
| `isWithholdingTax` | checkbox | No | Deducted at source |

**Routes**: `/settings/tax-entries`, `/settings/tax-entries/new`, `/settings/tax-entries/:id/edit`
**API**: GET/POST/PUT/DELETE `/rest/taxEntry/*.json`
**Impact**: Invoice/bill item forms need to switch from hardcoded tax rates to fetching from this endpoint. Multi-select tax entries instead of single rate dropdown.

### 3.4 Ledger Account Category (P2)

**Purpose**: Group ledger accounts into categories within each ledger group (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE).

**Form Fields**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | text | Yes | Category name |
| `description` | textarea | No | |
| `ledgerSubGroup` | select | No | Sub-group within ledger group |
| `ledgerAccountCategory` | select | No | Parent category |

**Routes**: `/ledger/categories`, `/ledger/categories/new`, `/ledger/categories/:id/edit`
**API**: GET/POST/PUT/DELETE `/rest/ledgerAccountCategory/*.json`

### 3.5 Exchange Rate (P2)

**Purpose**: Define currency exchange rates for multi-currency transactions.

**Form Fields**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `fromCurrency` | select | Yes | Source currency |
| `toCurrency` | select | Yes | Target currency |
| `rate` | number | Yes | Exchange rate |
| `startDate` | date | No | Valid from |
| `endDate` | date | No | Valid until |

**Routes**: `/settings/exchange-rates`, `/settings/exchange-rates/new`, `/settings/exchange-rates/:id/edit`
**API**: GET/POST/PUT/DELETE `/rest/exchangeRate/*.json`

### 3.6 Budget Management (P2)

#### Budget
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | text | Yes | Unique budget name |
| `description` | textarea | No | Max 1000 chars |
| `totalAmount` | number | Yes | Min 0 |
| `startDate` | date | Yes | Must be < endDate |
| `endDate` | date | Yes | |
| `status` | select | Yes | ACTIVE/INACTIVE/COMPLETED |
| `financialYear` | select | No | FK to FinancialYear |

#### Budget Category
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | text | Yes | |
| `description` | textarea | No | |
| `allocatedAmount` | number | Yes | Default 0, min 0 |
| `ledgerSubGroup` | select | No | |
| `ledgerAccountCategory` | select | No | |
| `budget` | select | Yes | FK to Budget |

#### Budget Entry
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `budget` | select | Yes | FK to Budget |
| `budgetCategory` | select | Yes | FK to BudgetCategory |
| `ledgerAccount` | select | Yes | FK to LedgerAccount |
| `description` | textarea | No | |
| `amount` | number | Yes | |
| `transactionDate` | date | Yes | |

**Routes**: `/budgets`, `/budgets/new`, `/budgets/:id`, `/budgets/:id/edit` (+ categories and entries as sub-routes or tabs)
**API**: GET/POST/PUT/DELETE `/rest/budget/*.json`, `/rest/budgetCategory/*.json`, `/rest/budgetEntry/*.json`

### 3.7 Missing Reports

#### Account Balances Report (P1)
**Filters**: dateRange, from, to, ledgerAccount, verifiedTransaction, isParentChecked
**API**: GET `/rest/financeReports/accountBalances.json`
**Response**: `{ resultList: { groupName: { accountList: [...] } }, fields: [...] }`
**Columns**: Account Name, Currency, Debit, Credit, Starting Balance, Closing Balance
**Route**: `/reports/account-balances`

#### Account Transactions Report (P1)
**Filters**: ledgerAccount, dateRange, from, to, verifiedTransaction, relatedToClass, relatedToId
**API**: GET `/rest/financeReports/accountTransactions.json`
**Response**: `{ resultList: [{ transactionList: [...], account: {name, id} }], fields: [...] }`
**Route**: `/reports/account-transactions`

#### Client Income Report (P2)
**Filters**: dateRange, from, to, accountServices
**API**: GET `/rest/financeReports/clientIncome.json`
**Response**: `{ clientList: [...], fields: [...] }`
**Columns**: Client, All Income, Paid Income
**Route**: `/reports/client-income`

#### Vendor Purchases Report (P2)
**Filters**: dateRange, from, to
**API**: GET `/rest/financeReports/vendorPurchases.json`
**Response**: `{ vendorList: [...], fields: [...] }`
**Columns**: Vendor, Currency, All Purchases, Paid Purchases
**Route**: `/reports/vendor-purchases`

#### Sales Tax Report (P3)
**Note**: Present in SSR print templates (`printSalesTax.gsp`) but NOT in sidebar navigation. Lower priority.

---

## 4. CROSS-CUTTING GAPS

### 4.1 Multi-Currency Support
SSR has currency + exchangeRate fields on: Invoice, Bill, Voucher, LedgerTransaction, BankDetails, Account.
SPA mostly ignores currency at transaction level. Need to add currency/exchangeRate fields to all forms.

### 4.2 Multi-Select Tax Entries
SSR allows multiple tax entries per invoice/bill item via `taxEntries` (multi-select binding with `@BindUsing`).
SPA has single `taxRate` percentage field. Need to switch to multi-select TaxEntry references.

### 4.3 Date Range Preset Dropdown
SSR has `dateRange` select on ALL reports. SPA has raw date inputs. Add preset ranges: "This Month", "Last Month", "This Quarter", "Last Quarter", "This Year", "Last Year", "Custom".

### 4.4 Print/Export on Reports
SSR has Print (2 versions) + Export (CSV, Excel, XML, ODS, PDF) on all reports.
SPA has no export functionality. Need to add export buttons.

### 4.5 `Clients` in Sidebar Navigation
SPA has full Client CRUD but it's NOT in the sidebar. Only accessible via invoice form. Should add to sidebar.

### 4.6 Soft-Delete (`archived` field)
SSR has `archived` toggle on Vendor, Ledger Account, Agent, AccountServices.
SPA has no archive/soft-delete UI. Need to add archive toggle on edit forms and filter on list pages.

### 4.7 Contacts (Email/Phone Lists)
SSR has multi-contact widgets (`emailContacts`, `phoneContacts` with priority) on Vendor, Account Settings.
SPA has single email/phone fields. Lower priority but a gap.

---

## 5. USER PROCESS FLOWS & DATA REQUIREMENTS

Each process below documents the complete user journey, every data input, all FK domain dependencies, and the current SPA status.

**Navigation order**: Sidebar top-to-bottom as user would encounter them.

---

### UP-01: Dashboard Overview

**User Story**: As a user, I land on the dashboard after login and see a financial summary with quick actions.

**Process Flow**:
1. User logs in → redirected to `/dashboard`
2. Dashboard loads KPI summary cards (Total Revenue, Outstanding Invoices, Expenses MTD, Net Profit)
3. Recent Invoices table shows latest invoices
4. User clicks "View all" → navigates to `/invoices`

**Data Requirements**: Read-only aggregations from Invoice, Bill, LedgerTransaction
**FK Domains**: None (display only)
**SPA Status**: DONE (excluded from gap work per user instruction)
**Design**: `financial-overview-dashboard`

---

### UP-02: Create Invoice

**User Story**: As a user, I create an invoice for a client with line items, taxes, and payment terms.

**Process Flow**:
1. User navigates: Sidebar → Invoices → "New Invoice" button
2. Fill Invoice Details section
3. Add Line Items (one or more)
4. Review totals (subtotal, taxes, total)
5. Click "Save Draft" or "Save & Send"
6. Redirect to invoice list

**Data Inputs (Invoice)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `accountServices` (via Client dropdown) | FK select | YES | `Client` → resolves to `AccountServices.id` | DONE |
| `numberPrefix` | text | no | -- | **MISSING** |
| `number` | text (auto-generated, editable) | unique | -- | **MISSING** |
| `purchaseOrderNumber` | text | no | -- | DONE |
| `salesOrderNumber` | text | no | -- | **MISSING** |
| `invoiceDate` | date | YES | -- | DONE |
| `paymentDate` (due date) | date | YES | -- | DONE |
| `currency` | java Currency select | defaults to account currency | `ExchangeRate` (for rate lookup) | **MISSING** |
| `exchangeRate` | number | conditional (currency != default) | -- | **MISSING** |
| `notes` | textarea | no | -- | DONE |
| `status` | enum (auto) | auto: PENDING | -- | DONE |

**Data Inputs (InvoiceItem - per line item)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `serviceDescription` | FK select | YES (type=INVOICE) | `ServiceDescription` | DONE |
| `description` | text | YES | -- | DONE |
| `quantity` | number | YES | -- | DONE |
| `unitPrice` | number | YES | -- | DONE |
| `taxEntries` | multi-select | no | `TaxEntry` (via `TaxEntryInvoiceItem` join) | **PARTIAL** (single rate, not multi-select) |
| `priority` | number | no (sort order) | -- | **MISSING** |
| `totalExpectation` | number (transient) | no | -- | **MISSING** |

**FK Domain Dependencies (must exist before creating invoice)**:
1. `Client` → at least one client must exist (SPA shows inline creation)
2. `AccountServices` → auto-created when Client is created
3. `ServiceDescription` (type=INVOICE) → at least one service must exist
4. `TaxEntry` → tax entries for multi-select (currently hardcoded)
5. `ExchangeRate` → needed if multi-currency (currently missing)
6. `LedgerAccount` → backend auto-creates income ledger transactions

**Backend Auto-Actions** (not user-visible):
- Creates `InvoiceTaxEntry` records for each selected tax
- Creates `TaxEntryInvoiceItem` join records per line item × tax entry
- Creates `LedgerTransaction` records (income posting) on save

**Design Reference**: `new-invoice-form`, `invoice-line-items-table`, `tax-and-discount-calculator`

---

### UP-03: Create Bill

**User Story**: As a user, I record a bill received from a vendor with line items and taxes.

**Process Flow**:
1. User navigates: Sidebar → Bills → "New Bill" button
2. Fill Bill Details section
3. Add Line Items (one or more)
4. Review totals
5. Save → redirect to bill list

**Data Inputs (Bill)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `vendor` | FK select | YES | `Vendor` | DONE |
| `numberPrefix` | text | no | -- | **MISSING** |
| `number` | text (auto-generated) | unique | -- | **MISSING** |
| `purchaseOrderNumber` | text | no | -- | **MISSING** |
| `salesOrderNumber` | text | no | -- | **MISSING** |
| `billDate` | date | YES | -- | DONE (but field name mismatch: SPA sends `issueDate`) |
| `paymentDate` (due date) | date | YES | -- | DONE |
| `currency` | java Currency select | defaults to account currency | `ExchangeRate` | **MISSING** |
| `exchangeRate` | number | conditional | -- | **MISSING** |
| `notes` | textarea | no | -- | DONE |
| `accountAttributed` | boolean (transient) | no | -- | **N/A** (trading) |
| `scheme` | FK (transient) | no | -- | **N/A** (trading) |
| `feeType` | FK select | no | `SchemeFeeType` | **N/A** (trading) |

**Data Inputs (BillItem - per line item)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `serviceDescription` | FK select | YES (type=BILL) | `ServiceDescription` | DONE |
| `description` | text | YES | -- | DONE |
| `quantity` | number | YES | -- | DONE |
| `unitPrice` | number | YES | -- | DONE |
| `taxEntries` | multi-select | no | `TaxEntry` (via `TaxEntryBillItem`) | **PARTIAL** (single rate) |
| `priority` | number | no | -- | **MISSING** |

**FK Domain Dependencies**:
1. `Vendor` → at least one vendor must exist
2. `ServiceDescription` (type=BILL) → at least one bill service
3. `TaxEntry` → for tax multi-select
4. `ExchangeRate` → if multi-currency

**Design Reference**: Same pattern as `new-invoice-form`

---

### UP-04: Manage Vendors

**User Story**: As a user, I manage my vendor/supplier directory.

**Process Flow**:
1. User navigates: Sidebar → Vendors
2. View vendor list (search, filter, paginate)
3. Click "New Vendor" → fill form → save
4. Click vendor row → view detail → edit

**Data Inputs (Vendor)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `name` | text | YES (unique) | -- | DONE |
| `symbol` | text | unique | -- | **MISSING** |
| `vendorType` | enum select | no | -- | **MISSING** |
| `residentialAddress` | text | no | -- | DONE (as `address`) |
| `postalAddress` | text | no | -- | **MISSING** |
| `email` | text | no | -- | DONE |
| `phoneNumber` | text | no | -- | DONE |
| `taxIdentificationNumber` | text | no | -- | DONE |
| `paymentTerms` | text/select | no | -- | DONE |
| `notes` | textarea | no | -- | DONE |
| `ledgerAccount` | FK select | no | `LedgerAccount` | **MISSING** |
| `archived` | boolean | no (edit only) | -- | **MISSING** |
| `market` | FK | no | `Market` | **N/A** (trading) |
| `exchange` | FK | no | `Exchange` | **N/A** (trading) |

**FK Domain Dependencies**:
1. `LedgerAccount` → for vendor account mapping (edit only)

**Design Reference**: `vendor-client-management` (combined directory with Client)

---

### UP-05: Manage Clients

**User Story**: As a user, I manage my client directory for invoicing.

**Process Flow**:
1. User navigates: (currently NO sidebar entry; direct URL `/clients`)
2. View client list → Click "New Client"
3. Select client type (INDIVIDUAL or CORPORATE)
4. Fill type-specific fields → Save
5. Backend auto-creates `AccountServices` record

**Data Inputs (Client)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `clientType` | radio (INDIVIDUAL/CORPORATE) | YES | -- | DONE |
| `firstName` | text | YES (individual) | -- | DONE |
| `lastName` | text | YES (individual) | -- | DONE |
| `companyName` | text | YES (corporate) | -- | DONE |
| `contactPerson` | text | no (corporate) | -- | DONE |
| `registrationNumber` | text | no (corporate) | -- | DONE |
| `taxNumber` | text | no | -- | DONE |
| `email` | text | no | -- | DONE |
| `phone` | text | no | -- | DONE |
| `address` | text | no | -- | DONE |

**FK Domain Dependencies**: None (Client is a root entity)
**Auto-Created**: `AccountServices` record (the actual FK used by Invoice)
**SPA Gap**: Not in sidebar navigation

**Design Reference**: `vendor-client-management`, `modal-quick-edit-client`

---

### UP-06: Record Payment (Invoice)

**User Story**: As a user, I record a payment received against an invoice.

**Process Flow**:
1. User navigates: Sidebar → Payments → "New Payment", OR Invoice Detail → "Record Payment"
2. Select invoice (pre-filled if from invoice detail via `?invoiceId=`)
3. Fill payment details
4. Optionally attach receipt
5. Save → invoice status updates (PARTIAL or PAID)

**Data Inputs (InvoicePayment)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `invoice` | FK select (unpaid/partial only) | YES | `Invoice` | DONE |
| `amount` | number | YES (max = invoice balance) | -- | DONE |
| `paymentDate` | date | YES | -- | DONE |
| `paymentMethod` | FK select | no | `PaymentMethod` | DONE |
| `payInAccount` | FK select (bank ledger accounts) | YES | `LedgerAccount` (filtered: accounts linked to `AccountBankDetails`) | **MISSING** |
| `currency` | java Currency | auto from invoice | -- | **MISSING** |
| `notes` | textarea | no | -- | DONE |

**FK Domain Dependencies**:
1. `Invoice` → at least one unpaid invoice must exist
2. `PaymentMethod` → payment methods must exist
3. `LedgerAccount` → bank/cash accounts (linked via `AccountBankDetails`)
4. `AccountBankDetails` → at least one bank account in settings

**Backend Auto-Actions**:
- Creates `Voucher` + `LedgerTransaction` for the payment
- Updates Invoice `status` (PARTIAL if amount < total, PAID if fully paid)

**Design Reference**: `payment-entry-form` (2-column layout), `payment-allocation-screen` (multi-invoice)

---

### UP-07: Record Payment (Bill)

**User Story**: As a user, I record a payment made to a vendor for a bill.

**Process Flow**:
1. Sidebar → Payments → "New Payment" (Bill tab), OR Bill Detail → "Record Payment"
2. Select bill → fill details → optionally attach receipt → save

**Data Inputs (BillPayment)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `bill` | FK select (unpaid/partial only) | YES | `Bill` | DONE |
| `amount` | number | YES (max = bill balance) | -- | DONE |
| `paymentDate` | date | YES | -- | DONE |
| `paymentMethod` | FK select | no | `PaymentMethod` | DONE |
| `payOutAccount` | FK select (bank ledger accounts) | YES | `LedgerAccount` (filtered) | **MISSING** |
| `paymentReceipt` | file upload | no | `SoupBrokerFile` | **MISSING** |
| `currency` | java Currency | auto from bill | -- | **MISSING** |
| `notes` | textarea | no | -- | DONE |

**FK Domain Dependencies**: Same as Invoice Payment + file upload support
**Design Reference**: `payment-entry-form`

---

### UP-08: Chart of Accounts (Ledger Accounts)

**User Story**: As a user, I manage the chart of accounts (create, edit, view hierarchy).

**Process Flow**:
1. Sidebar → Ledger → Chart of Accounts
2. View accounts grouped by category (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE)
3. Create new account → fill form → save
4. Edit existing account

**Data Inputs (LedgerAccount)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `name` | text | YES (unique) | -- | DONE |
| `description` | textarea | no | -- | DONE |
| `number` | text | unique | -- | DONE |
| `ledgerAccountCategory` | FK select | YES | `LedgerAccountCategory` | DONE |
| `parentAccount` | FK select (self-ref) | no | `LedgerAccount` | **MISSING** |
| `currency` | java Currency select | no | -- | **MISSING** |
| `cashFlow` | enum/select | no | -- | **MISSING** |
| `hiddenAccount` | boolean | no | -- | **MISSING** |
| `editable` | boolean | no | -- | **MISSING** |
| `deletable` | boolean | no | -- | **MISSING** |
| `archived` | boolean | no (edit only) | -- | **MISSING** |
| `security` | FK | no | `Security` | **N/A** (trading) |

**FK Domain Dependencies**:
1. `LedgerAccountCategory` → categories must exist (auto-seeded on registration)
2. `LedgerAccount` (self-ref) → parent account for hierarchy

**Design Reference**: `general-ledger-entries`, `gl-transactions-base-page`

---

### UP-09: Ledger Transactions (View/Post)

**User Story**: As a user, I view all ledger transactions and can post draft entries.

**Process Flow**:
1. Sidebar → Ledger → Transactions
2. View transaction list (Date, ID, Description, Account, Debit, Credit, Status)
3. Filter by date range, status, account number
4. Select draft transactions → "Post Selected"
5. Click "New Journal Entry" → navigates to journal entry form

**Data Requirements**: Read-only list of `LedgerTransaction` records
**Filters**: dateRange, status, accountNumber, minAmount, maxAmount
**SPA Status**: PARTIAL (basic list exists, missing: search, advanced filters, status badges, bulk post, pagination)
**Design Reference**: `general-ledger-entries`

---

### UP-10: Journal Entry (Batch Create)

**User Story**: As a user, I create a balanced journal entry with multiple debit/credit lines.

**Process Flow**:
1. Sidebar → Accounting → Journal Entry, OR Ledger Transactions → "New Journal Entry"
2. Set transaction date and optional currency
3. Add line items (each: account, description, debit OR credit amount)
4. Verify balance (total debits must equal total credits)
5. Save → creates `LedgerJournal` + `LedgerTransactionGroup` + `LedgerTransaction` records

**Data Inputs (Journal/TransactionGroup level)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `transactionDate` | date | YES | -- | DONE (as `entryDate`) |
| `currency` | java Currency | no | -- | **MISSING** |
| `exchangeRate` | number | conditional | -- | **MISSING** |
| `description` | text | YES | -- | DONE |
| `useDifferentLedgerTransactionDates` | boolean toggle | no | -- | **MISSING** |

**Data Inputs (per line item - LedgerTransaction)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `ledgerAccount` | FK select | YES | `LedgerAccount` | DONE |
| `notes` | text | no | -- | DONE (as `description`) |
| `debit` | number | conditional (one of debit/credit) | -- | DONE |
| `credit` | number | conditional | -- | DONE |
| `transactionDate` | date | conditional (if useDifferentDates) | -- | **MISSING** |

**Validation**: Total Debits == Total Credits (balanced entry)
**FK Domain Dependencies**: `LedgerAccount` → accounts must exist
**Design Reference**: `gl-transactions-base-page`

---

### UP-11: Create Voucher

**User Story**: As a user, I create a payment/receipt/deposit voucher for cash transactions.

**Process Flow**:
1. Sidebar → Accounting → Payment/Receipt Voucher
2. Select voucher type (PAYMENT, RECEIPT, DEPOSIT)
3. Select voucher target (CLIENT, VENDOR, STAFF, OTHER)
4. Fill conditional fields based on type + target
5. Save → creates `Voucher` + `LedgerTransaction` (shared ID)

**Data Inputs (Voucher)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `voucherType` | enum tabs (PAYMENT/DEPOSIT/RECEIPT) | YES | -- | DONE |
| `voucherTo` | enum radio (CLIENT/VENDOR/STAFF/OTHER) | YES | -- | DONE |
| `accountServices` | FK select | conditional: voucherTo=CLIENT | `Client` → `AccountServices` | DONE |
| `vendor` | FK select | conditional: voucherTo=VENDOR | `Vendor` | DONE |
| `staff` | FK select | conditional: voucherTo=STAFF | `Agent` | DONE |
| `beneficiaryInfo` | text | conditional: voucherTo=OTHER | -- | DONE |
| `amount` | number | YES (>0) | -- | DONE |
| `transactionDate` | date | YES | -- | DONE (as `voucherDate`) |
| `paymentMethod` | FK select | no | `PaymentMethod` | **MISSING** |
| `currency` | java Currency | YES | -- | **MISSING** |
| `exchangeRate` | number | conditional | -- | **MISSING** |
| `notes` | textarea | no | -- | DONE (as `description`) |
| `debitLedgerAccount` | FK select | YES | `LedgerAccount` | DONE (as `cashAccountId`/`expenseAccountId`) |
| `creditLedgerAccount` | FK select | YES | `LedgerAccount` | DONE (as `incomeAccountId`) |
| Account balance display | read-only | -- | -- | **MISSING** |
| `voucherStation` | enum | no | -- | **N/A** (trading) |

**FK Domain Dependencies**:
1. `Client`/`AccountServices` → if voucherTo=CLIENT
2. `Vendor` → if voucherTo=VENDOR
3. `Agent` → if voucherTo=STAFF
4. `LedgerAccount` → debit + credit accounts (always required)
5. `PaymentMethod` → for payment method dropdown

**Design Reference**: Existing SPA voucher form + SSR fields

---

### UP-12: Reports (Existing)

**User Story**: As a user, I generate financial reports with date range filters.

#### UP-12a: Trial Balance
**Route**: `/reports/trial-balance`
**Filters**: startDate, endDate, accountType, verifiedTransaction, isParentChecked
**Columns**: Account Code, Account Name, Debit, Credit, Totals
**FK Domains (filters)**: `LedgerAccountCategory` (for accountType filter)
**SPA Status**: PARTIAL (missing: date range presets, verifiedTransaction, isParentChecked, summary cards, export)
**Design**: `trial-balance-report`

#### UP-12b: Balance Sheet
**Route**: `/reports/balance-sheet`
**Filters**: asOf (to date), isParentChecked, verifiedTransaction
**Display**: Summary cards (Total Assets, Liabilities, Equity) → Donut chart → Expandable tree table
**FK Domains**: None (aggregations)
**SPA Status**: PARTIAL (missing: summary cards, charts, expandable tree, export)
**Design**: `balance-sheet-report`

#### UP-12c: Income Statement (P&L)
**Route**: `/reports/pnl`
**Filters**: dateRange, from, to, verifiedTransaction, isParentChecked
**Display**: Summary cards (Revenue, Expenses, Net Profit) → Charts → Expandable table
**SPA Status**: PARTIAL (missing: summary cards, charts, expandable tree, export)
**Design**: `income-statement-report`

#### UP-12d: Aging Reports (AR + AP)
**Route**: `/reports/aging`
**Filters**: asOf (to date)
**Display**: Aging buckets (Current, 1-30, 31-60, 61-90, 90+)
**SPA Status**: PARTIAL (minimal gaps)
**Design**: `ap-aging-report`, `ar-aging-report`

---

### UP-13: Settings - Account

**User Story**: As a user, I configure company-wide settings.

**Data Inputs (Account)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `name` | text | YES | -- | DONE |
| `currency` | select | YES | -- | DONE |
| `address` | text | no | -- | DONE |
| `website` | text | no | -- | DONE |
| `location` | text | no | -- | DONE |
| `countryOfOrigin` | select | no | -- | DONE |
| `designation` | text | no | -- | DONE |
| `slogan` | text | no | -- | DONE |
| `emailSubjectPrefix` | text | no | -- | DONE |
| `smsIdPrefix` | text | no | -- | DONE |
| `businessLicenceCategory` | select | no | -- | DONE |
| `logo` | file upload | no | `SoupBrokerFile` | **MISSING** |
| `favicon` | file upload | no | `SoupBrokerFile` | **MISSING** |
| `startOfFiscalYear` | date | no | -- | **MISSING** |
| `preferredTemplateLayout` | select | no | -- | **EXCLUDED** (fixed at Vertical per decision) |
| `emailContacts` | multi-contact widget | no | `EmailContact` | **MISSING** |
| `phoneContacts` | multi-contact widget | no | `PhoneContact` | **MISSING** |

---

### UP-14: Settings - Bank Accounts

**User Story**: As a user, I manage my organization's bank account details.

**Data Inputs (AccountBankDetails)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `priority` | select (PRIMARY/SECONDARY) | YES | -- | DONE |
| `bank` | FK select | no | `Bank` | DONE |
| `bankForOtherOption` | text | conditional (if bank=OTHER) | -- | DONE |
| `accountName` | text | YES | -- | DONE |
| `bankBranch` | text | no | -- | DONE |
| `accountNumber` | text | YES | -- | DONE |
| `currency` | java Currency | YES | -- | DONE |
| `ledgerAccount` | FK select (ASSET group) | no (unique) | `LedgerAccount` | DONE |
| `defaultClientDebtAccount` | FK select | no | `LedgerAccount` | DONE |
| `defaultClientEquityAccount` | FK select | no | `LedgerAccount` | DONE |

**SPA Status**: DONE (form appears complete)

---

### UP-15: Settings - Users/Agents

**User Story**: As a user, I manage team members and their access roles.

**Data Inputs (Agent)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `firstName` | text | YES | -- | DONE |
| `lastName` | text | YES | -- | DONE |
| `otherNames` | text | no | -- | DONE |
| `designation` | text | no | -- | DONE |
| `address` | text | no | -- | DONE |
| `email` | text | YES | -- | DONE |
| `phone` | text | no | -- | DONE |
| `username` | text | YES | -- | DONE |
| `password` | text | YES (create only) | -- | DONE |
| `roles` | multi-checkbox | YES | `Role` | DONE |
| `profile` | select | no | -- | **MISSING** |
| `userAccess` | select | no | -- | **MISSING** |
| `archived` | boolean | no (edit only) | -- | **MISSING** |
| `disabled` | boolean | no (edit only) | -- | **MISSING** |

---

### UP-16: Financial Year (MISSING MODULE)

**User Story**: As a user, I define accounting periods for my organization.

**Process Flow**:
1. Settings → Financial Years (new sidebar item)
2. View list of fiscal years
3. Create new → name, from date, to date, notes → save

**Data Inputs (FinancialYear)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `name` | text | YES | -- | **MISSING** |
| `fromDate` | date | YES | -- | **MISSING** |
| `toDate` | date | YES | -- | **MISSING** |
| `notes` | textarea | no | -- | **MISSING** |

**FK Domain Dependencies**: `Account` (financial year belongs to current tenant account — auto-set by backend)
**Depends On**: Account Settings must exist (account property links FY to the tenant)
**Depended On By**: `Budget` references `FinancialYear`; `Account.startOfFiscalYear` references FY period

---

### UP-17: Tax Entry (MISSING MODULE)

**User Story**: As a user, I define tax rates used on invoices and bills.

**Process Flow**:
1. Settings → Tax Entries (new sidebar item)
2. View list of tax rates
3. Create new → fill fields with toggle switches → save
4. Invoice/Bill item forms will then use these as multi-select options

**Data Inputs (TaxEntry)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `name` | text | YES | -- | **MISSING** |
| `abbreviation` | text | YES | -- | **MISSING** |
| `description` | textarea | no | -- | **MISSING** |
| `taxNumber` | text | no | -- | **MISSING** |
| `taxRate` | number (%) | YES (default: 1.0) | -- | **MISSING** |
| `showTaxNumberOnInvoice` | toggle | no | -- | **MISSING** |
| `isRecoverable` | toggle | no | -- | **MISSING** |
| `isTaxable` | toggle | no | -- | **MISSING** |
| `isCompoundTax` | toggle | no | -- | **MISSING** |
| `isWithholdingTax` | toggle | no | -- | **MISSING** |
| `expenseLedgerAccount` | FK select | no | `LedgerAccount` | **MISSING** |

**FK Domain Dependencies**: `LedgerAccount` (optional expense account)
**Depends On**: `LedgerAccount` (for expense account mapping)
**Depended On By**: `InvoiceItem` (via `TaxEntryInvoiceItem`), `BillItem` (via `TaxEntryBillItem`)
**Impact**: Replaces hardcoded `DEFAULT_TAX_RATES` in `domainData.ts`

**Design Reference**: `tax-liability-report`, `form-toggle-switch-component`

---

### UP-18: Service Description (MISSING MODULE)

**User Story**: As a user, I manage predefined services/products for invoice and bill line items.

**Process Flow**:
1. Settings → Services (new sidebar item)
2. View list of services (filtered by INVOICE or BILL type)
3. Create new → name, description, unit price, type, ledger account → save
4. Services appear in Invoice/Bill line item dropdowns

**Data Inputs (ServiceDescription)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `name` | text | YES | -- | **MISSING** |
| `description` | textarea | no | -- | **MISSING** |
| `unitPrice` | number | no | -- | **MISSING** |
| `type` | select (INVOICE/BILL) | YES | -- | **MISSING** |
| `ledgerAccount` | FK select | no | `LedgerAccount` (INCOME for INVOICE, EXPENSE for BILL) | **MISSING** |

**FK Domain Dependencies**: `LedgerAccount` (optional, for auto-posting)
**Depended On By**: `InvoiceItem`, `BillItem` (service dropdown)
**Note**: API already used by invoice/bill forms (`listInvoiceServices`/`listBillServices` in `domainData.ts`). This page manages the data itself.

**Design Reference**: `services-selection-grid`, `item-services-catalog-browser`, `item-creation-modal`

---

### UP-19: Ledger Account Category (MISSING MODULE)

**User Story**: As a user, I manage the grouping/categorization of ledger accounts.

**Data Inputs (LedgerAccountCategory)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `name` | text | YES (unique) | -- | **MISSING** |
| `description` | textarea | no | -- | **MISSING** |
| `ledgerGroup` | enum select (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE) | YES | -- | **MISSING** |
| `ledgerSubGroup` | enum select | conditional (EQUITY only) | -- | **MISSING** |
| `ledgerGroupType` | enum select | conditional (EQUITY only) | -- | **MISSING** |
| `parentCategory` | FK select (self-ref) | no | `LedgerAccountCategory` | **MISSING** |

**FK Domain Dependencies**: Self-referencing (parent category)
**Depended On By**: `LedgerAccount`, `BudgetCategory`

**Design Reference**: `expense-category-breakdown`

---

### UP-20: Exchange Rate (MISSING MODULE)

**User Story**: As a user, I define currency exchange rates for multi-currency transactions.

**Data Inputs (ExchangeRate)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `fromCurrency` | java Currency select | YES | -- | **MISSING** |
| `toCurrency` | java Currency select | YES | -- | **MISSING** |
| `rate` | number | YES | -- | **MISSING** |
| `startDate` | date | no | -- | **MISSING** |
| `endDate` | date | no | -- | **MISSING** |

**FK Domain Dependencies**: None (uses java.util.Currency)
**Depended On By**: Invoice, Bill, Voucher, LedgerTransaction (when currency != account default)

---

### UP-21: Budget Management (MISSING MODULE)

**User Story**: As a user, I create budgets with categories and entries to track spending.

**Process Flow**:
1. Sidebar → Budgets (new item)
2. Create budget → name, date range, total, financial year
3. Add budget categories → allocate amounts per category
4. Add budget entries → individual line items per category/account
5. View budget vs actual variance report

**Data Inputs (Budget)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `name` | text | YES (unique) | -- | **MISSING** |
| `description` | textarea | no (max 1000) | -- | **MISSING** |
| `totalAmount` | number | YES (min 0) | -- | **MISSING** |
| `startDate` | date | YES (< endDate) | -- | **MISSING** |
| `endDate` | date | YES | -- | **MISSING** |
| `status` | select (ACTIVE/INACTIVE/COMPLETED) | YES | -- | **MISSING** |
| `financialYear` | FK select | no | `FinancialYear` | **MISSING** |

**Data Inputs (BudgetCategory)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `name` | text | YES | -- | **MISSING** |
| `description` | textarea | no | -- | **MISSING** |
| `allocatedAmount` | number | YES (min 0) | -- | **MISSING** |
| `ledgerSubGroup` | enum select | no | -- | **MISSING** |
| `ledgerAccountCategory` | FK select | no | `LedgerAccountCategory` | **MISSING** |
| `budget` | FK | YES (parent) | `Budget` | **MISSING** |

**Data Inputs (BudgetEntry)**:
| Field | Type | Required | FK Domain | SPA Status |
|-------|------|----------|-----------|------------|
| `description` | textarea | no | -- | **MISSING** |
| `amount` | number | YES | -- | **MISSING** |
| `transactionDate` | date | YES | -- | **MISSING** |
| `budget` | FK | YES | `Budget` | **MISSING** |
| `budgetCategory` | FK select | YES | `BudgetCategory` | **MISSING** |
| `ledgerAccount` | FK select | YES | `LedgerAccount` | **MISSING** |

**FK Domain Dependencies**:
1. `FinancialYear` → for budget period
2. `LedgerAccountCategory` → for budget category mapping
3. `LedgerAccount` → for budget entry account assignment
4. `BudgetCategory` → entries reference categories (parent must exist)

**Design Reference**: `budget-vs-actual-variance-report`

---

### UP-22: Missing Reports

#### UP-22a: Account Balances Report (MISSING)
**Filters**: dateRange, from, to, ledgerAccount, verifiedTransaction, isParentChecked
**FK Domains (filters)**: `LedgerAccount` (account selector)
**API**: GET `/rest/financeReports/accountBalances.json`
**Design**: Report template pattern with `SummaryCards` + `ExpandableTable`

#### UP-22b: Account Transactions Report (MISSING)
**Filters**: ledgerAccount (required), dateRange, from, to, verifiedTransaction, relatedToClass, relatedToId
**FK Domains (filters)**: `LedgerAccount` (required), any domain (polymorphic relatedTo)
**API**: GET `/rest/financeReports/accountTransactions.json`

#### UP-22c: Client Income Report (MISSING)
**Filters**: dateRange, from, to, accountServices
**FK Domains (filters)**: `Client`/`AccountServices`
**API**: GET `/rest/financeReports/clientIncome.json`

#### UP-22d: Vendor Purchases Report (MISSING)
**Filters**: dateRange, from, to
**FK Domains (filters)**: None
**API**: GET `/rest/financeReports/vendorPurchases.json`
**Design**: `vendor-payment-analysis`

---

### MODULE DEPENDENCY ORDER (Setup Sequence)

For a new user setting up the system, modules must be created in this order:

```
1. Account Settings (UP-13)     ← company info, default currency
2. Financial Year (UP-16)       ← accounting periods
3. Ledger Account Category (UP-19) ← auto-seeded, but customizable
4. Chart of Accounts (UP-08)    ← accounts within categories
5. Bank Details (UP-14)         ← links to ledger accounts
6. Tax Entry (UP-17)            ← tax rates
7. Service Description (UP-18)  ← invoice/bill services
8. Exchange Rate (UP-20)        ← if multi-currency
9. Users (UP-15)                ← team members
10. Clients (UP-05)             ← invoice targets
11. Vendors (UP-04)             ← bill sources
12. Invoices (UP-02)            ← requires: clients, services, taxes
13. Bills (UP-03)               ← requires: vendors, services, taxes
14. Payments (UP-06/07)         ← requires: invoices/bills, bank accounts
15. Vouchers (UP-11)            ← requires: clients/vendors, ledger accounts
16. Journal Entries (UP-10)     ← requires: ledger accounts
17. Budgets (UP-21)             ← requires: financial year, categories, accounts
```

---

> **SUPERSEDED**: The phase plan below (Phase 1-4) is the original pre-design version.
> **Use Section 11 ("UPDATED IMPLEMENTATION PHASES — Design-Aware") instead**, which
> incorporates shared component architecture, design cross-references, and revised task IDs.

### Phase 1: Core Field Gaps (P1) - Existing Pages
Fix field-level gaps in pages that already exist.

| Task | Effort | Files |
|------|--------|-------|
| 1.1 Add `numberPrefix`, `number`, `salesOrderNumber`, `currency`, `exchangeRate` to InvoiceFormPage | M | InvoiceFormPage.tsx, invoices.ts |
| 1.2 Add `numberPrefix`, `number`, `purchaseOrderNumber`, `salesOrderNumber`, `currency`, `exchangeRate` to BillFormPage. Fix `billDate` field name. | M | BillFormPage.tsx, bills.ts |
| 1.3 Add `payInAccount` to invoice payment, `payOutAccount` + `paymentReceipt` to bill payment | M | PaymentFormPage.tsx, invoices.ts, bills.ts |
| 1.4 Add `paymentMethod` to VoucherFormPage, `currency`, `exchangeRate`, ledger account balance display | S | VoucherFormPage.tsx |
| 1.5 Add `parentAccount`, `currency`, `cashFlow`, `hiddenAccount` to ChartOfAccountsPage create/edit | M | ChartOfAccountsPage.tsx, ledger.ts |
| 1.6 Add `currency`, `exchangeRate`, `useDifferentLedgerTransactionDates` to JournalEntryPage | S | JournalEntryPage.tsx |
| 1.7 Add date range presets to all report pages | S | Report components, shared DateRangeFilter component |
| 1.8 Add `verifiedTransaction` and `isParentChecked` filters to existing reports | S | Report components |
| 1.9 Add `logo`, `favicon`, `startOfFiscalYear` to AccountSettingsPage (`preferredTemplateLayout` excluded - fixed at Vertical) | M | AccountSettingsPage.tsx, settings.ts |
| 1.10 Add `Clients` to sidebar navigation | XS | SideNav.tsx |
| 1.11 Add `archived`/`disabled` toggle to Agent/User edit form | S | UserFormPage.tsx |

**Estimated effort**: ~2 weeks

### Phase 2: New P1 Modules
Build new pages that are essential for a complete finance workflow.

| Task | Effort | Files |
|------|--------|-------|
| 2.1 Tax Entry CRUD (list, create, edit) | M | New: TaxEntryListPage, TaxEntryFormPage, taxEntry API |
| 2.2 Service Description CRUD (list, create, edit) | M | New: ServiceListPage, ServiceFormPage (API exists in domainData.ts) |
| 2.3 Financial Year CRUD (list, create, edit) | S | New: FinancialYearListPage, FinancialYearFormPage, financialYear API |
| 2.4 Switch invoice/bill items from single taxRate to multi-select TaxEntry | L | InvoiceFormPage, BillFormPage, fixtures, types |
| 2.5 Account Balances report page | M | New: AccountBalancesPage, reports.ts |
| 2.6 Account Transactions report page | M | New: AccountTransactionsPage, reports.ts |
| 2.7 Add sidebar entries for new modules under Settings | XS | SideNav.tsx |
| 2.8 Add export/print to all report pages | M | Shared ExportMenu component, report pages |

**Estimated effort**: ~3 weeks

### Phase 3: P2 Modules
Nice-to-have modules for feature completeness.

| Task | Effort | Files |
|------|--------|-------|
| 3.1 Ledger Account Category CRUD | M | New pages + API |
| 3.2 Exchange Rate CRUD | M | New pages + API |
| 3.3 Budget + Budget Category + Budget Entry CRUD | L | New pages (3 entities) + APIs |
| 3.4 Client Income report | M | New page + API |
| 3.5 Vendor Purchases report | M | New page + API |
| 3.6 Multi-contact widgets (emailContacts/phoneContacts) for Vendor, Account Settings | M | Shared ContactList component |
| 3.7 Vendor: add `symbol`, `postalAddress`, `ledgerAccount`, `archived` | S | VendorFormPage.tsx |

**Estimated effort**: ~4 weeks

### Phase 4: Polish & Parity
Final refinements for full SSR parity.

| Task | Effort | Files |
|------|--------|-------|
| 4.1 Soft-delete (archived) filter on all list pages | M | List components, API params |
| 4.2 Invoice/Bill standalone item management (standalone create outside parent form) | S | Low priority - inline editing covers most cases |
| 4.3 Sales Tax report | S | New page if needed |

**Estimated effort**: ~1 week

---

## 6. EXCLUDED (N/A - Trading-Specific)

These SSR features are specific to the trading/brokerage platform and NOT applicable to SoupFinance:

- Coupons & Maturities (`orderRequest/couponsAndMaturities`)
- Pending Settlement (`orderRequest/salesAndWithdrawalsPendingSettlement`)
- Finance Data Sync (`tradeFinanceSync`)
- Account Services management (`accountServices` CRUD - used for client investment accounts)
- Account Modules (`accountModule` - platform module management)
- CSD ID, Market, Exchange fields on Vendor
- Security/Scheme fields on Voucher, Bank Details, Ledger Account
- ForEx Gain/Loss report (commented out in SSR)
- Trading-specific fields on Bill (`accountAttributed`, `scheme`, `feeType`)

---

## 7. TECHNICAL NOTES

### API Patterns
- All mutations (POST/PUT/DELETE) require CSRF tokens
- SSR uses `useToken="true"` in forms; SPA uses `getCsrfToken(controller)`
- All create forms pass hidden `account.id` from session; SPA doesn't need this (backend resolves from auth)
- Grails `<f:all bean="...">` renders ALL domain fields unless explicitly ordered

### Field Name Mapping (SSR → SPA)
| SSR Domain Field | SPA Field | Notes |
|-----------------|-----------|-------|
| `billDate` | `issueDate` | **MISMATCH** - should use `billDate` |
| `transactionDate` (voucher) | `voucherDate` | **MISMATCH** - should use `transactionDate` |
| `notes` (voucher) | `description` | **MISMATCH** - should use `notes` |
| `supplier` (controller) | `vendor` (SPA) | Acceptable mapping - SPA uses modern terminology |
| `serialised` | `displayName` | Backend generates `serialised` field for display |

### Multi-Tenancy
- All domain objects have `account` FK (auto-injected by `SbDomain` base class)
- SPA doesn't send `account.id` - backend resolves from authenticated session
- `archived` field for soft-delete across all domains

---

## 8. DESIGN FILE CROSS-REFERENCE

All design files are in `/soupfinance-designs/{name}/screen.png` (+ optional `code.html`).

### 8.1 Design → Gap Mapping

| Design File | Maps to Gap Item | Key Design Insights |
|---|---|---|
| **Invoice & Payment** | | |
| `new-invoice-form` | §2.1 Invoice Form | Card sections: "Invoice Details" (Client, Number, Dates, PO) → "Line Items" → Notes → Terms. 3-col row for Number/InvoiceDate/DueDate. Buttons: Cancel, Save Draft, Save & Send |
| `invoice-line-items-table` | §2.1 Invoice Items | CSS Grid layout (not HTML table). Columns: Description, Qty, Rate, Amount, delete. Editable Tax % per item. "+ Add Line Item" link |
| `invoice-management` | Invoice list enhancements | Status badges (Paid/Overdue/Pending/Draft), search bar, pagination |
| `payment-entry-form` | §2.5/2.6 Payments | **2-column**: Invoice Summary (left card) + Payment Details (right). Partial/Full payment toggle. File upload for receipt. Shows remaining balance |
| `payment-allocation-screen` | NEW: Multi-invoice allocation | **3-column**: Payment Summary → Invoice selection table (checkboxes + editable amounts) → Allocation Summary (Total Allocated / Unallocated / Remaining) |
| `services-selection-grid` | §3.2 Service Description | **Card grid** with left category sidebar, quantity inputs per card, right running-total sidebar. "Add to Invoice" per card |
| `item-creation-modal` | Inline item creation | Modal for quick service/item creation without leaving form |
| `item-services-catalog-browser` | §3.2 Service Description (alt) | **Table-based** catalog with SKU, filterable by category |
| **Reports** | | |
| `balance-sheet-report` | §Report 4 Balance Sheet | 3 summary cards (Assets/Liabilities/Equity with % change), donut chart (Asset Composition), expandable tree table, PDF + Excel export |
| `income-statement-report` | §Report 5 Income Statement | 3 summary cards (Revenue/Expenses/Net Profit), bar chart (Revenue vs Expenses), donut (Expense Breakdown), expandable table. Filter chips: Date Range, Department, Subsidiary |
| `trial-balance-report` | §Report 3 Trial Balance | Simple: Start/End date + Account Type filter, "Generate Report" button, table with Debit/Credit columns, Totals row. Print + Export buttons |
| `budget-vs-actual-variance-report` | §3.6 Budget | 4 summary cards, filter bar (Date Range, Department, GL Account, Variance View toggle %/$), color-coded variance table |
| `tax-liability-report` | §3.3 Tax Entry / Sales Tax | 4 summary cards (Net Liability/Taxable Sales/Collected/Paid), Data Table / Chart View tabs, Print + Export |
| `cash-flow-statement-report` | NEW: Cash Flow Statement | Design exists (no SSR equivalent). Consider as bonus report |
| `profit-and-loss-summary-report` | §Report 5 alt P&L view | Alternative P&L layout |
| `payment-history-report` | Payment tracking | Payment history table view |
| `ap-aging-report` | §Report 9 Aged Payables | Aging buckets design |
| `ar-aging-report` | §Report 7 Aged Receivables | Aging buckets design |
| `vendor-payment-analysis` | §Report 8 Vendor Purchases | Vendor payment analysis with charts |
| `expense-category-breakdown` | §3.4 Account Category | Donut chart + comparison bar chart + change % table. Filters: Quarter preset, Compare to Previous, Department |
| **GL & Ledger** | | |
| `general-ledger-entries` | §2.8/2.9 Ledger Account/Transaction | Table: Date, Transaction ID, Description, Account #, Account Name, Debit, Credit, Status badges (Draft/Posted/Pending). Advanced Filters sidebar. Pagination |
| `gl-transactions-base-page` | §2.9 Ledger Transaction | Base transaction view with same pattern as GL entries |
| `gl-reconciliation-report` | NEW: GL Reconciliation | Design exists (no direct SSR equivalent). Consider as bonus |
| `gl-integration-mapping` | NEW: GL Integration | Design exists for mapping integrations |
| **Contacts** | | |
| `vendor-client-management` | §2.3/2.4 Vendor/Client | **Combined directory** with Type badges (Client/Vendor), columns: Name, Type, Contact Person, Email, Phone, Payment Terms, Status, Actions. Filter + Export. Pagination |
| `modal-quick-edit-client` | Client inline edit | Slide-over/modal for quick client edits without full page navigation |
| **Form Components** | | |
| `form-date-range-picker` + `form-date-range-picker-component` | §4.3 Date Range Presets | Dual-month calendar popup, preset dropdown ("Select date range"), "Apply Range" button, shows "X days selected" count |
| `form-multiselect-component` + `form-multiselect-dropdown` | §4.2 Multi-select Tax Entries | Tag chips with ×, checkbox dropdown with name + description, "X selected" count, "Clear all" |
| `form-toggle-switch-component` + `form-toggle-switch-styles` | Boolean fields (Tax Entry) | Toggle switches with labels for boolean fields |
| `form-search-autocomplete` + `form-search-autocomplete-component` | Dropdown search | Searchable dropdown for Client/Vendor/Account selects |
| `form-checkbox-component` + `form-radio-button-component` | Form field types | Standard checkbox and radio components |
| `form-validation-error-states` | Form validation UI | Error state styling for form fields |
| **Modals** | | |
| `modal-export-options` | §4.4 Print/Export | Card-style format selector (PDF/Excel/CSV), date range, "Export Data" button |
| `modal-delete-confirmation` | Soft-delete confirmation | Confirmation dialog for deletions |
| `modal-discard-changes` | Unsaved changes | "Discard changes?" confirmation |
| `tax-and-discount-calculator` | Tax computation UI | 3-column: Items | Discounts + Taxes | Summary. Toggle switches for tax types, "+ Add Tax", real-time totals |

### 8.2 Designs Without SSR Equivalent (SPA Enhancements)

These designs add UX value beyond what SSR provides:

| Design File | Enhancement | Priority |
|---|---|---|
| `payment-allocation-screen` | Multi-invoice payment allocation with checkbox selection | P1 - Major UX improvement |
| `cash-flow-statement-report` | Cash flow statement report | P3 - Bonus report |
| `gl-reconciliation-report` | GL reconciliation view | P3 - Bonus |
| `gl-integration-mapping` | GL integration mapping | P3 - Bonus |
| `invoice-approval-workflow` | Invoice approval workflow (Draft → Approved → Sent) | P2 |
| `invoice-draft-preview` | Invoice PDF preview before sending | P2 |
| `invoice-validation-checker` | Pre-send validation checklist | P2 |
| `overdue-reminder-generator` | Automated overdue payment reminders | P3 |
| `modal-quick-edit-client` | Quick client edit without full navigation | P2 |
| `invoice-status-update-log` | Audit trail for invoice status changes | P3 |
| `audit-trail-log` | General audit trail | P3 |

### 8.3 Designs for Existing UI Polish

| Design File | Current SPA State | Design Improvement |
|---|---|---|
| `empty-state-no-invoices` | No empty states | Illustrated empty states with CTA buttons |
| `empty-state-no-clients` | No empty states | Illustrated empty states |
| `empty-state-no-payments` | No empty states | Illustrated empty states |
| `empty-state-no-search-results` | No empty states | Search empty state |
| `empty-state-welcome-dashboard` | Basic dashboard | Welcome onboarding state |
| `loading-table-skeleton` | No skeletons | Table loading skeleton |
| `loading-dashboard-skeleton` | No skeletons | Dashboard loading skeleton |
| `loading-full-page-spinner` | Basic spinner | Full-page loading state |
| `loading-button-saving-state` | No loading buttons | Button loading indicators |
| `alert-banner-*` | No banner alerts | Error/Info/Success/Warning banners |
| `alert-toast-notification-stack` | Basic toasts | Stacked toast notifications |
| `error-404-page-not-found` | No error pages | Styled error pages |
| `error-500-internal-server` | No error pages | Styled error pages |
| `error-session-expired-page` | No session expired | Session expired page |
| `login-authentication` | Basic login | Styled login page |

---

## 9. SHARED COMPONENT LIBRARY (from Design Analysis)

The designs consistently use these shared components. Build once, use everywhere.

### 9.1 Must-Build Components (P1)

| Component | Used By | Design Reference |
|---|---|---|
| `DateRangePicker` | All reports, GL transactions, payment history | `form-date-range-picker` - Dual calendar, presets, "Apply Range" |
| `MultiSelect` | Tax entries on invoice/bill items, role assignment | `form-multiselect-component` - Tag chips, checkbox dropdown |
| `ExportModal` | All reports, transaction lists | `modal-export-options` - PDF/Excel/CSV cards, date range |
| `SummaryCards` | All reports (3-4 KPI cards at top) | `balance-sheet-report`, `income-statement-report` etc. |
| `ExpandableTable` | Balance Sheet, Income Statement, Account Balances | `balance-sheet-report` - Collapsible tree with group totals |
| `StatusBadge` | Invoices, Bills, GL transactions, contacts | `general-ledger-entries` - Draft/Posted/Pending/Overdue |
| `SearchableSelect` | Client, Vendor, Account dropdowns | `form-search-autocomplete` - Typeahead with results |
| `FileUpload` | Payment receipt, logo/favicon upload | `payment-entry-form` - Drag-and-drop with preview |
| `ConfirmDialog` | Delete, discard changes | `modal-delete-confirmation`, `modal-discard-changes` |

### 9.2 Nice-to-Have Components (P2-P3)

| Component | Used By | Design Reference |
|---|---|---|
| `EmptyState` | All list pages when no data | `empty-state-*` designs |
| `TableSkeleton` | All list pages during loading | `loading-table-skeleton` |
| `ToggleSwitch` | Tax Entry booleans, other boolean fields | `form-toggle-switch-component` |
| `DonutChart` | Balance Sheet, Expense Breakdown, Aging | `balance-sheet-report`, `expense-category-breakdown` |
| `BarChart` | Income Statement, Budget Variance | `income-statement-report`, `expense-category-breakdown` |
| `PaginationControl` | All list pages | `vendor-client-management` - Page numbers, Previous/Next |
| `AdvancedFilterSidebar` | GL Transactions, reports | `general-ledger-entries` - Collapsible filter panel |
| `QuickEditSlideOver` | Client, Vendor quick edit | `modal-quick-edit-client` |

---

## 10. DESIGN-AWARE UX RECOMMENDATIONS

### 10.1 Smart SSR → SPA Adaptations

These recommendations refactor SSR data requirements to work smartly with the design system.

#### Invoice Form (SSR has 9 fields + line items → Design shows progressive layout)

**Design approach**: The `new-invoice-form` design shows a clean 2-section card layout. SSR's missing fields should be added following this pattern:

| SSR Gap Field | Design Adaptation | UX Recommendation |
|---|---|---|
| `numberPrefix` + `number` | Design shows single "Invoice Number" field with `INV-2024-00123` format | Combine into one field: prefix is auto-generated, number is editable. Show as read-only with edit icon |
| `salesOrderNumber` | Not in design | Add below PO Number as optional field in same row |
| `currency` + `exchangeRate` | Not in base design | Add as **collapsible "Advanced" section** below Invoice Details card. Show currency dropdown; exchangeRate auto-populates from ExchangeRate table, only visible when currency != account default |
| Line item `taxEntries` (multi-select) | Design shows single Tax % per line | Use `MultiSelect` component from `form-multiselect-component` design. Show selected taxes as tag chips. Tax calculator from `tax-and-discount-calculator` design for summary |
| Line item `priority` | Not visible in design | Use drag handle for reordering (implied by `services-selection-grid` design which shows drag handles) |

#### Payment Form (SSR has 6 fields → Design shows rich 2-column layout)

**Design approach**: The `payment-entry-form` design is significantly richer than SSR. Adopt the design fully:

| SSR Gap Field | Design Adaptation | UX Recommendation |
|---|---|---|
| `payInAccount` / `payOutAccount` | Design doesn't show explicitly | Add as dropdown below Payment Method, labeled "Pay From Account" / "Pay To Account". Filter to bank detail ledger accounts |
| `paymentReceipt` (file upload) | **Design has "Attach Receipt"** with drag-and-drop | Use `FileUpload` component. Show preview thumbnail |
| Partial/Full toggle | **Design has toggle** not in SSR | Adopt from design - when "Full Payment" selected, amount auto-fills to remaining balance |
| Invoice Summary card | **Design has summary card** not in SSR | Adopt - shows Client, Invoice Date, Due Date, Total Due, Remaining Balance |
| Payment Allocation | **NEW from `payment-allocation-screen`** | Multi-invoice allocation: checkbox select invoices, edit amounts per invoice, real-time allocation summary |

#### Reports (SSR has basic filters + table → Design shows rich dashboard layout)

**Design approach**: All report designs follow the same pattern - significantly richer than SSR. Adopt the design pattern:

| Report Component | SSR Implementation | Design Upgrade |
|---|---|---|
| Filter bar | Raw date inputs + dropdowns | **Chip-based filter bar** with date range presets, "Apply Filters" button |
| Summary section | None | **3-4 KPI summary cards** at top with $ amounts and % change vs prior period |
| Charts | None | **Donut chart** for composition, **bar chart** for comparison (as per design) |
| Data table | Basic HTML table | **Expandable tree table** for hierarchical data (Balance Sheet, Income Statement) |
| Export | SSR has 6 export formats | **Export modal** with PDF/Excel/CSV (design simplifies to 3 formats) |
| Print | SSR has print button | Add Print button alongside Export |

#### GL Transactions (SSR has basic list → Design shows advanced filtered view)

**Design approach**: The `general-ledger-entries` design adds significant UX value:

| Enhancement | SSR | Design |
|---|---|---|
| Search | None | Full-text search by Transaction ID, Description, or Amount |
| Filters | Inline params | **Advanced Filters sidebar**: Date Range, Status, Account Number, Min/Max Amount |
| Status | None visible | **Color-coded status badges**: Draft (yellow), Posted (green), Pending (orange) |
| Bulk actions | None | "Post Selected" button for batch posting |
| Pagination | Basic offset | **Page numbers** with Previous/Next |

#### Vendor & Client (SSR has separate pages → Design shows combined directory)

**Design approach**: The `vendor-client-management` design combines vendors and clients into one directory with type badges. This is a **smart SPA improvement over SSR**:

| Enhancement | SSR | Design |
|---|---|---|
| View | Separate Vendor and Client pages | **Combined "Contacts" directory** with Type filter (Client/Vendor) |
| Type indicator | N/A | **Badge**: orange "Vendor" / blue "Client" |
| Quick edit | Full page navigation | **Slide-over modal** from `modal-quick-edit-client` |
| Status | `archived` field hidden | **Active/Inactive status** column with badge |
| Export | None | Export button on list |

### 10.2 Progressive Disclosure Strategy

Based on design analysis, SSR's flat form layout should become progressive:

```
┌─────────────────────────────────────────────┐
│ ESSENTIAL FIELDS (always visible)           │
│ - Client, Number, Dates, Line Items         │
│ - These match the design mockups exactly    │
├─────────────────────────────────────────────┤
│ ▼ ADVANCED OPTIONS (collapsible, closed)    │
│ - Currency, Exchange Rate                   │
│ - Sales Order Number                        │
│ - Additional Notes, Terms & Conditions      │
│ - Priority/Sort Order fields                │
├─────────────────────────────────────────────┤
│ ✕ EXCLUDED (not applicable)                 │
│ - Trading-specific fields                   │
│ - CSD, Security, Scheme, Market fields      │
└─────────────────────────────────────────────┘
```

### 10.3 Consistent Report Page Template

All report pages should follow this design-driven template:

```
┌─────────────────────────────────────────────────────────┐
│ Report Title                          [Print] [Export]  │
│ Description text                                        │
├─────────────────────────────────────────────────────────┤
│ [Date Range ▼] [Filter 2 ▼] [Filter 3 ▼] [Apply ▼]   │
├──────────┬──────────┬──────────┬───────────────────────┤
│ KPI Card │ KPI Card │ KPI Card │ (optional 4th card)   │
│ $Amount  │ $Amount  │ $Amount  │                       │
│ +X.X%    │ +X.X%    │ +X.X%    │                       │
├──────────┴──────────┴──────────┴───────────────────────┤
│ ┌─────────────────┐ ┌─────────────────────────────────┐│
│ │   Donut Chart   │ │   Bar Chart / Comparison        ││
│ │   (composition) │ │   (trend or vs. prior period)   ││
│ └─────────────────┘ └─────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│ ACCOUNT / LINE ITEM     │ AMOUNT     │ % CHANGE        │
│ ▼ Category 1            │ $X,XXX     │                 │
│   - Sub-item            │ $X,XXX     │ +X.X%           │
│   - Sub-item            │ $X,XXX     │ -X.X%           │
│ ▼ Category 2            │ $X,XXX     │                 │
│   - Sub-item            │ $X,XXX     │ +X.X%           │
├─────────────────────────────────────────────────────────┤
│ TOTALS                  │ $XX,XXX    │                  │
└─────────────────────────────────────────────────────────┘
```

### 10.4 Design-Driven Form Standardization

The designs reveal the SPA should standardize on **react-hook-form + zod** (already used in VendorFormPage):

| Form Pattern | Design Source | Standard |
|---|---|---|
| Card sections | `new-invoice-form` | Each logical group in a bordered card with header |
| 3-column date row | `new-invoice-form` | Number | Date | Date in same row |
| 2-column layout | `payment-entry-form` | Summary card (left) + Form fields (right) |
| Inline add | `invoice-line-items-table` | "+ Add Line Item" link below table |
| Action buttons | All forms | Left: Cancel (text), Center: Secondary (outline), Right: Primary (filled orange) |
| Required indicators | `form-validation-error-states` | Asterisk on label + red border + helper text on error |

---

## 11. UPDATED IMPLEMENTATION PHASES (Design-Aware)

### Phase 1: Shared Components + Core Field Gaps

**Build shared components first**, then fix existing page gaps using them.

#### 1A. Shared Components (build once, use everywhere)

| Task | Design Reference | Effort |
|------|------------------|--------|
| 1A.1 `DateRangePicker` - dual calendar, presets, "Apply Range" | `form-date-range-picker` | M |
| 1A.2 `MultiSelect` - tag chips, checkbox dropdown | `form-multiselect-component` | M |
| 1A.3 `ExportModal` - PDF/Excel/CSV format cards, date range | `modal-export-options` | S |
| 1A.4 `SummaryCards` - KPI cards with $ amount and % change | `balance-sheet-report` | S |
| 1A.5 `StatusBadge` - colored status indicators | `general-ledger-entries` | XS |
| 1A.6 `FileUpload` - drag-and-drop with preview | `payment-entry-form` | S |
| 1A.7 `ConfirmDialog` - delete/discard confirmation | `modal-delete-confirmation` | XS |
| 1A.8 `SearchableSelect` - typeahead dropdown | `form-search-autocomplete` | S |

**Estimated effort**: ~1.5 weeks

#### 1B. Existing Page Field Gaps (using new shared components)

| Task | Design Reference | Effort |
|------|------------------|--------|
| 1B.1 Invoice form: add numberPrefix+number (combined), salesOrderNumber, currency/exchangeRate (advanced section) | `new-invoice-form` | M |
| 1B.2 Invoice items: switch from single taxRate to `MultiSelect` TaxEntry references | `form-multiselect-component`, `tax-and-discount-calculator` | L |
| 1B.3 Bill form: add numberPrefix+number, PO/SO numbers, currency/exchangeRate. Fix `billDate` field name | `new-invoice-form` (same pattern) | M |
| 1B.4 Payment form: redesign as 2-column layout with Invoice Summary card + `payInAccount`/`payOutAccount` + `FileUpload` for receipt + Partial/Full toggle | `payment-entry-form` | L |
| 1B.5 Voucher form: add `paymentMethod`, `currency`/`exchangeRate`, ledger account balance display | Existing + SSR fields | M |
| 1B.6 Ledger Account form: add `parentAccount`, `currency`, `cashFlow`, `hiddenAccount` | `general-ledger-entries` | S |
| 1B.7 Journal Entry page: add `currency`, `exchangeRate`, `useDifferentLedgerTransactionDates` | Existing | S |
| 1B.8 All existing reports: add `DateRangePicker`, `SummaryCards`, `ExportModal`, `verifiedTransaction`/`isParentChecked` filters | Report designs | M |
| 1B.9 Account Settings: add logo/favicon `FileUpload`, `startOfFiscalYear` (`preferredTemplateLayout` excluded - fixed at Vertical) | Existing | M |
| 1B.10 Add `Clients` to sidebar navigation | `vendor-client-management` | XS |
| 1B.11 Add `archived`/`disabled` toggle to Agent/User edit form | Existing | S |

**Estimated effort**: ~2.5 weeks

### Phase 2: New P1 Modules + Reports (Design-Driven)

| Task | Design Reference | Effort |
|------|------------------|--------|
| 2.1 Tax Entry CRUD (list + form) with toggle switches for boolean fields | `tax-liability-report`, `form-toggle-switch-component` | M |
| 2.2 Service Description CRUD - implement as card grid (category sidebar + cards + running total) | `services-selection-grid`, `item-services-catalog-browser` | L |
| 2.3 Financial Year CRUD (simple list + form) | Standard form pattern | S |
| 2.4 Account Balances report with `SummaryCards`, `ExpandableTable`, `DateRangePicker`, `ExportModal` | `balance-sheet-report` pattern | M |
| 2.5 Account Transactions report with filters (ledgerAccount, dateRange, verifiedTransaction) | `general-ledger-entries` pattern | M |
| 2.6 GL Transactions list: add search, `StatusBadge`, `AdvancedFilterSidebar`, pagination, "Post Selected" bulk action | `general-ledger-entries` | L |
| 2.7 Add sidebar entries for new modules | Standard | XS |
| 2.8 Payment allocation: multi-invoice allocation with checkbox table | `payment-allocation-screen` | L |

**Estimated effort**: ~3.5 weeks

### Phase 3: P2 Modules + Remaining Reports

| Task | Design Reference | Effort |
|------|------------------|--------|
| 3.1 Ledger Account Category CRUD | `expense-category-breakdown` for reference | M |
| 3.2 Exchange Rate CRUD | Standard form pattern | M |
| 3.3 Budget Management (Budget + Category + Entry) with variance report | `budget-vs-actual-variance-report` | L |
| 3.4 Client Income report | Report template pattern | M |
| 3.5 Vendor Purchases report | `vendor-payment-analysis` | M |
| 3.6 Combined Vendor & Client directory (merge existing pages) with type badges | `vendor-client-management` | M |
| 3.7 Vendor form: add `symbol`, `postalAddress`, `ledgerAccount`, `archived` | Standard | S |
| 3.8 Multi-contact widgets (emailContacts/phoneContacts) for Vendor, Account Settings | Standard | M |

**Estimated effort**: ~4 weeks

### Phase 4: Polish, Empty States & UX Enhancements

| Task | Design Reference | Effort |
|------|------------------|--------|
| 4.1 Empty states for all list/report pages | `empty-state-*` designs (5 variants) | M |
| 4.2 Loading skeletons (table, dashboard, full-page) | `loading-*` designs (4 variants) | M |
| 4.3 Error pages (404, 500, session expired, offline) | `error-*` designs (5 variants) | S |
| 4.4 Alert banners + toast notification stack | `alert-banner-*`, `alert-toast-notification-stack` | S |
| 4.5 Soft-delete (`archived`) filter on all list pages | Standard | M |
| 4.6 `DonutChart` + `BarChart` visualization components for reports | `balance-sheet-report`, `expense-category-breakdown` | M |
| 4.7 Quick edit slide-over for Clients/Vendors | `modal-quick-edit-client` | S |
| 4.8 Invoice approval workflow (Draft → Approved → Sent) | `invoice-approval-workflow` | M |
| 4.9 Invoice PDF preview | `invoice-draft-preview` | S |
| 4.10 Pagination component for all list pages | `vendor-client-management` | S |

**Estimated effort**: ~2.5 weeks

---

## 12. DESIGN SYSTEM NOTES

### Color Palette (from designs)
- **Primary**: Orange `#f24a0d` (buttons, active states, links)
- **Background**: Light gray `#f8f8f8` (page), White `#ffffff` (cards)
- **Text**: Dark `#1a1a1a` (headings), Medium `#6b7280` (labels), Light `#9ca3af` (placeholders)
- **Success**: Green for positive values, "Active" status, under-budget
- **Danger**: Red for negative values, "Overdue" status, over-budget
- **Warning**: Orange/Yellow for "Pending", "Draft" status
- **Info**: Blue for "Client" type badge

### Typography (from designs)
- **Font**: Manrope (already in SPA)
- **Headings**: Bold, large (e.g., "New Invoice" = ~24px bold)
- **Labels**: Medium weight, smaller (~14px)
- **Body**: Regular weight (~14-16px)

### Spacing
- Cards use `p-6` padding with `rounded-xl` borders
- Section gaps: `gap-6` between cards
- Form field gaps: `gap-4` between fields

### Icons
- Material Symbols Outlined (already in SPA)
- Used for: sidebar nav, action buttons, status indicators

---

## Appendix: SSR Sidebar Menu (Complete)

### Finance Menu (20 items)
1. Financial Year (**MISSING**)
2. Chart of Accounts (PARTIAL)
3. Transaction (PARTIAL)
4. Account Category (**MISSING**)
5. Journal (PARTIAL)
6. Voucher (PARTIAL)
7. ~~Coupons & Maturities~~ (N/A)
8. ~~Pending Settlement~~ (N/A)
9. Invoice (PARTIAL)
10. Invoice Item (PARTIAL - inline)
11. Invoice Payment (PARTIAL)
12. Bill (PARTIAL)
13. Bill Item (PARTIAL - inline)
14. Bill Payment (PARTIAL)
15. Supplier/Vendor (PARTIAL)
16. Invoice/Bill Services (**MISSING**)
17. Exchange Rate (**MISSING**)
18. Tax Entry (**MISSING**)
19. Budget (**MISSING**)
20. Budget Category (**MISSING**)
21. Budget Entry (**MISSING**)
22. ~~Finance Data Sync~~ (N/A)

### Finance Reports Menu (9 items)
1. Account Balances (**MISSING**)
2. Account Transactions (**MISSING**)
3. Trial Balance (PARTIAL)
4. Balance Sheet (PARTIAL)
5. Income Statement (PARTIAL)
6. Income By Client (**MISSING**)
7. Aged Receivables (PARTIAL)
8. Purchases By Vendors (**MISSING**)
9. Aged Payables (PARTIAL)

---

## 13. SSR WORKFLOW INVESTIGATION FINDINGS

**Date**: 2026-02-07
**Status**: COMPLETE — All SSR workflows investigated

This section documents the actual backend (Grails SSR) workflows for every identified gap, based on direct source code investigation of `soupmarkets-web`.

---

### 13.1 Payment Workflows (UP-06/07)

#### InvoicePayment SSR Workflow

**Source**: `InvoicePaymentController.groovy`, `InvoicePayment.groovy`, `InvoicePaymentLedgerTransactionListenerService.groovy`

**Domain fields** (what SSR actually saves):
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `invoice` | FK | YES (not nullable) | Single invoice per payment |
| `amount` | BigDecimal | YES | Pre-filled with `invoice.amountDue` |
| `paymentDate` | Date | YES | Defaults to today |
| `paymentMethod` | FK | No | PaymentMethod entity |
| `payInAccount` | FK | YES (not nullable) | **Source: `accountBankDetailsList.collect{it.ledgerAccount}`** |
| `notes` | String | No | Free text |
| `currency` | Currency | Auto | Inherited from `invoice.currency` |
| `exchangeRate` | double | Auto | Inherited from `invoice.exchangeRate` |

**How `payInAccount` dropdown is populated**: SSR uses `userSessionData.accountBankDetailsList?.collect{it.ledgerAccount}?.findAll()` — the list of LedgerAccounts linked to AccountBankDetails records. SPA must replicate this by loading AccountBankDetails and extracting `ledgerAccount` from each.

**SSR does NOT show account balance** on the InvoicePayment form (unlike Voucher form which does).

**Ledger auto-creation**: When saved, creates `Voucher` with `voucherType=DEPOSIT`, `voucherTo=CLIENT`, `debitLedgerAccount=payInAccount` (bank), `creditLedgerAccount=receivableAccount`. Async via RabbitMQ `syncInvoicePayment` queue (though lifecycle hooks are currently **commented out**).

#### BillPayment SSR Workflow

**Source**: `BillPaymentController.groovy`, `BillPayment.groovy`

**Same pattern as InvoicePayment**, with these differences:
| Difference | InvoicePayment | BillPayment |
|-----------|----------------|-------------|
| Account field | `payInAccount` (money IN) | `payOutAccount` (money OUT) |
| File upload | None | `paymentReceipt` (SoupBrokerFile) |
| Voucher type | DEPOSIT | PAYMENT |
| Ledger direction | Debit Bank, Credit Receivable | Debit Payable, Credit Bank |

**File upload**: SSR uses `<g:uploadForm>` multipart. SoupBrokerFile accepts 3 formats: Base64 string, public URL, or standard multipart. SPA should use Base64 encoding.

#### CRITICAL FINDING: No Multi-Invoice Payment Allocation

**There is NO allocation logic in the backend.** Each InvoicePayment belongs to exactly ONE Invoice. The `payment-allocation-screen` design (multi-invoice checkbox allocation) has **zero backend support**. If desired, this requires:
- New backend endpoint(s) for batch payment creation
- Or SPA can create multiple individual InvoicePayment records in a loop (simulating allocation)

**Partial payments work via cumulative records**: Multiple InvoicePayment records against one Invoice. `Invoice.getPaidAmount()` sums them. Status transitions: PENDING → PARTIAL → PAID.

#### FINDING: Amount validation is commented out

Both InvoicePayment and BillPayment have `min:0.01` constraint **commented out**. Backend currently accepts zero/negative amounts. SPA should add client-side validation: `amount > 0 && amount <= amountDue`.

---

### 13.2 Voucher Workflows (UP-11)

**Source**: `VoucherController.groovy`, `Voucher.groovy`, `VoucherService.groovy`

#### CRITICAL FINDING: RECEIPT is silently converted to DEPOSIT

In `Voucher.beforeImport()`:
```groovy
if(voucherType == VoucherType.RECEIPT) {
    voucherType = VoucherType.DEPOSIT
}
```

The SSR form shows all three types (PAYMENT, DEPOSIT, RECEIPT), but RECEIPT is normalized to DEPOSIT on save. **They produce identical ledger transactions.** The SPA should either:
- Show all three (matching SSR) and let backend normalize
- Or show only PAYMENT and DEPOSIT to reduce confusion

#### Voucher SSR Form — Full Field List

| # | Field | Condition | SPA Status |
|---|-------|-----------|------------|
| H | `journalEntryType` | Always hidden: `DOUBLE_ENTRY` | SPA must send this |
| 1 | `voucherType` | Always | DONE |
| 2 | `voucherTo` | Always | DONE |
| 3 | `accountServices` | CLIENT only | DONE |
| 4 | `vendor` | VENDOR only | DONE |
| 5 | `staff` | STAFF only | DONE |
| 6 | `beneficiaryInfo` | OTHER only | DONE |
| 7 | `currency` | Always | **MISSING** |
| 8 | `exchangeRate` | Always | **MISSING** |
| 9 | `amount` | Always | DONE |
| 10 | `paymentMethod` | Always | **MISSING** |
| 11 | `transactionDate` | Always | DONE (as voucherDate) |
| 12 | `notes` | Always | DONE (as description) |
| 13 | `voucherStation` | Always | **N/A** (trading) |
| 14 | `debitLedgerAccount` | Always | DONE (as cashAccountId/expenseAccountId) |
| 15 | `creditLedgerAccount` | Always | DONE (as incomeAccountId) |
| RO | debit/credit balance | Read-only | **MISSING** |

**Account balance display**: The SSR form shows `debitLedgerAccount.balance` and `creditLedgerAccount.balance` as **read-only fields**. `VoucherService.doCreate()` pre-populates them via `ledgerAccountService.getBalance()`. SPA needs a balance lookup API.

**Dynamic form reload**: SSR uses `fetchAndChangeUrlParams()` — reloads page with form values as URL params when any field changes. SPA achieves this with React conditional rendering (already done).

#### DEPOSIT vs PAYMENT Ledger Behavior

| Type | Default State | Effect |
|------|--------------|--------|
| DEPOSIT/RECEIPT | `transactionState = CREDIT` | Money flowing IN; default time 12:00 |
| PAYMENT | `transactionState = DEBIT` | Money flowing OUT; default time 17:00 |

**Constraint validation**:
- PAYMENT: `creditLedgerAccount` MUST be ASSET type
- DEPOSIT: `debitLedgerAccount` MUST be ASSET type

---

### 13.3 Report Workflows (UP-12)

**Source**: `FinanceReportsController.groovy`, service files in `soupbroker/finance/report/`

#### CRITICAL FINDING: Cash Flow Statement has NO endpoint

`FinanceService.generateCashFlowStatement()` exists as a service method but **no controller action exposes it**. It works by:
1. Finding LedgerAccounts where `cashFlow = true`
2. Getting LedgerTransactions within date range
3. Categorizing: Operating (REVENUE/EXPENSE), Investing (LONG_TERM_ASSETS), Financing (LIABILITY/EQUITY)
4. Returns: `operatingActivities`, `investingActivities`, `financingActivities`, `netCashFlow`, `beginningCashBalance`, `endingCashBalance`

**This needs a new backend endpoint** or SPA must replicate the logic (current naive approach). The `cashFlow` boolean on LedgerAccount is the key — it identifies which accounts are cash accounts.

#### `verifiedTransaction` — What It Actually Is

`boolean verifiedTransaction = false` on LedgerTransaction. Means "this transaction has been verified/approved and affects account balances." **Unverified transactions are pending review.** Filter: `eq('verifiedTransaction', Boolean.valueOf(params?.verifiedTransaction))`.

SSR renders as a dropdown with "Verified"/"Unverified" options.

#### `isParentChecked` — What It Actually Is

Enum `ParentChildLedger`: `ONLY_PARENT_ACCOUNT` (default) or `WITH_SUB_ACCOUNT`.
- `ONLY_PARENT_ACCOUNT`: Show only top-level accounts
- `WITH_SUB_ACCOUNT`: Include child accounts, aggregate their balances into parents

**Default is ONLY_PARENT_ACCOUNT** — SSR shows a dropdown for this.

#### `dateRange` — IS A STUB

The `dateRange` parameter in GSP views renders with `from="${[]}"` — **zero options**. It is NOT processed by any controller or service. All date filtering uses raw `from` and `to` parameters. The SPA's date range preset dropdown should set `from`/`to` values directly.

#### Report API Endpoints (verified working)

| Report | Endpoint | Key Params |
|--------|----------|------------|
| Account Balances | `GET /rest/financeReports/accountBalances.json` | `from`, `to`, `isParentChecked`, `ledgerAccount`, `verifiedTransaction` |
| Account Transactions | `GET /rest/financeReports/accountTransactions.json` | `from`, `to`, `ledgerAccount` (filter), `verified`, `relatedToClass`, `relatedToId` |
| Trial Balance | `GET /rest/financeReports/trialBalance.json` | `from`, `to`, `isParentChecked` |
| Balance Sheet | `GET /rest/financeReports/balanceSheet.json` | `to`, `isParentChecked` |
| Income Statement | `GET /rest/financeReports/incomeStatement.json` | `from`, `to`, `isParentChecked` |
| Client Income | `GET /rest/financeReports/clientIncome.json` | `from`, `to`, `accountServices` |
| Vendor Purchases | `GET /rest/financeReports/vendorPurchases.json` | `from`, `to` |
| Aged Receivables | `GET /rest/financeReports/agedReceivables.json` | `to` |
| Aged Payables | `GET /rest/financeReports/agedPayables.json` | `from`, `to` |

#### Account Transactions — `relatedToClass`/`relatedToId`

These params filter LedgerTransactions linked to a specific domain object. Example: `relatedToClass=soupbroker.finance.Invoice&relatedToId={uuid}` shows all ledger entries for that invoice. Useful for drill-down from reports.

---

### 13.4 Account Settings Workflows (UP-13)

**Source**: `AccountController.groovy`, `Account.groovy`

#### Logo/Favicon Upload

Both are `SoupBrokerFile` associations. `SoupBrokerFileUtilityService` accepts:
1. Base64 string: `"data:image/png;base64,..."`
2. Public URL: `"https://example.com/logo.png"`
3. Standard multipart upload

SPA should use Base64 encoding for uploads. The standard Grails data binding handles file fields automatically.

#### `startOfFiscalYear`

Stored as **String** in `MM-DD` format (e.g., "01-01" for January 1st). Simple text property, data-bound normally. Note: `FinanceService.getStartOfFinancialYear()` uses the `FinancialYear` domain, not this string. This field is a simpler configuration option.

#### `emailContacts`/`phoneContacts`

These are **computed getter methods**, NOT stored fields on Account:
- `Account.getContacts()` queries `Contact` where `sourceId=account.id`
- `getEmailContacts()` finds `EmailContact` subclasses from contacts
- `getPhoneContacts()` finds `PhoneContact` subclasses from contacts

**Saving requires separate CRUD operations** on Contact/EmailContact/PhoneContact controllers — NOT through AccountController. SPA needs a multi-contact widget that creates Contact entities separately.

---

### 13.5 Ledger Transaction Workflows (UP-09)

**Source**: `LedgerTransactionController.groovy`, `LedgerTransaction.groovy`

#### CRITICAL FINDING: No Batch Post Endpoint

There is **no** `post`, `postSelected`, or `batch` action in `LedgerTransactionController`. The `verifiedTransaction` boolean is the "posted" status, but it must be updated **per-transaction** through the standard `update` action. The design's "Post Selected" button has no backend support — needs a new endpoint.

#### SSR Filter Parameters (for advanced filter sidebar)

| Param | Type | Description |
|-------|------|-------------|
| `search` | String | Keyword across `id`, `serialised`, `notes` |
| `ledgerAccount` | UUID | Filter by account (matches debit, credit, or single-entry) |
| `from` | Date | Transaction date >= |
| `to` | Date | Transaction date <= |
| `balanced` | Boolean | Filter balanced status |
| `verifiedTransaction` | Boolean | Filter verified/unverified |

**Pagination**: `max` (default 10, max 1000), `offset`, `sort` (default `transactionDate`), `order` (default `desc`). Response includes `ledgerTransactionCount: totalCount`.

---

### 13.6 Missing Module Endpoints (UP-16 through UP-21)

#### ALL REST ENDPOINTS EXIST

| Module | Endpoint | Controller Confirmed |
|--------|----------|---------------------|
| Financial Year | `/rest/financialYear/index.json` | `FinancialYearController.groovy` |
| Tax Entry | `/rest/taxEntry/index.json` | `TaxEntryController.groovy` |
| Service Description | `/rest/serviceDescription/index.json` | `ServiceDescriptionController.groovy` |
| Ledger Account Category | `/rest/ledgerAccountCategory/index.json` | `LedgerAccountCategoryController.groovy` |
| Exchange Rate | `/rest/exchangeRate/index.json` | `ExchangeRateController.groovy` |
| Budget | `/rest/budget/index.json` | `BudgetController.groovy` |
| Budget Category | `/rest/budgetCategory/index.json` | `BudgetCategoryController.groovy` |
| Budget Entry | `/rest/budgetEntry/index.json` | `BudgetEntryController.groovy` |

All support standard CRUD: `index`, `show`, `create`, `save`, `edit`, `update`, `delete`.

URL routing supports both patterns:
- `/rest/{controller}/index.json` (without module prefix)
- `/rest/finance/{controller}/index.json` (with module prefix)

---

### 13.7 Summary: Backend Changes Required

| Gap | Requires Backend Change? | Details |
|-----|--------------------------|---------|
| Cash Flow Statement endpoint | **YES** | Need new controller action exposing `FinanceService.generateCashFlowStatement()` |
| Batch Post Transactions | **YES** | Need new endpoint to set `verifiedTransaction=true` for multiple IDs |
| Multi-Invoice Payment Allocation | **YES** (if desired) | Currently no backend support; or SPA can loop-create individual payments |
| Missing module pages | **NO** | All REST endpoints already exist |
| `payInAccount`/`payOutAccount` | **NO** | SPA can derive from AccountBankDetails API |
| Report filters | **NO** | Backend already accepts all params |
| File upload (receipt, logo) | **NO** | SoupBrokerFile handles Base64 encoding |
| Contact chain (email/phone) | Partially | Separate Contact CRUD exists; backend auto-chain (Issue #12) preferred |
| Ledger account balance lookup | **Possible** | `/rest/ledgerAccount/balance/{id}.json` exists but returns 302 (Issue #4) |

---

### 13.8 Design vs Backend Reality Check

| Design Feature | Backend Support | SPA Action |
|----------------|-----------------|------------|
| Multi-invoice payment allocation | **NONE** | Either build backend endpoint OR loop-create individual payments |
| "Post Selected" bulk action | **NONE** | Build backend batch endpoint |
| Date range presets (This Month, etc.) | **STUB** — backend uses raw `from`/`to` | SPA computes dates client-side, sends `from`/`to` |
| Account balance on payment forms | Only on Voucher form | Solve Issue #4 (balance endpoint 302) or compute from transactions |
| Charts on reports | N/A (visualization only) | Pure frontend — no backend needed |
| Export (PDF/Excel/CSV) | Backend has `exportService` | Can use backend export or generate client-side |
| RECEIPT vs DEPOSIT distinction | **Identical** — RECEIPT normalized to DEPOSIT | Show both or just DEPOSIT+PAYMENT |
