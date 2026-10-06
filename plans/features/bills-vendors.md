# Feature Plan: Bills & Vendors

**TASCIM module:** Bills & Vendors (`745d19d4-d159-4408-ab8b-a9320f89ee7f`)
**Reviewed:** 2026-10-06, against `main` @ 083a461
**Scope:** accounts payable. This covers recording vendor bills with line-item tax, tracking bill payments, managing vendors, and the bill PDF and email.

---

## 1. Overview

| Layer | Path |
|-------|------|
| Routes | `/bills`, `/bills/new`, `/bills/:id`, `/bills/:id/edit`, `/vendors`, `/vendors/new`, `/vendors/:id`, `/vendors/:id/edit` (`soupfinance-web/src/App.tsx:272-281`) |
| Bill pages | `src/features/bills/BillListPage.tsx`, `BillFormPage.tsx`, `BillDetailPage.tsx` |
| Vendor pages | `src/features/vendors/VendorListPage.tsx`, `VendorFormPage.tsx`, `VendorDetailPage.tsx` |
| API | `src/api/endpoints/bills.ts` covers `/rest/bill/*`, `/rest/billItem/*` and `/rest/billPayment/*`. It also contains `transformBill`, `extractVendorName` and `resolveBillItemTaxRate`. |
| API | `src/api/endpoints/vendors.ts` covers `/rest/trading/vendor/*`, including `paymentSummary`. |
| API | `src/api/endpoints/taxEntryJoins.ts` parses the TaxEntry join rows. It is shape-aware: bill rows have one trailing amount, invoice rows have two. |
| PDF / email | `src/utils/pdf/templates.ts` (`generateBillHtml`), `src/utils/pdf/index.ts`, `src/hooks/usePdf.ts`, `src/hooks/useEmailSend.ts` |
| Nav gating | `src/components/layout/SideNav.tsx:28` hides Vendors for SERVICES tenants (`hideForCategories`) |
| Bill payments | Recorded from `src/features/payments/PaymentFormPage.tsx` (`recordBillPayment`) and listed on the bill detail page |
| Unit tests | `src/features/bills/__tests__/*` (3 files), `src/features/vendors/__tests__/*` (List and Detail only), `src/api/endpoints/__tests__/bills.test.ts`, `taxEntryJoins.test.ts`, `src/api/__tests__/integration/vendors.integration.test.ts`, `src/components/layout/__tests__/SideNav.test.tsx` |
| E2E (mock) | `e2e/bills.spec.ts`, `vendors.spec.ts`, `soupfin-25-vendors-fixes.spec.ts`, `soupfin-30-frontend-fixes.spec.ts` (#15), `soupfin-43-bill-detail-totals.spec.ts`, `soupfin-44-line-item-tax-rate.spec.ts` |
| E2E (LXC) | None for bills yet (SOUPFIN-175) |

## 2. Current status

**What works on main.** On 2026-10-06, 234/234 unit tests passed across the bills, vendors, SideNav and pdf files.

- Bill create and edit send `billItemList[n].taxEntries` as TaxEntry ids (5b1b7cc). Production persists the tax: the SOUPFIN-43 repro returned `totalTaxAmount 225`.
- The bill detail page reads its totals from the header fields `subTotal`, `totalTaxAmount` and `total` (86d4e7b). The line tax rate comes from the join rows, and an unknown entry shows an em dash (e070579).
- The vendor name is resolved from `serialised`. Dates are formatted. The edit form is prefilled. The "+" add-vendor button is on the bill form (SOUPFIN-30).
- Vendor calls use the `/rest/trading/vendor` prefix, and module-prefixed CSRF works (5a47460).

**What is broken or missing:**
- The bill PDF prints `0%` tax on every line (`templates.ts:474`). Tracked as SOUPFIN-47.
- Bills and vendors pages show generic error states and the raw "status code 403" text. There is no `ApiErrorState` or `ModuleDisabledBanner`. Tracked as SOUPFIN-160.
- The Vendors nav is hidden for SERVICES tenants, but SoupFinance is a SERVICES tenant and bills require a vendor. Tracked as SOUPFIN-173.
- The bill list is capped at 20 rows, with no pagination, search, filters or overdue view. Tracked as SOUPFIN-171.
- The vendor detail page has no bill history, and `getVendorPaymentSummary` is never called. Tracked as SOUPFIN-172.
- Bills are always saved as DRAFT. There are no submit or void actions, and the form sends `subtotal`/`taxAmount`/`totalAmount`, which are not Bill columns. Tracked as SOUPFIN-184.
- The vendor form is missing the `ledgerAccount`, `vendorType`, `symbol`, `postalAddress` and archived fields, and has no unit test. Tracked as SOUPFIN-182.
- There is no i18n: the `bills` and `vendors` namespaces exist but nothing uses them. Tracked as SOUPFIN-183.
- Backend: `bill/create.json` returns no CSRF token. `BillItemController.save()` stores 0 tax. The bill update path is unverified. Tracked as SOUPFIN-174.
- The voucher form's vendor field is free text posted as `vendorId`. This is in the Ledger & Accounting module, tracked as SOUPFIN-162.

## 3. Task review

| ID | Title | State | Evidence / notes |
|----|-------|-------|------------------|
| SOUPFIN-4 | Bills & Vendors inaccessible, modules not enabled | Done → **In Review** | No SOUPFIN-4 commit on main. Backend items are resolved in production (SOUPFIN-43 repro). UX items #5, #6 and #8 moved to child SOUPFIN-160. |
| SOUPFIN-6 | Vendors blocked, Trading module | Done → **In Review** | Vendor URL fixed by 5a47460. UX items #3-#5 (generic error, raw 403 text) mapped to SOUPFIN-160. |
| SOUPFIN-25 | Vendor module prefix + SERVICES nav | In Review → **Done** | 5a47460 is on main. `vendors.ts:16`, `SideNav.tsx:28`, `SideNav.test.tsx`, and the soupfin-25 e2e spec. Follow-up is SOUPFIN-173. |
| SOUPFIN-30 | V19 umbrella (17 items) | In Review (unchanged) | Bill items #1, #2, #3, #15 (bill form) and #17 are fixed. Other areas are fixed in b18be01, f333134 and a584578, with follow-ups in SOUPFIN-33. The open #15 remainder (voucher) is child SOUPFIN-162 in Ledger & Accounting. Manual UAT is still pending. |
| SOUPFIN-38 | Bill save discards line tax | In Review → **Done** | 5b1b7cc. BillFormPage tests ("sends the TaxEntry id as taxEntries…"). Production persists the tax. |
| SOUPFIN-42 | V22 umbrella (invoice discount) | Backlog → **In Review** | The tax half is fixed (a22a24a). The discount half is SOUPFIN-39, which is backend-blocked. Moved to the Invoices & Clients module. |
| SOUPFIN-43 | Bill detail summary all zeros | In Review → **Done** | 86d4e7b and ed4a5bd. The soupfin-43 e2e spec. Verified in production. |
| SOUPFIN-47 | Bill PDF prints Tax 0% | Backlog → **Todo** | Still present at `templates.ts:474`. Unblocked now that `resolveBillItemTaxRate` is on main. |
| SOUPFIN-48 | bills.spec E2E failures | (owned by Testing) | Referenced only. |

**New tasks (2026-10-06):**

| ID | Title | State |
|----|-------|-------|
| SOUPFIN-160 | Module-aware error states for Bills & Vendors (child of SOUPFIN-4) | Todo |
| SOUPFIN-162 | Voucher form: vendor/client/staff free text sent as FK ids (child of SOUPFIN-30, Ledger & Accounting) | Todo |
| SOUPFIN-171 | Bills list: pagination, search, filters, overdue | Todo |
| SOUPFIN-172 | Vendor detail: bill history + AP payment summary | Todo |
| SOUPFIN-173 | Decide vendor access for SERVICES tenants | Todo |
| SOUPFIN-174 | Backend: bill CSRF token, BillItem tax refresh, update path (backend-required) | Backlog |
| SOUPFIN-175 | Bills LXC integration spec | Todo |
| SOUPFIN-182 | Vendor form: missing domain fields + unit tests | Backlog |
| SOUPFIN-183 | i18n for Bills and Vendors | Backlog |
| SOUPFIN-184 | Bill status lifecycle (draft/submit/void) | Backlog |

## 4. Remaining work plan

**Phase 1: correctness on customer-facing output**
1. Pass the tax catalogue through `usePdf`/`useEmailSend` into `generateBillHtml`. Resolve each rate from the join rows and render an em dash for unknown entries. Fix the invoice template's literal `-` the same way. Closes SOUPFIN-47.
2. Decide on and implement vendor access for SERVICES tenants. Update the SideNav tests and the soupfin-25 spec. Closes SOUPFIN-173.
3. Replace the voucher's free-text vendor, client and staff fields with real selects plus an add button. Closes SOUPFIN-162, then SOUPFIN-30 after UAT.

**Phase 2: error handling.** Use `ApiErrorState` on the list and detail pages and `ModuleDisabledBanner` on the forms. Show `getApiErrorMessage` instead of raw text. Closes SOUPFIN-160, then SOUPFIN-4 and SOUPFIN-6.

**Phase 3: verification.** Write the LXC integration spec: create/edit with tax, remove a line, partial payment, PDF, delete. Closes SOUPFIN-175 and confirms item 3 of SOUPFIN-174. Coordinate with SOUPFIN-48.

**Phase 4: completeness.**
1. Bills list pagination, search, filters and overdue view. Closes SOUPFIN-171.
2. Vendor detail summary, bill history and a "create bill for vendor" action. Closes SOUPFIN-172.
3. Bill lifecycle actions, and stop sending the non-column total fields. Closes SOUPFIN-184.
4. Vendor form domain fields, archived filter, pagination and `VendorFormPage.test.tsx`. Closes SOUPFIN-182.
5. i18n in all 4 languages, including the PDF strings. Closes SOUPFIN-183.

## 5. Backend dependencies

| Need | Plan | Task |
|------|------|------|
| `BillController.create()` emits a CSRF token | `plans/soup-2619-invoice-bill-save-blocker.md` (Finding 2) | SOUPFIN-174 |
| `BillItemController.save()`: add `refresh()` and the withholding guard | `plans/soupfin-37-invoice-tax-and-discount-backend.md`; the SOUPFIN-38 comment | SOUPFIN-174 |
| Bill update keeps line tax (bill version of SOUPFIN-40) | Extend the SOUPFIN-37 plan | SOUPFIN-174 |
| Finance and Trading modules enabled per tenant | `plans/soupfinance-finance-module-tenant-enablement.md`; `plans/soupfin-13-backend-consolidation-directive.md` | Appears resolved in production (SOUPFIN-4/6) |
| Bill/BillItem discount (if bills need it) | `plans/soupfinance-invoice-tax-and-discount-backend.md` | SOUPFIN-39 |
| Vendor `paymentSummary` and status-transition endpoints | Verify on LXC first. Write a plan in `plans/` if they are missing. | SOUPFIN-172, SOUPFIN-184 |

## 6. Related QBO-parity / COA tasks (user-facing extensions)

- SOUPFIN-124: vendor bill tracking (due dates, reminders, payment scheduling). Builds on SOUPFIN-171.
- SOUPFIN-127: purchase orders with conversion to a bill.
- SOUPFIN-128: vendor credits.
- SOUPFIN-129: batch expense entry.
- SOUPFIN-123: contractor payments and withholding tax prep.
- SOUPFIN-126: cheque printing for bill payments.
- SOUPFIN-105: A/P aging and the Unpaid Bills report. SOUPFIN-139: approval workflow. Both build on SOUPFIN-184.
- SOUPFIN-125: multi-currency bills. SOUPFIN-142: COA seeding, needed for the vendor `ledgerAccount` select in SOUPFIN-182.

## 7. Definition of done

- A user can create, edit, view, pay, void and delete a bill.
- The tax entered on a bill matches the tax shown on the detail page, in the PDF and in the email, and the figures are verified on LXC and production.
- Vendors are reachable from the nav for every tenant category that can record bills. A vendor has full CRUD, an archived filter, an AP summary and bill history.
- Every bills and vendors page has loading, empty, error and module-disabled states. No raw HTTP status text reaches the user.
- The bills and vendors lists paginate, and the bills list filters by status, vendor and date, with an overdue view.
- All strings are translated in en, de, fr and nl.
- Unit tests cover every page and endpoint, including `VendorFormPage`. The mock E2E specs and the LXC bills integration spec pass on Firefox.
- SOUPFIN-4, 6, 30, 47, 160, 162, 171-175 and 182-184 are Done. The backend items in SOUPFIN-174 are deployed to production.
