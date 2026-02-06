# Grails Domain Structure is Source of Truth (HARD RULE)

## Core Principle

**ALL frontend TypeScript types, API endpoints, and data models MUST mirror the Grails domain classes exactly.**

Do NOT invent frontend-specific types or abstractions that don't exist in the backend. The Grails domain structure is the single source of truth.

---

## Rules

### 1. TypeScript Types Match Grails Domains

| Grails Domain | Frontend Type | Notes |
|---------------|---------------|-------|
| `soupbroker.kyc.AccountServices` | `AccountServices` | Invoice recipient / "client" |
| `soupbroker.finance.Invoice` | `Invoice` | Uses `accountServices` FK |
| `soupbroker.finance.InvoiceItem` | `InvoiceItem` | Line items |
| `soupbroker.finance.Vendor` | `Vendor` | Expense vendor |
| `soupbroker.finance.LedgerAccount` | `LedgerAccount` | Chart of accounts |
| `soupbroker.finance.LedgerTransaction` | `LedgerTransaction` | Journal entries |
| `soupbroker.finance.Voucher` | `Voucher` | Payment/receipt |

### 2. No Invented Frontend Types

- Do NOT create `BrokerClient` - use the actual domain (`AccountServices` or `Client`)
- Do NOT rename fields - use backend field names (`invoiceDate`, not `issueDate`)
- Do NOT add fields that don't exist on the backend domain
- Mark computed/UI-only fields clearly with comments

### 3. FK References Match Backend

```typescript
// CORRECT - matches Grails domain FK
accountServices: { id: string; serialised?: string; class?: string };

// WRONG - invented frontend abstraction
client: { id: string; name?: string };
```

### 4. Field Names Match Backend

```typescript
// CORRECT - matches Grails domain fields
number: number;        // Invoice.number
invoiceDate: string;   // Invoice.invoiceDate
paymentDate: string;   // Invoice.paymentDate
invoiceItemList: [];   // Invoice.invoiceItemList

// WRONG - frontend-invented names
invoiceNumber: string;
issueDate: string;
dueDate: string;
items: [];
```

---

## Verification

When adding or updating types:
1. Check the actual Grails domain class in `soupmarkets-web/grails-app/domain/`
2. Use `/rest/{controller}/show/{id}.json` to verify field names
3. Match field types exactly (number vs string, optional vs required)
4. Include `serialised` and `class` fields on FK references (Grails adds these)

---

## License Category

The SoupFinance tenant uses a **SERVICES-based license category** (not TRADING/brokerage). This affects:
- Available modules and features
- Domain class availability
- API endpoint behavior
