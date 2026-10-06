# SoupFinance Master Plan

**Date**: 2026-10-06
**Pricing**: SoupFinance is **free until the end of 2027**. There are no pricing tiers, seat limits, feature gating or upgrade prompts anywhere in the plan.
**TASCIM**: project `SOUPFIN`. Every task now belongs to a feature module, a QBO module or the COA module.

This file is the index. Each feature has its own plan, with a task review table, remaining work, backend dependencies and a definition of done.

## Plans

| Area | Plan | TASCIM module |
|------|------|---------------|
| Auth & Registration | [features/auth-registration.md](features/auth-registration.md) | Auth & Registration |
| Onboarding & KYC | [features/onboarding-kyc.md](features/onboarding-kyc.md) | Onboarding & KYC |
| Settings, Users & Tenant Currency | [features/settings-users.md](features/settings-users.md) | Settings, Users & Tenant Currency |
| Invoices & Clients | [features/invoices-clients.md](features/invoices-clients.md) | Invoices & Clients |
| Payments | [features/payments.md](features/payments.md) | Payments |
| Bills & Vendors | [features/bills-vendors.md](features/bills-vendors.md) | Bills & Vendors |
| Ledger & Accounting | [features/ledger-accounting.md](features/ledger-accounting.md) | Ledger & Accounting |
| Reports | [features/reports.md](features/reports.md) | Reports |
| Dashboard, Layout, Mobile & A11y | [features/dashboard-layout.md](features/dashboard-layout.md) | Dashboard, Layout, Mobile & A11y |
| Help & Documentation | [features/help-docs.md](features/help-docs.md) | Help & Documentation |
| Landing Site | [features/landing.md](features/landing.md) | Landing Site |
| Testing, QA & Deployment | [features/testing-deployment.md](features/testing-deployment.md) | Testing, QA & Deployment |
| Empty Chart of Accounts | [coa-template-seeding.md](coa-template-seeding.md) | COA Templates & Tenant Seeding (epic SOUPFIN-142) |
| QuickBooks-class features | [qbo-feature-parity-roadmap.md](qbo-feature-parity-roadmap.md) | 9 QBO modules (epic SOUPFIN-98) |

## What the review found (2026-10-06)

1. **Many finished fixes are not merged.** Their branches exist, but `main` does not have the fix. The tasks are now In Review and named in each plan.

   | Area | Tasks |
   |------|-------|
   | Reports | 59, 60, 67, 72, 73 |
   | Invoices | 46, 92 |
   | Auth/Settings | 49, 53, 85 |
   | Onboarding | 89 |
   | Landing/layout | 93, 94 |

   The most urgent is **SOUPFIN-60: Excel export returns 500 in production.**
2. **Ledger, Accounting, Voucher and PaymentMethod return 403 for SERVICES tenants** (SOUPFIN-144). The ledger pages, the journal and voucher forms, and the payment-method dropdowns cannot work in production until this is fixed.
3. **Every new tenant starts with an empty Chart of Accounts.** Registration seeds no COA, so invoice and bill posting has no A/R, A/P or tax accounts (epic SOUPFIN-142).
4. **Ledger UX gaps.**
   - Transaction Register view and edit links go to routes that don't exist (SOUPFIN-154).
   - "Save & Post" saves a draft (SOUPFIN-155).
   - Vouchers can only be created (SOUPFIN-156).
5. **Lists are capped and have no paging.**

   | List | Cap | Task |
   |------|-----|------|
   | Bills | 20 | SOUPFIN-171 |
   | Register | 500 | SOUPFIN-163 |
   | Invoices and clients | — | SOUPFIN-165 |
   | Payments | — | SOUPFIN-177 |

6. **i18n is missing in most modules.** The translation files exist but pages hardcode English (164, 167, 180, 183, 185, 194, 195, 198, 202, 212).
7. **The landing site sells plans and trials** (Starter, Professional, Enterprise). Change it to "free until end of 2027" (SOUPFIN-215). Fix the landing deploy script first (SOUPFIN-214).
8. **Product decision needed: Vendors for SERVICES tenants** (SOUPFIN-173). Vendors are hidden from the menu for these tenants, but every bill needs a vendor.

## Overall order

### Stage 0: Stabilise what exists (now)

- Review, rebase and merge the unmerged fix branches listed above, starting with **SOUPFIN-60**.
- Then deploy the frontend and verify in production. This closes most In Review tasks.
- Fix the landing deploy script (SOUPFIN-214), then ship the free-until-2027 copy (SOUPFIN-215, 89).

### Stage 1: Unblock the books (backend plans first; the work happens in soupmarkets-web)

- **SOUPFIN-144**: Ledger, Accounting, Voucher and PaymentMethod modules enabled for SERVICES tenants.
- **COA epic SOUPFIN-142**:
  - templates 143;
  - seeding at registration 144/145;
  - `applyTemplate` 146;
  - backfill 147.
- **Other backend gaps**:
  - Bills: CSRF and tax on save (174).
  - KYC CSRF (196).
  - `tenant_id` set at registration (187).
  - Forgot/reset password (186).
  - Report schedules return 403 (191).
  - Cash flow endpoint (190).
  - A structured "module disabled" 403 (181).

### Stage 2: Finish every existing feature (frontend)

Work through each feature plan's remaining-work section. The main items:

| Area | Work | Tasks |
|------|------|-------|
| COA UI | Empty-state CTA, template picker, grouping fallback, account CRUD | 148–152 |
| Ledger | Routing, post/reverse, voucher lifecycle, paging/export | 154–156, 163 |
| Lists | Paging, search and filters | 165, 171, 177 |
| Errors | Error states with the `ApiErrorState` / `ModuleDisabledBanner` pattern | 160, 166, 192 |
| Payments | Nested FK payload | 176 |
| Dashboard | Real KPIs, charts, welcome checklist | 197, 199, 201 |
| Top bar | Notifications, search, profile menu | 203–205 |
| Translation | i18n in all four languages across every module | — |
| Tests | Unit tests for the untested pages, LXC integration specs per module, axe a11y checks | 161, 175, 189, 207 |

### Stage 3: QuickBooks-class features, by user value

See the [roadmap](qbo-feature-parity-roadmap.md).

1. **Phase 1, Everyday bookkeeping**:
   - Bank feeds and reconciliation.
   - Estimates.
   - Recurring invoices.
   - Credit notes and vendor credits.
   - Core reports and aging.
   - CSV import/export.
   - Receipt capture.
   - Bill tracking.
   - Multi-currency.
   - Accountant access.
2. **Phase 2, Growing the business**:
   - Time tracking.
   - Projects.
   - Class/location.
   - Purchase orders.
   - Progress invoicing.
   - Invoice layouts.
   - Budgets.
   - Withholding tax.
   - AI assistant.
   - Collaboration.
   - Mileage and cheques.
3. **Phase 3, Scale & control**:
   - Inventory.
   - Custom roles.
   - Approvals.
   - Custom fields.
   - Batch entry.
   - Fixed assets.
   - Revenue recognition.
   - Advanced reports.
   - Backup and restore.

## Conventions for every task

- **Backend work** follows `.claude/rules/backend-changes-workflow.md`. Write the plan in `plans/` first. Never edit soupmarkets-web from this repo.
- **Types** mirror the Grails domains (`.claude/rules/grails-domain-source-of-truth.md`).
- **Requests** use JSON, with a CSRF token on POST.
- **Errors** are never swallowed: no `.catch(() => null)`.
- **UI quality**: every change ships with dark mode, i18n for en/de/fr/nl, unit tests, and a per-issue E2E regression spec for bug fixes.
- **Task states are evidence-based.**
  - **Done** means the fix is on `main` with tests.
  - **In Review** means one of two things:
    - the fix is on an unmerged branch, or
    - the fix is merged but not yet verified in production.
