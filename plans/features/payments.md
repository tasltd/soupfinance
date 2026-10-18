# Feature: Payments

**TASCIM module:** Payments (`77ac3962-2050-446d-b391-a1f888f4d320`)
**Reviewed:** 2026-10-06 against `main` @ 083a461

## 1. Overview

Users record money received against an invoice (`InvoicePayment`) or paid against a bill (`BillPayment`), and view both in a tabbed list. A payment carries:
- the amount (validated against `amountDue`)
- a `PaymentMethod` domain FK (via `usePaymentMethods`)
- a pay-in account (invoices) or pay-out account (bills), taken from the bank/cash ledger accounts
- a reference and a date

| Route | Component |
|-------|-----------|
| `/payments` | `src/features/payments/PaymentListPage.tsx` (Incoming / Outgoing tabs) |
| `/payments/new?invoiceId=…` / `?billId=…` | `src/features/payments/PaymentFormPage.tsx` |
| `/invoices/:id` | "Record payment" and payment history in `InvoiceDetailPage.tsx` |

**API**
- `src/api/endpoints/invoices.ts`: `listAllInvoicePayments`, `listInvoicePayments`, `recordInvoicePayment`, `deleteInvoicePayment` (`/rest/invoicePayment/*`, CSRF from `create.json`).
- `src/api/endpoints/bills.ts`: the BillPayment equivalents.

**Hooks:** `usePaymentMethods` (`/rest/paymentMethod/index.json`), `useLedgerAccounts`.

**Tests**
- Unit: `src/features/payments/__tests__/PaymentListPage.test.tsx`, `PaymentFormPage.test.tsx`.
- Mock E2E: `e2e/payments.spec.ts`.
- LXC integration: `e2e/integration/05-payments.integration.spec.ts`.

## 2. Current status

**Works on main**
- When the Finance module is disabled (403), the list and form show a "Finance module not available" fallback instead of empty dropdowns (SOUPFIN-8, f03e229).
- Amount is validated against the balance due, and invoice/bill preselect works through query params.
- PaymentMethod is treated as a domain FK.
- A pay-in or pay-out account is selected from bank/cash ledger accounts.

**Broken, risky or missing**
- The form posts dotted keys (`'paymentMethod.id'`, `'payInAccount.id'`, `PaymentFormPage.tsx:172-191`) instead of nested FK objects. No test proves they persist (SOUPFIN-176).
- The list is capped at 50 rows per tab, with no filters, no detail view and no void/delete. `deleteInvoicePayment` is unused (SOUPFIN-177).
- The method badge maps hard-coded enum codes against free-text domain names (SOUPFIN-177).
- One payment can only settle one invoice or bill; there is no allocation screen (SOUPFIN-178, with plans already written).
- No receipt/proof upload, though `BillPayment.paymentReceipt` exists (SOUPFIN-179).
- The pages use the legacy `utils/apiErrors` heuristic and need both tabs to 403 before showing module-disabled. They are not translated (SOUPFIN-180).
- The backend gives no structured module-disabled signal and has no enabled-modules endpoint (SOUPFIN-181). Tenant enablement itself → SOUPFIN-15 #4 / SOUPFIN-144.

## 3. Task review

| ID | Title | State | Evidence / notes |
|----|-------|-------|------------------|
| SOUPFIN-8 | Payments module disabled (403) | Done (unchanged) | f03e229 / 3a0c4e9; module-disabled fallback + tests. Backend → 15 #4 / 144, 181 |

**New tasks**
- SOUPFIN-176: nested FK payload + persistence proof (Todo, bug)
- SOUPFIN-177: list pagination, filters, detail, void
- SOUPFIN-178: multi-invoice / multi-bill allocation (backend-required)
- SOUPFIN-179: receipt upload
- SOUPFIN-180: i18n + ApiErrorState / ModuleDisabledBanner
- SOUPFIN-181: backend structured MODULE_DISABLED 403 + modules endpoint (backend-required)

Related, owned elsewhere:
- SOUPFIN-15 #4 / SOUPFIN-144: Finance/Ledger module enablement for the tenant.
- Invoices & Clients: invoice detail "Record payment" and SOUPFIN-170 (invoice save blocker).

## 4. Remaining work plan

1. **Correctness first** (closes 176). Switch the payload to nested FK objects. Assert the exact body in unit tests, and read each payment back on LXC (method + account) with screenshots.
2. **Usable list** (closes 177). Add server pagination, date and method filters, a payment detail view, and void with confirmation. Voiding invalidates the parent invoice/bill queries so `amountDue` and status refresh.
3. **Error states and i18n** (closes 180). Move to `api/errors` + `ApiErrorState` per tab and `ModuleDisabledBanner` on the form, and translate everything in 4 locales.
4. **Backend signal** (closes 181). Write the backend plan from `plans/soupfinance-payments-finance-module-enable.md` §2-3, execute it in soupmarkets-web, then make `parseApiError` read the structured body first.
5. **Receipt upload** (closes 179). Base64 upload in the JSON body, with display on the detail view.
6. **Allocation** (closes 178). Execute `plans/soupmarkets-multi-invoice-payment.md` (backend) and then `plans/soupfinance-multi-invoice-payment.md` (frontend): FIFO auto-allocation, manual override, unapplied amount.

## 5. Backend dependencies

- `plans/soupfinance-payments-finance-module-enable.md`: tenant Finance enablement (SOUPFIN-15 #4, SOUPFIN-144), structured 403 and modules endpoint (SOUPFIN-181).
- `plans/soupfinance-finance-module-tenant-enablement.md`: tenant module enablement detail.
- `plans/soupmarkets-multi-invoice-payment.md` (backend first) and `plans/soupfinance-multi-invoice-payment.md` (frontend): SOUPFIN-178.
- FK binding: if `show.json` shows the method or account dropped after SOUPFIN-176, write a backend plan before changing anything else.

## 6. Related QBO-parity tasks (user-facing extensions)

- SOUPFIN-124: bill due dates, reminders and payment scheduling.
- SOUPFIN-126: cheque printing.
- SOUPFIN-125: multi-currency payments / FX.
- SOUPFIN-128: credit notes and vendor credits, applied against payments.
- SOUPFIN-131: bank feeds and matching of received payments.
- SOUPFIN-123: contractor payments and withholding.
- SOUPFIN-137: automated payment reminders.
- SOUPFIN-139: payment approval workflow.

## 7. Definition of done

- With the Finance module enabled, a user records full and partial payments for invoices and bills. Method, account and reference persist (proven by an LXC read-back), and the invoice/bill `amountDue` and status update.
- A payment can be viewed and voided, and the parent balance is restored.
- The list paginates and filters, and method badges reflect real PaymentMethod records.
- One receipt can be allocated across several invoices (or one payment across several bills), producing balanced ledger postings.
- When the module is disabled the user sees a clear, translated explanation driven by a structured backend signal.
- SOUPFIN-176 to 181 are Done. Unit tests, mock E2E (`e2e/payments.spec.ts`) and `05-payments.integration.spec.ts` pass, with screenshots.
