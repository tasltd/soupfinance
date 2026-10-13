# QuickBooks-Class Feature Roadmap (user-facing features, no pricing tiers)

**Date**: 2026-10-06 (revised the same day: pricing tiers removed)
**Status**: PLANNED (tasks in TASCIM project `SOUPFIN`, epic **SOUPFIN-98**; nothing started)
**Source**: QuickBooks Online feature matrix, used only as a checklist of features that help users

## Goal

Give SoupFinance the feature depth of QuickBooks Online: the things that help a small
business run its books day to day.

**SoupFinance is free until the end of 2027.** That means:

- no pricing tiers or plan entitlements;
- no seat limits or accountant-invite limits;
- no Chart of Accounts cap;
- no upgrade prompts.

Every feature ships to every tenant. The QBO tier columns were used only to find features.
They do not decide packaging or order.

Order is decided by **user value**: what a bookkeeper needs every week comes first.

Per [backend-changes-workflow](../.claude/rules/backend-changes-workflow.md), backend
work lives in **soupmarkets-web**. Every task labelled `backend-required` gets its own
backend plan in `plans/` before any frontend work that depends on it starts.

## Cancelled (tier-only work)

| Task | Was | Why cancelled |
|------|-----|---------------|
| SOUPFIN-99 | Plan-tier entitlement framework | No tiers until the end of 2027 |
| SOUPFIN-100 | Seat limits per tier | No limits |
| SOUPFIN-109 | COA account cap (250) and usage meter | No cap; COA templates stay lean (60-90 accounts) for usability |

If paid plans come back after 2027, write a new packaging plan then. Keep features
free of tier checks until that happens.

## What SoupFinance has today (baseline)

| Area | Status |
|------|--------|
| Invoices, Bills, Vendors, Clients, Payments | CRUD in place |
| Chart of Accounts, Ledger Transactions, Journal Entry, Vouchers | In place; blocked by Ledger/Accounting module gating on SERVICES tenants (SOUPFIN-144); the COA starts empty (epic SOUPFIN-142) |
| Reports | P&L, Balance Sheet, Cash Flow, Trial Balance, A/R + A/P aging, Scheduled Reports |
| Settings | Users, Bank Accounts, Account settings, roles from the backend |
| Currency | One tenant currency (`accountStore`) |
| Not built | Estimates, recurring invoices, credit notes, POs, bank feeds, reconciliation, time, projects, inventory, budgets, tags, custom fields, approvals |

## Phases (by user value)

### Phase 1: Everyday bookkeeping (priority: high)

These are the features a small business needs to keep its books right every week.

| Task | Feature | Backend |
|------|---------|:-:|
| SOUPFIN-131 | Bank feeds (statement import, then open banking / MoMo) with matching and rules | ✔ |
| SOUPFIN-132 | Bank reconciliation | ✔ |
| SOUPFIN-112 | Estimates / quotes, converted to invoices | ✔ |
| SOUPFIN-114 | Recurring invoices | ✔ |
| SOUPFIN-128 | Customer credit notes and vendor credits | ✔ |
| SOUPFIN-103 | Report framework (shared shell, filters, export, favourites) | |
| SOUPFIN-104 | Core report pack (GL, journal, sales by customer, expenses by vendor, tax summary, comparatives) | ✔ |
| SOUPFIN-105 | A/R and A/P aging summary and detail, open invoices, unpaid bills | |
| SOUPFIN-140 | CSV/Excel import and export (migration from other software) | |
| SOUPFIN-121 | Receipt capture (upload + OCR into a draft expense) | ✔ |
| SOUPFIN-124 | Bill tracking: due dates, reminders, paying several bills at once | |
| SOUPFIN-125 | Multi-currency invoices and bills, FX gain/loss | ✔ |
| SOUPFIN-101 | Invite an external accountant (accountant role) | ✔ |

### Phase 2: Growing the business (priority: medium)

| Task | Feature | Backend |
|------|---------|:-:|
| SOUPFIN-133 | Time tracking; billable time onto invoices | ✔ |
| SOUPFIN-135 | Projects and job costing | ✔ |
| SOUPFIN-110 | Class and Location tracking (no limit on count) | ✔ |
| SOUPFIN-127 | Purchase orders, converted to bills | ✔ |
| SOUPFIN-117 | Progress invoicing against estimates | ✔ |
| SOUPFIN-118 | Custom invoice layouts and templates | |
| SOUPFIN-136 | Budgeting and Budget vs Actual | ✔ |
| SOUPFIN-115 | Sales rep tracking | ✔ |
| SOUPFIN-123 | Contractor payments and withholding tax (Ghana WHT; 1099 later) | ✔ |
| SOUPFIN-137 | AI assistant: categorisation, reminders, Q&A, insights | ✔ |
| SOUPFIN-138 | Collaboration: comments, @mentions, accountant review | ✔ |
| SOUPFIN-113 | Sales channel sync | ✔ |
| SOUPFIN-122 | Mileage tracking | ✔ |
| SOUPFIN-126 | Cheque printing | |
| SOUPFIN-116 | Appointment scheduling linked to invoicing | ✔ |

### Phase 3: Scale & control (priority: low)

| Task | Feature | Backend |
|------|---------|:-:|
| SOUPFIN-134 | Inventory (TRADING tenants only) | ✔ |
| SOUPFIN-102 | Custom user roles and permissions | ✔ |
| SOUPFIN-139 | Approval workflows (bills, invoices, expenses, payments) | ✔ |
| SOUPFIN-111 | Custom fields | ✔ |
| SOUPFIN-119 | Batch invoicing | ✔ |
| SOUPFIN-129 | Batch expense entry | ✔ |
| SOUPFIN-130 | Fixed assets and depreciation | ✔ |
| SOUPFIN-120 | Revenue recognition | ✔ |
| SOUPFIN-106 | Product/service and project profitability reports | ✔ |
| SOUPFIN-107 | Custom report builder | ✔ |
| SOUPFIN-108 | Cash flow forecasting | ✔ |
| SOUPFIN-141 | Tenant backup and restore | ✔ |
| SOUPFIN-140 (part 2) | Live two-way spreadsheet sync | |

## Before Phase 1: make the existing product work

The QBO features build on the ledger. Fix these first:

1. **Ledger/Accounting module enablement for SERVICES tenants** (SOUPFIN-144). Without it, every
   ledger, voucher and payment-method call returns 403.
2. **COA template seeding at registration and backfill** (epic SOUPFIN-142,
   [coa-template-seeding.md](coa-template-seeding.md)). Invoices and bills cannot post until
   A/R, A/P and tax system accounts exist.
3. **Finish and merge the open fix branches.** They are listed per feature in
   [`plans/features/`](features/) and in the master plan.

## TASCIM organisation

- Epic **SOUPFIN-98**. Every task is labelled `qbo-parity`, plus `backend-required` where it
  needs soupmarkets-web changes.
- Modules:
  - QBO: Users & Access
  - QBO: Reporting & Analytics
  - QBO: COA & Dimensions
  - QBO: Invoicing & Sales
  - QBO: Expenses, Bills & Purchasing
  - QBO: Banking
  - QBO: Operations
  - QBO: Automation, AI & Collaboration
  - QBO: Data Management
- Each task description starts with its phase (`**Phase N – …**`).
- Tier labels were deleted.

## Dependency notes

- Reconciliation (132) depends on Bank feeds (131). The AI assistant (137) reuses the Bank feeds rules engine.
- Progress invoicing (117) depends on Estimates (112). Batch invoicing (119) and Recurring invoices (114) share the invoice-generation service.
- Profitability reports (106) depend on Projects (135) and Inventory (134).
- Class/Location (110) and Custom fields (111) must reach the report framework (103) so reports can filter by them.
- Multi-currency (125) needs the FX system accounts from the COA templates (143).
- Inventory applies only to TRADING tenants. SERVICES tenants (the current SoupFinance tenant) hide it.
- Each new UI ships with i18n for en/de/fr/nl and dark mode. Types mirror the Grails domains.
