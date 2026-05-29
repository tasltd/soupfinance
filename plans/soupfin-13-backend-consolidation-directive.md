# SOUPFIN-13 — Backend Consolidation Directive

**PM Issue:** SOUPFIN-13 — *DIRECTIVE: Implement all backend resolutions (SOUPFIN-1 to 11) in SoupMarkets project*
**Type:** Strategic directive (no soupfinance code changes)
**Target repo for actual fixes:** `soupmarkets-web` (GitLab: `tasltd/soupmarkets-web`)
**Filed:** 2026-05-29
**Status in soupfinance:** *Documented only* — work happens elsewhere.

---

## 1. Directive Summary

For SOUPFIN-1 through SOUPFIN-11, all **backend-specific changes, resolutions, and
architectural patches** must be implemented in the **soupmarkets-web** repository
and tracked under the Soupmarkets PM project
(`14b64ee3-f6b9-443a-aee1-6a77e3a83972`), **not** in this SoupFinance worktree.

SoupFinance remains the scope for frontend (React) validation and UI-specific
fixes only.

> **Instruction to Agent/Engineer:** Do not apply backend fixes in the soupfinance
> scope. Compile and fix in soupmarkets.

This directive aligns with two pre-existing HARD rules already enforced by this
project:

| Rule file | What it enforces |
|-----------|------------------|
| `.claude/rules/backend-changes-workflow.md` | Backend changes from soupfinance context are forbidden — create a plan in `plans/` instead. |
| `.claude/rules/deployment-restrictions.md` | Never deploy to any Soupmarkets infrastructure (`140.82.32.141`, `tas.soupmarkets.com`, `edge.soupmarkets.com`) from soupfinance. |

---

## 2. Five Backend Areas (verbatim from the directive)

| # | Area | Description (from SOUPFIN-13) |
|---|------|---|
| 1 | Permission Logic (403s) | Enabling Finance and Trading modules for active tenants |
| 2 | Report Data-Binding | Removing hard-coded date parameters in Grails controllers for Trial Balance and P&L |
| 3 | Tenant Resolution | Fixing the `SbUserController.current()` null tenant ID issue |
| 4 | Domain Logic | Ensuring "Quick Add Client" correctly triggers `AccountServices` record creation |
| 5 | Performance | Implementing eager metaclass loading to prevent first-request hangs |

---

## 3. Issue → Backend-Area → Plan Mapping

The frontend portion of every SOUPFIN-1..11 ticket is already merged on `main`
(see merge commits `2eacd05`, `6d41926`, `26d5406`, `8f5307b`, etc.). The
remaining work is the matching backend resolution in soupmarkets-web.

| Issue | Title (short) | Backend area | Existing soupfinance plan that describes the backend work |
|-------|----------------|--------------|------------------------------------------------------------|
| SOUPFIN-1 | Quick Add Client does not create AccountServices | #4 Domain Logic | `plans/SOUPFINANCE_BACKEND_CHANGES_NEEDED.md` → Issue 12 (Client Contact Chain Not Created from SPA Form) |
| SOUPFIN-2 | Cannot add new users — roles endpoint 500, missing tenant_id | #3 Tenant Resolution | `plans/soupfinance-user-creation-backend.md`; `plans/soupfinance-tenant-resolution-fix.md` |
| SOUPFIN-3 | Add bank account — ledger 403 + save validation | #1 Permission Logic | `plans/soupfinance-ledger-accounting-module-enablement.md` |
| SOUPFIN-4 | Bills & Vendors inaccessible — modules not enabled | #1 Permission Logic | `plans/soupfinance-finance-module-tenant-enablement.md` |
| SOUPFIN-5 | Account settings — missing fields + 500 on SMS prefix | Cross-cutting (#3 + minor) | `plans/SOUPFINANCE_BACKEND_CHANGES_NEEDED.md` → Issues 14, 17 |
| SOUPFIN-6 | Vendors blocked — Trading module not enabled | #1 Permission Logic | `plans/soupfinance-finance-module-tenant-enablement.md` (Trading flag) |
| SOUPFIN-7 | Clients — persistence, filtering, search issues | #4 Domain Logic | `plans/SOUPFINANCE_BACKEND_CHANGES_NEEDED.md` → Issue 12 |
| SOUPFIN-8 | Payments disabled — 403 on all data endpoints | #1 Permission Logic | `plans/soupfinance-payments-finance-module-enable.md` |
| SOUPFIN-9 | Ledger / Accounting — 403 on all lookups | #1 Permission Logic | `plans/soupfinance-ledger-accounting-module-enablement.md` |
| SOUPFIN-10 | Accounting hard-blocked by 403s + settings race | #1 Permission Logic + #3 Tenant Resolution | `plans/soupfinance-finance-module-tenant-enablement.md`; `plans/soupfinance-tenant-resolution-fix.md` |
| SOUPFIN-11 | Reports module — hard-coded date filters & crashes | #2 Report Data-Binding | `plans/soupfinance-report-schedule-finance-module.md`; `plans/SOUPFINANCE_BACKEND_CHANGES_NEEDED.md` → Issue 5 |
| Cross-cutting | First-request hang — eager metaclass loading | #5 Performance | New, to be authored in soupmarkets-web (see §5 below) |

---

## 4. Authoritative Backend Plans Already in this Repository

These files are **reference material for the soupmarkets-web team**. They were
written from the soupfinance side, so they describe symptoms and root causes
from the consumer perspective. They must be **mirrored into soupmarkets-web**
(e.g. `soupmarkets-web/plans/` or per-team convention) before implementation
starts there.

| File | Coverage |
|------|----------|
| `plans/SOUPFINANCE_BACKEND_CHANGES_NEEDED.md` | Master list — 21 backend issues with root cause analysis, log excerpts, repro curl commands. **Single most useful starting point.** |
| `plans/soupfinance-tenant-resolution-fix.md` | `SbUser.tenant_id` / `Agent.tenant_id` NULL after registration; `TenantNotFoundException` on every data query (Area #3). |
| `plans/soupfinance-tenant-architecture-refactor.md` | Tenant-per-Account refactor (registration creates new `Account` = tenant, not a Corporate row in a shared tenant). Underpins Areas #1 and #3. |
| `plans/soupfinance-finance-module-tenant-enablement.md` | How the `Account.financeEnabled` (and Trading) flags must be set on registration + admin endpoint to toggle them. (Area #1) |
| `plans/soupfinance-ledger-accounting-module-enablement.md` | Same enablement pattern, scoped to Ledger / Voucher / PaymentMethod (Area #1). |
| `plans/soupfinance-payments-finance-module-enable.md` | Same enablement pattern, scoped to Invoice/Bill Payments (Area #1). |
| `plans/soupfinance-report-schedule-finance-module.md` | Backend schedule controller alignment with the `/rest/financeReports/*` family (Area #2). |
| `plans/soupfinance-agent-current-endpoint.md` | Optional `GET /rest/agent/current.json` to return the full Agent for the logged-in `SbUser` (Area #3 ergonomics). |
| `plans/soupfinance-user-creation-backend.md` | Roles endpoint 500 + missing tenant_id on `SbUser` save (Area #3, SOUPFIN-2). |
| `plans/soupfinance-disable-email-confirmation.md` | Adjacent to SOUPFIN-2 — confirmation flow must propagate tenant_id. |
| `plans/soupfinance-api-audit-reconciliation.md` | Endpoint inventory used during the audit that produced SOUPFIN-1..11. |
| `plans/soupfinance-multi-invoice-payment.md` + `plans/soupmarkets-multi-invoice-payment.md` | Companion frontend/backend plan pair for the multi-invoice payment feature (touches Areas #1 and #4). |
| `plans/soupfinance-voucher-type-refactoring.md` + `plans/soupmarkets-voucher-type-restructuring.md` | Companion plan pair for voucher type enum cleanup (Area #4 follow-on). |

---

## 5. New Backend Items (no soupfinance plan yet — must be authored in soupmarkets-web)

### 5a. Area #2 — Remove hard-coded date parameters in Trial Balance / P&L

The directive specifically calls out hard-coded dates in
`FinanceReportsController` actions for Trial Balance and P&L. Today the frontend
passes `?from=…&to=…` but some Grails actions ignore or override those params
with hard-coded defaults during render.

**Action for the soupmarkets-web team:**
- Audit `FinanceReportsController.trialBalance`, `incomeStatement`,
  `accountBalances`, `accountTransactions` actions and the GSON views they
  render — every date literal must be replaced with the corresponding
  `params.from` / `params.to` binding.
- Add Spock integration tests that pass `from=2025-01-01&to=2025-03-31` and
  assert the response excludes transactions outside that window.

### 5b. Area #5 — Eager metaclass loading on startup

The first request after boot hangs while Groovy expands lazy metaclasses for
the large finance domain graph. The directive asks for **eager metaclass loading
during startup** so the first user does not pay this cost.

**Action for the soupmarkets-web team:**
- Add a `BootStrap.init` block (or a `@PostConstruct` on a startup bean) that
  touches `metaClass` on the hot-path domain classes: `Invoice`, `Bill`,
  `Vendor`, `Client`, `AccountServices`, `Voucher`, `LedgerAccount`,
  `LedgerTransaction`, `PaymentMethod`, `Account`, `Agent`, `SbUser`.
- Gate behind `grails.env != 'test'` so unit-test boot is unaffected.
- Add JMX / actuator metric for "first request latency" to prove the fix.

These two items have **no existing plan in soupfinance/plans/** because they
were never reproduced from the SPA side — they are purely backend. They must be
created in `soupmarkets-web/plans/` (or the team's chosen location).

---

## 6. What This Branch Touches (and Does Not)

**This worktree is `feature/20260529-093549-auto-fix-request-soupfin-13-issue-directiv`.**

Changes in this branch:

- ✅ `plans/soupfin-13-backend-consolidation-directive.md` — this file.
- ✅ `CLAUDE.md` — top-level reference to the directive so future agents see it
  before they touch backend code.
- ✅ PM comment on SOUPFIN-13 documenting the scope decision.

Explicitly **not** in this branch:

- ❌ Any change to `soupfinance-web/src/**`, `backend/**`, or deployment scripts.
- ❌ Any Apache config change.
- ❌ Any push, build, deploy, or restart on production servers.
- ❌ Any commit in `soupmarkets-web` (separate session, separate repo).

---

## 7. Hand-off Checklist for the soupmarkets-web Engineer

When the soupmarkets-web session picks up this directive:

1. Read `plans/SOUPFINANCE_BACKEND_CHANGES_NEEDED.md` first — it is the most
   complete root-cause reference.
2. Open SOUPFIN-13 in PM and link a Soupmarkets parent epic (e.g. `SOUP-XXX`)
   so backend work is visible to both teams.
3. For each area in §2, create a soupmarkets-web work item with the matching
   issue references from §3.
4. Implement under RIPUIF, with integration tests against the real LXC backend
   (single JVM, sequential — see the Sequential Integration Test Execution rule).
5. After each backend area lands on `master`/`master_stable_last`, deploy via
   the soupmarkets-web release pipeline (NOT from this worktree).
6. Add a comment on the matching SOUPFIN-* issue noting the backend commit /
   tag that resolves it.
7. Only after all five areas are resolved should SOUPFIN-13 itself be moved
   to *Done*.

---

## 8. References

- PM: `https://cim.techatscale.io/pm/projects/SOUPFINANCE/issues/SOUPFIN-13`
- soupmarkets-web project on GitLab: `tasltd/soupmarkets-web`
- Soupmarkets PM project ID: `14b64ee3-f6b9-443a-aee1-6a77e3a83972`
- Parent CLAUDE.md (soupmarkets workspace): `../CLAUDE.md`
- This project's own rule against backend changes: `.claude/rules/backend-changes-workflow.md`
