# SoupFinance SPA — Voucher Type Refactoring Plan

**Created**: 2026-02-07
**Status**: Ready for implementation
**Executor**: Separate Claude session with soupfinance-web context
**Prerequisite**: Backend restructuring plan must be executed FIRST (see `soupmarkets-voucher-type-restructuring.md`)

---

## 1. Goal

Restructure the SoupFinance SPA voucher system from the current 3-type model (PAYMENT / RECEIPT / DEPOSIT) to 4 proper accounting voucher types:

| Type | Direction | Description | Journal Entry |
|------|-----------|-------------|---------------|
| **PAYMENT** | Money OUT | Pay external party (vendor, staff, etc.) | Dr: Expense/Payable, Cr: Bank/Cash (ASSET) |
| **RECEIPT** | Money IN | Receive from external party (client, etc.) | Dr: Bank/Cash (ASSET), Cr: Income/Receivable |
| **CONTRA** | Internal | Transfer between own bank/cash accounts | Dr: Bank/Cash (ASSET), Cr: Bank/Cash (ASSET) |
| **JOURNAL** | Non-cash | Adjustments (depreciation, provisions, accruals) | Dr: Any account, Cr: Any account |

---

## 2. Current State Analysis

### 2.1 Current Voucher Types (Wrong)

| Type | Current Behavior | Problem |
|------|-----------------|---------|
| PAYMENT | Money out to vendor/staff | Correct but account filtering too narrow |
| RECEIPT | Treated identical to DEPOSIT | Redundant — backend normalizes to DEPOSIT |
| DEPOSIT | Money in from client/other | Overloaded: conflates external receipts AND internal transfers |

### 2.2 Files to Modify

| File | Changes Needed |
|------|---------------|
| `src/types/index.ts` | Update `VoucherType`, `Voucher`, `CreateVoucherRequest` |
| `src/features/accounting/VoucherFormPage.tsx` | Refactor type tabs, account filtering, journal preview |
| `src/api/endpoints/ledger.ts` | Update `createVoucher()` and `updateVoucher()` field mapping |
| `src/features/accounting/TransactionRegisterPage.tsx` | Update type filters, icons, labels (this is the voucher list view) |
| Routes file | Add routes for `/accounting/voucher/contra` and `/accounting/voucher/journal` |

---

## 3. Implementation Steps

### Step 1: Update TypeScript Types (`src/types/index.ts`)

**Current** (line 275):
```typescript
export type VoucherType = 'PAYMENT' | 'DEPOSIT' | 'RECEIPT';
```

**New**:
```typescript
// Changed: 4 standard accounting voucher types replacing old 3-type model
// PAYMENT = money out, RECEIPT = money in, CONTRA = internal transfer, JOURNAL = non-cash adjustment
export type VoucherType = 'PAYMENT' | 'RECEIPT' | 'CONTRA' | 'JOURNAL';
```

**Update `Voucher` interface** (line 341):
- Remove `expenseAccount` and `incomeAccount` fields
- Add `debitLedgerAccount` and `creditLedgerAccount` to match backend
- Keep `cashAccount` as convenience alias

```typescript
export interface Voucher extends BaseEntity {
  voucherNumber: string;
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
  // Changed: Use backend field names for ledger accounts
  debitLedgerAccount?: { id: string; name?: string; code?: string };
  creditLedgerAccount?: { id: string; name?: string; code?: string };
  // Added: Convenience aliases (resolved from debit/credit based on type)
  cashAccount?: { id: string; name?: string; code?: string };
  counterAccount?: { id: string; name?: string; code?: string };
  ledgerTransaction?: LedgerTransaction;
  status: 'PENDING' | 'APPROVED' | 'POSTED' | 'CANCELLED';
}
```

**Update `CreateVoucherRequest`** (line 402):
```typescript
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
  // Changed: Use debit/credit account IDs instead of role-based names
  debitAccountId: string;
  creditAccountId: string;
}
```

### Step 2: Refactor VoucherFormPage.tsx

This is the largest change. The form needs to dynamically adjust based on the 4 voucher types.

#### 2a. Update Voucher Type Options

**Current** (line 72):
```typescript
const VOUCHER_TYPE_OPTIONS: RadioOption[] = [
  { value: 'PAYMENT', label: 'Payment Voucher' },
  { value: 'RECEIPT', label: 'Receipt Voucher' },
  { value: 'DEPOSIT', label: 'Deposit Voucher' },
];
```

**New**:
```typescript
// Changed: 4 standard accounting voucher types
const VOUCHER_TYPE_OPTIONS: RadioOption[] = [
  { value: 'PAYMENT', label: 'Payment Voucher' },
  { value: 'RECEIPT', label: 'Receipt Voucher' },
  { value: 'CONTRA', label: 'Contra Voucher' },
  { value: 'JOURNAL', label: 'Journal Voucher' },
];
```

#### 2b. Update Zod Validation Schema

**Current** (line 31):
```typescript
voucherType: z.enum(['PAYMENT', 'RECEIPT', 'DEPOSIT'], { ... }),
```

**New**:
```typescript
voucherType: z.enum(['PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL'], {
  message: 'Voucher type is required',
}),
```

Replace `cashAccountId` / `expenseAccountId` / `incomeAccountId` with:
```typescript
debitAccountId: z.string().min(1, 'Debit account is required'),
creditAccountId: z.string().min(1, 'Credit account is required'),
```

Remove the `.refine()` calls for expense/income accounts. Replace with a single refine:
```typescript
.refine(
  (data) => {
    // CONTRA: Both accounts must be ASSET type (validated at submit time via account lookup)
    // Other types: validated by the account filter options shown
    return data.debitAccountId !== data.creditAccountId;
  },
  { message: 'Debit and credit accounts must be different', path: ['creditAccountId'] }
)
```

#### 2c. Account Filtering Per Voucher Type

This is the critical change. Each type has specific rules for which accounts can be selected:

```typescript
// Added: Account options filtered by voucher type
const accountOptionsByType = useMemo(() => {
  const allAccounts = accounts || [];
  const assetAccounts = allAccounts.filter(a => a.ledgerGroup === 'ASSET');
  const expenseAccounts = allAccounts.filter(a => a.ledgerGroup === 'EXPENSE');
  const incomeAccounts = allAccounts.filter(a => a.ledgerGroup === 'INCOME' || a.ledgerGroup === 'REVENUE');
  const allOptions = allAccounts.map(a => ({ value: a.id, label: `${a.code} - ${a.name}` }));
  const assetOptions = assetAccounts.map(a => ({ value: a.id, label: `${a.code} - ${a.name}` }));
  const expenseOptions = expenseAccounts.map(a => ({ value: a.id, label: `${a.code} - ${a.name}` }));
  const incomeOptions = incomeAccounts.map(a => ({ value: a.id, label: `${a.code} - ${a.name}` }));

  switch (watchedVoucherType) {
    case 'PAYMENT':
      // Dr: Expense/Payable account, Cr: Bank/Cash (ASSET)
      return {
        debitLabel: 'Expense Account',
        debitOptions: expenseOptions,
        debitHelperText: 'Account to debit for this payment',
        creditLabel: 'Bank/Cash Account',
        creditOptions: assetOptions,
        creditHelperText: 'Bank or cash account paying from',
      };
    case 'RECEIPT':
      // Dr: Bank/Cash (ASSET), Cr: Income/Receivable
      return {
        debitLabel: 'Bank/Cash Account',
        debitOptions: assetOptions,
        debitHelperText: 'Bank or cash account receiving into',
        creditLabel: 'Income Account',
        creditOptions: incomeOptions,
        creditHelperText: 'Income or receivable account to credit',
      };
    case 'CONTRA':
      // Dr: Bank/Cash (ASSET), Cr: Bank/Cash (ASSET) — both must be ASSET
      return {
        debitLabel: 'Transfer To (Bank/Cash)',
        debitOptions: assetOptions,
        debitHelperText: 'Destination bank or cash account',
        creditLabel: 'Transfer From (Bank/Cash)',
        creditOptions: assetOptions,
        creditHelperText: 'Source bank or cash account',
      };
    case 'JOURNAL':
      // Dr: Any account, Cr: Any account
      return {
        debitLabel: 'Debit Account',
        debitOptions: allOptions,
        debitHelperText: 'Account to debit',
        creditLabel: 'Credit Account',
        creditOptions: allOptions,
        creditHelperText: 'Account to credit',
      };
    default:
      return {
        debitLabel: 'Debit Account',
        debitOptions: allOptions,
        debitHelperText: '',
        creditLabel: 'Credit Account',
        creditOptions: allOptions,
        creditHelperText: '',
      };
  }
}, [accounts, watchedVoucherType]);
```

#### 2d. Update Account Selection Section

Replace the current conditional `{isPaymentType && ...}` / `{isReceiptType && ...}` blocks with a unified two-selector layout:

```tsx
{/* Account Selection Section */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  <Select
    label={accountOptionsByType.debitLabel}
    required
    options={accountOptionsByType.debitOptions}
    placeholder="Select account..."
    {...register('debitAccountId')}
    error={errors.debitAccountId?.message}
    helperText={accountOptionsByType.debitHelperText}
    data-testid="voucher-debit-account-select"
  />
  <Select
    label={accountOptionsByType.creditLabel}
    required
    options={accountOptionsByType.creditOptions}
    placeholder="Select account..."
    {...register('creditAccountId')}
    error={errors.creditAccountId?.message}
    helperText={accountOptionsByType.creditHelperText}
    data-testid="voucher-credit-account-select"
  />
</div>
```

#### 2e. Update Journal Entry Preview

Replace the current `{isPaymentType ? ... : ...}` conditional with a universal debit/credit preview:

```tsx
<tbody>
  <tr className="border-t border-border-light dark:border-border-dark">
    <td className="px-4 py-2">{debitAccountLabel || accountOptionsByType.debitLabel}</td>
    <td className="px-4 py-2 text-right font-medium">{formatCurrency(watchedAmount)}</td>
    <td className="px-4 py-2 text-right text-subtle-text">-</td>
  </tr>
  <tr className="border-t border-border-light dark:border-border-dark">
    <td className="px-4 py-2">{creditAccountLabel || accountOptionsByType.creditLabel}</td>
    <td className="px-4 py-2 text-right text-subtle-text">-</td>
    <td className="px-4 py-2 text-right font-medium">{formatCurrency(watchedAmount)}</td>
  </tr>
</tbody>
```

#### 2f. Update Amount Preview

Replace the binary `isPaymentType` check with type-specific styling:

```typescript
// Added: Visual indicator per voucher type
const amountIndicator = useMemo(() => {
  switch (watchedVoucherType) {
    case 'PAYMENT':
      return { icon: 'arrow_upward', label: 'Money Out', color: 'danger', bgColor: 'danger' };
    case 'RECEIPT':
      return { icon: 'arrow_downward', label: 'Money In', color: 'success', bgColor: 'success' };
    case 'CONTRA':
      return { icon: 'swap_horiz', label: 'Internal Transfer', color: 'primary', bgColor: 'primary' };
    case 'JOURNAL':
      return { icon: 'edit_note', label: 'Journal Adjustment', color: 'warning', bgColor: 'warning' };
  }
}, [watchedVoucherType]);
```

#### 2g. Update Beneficiary Section

- CONTRA vouchers: Hide the beneficiary section entirely (internal transfer, no external party)
- JOURNAL vouchers: Make beneficiary optional with label "Related Party (Optional)"
- PAYMENT/RECEIPT: Keep current behavior

```typescript
// Added: Determine if beneficiary section should be shown
const showBeneficiary = watchedVoucherType !== 'CONTRA';
const beneficiaryRequired = watchedVoucherType === 'PAYMENT' || watchedVoucherType === 'RECEIPT';
```

#### 2h. Update Page Title and Subtitle

```typescript
const pageTitle = useMemo(() => {
  switch (watchedVoucherType) {
    case 'PAYMENT': return 'New Payment Voucher';
    case 'RECEIPT': return 'New Receipt Voucher';
    case 'CONTRA': return 'New Contra Voucher';
    case 'JOURNAL': return 'New Journal Voucher';
    default: return 'New Voucher';
  }
}, [watchedVoucherType]);

const pageSubtitle = useMemo(() => {
  switch (watchedVoucherType) {
    case 'PAYMENT': return 'Record a payment made to a beneficiary';
    case 'RECEIPT': return 'Record money received from a payer';
    case 'CONTRA': return 'Record an internal fund transfer between accounts';
    case 'JOURNAL': return 'Record a non-cash journal adjustment';
    default: return 'Create a financial voucher';
  }
}, [watchedVoucherType]);
```

### Step 3: Update API Layer (`src/api/endpoints/ledger.ts`)

#### 3a. Update createVoucher()

**Current** (line 244): Sends `cashAccount`, `expenseAccount`, `incomeAccount` as separate fields.

**New**: Send `debitLedgerAccount` and `creditLedgerAccount` as backend field names:

```typescript
export async function createVoucher(data: CreateVoucherRequest): Promise<Voucher> {
  const csrf = await getCsrfToken('voucher');

  const body: Record<string, unknown> = {
    voucherType: data.voucherType,
    voucherTo: data.voucherTo,
    voucherDate: data.voucherDate,
    amount: data.amount,
    description: data.description,
    reference: data.reference,
    beneficiaryName: data.beneficiaryName,
  };

  // FK references
  if (data.clientId) body.client = { id: data.clientId };
  if (data.vendorId) body.vendor = { id: data.vendorId };
  if (data.staffId) body.staff = { id: data.staffId };

  // Changed: Use backend field names for debit/credit accounts
  body.debitLedgerAccount = { id: data.debitAccountId };
  body.creditLedgerAccount = { id: data.creditAccountId };

  const response = await apiClient.post<Voucher>(
    `/voucher/save.json?${csrfQueryString(csrf)}`,
    body
  );
  return response.data;
}
```

#### 3b. Update updateVoucher()

Same pattern — replace `cashAccountId`/`expenseAccountId` with `debitAccountId`/`creditAccountId`.

### Step 4: Update TransactionRegisterPage (Voucher List View)

> **Note**: There is no `VoucherListPage.tsx`. The voucher list is rendered by `TransactionRegisterPage.tsx`.

Update type filter chips and voucher row display:
- Add CONTRA and JOURNAL filter options
- Update type badges/icons:
  - PAYMENT: red downward arrow / `payments` icon
  - RECEIPT: green upward arrow / `receipt_long` icon
  - CONTRA: blue horizontal arrows / `swap_horiz` icon
  - JOURNAL: amber edit icon / `edit_note` icon
- Remove DEPOSIT from filter options entirely

### Step 5: Update Routes

Add new URL paths:
```typescript
{ path: 'voucher/contra', element: <VoucherFormPage /> },
{ path: 'voucher/journal', element: <VoucherFormPage /> },
```

Update `getInitialVoucherType()` in VoucherFormPage to recognize new paths:
```typescript
if (['PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL'].includes(lastPart)) {
  return lastPart as VoucherType;
}
```

### Step 6: Update Navigation

Add quick-create buttons or links for the new types in the sidebar or voucher list header:
- "New Payment" → `/accounting/voucher/payment`
- "New Receipt" → `/accounting/voucher/receipt`
- "New Contra" → `/accounting/voucher/contra`
- "New Journal" → `/accounting/voucher/journal`

---

## 4. Migration Notes

### DEPOSIT → RECEIPT Migration

Existing vouchers with `voucherType: 'DEPOSIT'` in the database should be treated as RECEIPT type. The backend plan handles the data migration. On the frontend:

```typescript
// Added: Backwards compatibility for DEPOSIT type from existing data
// Backend migration will convert DEPOSIT → RECEIPT, but handle gracefully if not yet migrated
const normalizeVoucherType = (type: string): VoucherType => {
  if (type === 'DEPOSIT') return 'RECEIPT';
  return type as VoucherType;
};
```

Apply this normalization when reading voucher data from the API (in list pages and detail pages).

### Backward Compatibility Period

During the transition (before backend migration runs):
1. Frontend sends new type names (PAYMENT, RECEIPT, CONTRA, JOURNAL)
2. Backend must accept all new type names
3. Frontend must handle old DEPOSIT type in read responses

---

## 5. Testing Requirements

### Unit Tests
- Schema validation for each voucher type
- Account filtering logic per type
- Journal entry preview for each type
- `normalizeVoucherType` mapping

### E2E Tests (Playwright)
- Create a PAYMENT voucher with expense + bank account
- Create a RECEIPT voucher with bank + income account
- Create a CONTRA voucher with two different bank accounts
- Create a JOURNAL voucher with any two accounts
- Verify journal entry preview shows correct debit/credit
- Verify CONTRA hides beneficiary section
- Verify type filter chips on list page
- Verify URL routing for all 4 types

---

## 6. Acceptance Criteria

- [ ] DEPOSIT type removed from all UI (replaced by RECEIPT + CONTRA)
- [ ] 4 voucher type tabs: PAYMENT, RECEIPT, CONTRA, JOURNAL
- [ ] Account dropdowns filter correctly per type
- [ ] CONTRA requires both sides to be ASSET accounts
- [ ] JOURNAL allows any account combination
- [ ] Journal entry preview renders correct debit/credit for all types
- [ ] Beneficiary section hidden for CONTRA, optional for JOURNAL
- [ ] Existing DEPOSIT vouchers display as RECEIPT
- [ ] Type filter on list page includes all 4 types
- [ ] Routes work for `/accounting/voucher/{payment|receipt|contra|journal}`
- [ ] All E2E tests pass
