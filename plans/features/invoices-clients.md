# Feature: Invoices & Clients

**TASCIM module:** Invoices & Clients (`2ceb18d6-457e-4212-b79e-5e5488a23dae`)
**Reviewed:** 2026-10-06 against `main` @ 083a461

## 1. Overview

Clients are KYC `Client` entities. Invoices are raised against the client's `AccountServices` (FK `accountServices.id`, resolved via `client.portfolioList[0]` → `GET /rest/clientPortfolio/show/{id}.json`). Users create, edit, send (frontend PDF + email), cancel and delete invoices, and record payments from the invoice detail page.

| Route | Component |
|-------|-----------|
| `/invoices`, `/invoices/new`, `/invoices/:id`, `/invoices/:id/edit` | `src/features/invoices/InvoiceListPage.tsx`, `InvoiceFormPage.tsx`, `InvoiceDetailPage.tsx` |
| `/clients`, `/clients/new`, `/clients/:id`, `/clients/:id/edit` | `src/features/clients/ClientListPage.tsx`, `ClientFormPage.tsx`, `ClientDetailPage.tsx`, `getClientDisplayName.ts` |

**API modules**
- `src/api/endpoints/invoices.ts`: invoice and invoiceItem CRUD, send, cancel, invoicePayment, and `computeInvoiceTotals`.
- `clients.ts`: client CRUD, `createAccountServicesForClient`, `resolveAccountServicesId`.
- `taxEntryJoins.ts`: resolves TaxEntry join rows.
- `domainData.ts`: tax catalogue from `/rest/taxEntry/index.json`, hardcoded payment terms, service descriptions.
- `email.ts`: sends invoice email.

**Hooks and PDF:** `usePdf`, `useEmailSend`; `src/utils/pdf/templates.ts` (`generateInvoiceHtml`).

**Tests**
- Unit: `src/features/{invoices,clients}/__tests__/*`; `src/api/endpoints/__tests__/{invoices,invoice-tax,clients,taxEntryJoins,domainData}.test.ts`.
- Mock E2E: `e2e/invoices.spec.ts`, `invoice-account-services.spec.ts`, `soupfin-37-invoice-tax.spec.ts`, `soupfin-44-line-item-tax-rate.spec.ts`, `soup-1836-clients.spec.ts`, `soupfin-16-v2-fixes.spec.ts`, `soupfin-21-frontend-bugs.spec.ts`.
- LXC integration: `e2e/integration/03-invoices.integration.spec.ts`, `invoices.integration.spec.ts`, `invoice-tax.integration.spec.ts`.

## 2. Current status

**Works on main**
- Quick-add client creates AccountServices (SOUPFIN-1, 28).
- The invoice client dropdown is keyed by client, and the FK is resolved via the portfolio detail call (SOUPFIN-27).
- `?clientId` preselects the client.
- Line-item tax persists through `/rest/invoiceItem/save.json` `taxEntries`, and totals are correct (SOUPFIN-37).
- Client search (`q`), type filter with feedback, and corporate/individual name fields (SOUPFIN-16, SOUP-1836).
- Delete errors are surfaced, and the delete dialog shows the name (SOUPFIN-21, SOUP-1929).
- Send, cancel and delete actions; payment history on the detail page.

**Broken or missing**
- The invoice edit form previews 0 tax for a taxed line (`InvoiceFormPage.tsx:198`). Fixed on an unmerged branch (SOUPFIN-46).
- The invoice PDF prints `-` per line in the Tax column (`templates.ts:350`). Fixed on an unmerged branch (SOUPFIN-92).
- The detail page has no line Tax column (SOUPFIN-95).
- Discount cannot be saved because the backend has no field (SOUPFIN-39). Editing tax on a saved line stores 0 because of a backend bug (SOUPFIN-40).
- `invoice/create.json` takes ~23s (SOUPFIN-41). Saves can 422 on the number unique constraint (SOUP-2619 → SOUPFIN-170).
- The list is capped at 20 invoices / 50 clients, with no pagination, invoice search, filters or archive view (SOUPFIN-165).
- No `ApiErrorState` usage; the retry button does `window.location.reload()` (SOUPFIN-166).
- Pages are effectively un-translated (SOUPFIN-167).
- A single tax per line, while the backend supports several (SOUPFIN-168).
- Client delete persistence is unverified on a real backend (SOUPFIN-169).
- Backend client list omits names and ignores `clientType` (SOUPFIN-15 #2/#3; the frontend works around it).

## 3. Task review

| ID | Title | State | Evidence / notes |
|----|-------|-------|------------------|
| SOUPFIN-1 | Quick Add Client → AccountServices | Done (unchanged) | a586c89 / 8f5307b; clients.test.ts |
| SOUPFIN-7 | Clients persistence/filter/search | Done (unchanged) | Frontend fixed (SOUPFIN-16, SOUP-1836/1929); backend → 15; item 1 → new 169 |
| SOUPFIN-14 | V1 umbrella | Done (unchanged) | All items fixed or mapped (15, 11, 144); comment posted |
| SOUPFIN-16 | V2 umbrella | Done (unchanged) | 5c4da7b / c3fa3f1, f1dea49; reports → 11; flaky E2E → 17 |
| SOUPFIN-18 | V3 umbrella | Done (unchanged) | 77db9e9, 92e4241, f1dea49; reports → 11 |
| SOUPFIN-19 | V8 umbrella | Done (unchanged) | 93a7bfb / fed2a90, a2d4abf, SOUPFIN-9 export |
| SOUPFIN-21 | V10 delete name / settings form | Done (unchanged) | 92e4241, 1b9ac53, 2eb47d6 |
| SOUPFIN-27 | Invoice FK + dropdown + ?clientId | Done (unchanged) | 4d35e6f, 53984c4 → 32810d7 |
| SOUPFIN-28 | createClient discards AS id | Done (unchanged) | df04b68 → 1779b28 |
| SOUPFIN-37 | V21 invoice tax/discount umbrella | In Review → **Done** | 9d1ba43 / 1b44c92 (PR #27); invoice-tax tests; discount → 39, edit preview → 46 |
| SOUPFIN-39 | Backend: no discount field | In Review → **Backlog** | Backend not started; plan §4 of soupfin-37 plan |
| SOUPFIN-40 | Backend: invoiceItem update stale tax | In Review → **Backlog** | Backend fix outstanding; frontend workaround on main |
| SOUPFIN-41 | invoice/create.json 23s | In Review → **Backlog** | Backend; verified together with SOUPFIN-170 |
| SOUPFIN-44 | Tax Rate 0% when entry unresolved | In Review → **Done** | e070579 → 665d48a; taxEntryJoins.test.ts, soupfin-44 spec |
| SOUPFIN-46 | Edit form previews 0 tax | Backlog → **In Review** | Unmerged branch `…soupfin-46-issue-invoice` (dbc6e4d) with tests |
| SOUPFIN-92 | PDF tax column dash | In Review (unchanged) | Unmerged branch `…soupfin-92-issue-invoice` (e32a2cc) |
| SOUPFIN-95 | Detail page has no Tax column | Backlog (unchanged) | Needs `computeInvoiceItemTax` from 92 |
| SOUPFIN-38 | Bill tax (reference only) | owned by Bills & Vendors | Same root cause as 37 |

**New tasks:** SOUPFIN-165 (lists: pagination, search, filters, archive), 166 (ApiErrorState), 167 (i18n), 168 (multi-tax per line), 169 (verify client delete), 170 (verify SOUP-2619 number fix).

## 4. Remaining work plan

1. **Merge the reviewed branches** (closes 46, 92, then 95). Merge the 46 and 92 branches after a rebase onto main, then implement the line Tax column on the detail page with the merged helper.
2. **Unblock saving on production** (closes 170, then 41). Confirm SOUP-2619 is deployed, run the LXC invoice specs, and re-measure create.json latency.
3. **Error handling** (closes 166). Use ApiErrorState and ModuleDisabledBanner on all six pages, with 403/500 unit tests.
4. **Lists** (closes 165, plus SOUPFIN-7 item 11). Add pagination, invoice search, status and date filters, and the archived toggle.
5. **Client delete verification** (closes 169). Add an LXC spec, and write a backend plan if it fails.
6. **Backend tax and discount** (closes 40, 39, then 168). Execute `plans/soupfin-37-invoice-tax-and-discount-backend.md` in soupmarkets-web. Then build multi-select taxes per line, and restore the discount input once the field exists.
7. **i18n** (closes 167). Add the invoices and clients namespaces in all 4 locales, with a key-parity test.

## 5. Backend dependencies

- `plans/soupfin-37-invoice-tax-and-discount-backend.md` (and its twin `soupfinance-invoice-tax-and-discount-backend.md`): taxEntries binding, totals in JSON, discount. Tasks: SOUPFIN-39, 40.
- `plans/soup-2619-invoice-bill-save-blocker.md`: number sequencer and empty bill CSRF. Tasks: SOUPFIN-170, 41.
- `plans/soupfinance-soupfin-14-backend-issues.md` (on the SOUPFIN-14 branch): client names, `clientType` filter. Task: SOUPFIN-15.
- Client soft-delete / index archived filter, if SOUPFIN-169 fails. Plan to be written.

## 6. Related QBO-parity tasks (user-facing extensions)

- SOUPFIN-112: estimates / quotes → invoice.
- SOUPFIN-114: recurring invoices.
- SOUPFIN-115: sales rep tracking.
- SOUPFIN-117: progress invoicing.
- SOUPFIN-118: custom invoice layouts.
- SOUPFIN-119: batch invoicing.
- SOUPFIN-120: revenue recognition.
- SOUPFIN-125: multi-currency.
- SOUPFIN-128: credit notes.
- SOUPFIN-111: custom fields on clients.
- SOUPFIN-139: approval workflow.
- SOUPFIN-137: payment reminders.

## 7. Definition of done

- On app.soupfinance.com a user can create, edit, send, cancel and delete an invoice with taxed lines. Preview, saved totals, detail page, line Tax column and PDF all agree. Five consecutive saves succeed with no 422 or timeout.
- Invoice and client lists paginate, search, filter and show archived records. A deleted client leaves the active list.
- Every page distinguishes module-disabled, error, empty and no-match states. No `window.location.reload()` retries.
- All strings are translated in en, de, fr and nl.
- SOUPFIN-46, 92, 95, 165-170 are Done. Backend-required items (39, 40, 41, 15) are Done or explicitly deferred with a plan.
- `npm run test:run` and the mock E2E pass, and the invoice/client LXC integration specs pass, with screenshots.
