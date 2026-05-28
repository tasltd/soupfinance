# Report Schedule Module Access Backend Plan (SOUPFIN-11)

## Context

The Scheduled Reports feature in the SoupFinance frontend is **blocked** because the backend
`ReportScheduleController` rejects every request with HTTP 403 and the message
`"Finance module is not enabled for this tenant"`.

Endpoints affected:

| Endpoint | Method | Observed Status | Observed Body |
|----------|--------|-----------------|---------------|
| `/rest/reportSchedule/index.json` | GET | 403 | `{"error": "Finance module is not enabled for this tenant"}` |
| `/rest/reportSchedule/create.json` | GET | 403 | `{"error": "Finance module is not enabled for this tenant"}` |
| `/rest/reportSchedule/save.json` | POST | 403 (expected) | same |
| `/rest/reportSchedule/update/:id.json` | PUT | 403 (expected) | same |

This makes the frontend `/reports/scheduled` route produce confusing UX —
the page loads, the "New Schedule" modal opens and is fully interactive,
but every API call returns 403 so the list is empty, history is empty,
and submission silently fails.

## Root Cause (suspected)

`ReportScheduleController` is gated by a `LicenseService.isFinanceEnabled()` (or equivalent)
check. SoupFinance customers register against a tenant whose `licenseCategory = SERVICES`,
but the gating logic only allows tenants where the `FINANCE` module is explicitly enabled.

The other Finance endpoints (`/rest/financeReports/*`, `/rest/invoice/*`, `/rest/bill/*`,
`/rest/ledgerAccount/*`, `/rest/voucher/*`) work fine — so the gating on this single
controller is inconsistent with the rest of the module.

## Required Changes (backend — soupmarkets-web)

### 1. ReportScheduleController gating

File: `grails-app/controllers/soupbroker/finance/ReportScheduleController.groovy`

- Remove or relax the `Finance module is not enabled` check.
- Use the same `@Secured` annotation pattern as `LedgerTransactionController` /
  `VoucherController` so that any authenticated user with `ROLE_USER` in a SERVICES-
  licensed tenant can list, create, update, and view history of their own report
  schedules.
- If a license check is genuinely needed (e.g., for a paid feature flag), make it
  surface as `403 SCHEDULING_NOT_LICENSED` with a structured response that the
  frontend can interpret — NOT a generic "module not enabled" string. The frontend
  should be able to render a meaningful upgrade prompt.

### 2. Audit other Finance endpoints

Run a grep over `grails-app/controllers/soupbroker/finance/*Controller.groovy`
for `isFinanceEnabled()` / `licenseService.hasFinance()` / equivalent guards and
make sure SoupFinance (SERVICES tenant) can use all of:

- `ReportScheduleController` (this issue)
- `ReportScheduleJobService` (already runs from cron)
- `FrontendLogController` (already works)

### 3. Expected API behavior after fix

```bash
# Listing — must return 200 with a list (possibly empty)
GET /rest/reportSchedule/index.json
Authorization: X-Auth-Token=<token>
->  200 OK
    { "reportScheduleList": [], "count": 0 }

# CSRF for create — must return 200 with synchronizer token
GET /rest/reportSchedule/create.json
->  200 OK
    { "SYNCHRONIZER_TOKEN": "...", "SYNCHRONIZER_URI": "/rest/reportSchedule/save" }

# Save — must return 200 with the created schedule
POST /rest/reportSchedule/save.json?SYNCHRONIZER_TOKEN=...&SYNCHRONIZER_URI=...
{ "name": "...", "reportType": "TRIAL_BALANCE", "frequency": "WEEKLY", ... }
->  200 OK
    { "id": "...", "name": "...", "status": "ACTIVE", ... }
```

### 4. Tests to add on backend

- `ReportScheduleControllerSpec.groovy` — integration test:
  - Given a SERVICES-licensed tenant (`account.licenseCategory = SERVICES`)
  - And a user with `ROLE_USER`
  - When the user calls `GET /rest/reportSchedule/index.json`
  - Then the response is `200 OK` with `reportScheduleList: []`

- `ReportScheduleControllerFunctionalSpec.groovy` — happy path:
  - Login as `soup.support`, POST a schedule, GET the list, PUT to pause,
    DELETE, and verify each step returns the expected JSON.

## Frontend Implications

Once the backend is fixed, the frontend `/reports/scheduled` page will work as-is.
No frontend code changes are needed for this specific issue — the
`ScheduledReportsPage.tsx` already handles 403 by showing the "Failed to load
schedules" error message at line 442. After the backend fix, the empty list
and form submission will work end-to-end.

## How to Test (backend dev)

```bash
# Test against LXC backend
curl -s "http://10.115.213.183:9090/rest/reportSchedule/index.json" \
  -H "X-Auth-Token: <token>" -H "Accept: application/json"

# Should return 200 with a list — currently returns 403
```

## Related Issues

- SOUPFIN-11 (this issue) — Reports module unusable; reportSchedule 403 is one of several bugs.
- SoupFinance domain architecture rule: every Finance endpoint should be reachable
  from SERVICES-licensed tenants, not gated behind a TRADING-only flag.
