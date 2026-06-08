# SOUPFIN-14 Backend Issues Plan

This plan tracks the backend (`soupmarkets-web`) changes needed to resolve the
issues filed in SOUPFIN-14 (Frontend Unaddressed/Persistent Issues, 2026-06-04).

The frontend-only issues have been resolved in the corresponding frontend PR.
The items in this document are **backend-side** and must be picked up by a
session with `soupmarkets-web` context.

---

## 1. `/account/show/{id}.json` returns NULL for company profile fields

### Symptom
On `app.soupfinance.com → Settings → Account`, the form loads but every text
field (Address, Location, Website, Slogan, Phone, Country, etc.) is empty.
The backend response from `GET /account/show/{tenantId}.json` contains literal
`null` for these properties even when they have been previously saved.

### Suspected Root Cause
Likely a missing field projection in the GSON view template
`grails-app/views/account/_account.gson` (or `show.gson`), or the
`AccountController.show()` action returning only a partial domain projection.

### Required Backend Investigation
1. Verify that `Account` (or whatever discriminator-specific subclass is the
   tenant entity in the SoupFinance license category) has columns / fields
   for: `address`, `location`, `website`, `slogan`, `phone`, `country`.
2. Inspect the GSON template at `grails-app/views/account/show.gson` and
   `_account.gson` — ensure each field is rendered explicitly. The fix to
   the `_domainClassInstance.gson` reflection delegate from earlier work
   appears to have skipped the Account template.
3. Add an integration test (`AccountControllerFunctionalSpec`) that:
   - Persists an Account with non-null `address`, `website`, `slogan`,
     `phone`, `country` values
   - Calls `GET /account/show/{id}.json` with the matching tenant context
   - Asserts every field is echoed in the response payload

### Acceptance Criteria
- `GET /account/show/{tenantId}.json` returns the actual stored values for
  the listed fields, not `null`.
- Frontend `Settings → Account` page populates all editable fields on load.

---

## 2. `/rest/client/index.json` omits `firstName` and `lastName`

### Symptom
Client list shows an empty `NAME` column for `INDIVIDUAL` clients. The
response payload includes `clientType: 'INDIVIDUAL'` but `firstName` and
`lastName` are missing. Search by name returns "No clients yet" because
the backend has no name field to match against.

### Suspected Root Cause
The `Client` domain links to an `Individual` (KYC) sub-entity via the
`individual` association. The list GSON template renders `client` directly
without flattening the `individual.firstName` / `individual.lastName`
into the top-level response.

### Required Backend Changes
1. Modify `grails-app/views/client/_client.gson` (or the list template):
   - For `clientType == 'INDIVIDUAL'`, render `firstName` and `lastName`
     pulled from `client.individual?.firstName` / `client.individual?.lastName`.
   - For `clientType == 'CORPORATE'`, render `companyName` from
     `client.corporate?.name`.
2. Also expose `name` as a computed top-level field (frontend currently
   reads `client.name` for the table — this should be a denormalized
   convenience string the backend computes from individual / corporate).
3. Verify with `GET /rest/client/index.json` that both fields are present.

### Acceptance Criteria
- `GET /rest/client/index.json` returns `firstName` + `lastName` for
  individual clients and `companyName` for corporate clients.
- Frontend client list shows the correct display name in the `NAME`
  column for both client types.
- Search by `firstName` / `lastName` works against the list endpoint.

---

## 3. Type filter on `/rest/client/index.json` ignores `clientType` query param

### Symptom
On the Clients page, selecting "Individual" or "Corporate" in the type
filter sends `?clientType=INDIVIDUAL` (or `CORPORATE`) but the response
is unchanged — all clients are still returned, all rendered as Corporate.

### Required Backend Changes
1. Update `ClientController.index()` (or the underlying `ClientService.list()`)
   to honor the `clientType` query parameter as a filter on `Client.clientType`.
2. Add a functional test that asserts:
   - `GET /rest/client/index.json?clientType=INDIVIDUAL` returns only
     individuals
   - `GET /rest/client/index.json?clientType=CORPORATE` returns only
     corporates
   - No filter param returns all clients

### Acceptance Criteria
- The frontend type filter on the Clients page works correctly without
  any further frontend change.

---

## 4. "Finance module is not enabled for this tenant" (403 on `/rest/ledgerAccount/*`, `/rest/financeReports/*`)

### Symptom
The Accounting → Chart of Accounts page hard-fails with a 403:
`{"error": "Finance module is not enabled for this tenant"}`. Reports
that depend on the ledger (Trial Balance, Balance Sheet, etc.) also
fail. Bank Account form's "Linked Ledger Account" dropdown is empty
because `/rest/ledgerAccount/index.json` returns the same 403.

### Suspected Root Cause
The SoupFinance tenant (Account ID `ff8081817217e9f3017217f19ccc0000`
on production) is configured with `licenceCategory = SERVICES` but the
`FinanceModuleEnabledFilter` (or equivalent feature gate in the backend)
checks for `licenceCategory in [BROKER, ASSET_MANAGER, TRUSTEE, ...]`
and rejects SERVICES.

### Required Backend Investigation
1. Find the feature flag enforcement code:
   ```bash
   grep -rn "Finance module is not enabled" grails-app/
   ```
2. Determine the intended policy:
   - **Option A**: SoupFinance (SERVICES category) is supposed to have
     finance enabled — the feature flag check needs to allow SERVICES.
   - **Option B**: The SoupFinance tenant should be on a different
     `licenceCategory` that includes finance — flip the DB column.
3. Add a per-tenant config switch (`account.financeModuleEnabled boolean`)
   so this can be toggled without code changes in the future.

### Acceptance Criteria
- `GET /rest/ledgerAccount/index.json` returns 200 with the tenant's
  chart of accounts for the SoupFinance production tenant.
- `GET /rest/financeReports/trialBalance.json` returns 200 (even if the
  list is empty for a freshly seeded tenant).
- New Journal Entry account dropdowns populate.
- Bank Account form "Linked Ledger Account" dropdown populates.

---

## 5. (Bonus) Backend reject reason for SMS Sender ID > 11 chars is generic

### Context
Frontend now blocks > 11 chars client-side (see frontend PR), but if the
backend constraint changes in the future the error message should be
specific. Today it just bubbles up as "Failed to save".

### Suggestion
Add an explicit field-level constraint in the `Account` domain class:

```groovy
smsIdPrefix nullable: true, maxSize: 11, blank: true
```

…and ensure the controller returns the validation `errors` payload so
the frontend can render field-specific messages.

---

## Project & Tracking

- **Issue**: SOUPFIN-14
- **Frontend PR**: this branch (`feature/20260608-082619-auto-fix-request-soupfin-14-issue-frontend`)
- **Backend repo**: `soupmarkets-web` (master branch — `tas.soupmarkets.com`)
- **Backend test infra**: integration tests under
  `src/integration-test/groovy/soupbroker/{kyc,finance,configuration}`
- **Do NOT** modify backend code from the SoupFinance project context;
  these changes must be picked up by a session rooted in the
  `soupmarkets-web` worktree.
