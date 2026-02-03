# SoupFinance API Contract Schema

This document maps frontend TypeScript types to backend Grails domain classes.

## Overview

| Frontend Type | Backend Domain | Endpoint Base | Notes |
|---------------|----------------|---------------|-------|
| `Corporate` | `Corporate` | `/corporate` | KYC registration |
| `CorporateAccountPerson` | `CorporateAccountPerson` | `/corporateAccountPerson` | Directors/signatories |
| `CorporateDocuments` | `CorporateDocuments` | `/corporateDocuments` | KYC documents |
| `Invoice` | `Invoice` | `/invoice` | Customer invoices |
| `InvoiceItem` | `InvoiceItem` | `/invoiceItem` | Invoice line items |
| `InvoicePayment` | `InvoicePayment` | `/invoicePayment` | Invoice payments |
| `InvoiceClient` | `InvoiceClient` | `/invoiceClient` | Invoice recipients |
| `Bill` | `Bill` | `/bill` | Vendor bills/expenses |
| `BillItem` | `BillItem` | `/billItem` | Bill line items |
| `BillPayment` | `BillPayment` | `/billPayment` | Bill payments |
| `Vendor` | `Vendor` | `/vendor` | Vendor management |
| `LedgerAccount` | `LedgerAccount` | `/ledgerAccount` | Chart of accounts |
| `LedgerAccountCategory` | `LedgerAccountCategory` | `/ledgerAccountCategory` | Account categories |
| `LedgerTransaction` | `LedgerTransaction` | `/ledgerTransaction` | Journal entries |
| `LedgerTransactionGroup` | `LedgerTransactionGroup` | `/ledgerTransactionGroup` | Grouped entries |
| `Voucher` | `Voucher` | `/voucher` | Payment/receipt vouchers |
| `Agent` | `Agent` | `/agent` | Staff/users |
| `AccountBankDetails` | `AccountBankDetails` | `/accountBankDetails` | Bank accounts |
| `AccountPerson` | `AccountPerson` | `/accountPerson` | Company directors |
| `AccountSettings` | `Account` | `/account` | Tenant settings |

## Type Definitions

### Source Files

- **Frontend Types**: `src/types/index.ts`, `src/types/settings.ts`
- **API Endpoints**: `src/api/endpoints/*.ts`
- **Backend Domains**: `soupmarkets-web/grails-app/domain/`

## Base Entity Pattern

All domain entities extend `SbDomain` which provides:

```typescript
interface BaseEntity {
  id: string;           // UUID (backend: String id)
  archived?: boolean;   // Soft delete flag
  dateCreated?: string; // ISO date string
  lastUpdated?: string; // ISO date string
  tenantId?: string;    // Multi-tenant ID
}
```

## Foreign Key Convention

Backend Grails uses nested object binding for foreign keys:

```typescript
// Frontend sends:
{ vendor: { id: "uuid-string" } }

// NOT flat format:
{ vendorId: "uuid-string" }  // WRONG for JSON binding
```

## Enum Mappings

### InvoiceStatus / BillStatus
```
'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED'
```

### LedgerGroup (Account Types)
```
'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'REVENUE'
```
Note: Backend uses both `INCOME` and `REVENUE` interchangeably.

### VoucherType
```
'PAYMENT' | 'DEPOSIT' | 'RECEIPT'
```

### VoucherTo (Beneficiary Type)
```
'CLIENT' | 'VENDOR' | 'STAFF' | 'OTHER'
```

### LedgerState (Transaction Direction)
```
'DEBIT' | 'CREDIT'
```

### BusinessCategory
```
'LIMITED_LIABILITY' | 'PARTNERSHIP' | 'SOLE_PROPRIETORSHIP' | 'PUBLIC_LIMITED' | 'NON_PROFIT'
```

## Detailed Type Contracts

### Corporate KYC

```typescript
interface Corporate {
  id: string;
  name: string;
  certificateOfIncorporationNumber: string;
  registrationDate: string;              // ISO date
  businessCategory: BusinessCategory;
  taxIdentificationNumber?: string;
  email: string;
  phoneNumber: string;
  address?: string;
  kycStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
}
```

### Invoice System

```typescript
interface Invoice {
  id: string;
  invoiceNumber: string;                 // Auto-generated
  client: { id: string; name?: string }; // FK to InvoiceClient
  issueDate: string;                     // ISO date
  dueDate: string;                       // ISO date
  status: InvoiceStatus;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  amountPaid: number;                    // Calculated from payments
  amountDue: number;                     // Calculated
  notes?: string;
  terms?: string;
  items?: InvoiceItem[];                 // Eager loaded on show
}

interface InvoiceItem {
  id: string;
  invoice: { id: string };               // FK back to Invoice
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;                       // Percentage (0-100)
  discountPercent: number;               // Percentage (0-100)
  amount: number;                        // Calculated
}
```

### Accounting/Ledger

```typescript
interface LedgerAccount {
  id: string;
  code: string;                          // Account code (e.g., "1000")
  name: string;
  number?: string;                       // Account number
  description?: string;
  ledgerGroup: LedgerGroup;
  ledgerAccountCategory?: { id: string; name?: string };
  parentAccount?: { id: string; name?: string };
  isActive: boolean;
  balance: number;                       // Current balance
}

interface Voucher {
  id: string;
  voucherNumber: string;                 // Auto-generated
  voucherType: VoucherType;
  voucherTo: VoucherTo;
  voucherDate: string;
  beneficiaryName?: string;
  beneficiaryReference?: string;
  client?: { id: string; name?: string };
  vendor?: { id: string; name?: string };
  staff?: { id: string; name?: string };
  amount: number;
  description: string;
  reference?: string;
  cashAccount?: { id: string; name?: string; code?: string };
  expenseAccount?: { id: string; name?: string; code?: string };
  incomeAccount?: { id: string; name?: string; code?: string };
  ledgerTransaction?: LedgerTransaction;
  status: 'PENDING' | 'APPROVED' | 'POSTED' | 'CANCELLED';
}
```

### Settings

```typescript
interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  designation?: string;
  address?: string;
  userAccess?: {
    username: string;
    // password never returned
  };
  authorities?: Array<{ authority: string }>;
}

interface AccountBankDetails {
  id: string;
  accountName: string;
  accountNumber: string;
  bank?: { id: string; name?: string };
  bankBranch?: string;
  priority?: number;
  currency?: string;
  ledgerAccount?: { id: string; name?: string };
  defaultClientDebtAccount?: boolean;
  defaultClientEquityAccount?: boolean;
}
```

## CSRF Token Pattern

POST/PUT/DELETE operations require CSRF tokens:

```typescript
// Step 1: Get token from create.json or edit.json
const csrf = await getCsrfToken('entity');

// Step 2: Include in request body
const response = await apiClient.post('/entity/save.json', {
  ...data,
  SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
  SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
});
```

## Report Types

Reports are read-only and don't map to domains directly:

| Report | Endpoint | Response Type |
|--------|----------|---------------|
| Trial Balance | `/financeReports/trialBalance.json` | `TrialBalance` |
| Balance Sheet | `/financeReports/balanceSheet.json` | `BalanceSheet` |
| Profit & Loss | `/financeReports/profitLoss.json` | `ProfitLoss` |
| Cash Flow | `/financeReports/cashFlow.json` | `CashFlowStatement` |
| Aged Receivables | `/financeReports/agedReceivables.json` | `AgingReport` |
| Aged Payables | `/financeReports/agedPayables.json` | `AgingReport` |
| Account Balances | `/financeReports/accountBalances.json` | `BackendAccountBalance[]` |

## Backend Domain Structure Interceptor

The Grails backend includes a **structure interceptor** that exposes domain class schemas. This can be used to auto-generate TypeScript types.

### Accessing Domain Structure

Each domain controller supports a `structure.json` endpoint:

```bash
# Get Invoice domain structure
GET /rest/invoice/structure.json

# Get LedgerAccount domain structure
GET /rest/ledgerAccount/structure.json

# Get Voucher domain structure
GET /rest/voucher/structure.json
```

### Example Response

```json
{
  "domainClass": "Invoice",
  "properties": {
    "id": { "type": "String", "required": true },
    "invoiceNumber": { "type": "String", "required": true },
    "client": { "type": "InvoiceClient", "required": true, "association": true },
    "issueDate": { "type": "Date", "required": true },
    "dueDate": { "type": "Date", "required": true },
    "status": { "type": "InvoiceStatus", "enum": ["DRAFT", "SENT", "VIEWED", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] },
    "subtotal": { "type": "BigDecimal", "required": false },
    "items": { "type": "InvoiceItem", "collection": true, "association": true }
  }
}
```

### Type Generation Strategy

To auto-generate TypeScript types from backend structures:

1. **Fetch all domain structures** from the backend
2. **Map Grails types to TypeScript**:
   - `String` → `string`
   - `Long`, `Integer`, `BigDecimal` → `number`
   - `Boolean` → `boolean`
   - `Date` → `string` (ISO format)
   - `enum` → Union type
   - `association` → `{ id: string; name?: string }`
   - `collection` → `Array<T>`
3. **Generate interfaces** with proper optional markers
4. **Write to `src/types/generated.ts`**

### Example Script (Future Implementation)

```typescript
// scripts/generate-types.ts
async function generateTypesFromBackend() {
  const domains = ['invoice', 'bill', 'vendor', 'ledgerAccount', 'voucher'];

  for (const domain of domains) {
    const structure = await fetch(`${API_URL}/${domain}/structure.json`);
    const schema = await structure.json();
    const tsInterface = convertToTypeScript(schema);
    // Write to generated types file
  }
}
```

## Runtime Validation (Optional)

The frontend includes **optional** Zod schemas for runtime API response validation.

### Why Optional?

- **Non-breaking**: In production, validation errors are logged but never thrown
- **Gradual adoption**: Add validation to endpoints as needed, not all at once
- **Development safety**: In dev mode, validation errors throw to catch issues early

### Schema Location

```
src/schemas/
├── base.ts      # Base entity, FK reference, enum schemas
├── domains.ts   # Domain-specific schemas (Vendor, Invoice, etc.)
├── validate.ts  # Validation utilities
└── index.ts     # Exports
```

### Usage Examples

```typescript
import { validateResponse, validateArray, safeValidate } from '../schemas';
import { vendorSchema, invoiceSchema } from '../schemas';

// Single entity validation
export async function getVendor(id: string): Promise<Vendor> {
  const response = await apiClient.get(`/vendor/show/${id}.json`);
  return validateResponse(response.data, vendorSchema, 'getVendor');
}

// Array validation
export async function listVendors(): Promise<Vendor[]> {
  const response = await apiClient.get('/vendor/index.json');
  return validateArray(response.data, vendorSchema, 'listVendors');
}

// Safe validation (returns null on failure, never throws)
const vendor = safeValidate(data, vendorSchema);
if (!vendor) {
  // Handle gracefully, show fallback UI
}
```

### Validation Behavior

| Environment | On Validation Error |
|-------------|---------------------|
| Development | Logs error + throws (catches issues early) |
| Production | Logs error only (app continues working) |

### Available Schemas

| Schema | Domain | File |
|--------|--------|------|
| `vendorSchema` | Vendor | `domains.ts` |
| `invoiceSchema` | Invoice | `domains.ts` |
| `invoiceItemSchema` | InvoiceItem | `domains.ts` |
| `invoicePaymentSchema` | InvoicePayment | `domains.ts` |
| `invoiceClientSchema` | InvoiceClient | `domains.ts` |
| `billSchema` | Bill | `domains.ts` |
| `billItemSchema` | BillItem | `domains.ts` |
| `billPaymentSchema` | BillPayment | `domains.ts` |
| `ledgerAccountSchema` | LedgerAccount | `domains.ts` |
| `ledgerTransactionSchema` | LedgerTransaction | `domains.ts` |
| `ledgerTransactionGroupSchema` | LedgerTransactionGroup | `domains.ts` |
| `voucherSchema` | Voucher | `domains.ts` |
| `agentSchema` | Agent | `domains.ts` |
| `bankSchema` | Bank | `domains.ts` |
| `accountBankDetailsSchema` | AccountBankDetails | `domains.ts` |
| `accountPersonSchema` | AccountPerson | `domains.ts` |
| `corporateSchema` | Corporate | `domains.ts` |
| `corporateAccountPersonSchema` | CorporateAccountPerson | `domains.ts` |
| `corporateDocumentsSchema` | CorporateDocuments | `domains.ts` |

### Type Inference

Zod schemas can infer TypeScript types:

```typescript
import { z } from 'zod';
import { vendorSchema } from '../schemas';

// Infer type from schema (alternative to manual interface)
type Vendor = z.infer<typeof vendorSchema>;
```

## Notes

1. **Structure Interceptor**: Backend exposes domain schemas via `/structure.json` endpoints
2. **Grails Binding**: Backend uses Grails data binding which handles nested objects for FKs
3. **Date Format**: All dates use ISO 8601 format (YYYY-MM-DD)
4. **Currency**: Amounts are in cents/smallest unit unless otherwise specified
5. **Soft Deletes**: Most entities use `archived: true` for soft deletes
6. **Runtime Validation**: Optional Zod schemas in `src/schemas/` for API response validation

## Future Improvements

- [x] Add Zod schemas for runtime API response validation
- [ ] Create type generation script using structure interceptor
- [ ] Add request/response examples for each endpoint
- [ ] Automate type sync in CI/CD pipeline
