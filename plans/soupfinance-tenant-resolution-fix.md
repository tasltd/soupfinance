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

### 5. Fix Account Settings Access (CRITICAL — updated 2026-02-10)

**Three independent issues prevent account settings from loading:**

#### Issue A: Filter Chain Blocks All /account/* Paths

**File:** `grails-app/conf/application.groovy` (lines 791-809)

All `/account/*` paths match the catch-all `/**` filter chain pattern which **EXCLUDES `restTokenValidationFilter`**. This means X-Auth-Token is completely invisible for `/account/*` — the backend never reads it.

**Current filter chain (exact):**
```groovy
grails.plugin.springsecurity.filterChain.chainMap = [
    [pattern: '/assets/**', filters: 'none'],
    [pattern: '/**/js/**', filters: 'none'],
    [pattern: '/**/css/**', filters: 'none'],
    [pattern: '/**/images/**', filters: 'none'],
    [pattern: '/**/favicon.ico', filters: 'none'],
    [pattern: '/souplify/**', filters: 'JOINED_FILTERS,-exceptionTranslationFilter,-authenticationProcessingFilter,-securityContextPersistenceFilter,-rememberMeAuthenticationFilter'],
    [pattern: '/client/**', filters: 'JOINED_FILTERS,-authenticationProcessingFilter,-rememberMeAuthenticationFilter'],
    [pattern: '/rest/**/**.json', filters: 'JOINED_FILTERS,-exceptionTranslationFilter,-authenticationProcessingFilter,-securityContextPersistenceFilter,-rememberMeAuthenticationFilter'],
    [pattern: '/rest/**/**/**.json', filters: 'JOINED_FILTERS,-exceptionTranslationFilter,-authenticationProcessingFilter,-securityContextPersistenceFilter,-rememberMeAuthenticationFilter'],
    [pattern: '/**/structure', filters: 'none'],
    [pattern: '/rest/**/structure', filters: 'none'],
    [pattern: '/rest/**/**/structure', filters: 'none'],
    [pattern: '/**', filters: 'JOINED_FILTERS,-restTokenValidationFilter,-restExceptionTranslationFilter'],
]
```

**What happens:** `/account/index.json` → matches `/**` → `restTokenValidationFilter` stripped → no auth context → `@Secured` fails → `exceptionTranslationFilter` redirects → **302 to `/login/auth`**

**Validated with official Grails Spring Security REST docs:** When `-restTokenValidationFilter` is in the chain, NO other filter reads `X-Auth-Token`. The filter chain patterns are stateful (`/**` = session-based) vs stateless (`/rest/**` = token-based). They are incompatible on the same URL pattern per the plugin docs.

#### Issue B: RESOLVED — Frontend Now Uses show/{id} (not index)

**AccountController security annotations:**
```groovy
@Secured(["ROLE_ADMIN"])           // Class-level default
class AccountController {
    @Secured(["ROLE_ADMIN"])       // index() — admin only
    def index() { ... }

    @Secured(["ROLE_ADMIN", "ROLE_USER"])  // show/edit/update — any user
    def show() { ... }
    def edit() { ... }
    def update() { ... }

    @Secured("permitAll") @WithoutTenant   // Public registration
    def register() { ... }
    def confirmEmail() { ... }
}
```

**RESOLVED:** Frontend now calls `show/{id}` and `update/{id}` (which accept `ROLE_USER`) instead of `index()` (which requires `ROLE_ADMIN`). No backend change needed for this issue.

#### Issue C: RESOLVED — Agent Endpoint Provides Account ID

The standard login response does NOT include `tenantId`. **But the agent endpoint (`/rest/agent/index.json`) returns agents with `account.id`** which IS the `tenant_id`.

**Corrected frontend flow (implemented 2026-02-10):**
1. Login → get `access_token`
2. `GET /rest/agent/index.json?max=1` → returns agent with `account: { id: "..." }` (works under `/rest/` with token auth)
3. `GET /account/show/{account.id}.json` → returns account settings (needs Issue A filter chain fix)
4. `PUT /account/update/{account.id}.json` → saves account settings (needs Issue A filter chain fix)

**No new REST endpoint needed.** The existing agent endpoint provides the account ID.

#### Required Fix: Filter Chain Entry for /account/*

Add a stateless chain for `/account/**/**.json` before the catch-all:
```groovy
// Add BEFORE the '/**' catch-all:
[pattern: '/account/**/**.json',
 filters: 'JOINED_FILTERS,-exceptionTranslationFilter,-authenticationProcessingFilter,-securityContextPersistenceFilter,-rememberMeAuthenticationFilter'],
```

Also add to `ApiAuthenticatorInterceptor.groovy`:
```groovy
match(controller: "account")
```

This enables X-Auth-Token authentication for `/account/show/{id}.json`, `/account/edit/{id}.json`, and `/account/update/{id}.json`. The `show`/`edit`/`update` actions already accept `ROLE_USER`, so regular SoupFinance users will have access.

### 6. Summary of All Changes Required

| # | File | Change | Priority |
|---|------|--------|----------|
| 1 | `AccountController.groovy` | Set `tenant_id` on Agent + SbUser during registration | CRITICAL |
| 2 | `AccountController.groovy` | Add `@WithoutTenant` to all actions | CRITICAL |
| 3 | `AccountService.groovy` | Add `@WithoutTenant` to all methods | CRITICAL |
| 4 | `application.groovy` | Add `/account/**/**.json` filter chain rule before `/**` catch-all | CRITICAL |
| 5 | `ApiAuthenticatorInterceptor.groovy` | Add `match(controller: "account")` | CRITICAL |
| 6 | `_account.gson` | Render fields explicitly (avoid generic template tenant resolution) | HIGH |
| 7 | Production DB | Fix any remaining NULL `tenant_id` values | DONE |
| 8 | Frontend (`settings.ts`, `accountStore.ts`) | Use agent → tenant_id → account/show flow | DONE |

## Notes

- The `SoupDiscriminatorTenantResolver` at line 33 uses `Tenants.withoutId {}` and then `Account.withTransaction {}` to resolve tenants. If the user has a valid `tenant_id`, this works. The hostname fallback checks the request's server name.
- The `Api-Authorization` header maps to the `ApiConsumer` record with `tenant_id = ff8081817217e9f3017217f19ccc0000` (Demo Securities). But per-user resolution uses the user's own `tenant_id`, which should be the Account created during their registration.
- Login endpoint (`/rest/api/login`) does NOT require tenant resolution — it authenticates by username/password and creates a token. The tenant is only needed for subsequent data queries.
- **Filter chain investigation (2026-02-10):** Confirmed via Apache logs + curl + online research:
  - ALL requests to `/account/*.json` return HTTP 302 regardless of auth headers
  - Direct curl to `tas.soupmarkets.com` with `Api-Authorization` + `X-Auth-Token` → `302 → /login/auth`
  - Both Tomcat instances (port 8080 and 9091) reject login for test users → password may have changed
  - The `restTokenValidationFilter` is explicitly excluded from `/**` catch-all (line 809)
  - Per official Grails Spring Security REST plugin docs: when `-restTokenValidationFilter` is in chain, NO other filter reads `X-Auth-Token`
  - The `ApiAuthenticatorInterceptor` has wildcard URI patterns (`/**/index`, `/**/show/**`) that would match `/account/*` but Grails interceptors run AFTER the Spring Security filter chain — the 302 happens before the interceptor ever runs
