# Data Models

[← Back to PRD Index](../PRD.md)

---

## Base Entity

All entities inherit from BaseEntity:

```typescript
interface BaseEntity {
  id: string;           // UUID
  archived: boolean;    // Soft delete flag
  dateCreated: string;  // ISO timestamp
  lastUpdated: string;  // ISO timestamp
  tenantId: string;     // Tenant discriminator
}
```

---

## Authentication & Users

### AuthUser
```typescript
interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  authorities: string[];  // Role authorities
}
```

### Agent (Staff/User)
```typescript
interface Agent extends BaseEntity {
  firstName: string;
  lastName: string;
  designation?: string;
  emailContacts?: EmailContact[];
  phoneContacts?: PhoneContact[];
  userAccess?: {
    username: string;
    enabled: boolean;
  };
  authorities?: SbRole[];
  disabled?: boolean;
}
```

---

## Tenant & Settings

### TenantRegistration
```typescript
type BusinessType = 'TRADING' | 'SERVICES';

interface TenantRegistration {
  companyName: string;
  businessType: BusinessType;
  adminFirstName: string;
  adminLastName: string;
  email: string;
  currency?: string;
}
```

### AccountSettings
```typescript
interface AccountSettings {
  id: string;
  name: string;
  currency?: string;
  countryOfOrigin?: string;
  businessLicenceCategory?: BusinessLicenceCategory;
  startOfFiscalYear?: string;
  logo?: { id: string };
  favicon?: { id: string };
}
```

### AccountBankDetails
```typescript
interface AccountBankDetails extends BaseEntity {
  accountName: string;
  accountNumber: string;
  bank?: { id: string; name: string };
  priority: 'PRIMARY' | 'SECONDARY';
  currency?: string;
  ledgerAccount?: { id: string; name: string };
}
```

---

## Invoice Management

### Invoice
```typescript
type InvoiceStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

interface Invoice extends BaseEntity {
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
```

### InvoiceItem
```typescript
interface InvoiceItem extends BaseEntity {
  invoice: { id: string };
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent: number;
  amount: number;
}
```

### InvoicePayment
```typescript
type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';

interface InvoicePayment extends BaseEntity {
  invoice: { id: string };
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference?: string;
}
```

### InvoiceClient
```typescript
type InvoiceClientType = 'INDIVIDUAL' | 'CORPORATE';

interface InvoiceClient extends BaseEntity {
  clientType: InvoiceClientType;
  name: string;
  email: string;
  phone?: string;
  address?: string;

  // Individual fields
  firstName?: string;
  lastName?: string;

  // Corporate fields
  companyName?: string;
  contactPerson?: string;
  registrationNumber?: string;
  taxNumber?: string;
}
```

---

## Bill Management

### Bill
```typescript
type BillStatus = 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

interface Bill extends BaseEntity {
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
  items?: BillItem[];
}
```

### BillItem
```typescript
interface BillItem extends BaseEntity {
  bill: { id: string };
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
}
```

### Vendor
```typescript
interface Vendor extends BaseEntity {
  name: string;
  email?: string;
  phoneNumber?: string;
  address?: string;
  taxIdentificationNumber?: string;
  paymentTerms?: number;  // days
  notes?: string;
}
```

---

## Ledger & Accounting

### LedgerAccount
```typescript
type LedgerGroup = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'REVENUE';

interface LedgerAccount extends BaseEntity {
  code: string;
  name: string;
  number?: string;
  description?: string;
  ledgerGroup: LedgerGroup;
  ledgerAccountCategory?: { id: string; name?: string };
  parentAccount?: { id: string; name?: string };
  isActive: boolean;
  balance: number;
}
```

### LedgerTransaction
```typescript
type JournalEntryType = 'DOUBLE_ENTRY' | 'SINGLE_ENTRY';
type LedgerState = 'DEBIT' | 'CREDIT';

interface LedgerTransaction extends BaseEntity {
  transactionNumber: string;
  transactionDate: string;
  description: string;
  amount: number;
  reference?: string;
  status: 'PENDING' | 'POSTED' | 'REVERSED';

  // Double-entry mode
  debitLedgerAccount?: { id: string; name?: string };
  creditLedgerAccount?: { id: string; name?: string };

  // Single-entry mode
  ledgerAccount?: { id: string; name?: string };
  transactionState?: LedgerState;

  journalEntryType: JournalEntryType;
  ledgerTransactionGroup?: { id: string };
}
```

### LedgerTransactionGroup
```typescript
interface LedgerTransactionGroup extends BaseEntity {
  description: string;
  groupDate: string;
  balanced: boolean;
  totalDebit: number;
  totalCredit: number;
  ledgerTransactionList: LedgerTransaction[];
  status: 'PENDING' | 'POSTED' | 'REVERSED';
}
```

### Voucher
```typescript
type VoucherType = 'PAYMENT' | 'DEPOSIT' | 'RECEIPT';

interface Voucher extends BaseEntity {
  voucherNumber: string;
  voucherType: VoucherType;
  voucherTo: 'CLIENT' | 'VENDOR' | 'STAFF' | 'OTHER';
  voucherDate: string;
  beneficiaryName?: string;
  amount: number;
  description: string;
  reference?: string;

  // Parties
  client?: { id: string; name?: string };
  vendor?: { id: string; name?: string };
  staff?: { id: string; name?: string };

  // Accounts
  cashAccount?: { id: string; name?: string; code?: string };
  expenseAccount?: { id: string; name?: string; code?: string };
  incomeAccount?: { id: string; name?: string; code?: string };

  status: 'PENDING' | 'APPROVED' | 'POSTED' | 'CANCELLED';
  ledgerTransaction?: LedgerTransaction;
}
```

---

## Corporate KYC

### Corporate
```typescript
type BusinessCategory = 'LIMITED_LIABILITY' | 'PARTNERSHIP' | 'SOLE_PROPRIETORSHIP' | 'PUBLIC_LIMITED' | 'NON_PROFIT';

interface Corporate extends BaseEntity {
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
```

### CorporateAccountPerson
```typescript
interface CorporateAccountPerson extends BaseEntity {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: 'DIRECTOR' | 'SIGNATORY' | 'BENEFICIAL_OWNER';
  corporate: { id: string };
}
```

---

## Entity Relationships

```
Account (Tenant)
  ├── Agent (Staff/Users)
  ├── InvoiceClient
  │     └── Invoice
  │           ├── InvoiceItem
  │           └── InvoicePayment
  ├── Vendor
  │     └── Bill
  │           ├── BillItem
  │           └── BillPayment
  ├── LedgerAccount
  │     └── LedgerTransaction
  ├── LedgerTransactionGroup
  │     └── LedgerTransaction[]
  ├── Voucher
  ├── Corporate
  │     ├── CorporateAccountPerson
  │     └── CorporateDocuments
  └── AccountBankDetails
```
