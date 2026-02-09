# SoupFinance Tenant Resolution Fix — Backend Plan

## Context

SoupFinance users registered through the `/account/register.json` endpoint experience `TenantNotFoundException` on ALL API calls after login. The root cause is that `sb_user.tenant_id` and `agent.tenant_id` are not set during registration.

**Error:** `org.grails.datastore.mapping.multitenancy.exceptions.TenantNotFoundException: Tenant could not be resolved - no session, user, or hostname match`

**Affected:** ALL endpoints (`/rest/agent/`, `/rest/invoice/`, `/rest/bill/`, `/account/index.json`, etc.) — login works but all data queries fail.

**Stack trace origin:** `SoupDiscriminatorTenantResolver.groovy:117` → tries session, user tenant_id, hostname — all fail when `sb_user.tenant_id = NULL`.

## Root Cause Analysis

### Issue 1: Registration does not set tenant_id on SbUser and Agent

When `AccountController.register()` creates a new Account + Agent + SbUser:
- The `Account` is created (this IS the tenant — `account.id` = `tenant_id`)
- The `Agent` is created but `agent.tenant_id` is left NULL
- The `SbUser` is created but `sb_user.tenant_id` is left NULL

**Evidence:** User `dfd.nusenu@gmail.com` (sb_user id=203) registered 2026-02-06, creating Account `ff8081819c32eab1019c33faecd10051` ("ToTransact"). Both `sb_user.tenant_id` and `agent.tenant_id` were NULL. Later test registrations (sb_user 206, 207) had correct tenant_ids — suggesting the issue may have been partially fixed but not for the `confirmEmail` flow.

### Issue 2: Account domain is not multi-tenant but GSON views trigger tenant resolution

The `Account` domain class does NOT have multi-tenant annotations (it IS the root tenant entity). However:
- `_account.gson` delegates to `_domainClassInstance.gson` (generic template)
- The generic template at line 574 accesses properties that trigger Hibernate tenant filter
- `SoupDiscriminatorTenantResolver.resolveTenantIdentifier()` is called and fails

## Required Changes

### 1. Fix Registration Flow (CRITICAL)

**File:** `AccountController.groovy` (specifically the `register` and `confirmEmail` actions)

After creating the new `Account`, the `tenant_id` must be set on both the Agent and SbUser:

```groovy
// In register/confirmEmail flow, AFTER Account is created:
def account = new Account(name: params.companyName, ...)
account.save(flush: true)

// Set tenant_id on the Agent
agent.tenantId = account.id
agent.save(flush: true)

// Set tenant_id on the SbUser (via agent.userAccess)
if (agent.userAccess) {
    agent.userAccess.tenantId = account.id
    agent.userAccess.save(flush: true)
}
```

**Check both paths:**
- `register` action (initial registration)
- `confirmEmail` action (email verification — this is where the SbUser password is set and the user is enabled)

The `account.id` IS the `tenant_id` for all entities belonging to that tenant.

### 2. Add @WithoutTenant to AccountController and AccountService (CRITICAL)

**File:** `AccountController.groovy`

The `Account` domain is the root tenant entity and does NOT participate in multi-tenancy. All controller actions that query `Account` must use `@WithoutTenant`:

```groovy
import grails.gorm.multitenancy.WithoutTenant

class AccountController {

    @WithoutTenant
    def index() { ... }

    @WithoutTenant
    def show() { ... }

    @WithoutTenant
    def edit() { ... }

    @WithoutTenant
    def update() { ... }

    @WithoutTenant
    def register() { ... }

    @WithoutTenant
    def confirmEmail() { ... }
}
```

**File:** `AccountService.groovy`

```groovy
import grails.gorm.multitenancy.WithoutTenant

class AccountService {

    @WithoutTenant
    def list(params) { ... }

    @WithoutTenant
    def get(id) { ... }

    @WithoutTenant
    def save(account) { ... }

    // All methods that query Account domain
}
```

### 3. Fix Account GSON views for tenant-free rendering

**File:** `grails-app/views/account/_account.gson`

Currently delegates to `_domainClassInstance.gson` which triggers tenant resolution at line 574. Options:
- **Option A (preferred):** Render Account fields explicitly in `_account.gson` instead of using the generic template
- **Option B:** Wrap the generic template call in `Tenants.withoutId { }` block

```groovy
// Option A: Explicit rendering in _account.gson
import soupbroker.Account

model {
    Account account
}

json {
    id account.id
    name account.name
    currency account.currency
    designation account.designation
    address account.address
    location account.location
    website account.website
    slogan account.slogan
    emailSubjectPrefix account.emailSubjectPrefix
    smsIdPrefix account.smsIdPrefix
    countryOfOrigin account.countryOfOrigin
    businessLicenceCategory account.businessLicenceCategory
    startOfFiscalYear account.startOfFiscalYear
    dateCreated account.dateCreated
    lastUpdated account.lastUpdated
}
```

### 4. Fix existing NULL tenant_ids (one-time SQL)

**Already done for user 203. Run this to catch any other orphaned users:**

```sql
-- Find all sb_users with NULL tenant_id that have an agent
SELECT u.id, u.username, u.tenant_id, a.id as agent_id, a.tenant_id as agent_tenant_id
FROM sb_user u
LEFT JOIN agent a ON a.user_access_id = u.id
WHERE u.tenant_id IS NULL;

-- Find agents with NULL tenant_id
SELECT a.id, a.first_name, a.last_name, a.tenant_id, a.user_access_id
FROM agent a
WHERE a.tenant_id IS NULL AND a.user_access_id IS NOT NULL;
```

## Verification

After making the changes:

1. Register a new user through SoupFinance (`app.soupfinance.com/register`)
2. Confirm email
3. Login
4. Verify `sb_user.tenant_id` is set to the newly created `account.id`
5. Verify all data endpoints return 200 (not 500)
6. Verify `/account/index.json` returns the account settings

## Immediate DB Fix Applied (2026-02-09)

```sql
-- Fixed user dfd.nusenu@gmail.com
UPDATE sb_user SET tenant_id = 'ff8081819c32eab1019c33faecd10051' WHERE id = 203;
UPDATE agent SET tenant_id = 'ff8081819c32eab1019c33faecd10051' WHERE id = 'ff8081819c32eab1019c33faef4b0052';
```

## Notes

- The `SoupDiscriminatorTenantResolver` at line 33 uses `Tenants.withoutId {}` and then `Account.withTransaction {}` to resolve tenants. If the user has a valid `tenant_id`, this works. The hostname fallback checks the request's server name.
- The `Api-Authorization` header maps to the `ApiConsumer` record with `tenant_id = ff8081817217e9f3017217f19ccc0000` (Demo Securities). But per-user resolution uses the user's own `tenant_id`, which should be the Account created during their registration.
- Login endpoint (`/rest/api/login`) does NOT require tenant resolution — it authenticates by username/password and creates a token. The tenant is only needed for subsequent data queries.
