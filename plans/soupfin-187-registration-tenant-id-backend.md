# SOUPFIN-187 Registration tenant_id — Backend Plan

**Status:** Open (backend change in soupmarkets-web; nothing here blocks login or data access)
**Verified:** 2026-10-14 on the LXC dev backend (`soupfinance-backend`, DB `soupbroker_dev`,
classes built 2026-10-14 06:20 from `soupmarkets-web` master)
**Supersedes:** Issue #7 in `SOUPFINANCE_BACKEND_CHANGES_NEEDED.md` and §1 of
`soupfinance-tenant-resolution-fix.md`

## Context

SOUPFIN-2 fixed the frontend symptoms of new tenants getting `TenantNotFoundException` / 403
on every data call. The backend root cause was listed as open: `POST /account/register.json`
left `agent.tenant_id` and `sb_user.tenant_id` NULL. SOUPFIN-187 asked us to confirm what
is still true on a fresh registration.

## What the LXC shows today

Three registrations on 2026-10-14, each checked in the database straight after:

| Column | Value | Expected | Verdict |
|---|---|---|---|
| `account.id` | new UUID | | |
| `agent.tenant_id` | `= account.id` | `= account.id` | **Fixed** (register() wraps Agent creation in `Tenants.withId(account.id)`) |
| `agent.account_id` | `= account.id` | `= account.id` | OK |
| `sb_user.tenant_id` | **NULL** | `= account.id` | **Still open** |
| `sb_user_sb_role.tenant_id` (ROLE_ADMIN, ROLE_USER) | **NULL** | `= account.id` | **Still open** (new finding) |

And through the API, as the new tenant's admin (single-step consumer, `requireEmailConfirmation=false`):

| Call | Result |
|---|---|
| `POST /rest/api/login` | 200, roles `ROLE_ADMIN`, `ROLE_USER` |
| `GET /rest/user/current.json` | 200, `tenantId` = `account.id`, `agentId` = the new agent |
| `GET /rest/invoice/index.json` | 200, `[]` (the other 105 invoices on the box belong to other tenants) |
| `GET /rest/ledgerAccount/index.json?max=500` | 200, 32 rows = the 32 seeded for this tenant |

So the user-facing bug is gone: `SoupDiscriminatorTenantResolver` resolves the tenant from the
session, then the selected Agent, then `agentService.findByUserAccess(currentUser)`. It never
reads `sb_user.tenant_id`. The NULL columns are a data-integrity gap, not an outage.

## Why the two columns are still NULL

`register()` is `@WithoutTenant`. `Tenants.withId(...)` only stamps `tenantId` on domains that
implement `grails.gorm.MultiTenant`:

- `Agent extends SbDomain implements MultiTenant<Agent>` — stamped. That is why the Agent fix works.
- `SbUser implements Serializable, Auditable, CommonMethods` — **not** MultiTenant. It is saved
  before the `withId` block anyway, and nothing sets `tenantId` by hand.
- `SbUserSbRole implements Serializable` — **not** MultiTenant (the file imports
  `grails.gorm.MultiTenant` but does not implement it). `assignDefaultRoles()` wraps
  `SbUserSbRole.create(...)` in `Tenants.withId(tenantId)` and its Javadoc says this "still
  gets the right tenantId". It does not: the rows are written with `tenant_id = NULL`.

## Required Changes (soupmarkets-web)

### Service: `grails-app/services/soupbroker/AccountRegistrationService.groovy`

1. **register()** — set the tenant on the SbUser explicitly, after `account.save(...)`:

   ```groovy
   SbUser sbUser = new SbUser(
       username: username,
       email: cmd.email,
       password: initialPassword,
       enabled: enabled,
       accountExpired: false,
       accountLocked: false,
       passwordExpired: false,
       tenantId: account.id   // Fix (SOUPFIN-187): SbUser is not MultiTenant, withId cannot stamp it
   )
   ```

2. **assignDefaultRoles(sbUser, tenantId, accountId)** — stamp the join row by hand, because
   `Tenants.withId` is a no-op for a non-MultiTenant domain:

   ```groovy
   resolved.each { String authority, SbRole role ->
       if (!SbUserSbRole.exists(sbUser.id, role.id)) {
           SbUserSbRole ur = new SbUserSbRole(sbUser: sbUser, sbRole: role, tenantId: tenantId)
           ur.save(failOnError: true, flush: true)
       }
   }
   ```

   Keep the `Tenants.withId` wrapper if other code relies on it, but correct the Javadoc: it
   does not set `tenantId` on `SbUserSbRole`.

3. **confirmEmail()** — backfill for accounts registered before this fix:
   `if (!sbUser.tenantId) sbUser.tenantId = agent.account.id` before `sbUser.save(...)`.

Do **not** add `implements MultiTenant` to `SbUser` or `SbUserSbRole`. A user can hold agents in
several tenants; a Hibernate tenant filter on `SbUser` would hide the user from login in every
tenant but one. The same caution is recorded in `AccountRegistrationRoleAssignmentSpec` for `SbRole`.

### One-time data backfill (per environment, after a verified backup)

```sql
-- sb_user: take the tenant from the user's only agent. Leave multi-agent users alone.
UPDATE sb_user u
JOIN (SELECT user_access_id, MIN(tenant_id) t FROM agent
      WHERE tenant_id IS NOT NULL GROUP BY user_access_id HAVING COUNT(DISTINCT tenant_id) = 1) a
  ON a.user_access_id = u.id
SET u.tenant_id = a.t
WHERE u.tenant_id IS NULL;

UPDATE sb_user_sb_role ur JOIN sb_user u ON u.id = ur.sb_user_id
SET ur.tenant_id = u.tenant_id
WHERE ur.tenant_id IS NULL AND u.tenant_id IS NOT NULL;
```

## Tests to add in soupmarkets-web

- `AccountRegistrationServiceSpec` (unit/integration): after `register(cmd, null, null, false)`,
  assert `sbUser.tenantId == account.id`, `agent.tenantId == account.id`, and every
  `SbUserSbRole.findAllBySbUser(sbUser)*.tenantId == [account.id] * 2`.
- Same for the confirmation path: `register(cmd)` then `confirmEmail(token, pw, pw)`.
- Fix the Javadoc assertion in `assignDefaultRoles()` and pin it with that spec.

## Test support the frontend spec needs (optional, small)

The LXC `soupfinance-web` ApiConsumer has `require_email_confirmation = 1`, and the dev box
reroutes every email to `support@techatscale.io`. The confirmation token is an HMAC signed with
`REGISTRATION_TOKEN_SECRET`, which is unset on the LXC, so the backend makes a random secret at
each start. An automated test therefore cannot mint the token. Either of these unblocks a
fully unattended confirm leg:

1. Set `REGISTRATION_TOKEN_SECRET` in `/etc/soupmarkets/current.env` on the LXC box and pass the
   same value to Playwright as `E2E_REGISTRATION_TOKEN_SECRET`. The frontend spec already mints
   the token from it (same `agentId:timestamp:base64url(HMAC-SHA256)` format as
   `generateConfirmationToken`). No backend code change.
2. Or add a `TestEndpointGate`-guarded `GET /authenticator/testConfirmationToken?email=` that
   returns `generateConfirmationToken(agent.id)` for the newest agent of that user.

Until one of those is in place, run the spec with a single-step ApiConsumer
(`E2E_SINGLE_STEP_CONSUMER_ID` / `_SECRET`; on the LXC any `api_consumer` row with
`require_email_confirmation = 0`). Without either variable the spec still registers the tenant
and proves login is refused before confirmation, then fails with a message naming both options.

## Frontend coverage (this repo)

`soupfinance-web/e2e/integration/soupfin-187-registration-tenant.integration.spec.ts`:
register → (confirm) → login → `GET /rest/user/current.json` returns `tenantId` = the new
account id → `GET /rest/invoice/index.json` 200 and empty → `GET /rest/ledgerAccount/index.json`
returns only this tenant's seeded accounts.

## Related

- SOUPFIN-144: Chart of Accounts seeding at registration (same endpoint) — seeding confirmed:
  32 ledger accounts appear for each fresh SERVICES tenant.
- SOUPFIN-151: industry field on registration (same endpoint).
