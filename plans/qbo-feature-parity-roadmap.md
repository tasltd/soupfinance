# QuickBooks Online Feature Parity Roadmap

**Date**: 2026-10-06
**Status**: PLANNED (tasks created in TASCIM project `SOUPFIN`, nothing started)
**Source**: QuickBooks Online feature matrix (Simple Start / Essentials / Plus / Advanced)

## Goal

Bring SoupFinance to feature parity with the four QuickBooks Online plans and sell
SoupFinance in the same four tiers. Each tier includes everything in the tier below it.

This is a plan for the frontend and the backend. Per
[backend-changes-workflow](../.claude/rules/backend-changes-workflow.md), backend work
lives in **soupmarkets-web**. Every task marked `backend-required` must get its own
backend plan in `plans/` before frontend work that depends on it starts.

## What SoupFinance has today (baseline)

| Area | Status |
|------|--------|
| Invoices, Bills, Vendors, Clients, Payments | CRUD in place |
| Chart of Accounts, Ledger Transactions, Journal Entry, Vouchers | In place (gated by the Ledger/Accounting module on SERVICES tenants) |
| Reports | P&L, Balance Sheet, Cash Flow, Trial Balance, A/R + A/P aging, Scheduled Reports |
| Settings | Users, Bank Accounts, Account settings, roles from the backend |
| Currency | One tenant currency only (`accountStore`) |
| Business type | TRADING / SERVICES chosen at registration |
| Not built | Estimates, recurring invoices, POs, vendor credits, bank feeds, reconciliation, time, projects, inventory, budgets, tags, custom fields, approvals, plan tiers |

## Tier matrix → SoupFinance tier labels

| QBO capability | Simple Start | Essentials | Plus | Advanced |
|----------------|:-:|:-:|:-:|:-:|
| Users + accountant invites | 1 + 2 | 3 + 2 | 5 + 2 | 25 + 3 |
| Reports | 40+ basic | + A/R & A/P aging | 70+ (+ job/product profitability) | 90+ (+ forecasting, custom builder) |
| COA limit | 250 | 250 | 250 | Unlimited |
| Class/Location tags | – | – | 40 | Unlimited |

TASCIM labels: `qbo-parity` on every task, plus one of `tier:simple-start`,
`tier:essentials`, `tier:plus`, `tier:advanced` (the lowest tier that ships the feature),
and `backend-required` where soupmarkets-web changes are needed.

## Phasing

| Phase | Tier | Focus |
|-------|------|-------|
| 0 | Foundation | Plan-tier entitlements, seat limits, report framework, COA limit |
| 1 | Simple Start | Estimates, basic report pack, bank feeds + matching, receipt capture, mileage, 1 sales channel, contractor prep, AI categorisation |
| 2 | Essentials | Recurring invoices, sales reps, appointments, bill tracking, multi-currency, cheque printing, time tracking, aging reports, collaboration |
| 3 | Plus | POs, vendor credits, class/location tags, progress invoicing, custom layouts, multi-channel sync, inventory, job costing, budgeting, profitability reports |
| 4 | Advanced | Batch invoicing/expenses, revenue recognition, fixed assets, unlimited tags/COA, approvals, custom fields and roles, custom report builder, forecasting, Excel sync, backup/restore |

Bank reconciliation is not in the QBO matrix, but bank feeds need it. It ships in Phase 1.

## Modules and tasks

Each bullet below is one TASCIM task. They are grouped into TASCIM modules and all sit
under the epic **"QBO feature parity roadmap"**.

### 1. Plans, Users & Access
- Plan-tier entitlement framework (tier on Account, feature flags, UI gating, upgrade prompts) — foundation, backend-required
- Seat limits for users and accountant invites per tier (1/3/5/25 users; 2/2/2/3 accountants) — foundation, backend-required
- External accountant invite and accountant role — simple-start, backend-required
- Custom user roles and granular permissions — advanced, backend-required

### 2. Reporting & Analytics
- Report catalogue framework (registry, common filters, export, favourites) — foundation
- Basic report pack for Simple Start (40+ reports: GL, journal, sales by customer, expenses by vendor, tax summary, comparative P&L/BS) — simple-start, backend-required
- A/R and A/P aging summary and detail plus open invoices / unpaid bills — essentials
- Product/service and project profitability reports (70+ tier) — plus, backend-required
- Custom report builder — advanced, backend-required
- Cash flow forecasting — advanced, backend-required

### 3. Chart of Accounts & Dimensions
- COA account limit per tier (250 cap, unlimited on Advanced) with a usage meter — foundation, backend-required
- Class and Location tracking (40 on Plus, unlimited on Advanced) — plus, backend-required
- Custom fields on transactions, clients and vendors — advanced, backend-required

### 4. Invoicing & Sales
- Estimates / quotes with conversion to an invoice — simple-start, backend-required
- Sales channel sync (1 channel on Simple Start, several on Plus) — simple-start, backend-required
- Recurring invoices — essentials, backend-required
- Sales rep tracking — essentials, backend-required
- Appointment scheduling linked to invoicing — essentials, backend-required
- Progress invoicing against estimates — plus, backend-required
- Custom invoice layouts and templates — plus
- Batch invoicing — advanced, backend-required
- Automated revenue recognition — advanced, backend-required

### 5. Expenses, Bills & Purchasing
- Receipt capture (mobile upload + OCR into a draft expense) — simple-start, backend-required
- Mileage tracking — simple-start, backend-required
- Contractor payments and withholding/1099-style prep — simple-start, backend-required
- Vendor bill tracking (due dates, reminders, bill payment scheduling) — essentials
- Multi-currency transactions (foreign-currency invoices/bills, FX rates, realised/unrealised gains) — essentials, backend-required
- Cheque printing — essentials
- Purchase orders with conversion to a bill — plus, backend-required
- Vendor credits — plus, backend-required
- Batch expense entry — advanced, backend-required
- Fixed asset register and depreciation — advanced, backend-required

### 6. Banking
- Bank feeds (statement import / open banking) with AI matching and rules — simple-start, backend-required
- Bank reconciliation workflow — simple-start, backend-required

### 7. Operations
- Time tracking and timesheets (billable time into invoices) — essentials, backend-required
- Inventory management for TRADING tenants — plus, backend-required
- Projects and job costing — plus, backend-required
- Budgeting and budget vs actual — plus, backend-required

### 8. Automation, AI & Collaboration
- AI assistant (auto-categorisation, invoice reminders, insights; the equivalent of Intuit Assist) — simple-start, backend-required
- Collaboration (comments, @mentions, shared review with the accountant) — essentials, backend-required
- Workflow approval engine for bills, invoices and expenses — advanced, backend-required

### 9. Data Management
- Excel / CSV import and export plus spreadsheet sync — advanced (CSV import is a foundation subtask)
- Tenant data backup and restore — advanced, backend-required

## Dependency notes

- Every tier-gated task depends on the **Plan-tier entitlement framework**.
- Profitability reports depend on Projects/job costing and Inventory.
- Progress invoicing depends on Estimates. Batch invoicing and Recurring invoices share the invoice-generation service.
- Bank reconciliation depends on Bank feeds. The AI assistant reuses the categorisation rules from Bank feeds.
- Class/Location tags and Custom fields must reach the report framework so reports can filter by them.
- Inventory applies only to TRADING tenants. SERVICES tenants (the current SoupFinance tenant) hide it.
