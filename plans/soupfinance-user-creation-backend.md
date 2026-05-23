# SoupFinance User Creation — Backend Plan (SOUPFIN-2)

## Context

Production at `https://app.soupfinance.com/settings/users/new` cannot create new users. Four backend bugs combine to make user management completely unusable for tenants registered via `/account/register.json`.

Frontend ticket: SOUPFIN-2 (Backlog → In Progress).

The frontend now (see `feature/20260523-112243-auto-fix-request-soupfin-2-issue-cannot-ad`):
- Surfaces backend error messages instead of a generic "Please check the form" toast
- Renders a roles loading / error / empty state instead of a silent blank box
- Stops silently defaulting new users to `ROLE_USER` when no roles are available
- Falls back to `userAccess.username` and shows an empty-state line in the users table
- Distinguishes 403 (permission/tenant problem) from 200-with-no-data on the dashboard

…but the actual fix for "user creation works" must happen in `soupmarkets-web`.

## Reproduction (verified manually)

1. Register a fresh tenant via `POST /account/register.json` → `confirmEmail.json`
2. Log in to `https://app.soupfinance.com`
3. Navigate to `Settings → User Management → Add User`
4. Fill in name + username + password and click Save

Observed:

| # | Endpoint | Status | Backend log line |
|---|----------|--------|-----------------|
| 1 | `POST /rest/agent/save.json` | **500** | `groovy.lang.MissingMethodException: No signature of method: soupbroker.security.SbUserSbRole.exists() is applicable for argument types: (null, Long) values: [null, 4]` |
| 2 | `GET /rest/sbRole/index.json` | **500** | `java.lang.IllegalArgumentException: Model variable [sbRoleList] with value [[SbRole(authority:ROLE_ACCOUNT)...` (Grails JSON view serialization failure) |
| 3 | `GET /rest/invoice/index.json` | **403** | Tenant resolver rejects request — `sb_user.tenant_id` is null |
| 4 | `GET /rest/bill/index.json` | **403** | Same tenant resolution failure as #3 |

Bugs 3 & 4 are already covered by `plans/soupfinance-tenant-resolution-fix.md`. This plan focuses on bugs **1** and **2** but cross-references the tenant fix because user creation cannot pass without it.

---

## Bug 1 — `SbUserSbRole.exists(null, Long)` on agent save

### Symptom

`POST /rest/agent/save.json` with body containing `authorities: [{ authority: 'ROLE_USER' }]` returns **500** with:

```
groovy.lang.MissingMethodException: No signature of method:
soupbroker.security.SbUserSbRole.exists() is applicable for argument types: (null, Long)
values: [null, 4]
```

The Long `4` is the primary key of `SbRole(authority='ROLE_USER')`. The `null` is the SbUser id.

### Root cause

In `AgentController.save()` (or `AgentService.save()` — wherever the authorities are bound onto the new SbUser), the code is reading the authorities collection from `params`/`request.JSON` and trying to look up each `(sbUser, sbRole)` pair via `SbUserSbRole.exists(sbUser, sbRole.id)` **before** the new `SbUser` has been persisted (so its `id` is still null).

The signature `exists(sbUser, roleId)` is also wrong — `SbUserSbRole` is a join table, so the standard pattern in the soupmarkets codebase is:

```groovy
SbUserSbRole.create(sbUser, sbRole, true)   // create-or-noop, idempotent
// or
SbUserSbRole.findBySbUserAndSbRole(sbUser, sbRole)
```

### Fix

In `soupmarkets-web/grails-app/controllers/.../AgentController.groovy` (or the relevant service):

```groovy
// 1. Build the SbUser from request.JSON.userAccess
def sbUser = new SbUser(
    username: request.JSON?.userAccess?.username,
    password: request.JSON?.userAccess?.password,
    enabled: true,
    tenantId: account.id          // see plans/soupfinance-tenant-resolution-fix.md
)
if (!sbUser.save(flush: true)) {
    respond sbUser.errors, status: 422
    return
}

// 2. Bind the agent + link to user
agent.userAccess = sbUser
agent.tenantId = account.id
agent.save(flush: true)

// 3. NOW that sbUser has an id, attach the role rows
def authoritiesPayload = request.JSON?.authorities ?: []
authoritiesPayload.each { roleRef ->
    SbRole role = SbRole.findByAuthority(roleRef?.authority as String)
    if (role) {
        SbUserSbRole.create(sbUser, role, true)   // idempotent helper
    }
}
```

### Acceptance criteria

- `curl -X POST /rest/agent/save.json -d '{"firstName":"A","lastName":"B","userAccess":{"username":"abc","password":"secret"},"authorities":[{"authority":"ROLE_USER"}]}'` returns **200/201** with the created Agent JSON (not 500)
- The new SbUser row has `tenant_id = currentAccount.id` (NOT null) — see bug 3
- `select * from sb_user_sb_role where sb_user_id = <new id>` returns one row per requested authority
- Re-saving the same authority does NOT throw `DataIntegrityViolation` (use `SbUserSbRole.create(..., true)` for idempotency)

---

## Bug 2 — `/rest/sbRole/index.json` view rendering 500

### Symptom

`GET /rest/sbRole/index.json` returns **500**. Backend log:

```
java.lang.IllegalArgumentException: Model variable [sbRoleList] with value
[[SbRole(authority:ROLE_ACCOUNT), SbRole(authority:ROLE_ADMIN), ...]]
```

The GSON view (`grails-app/views/sbRole/index.gson` or similar) is choking on the list.

### Root cause hypothesis

Either:
1. The view file is missing — Grails Views falls back to the generic `_domainClassInstance.gson` which can't render `SbRole` (no `tenant_id`, no `serialised` field) and throws on serialization
2. The view file exists but expects `sbRoleInstanceList` while the controller `respond`s `[sbRoleList: roles]` — model variable name mismatch
3. The view file uses `inherits template:` referencing a deleted/renamed parent template

### Fix

Inspect `soupmarkets-web/grails-app/views/sbRole/` and either:

**Option A — add an explicit GSON view** (preferred — production-safe, cache-friendly):

`grails-app/views/sbRole/index.gson`:

```groovy
import soupbroker.security.SbRole

model {
    Iterable<SbRole> sbRoleList
}

json tmpl.sbRole(sbRoleList)
```

`grails-app/views/sbRole/_sbRole.gson`:

```groovy
import soupbroker.security.SbRole

model {
    SbRole sbRole
}

json {
    id sbRole.id
    authority sbRole.authority
}
```

**Option B — fix the controller** to use `render` directly:

```groovy
@WithoutTenant   // SbRole is global, not tenant-scoped
def index(Integer max) {
    params.max = Math.min(max ?: 100, 1000)
    def roles = SbRole.list(params)
    render(contentType: 'application/json') {
        roles.collect { [id: it.id, authority: it.authority] }
    }
}
```

The frontend (`agentApi.create()` / `UserFormPage`) expects an array of `{ id, authority }` — keep the shape stable.

### Acceptance criteria

- `curl /rest/sbRole/index.json` returns **200** with a JSON array of `[{id, authority}]`
- Page `/settings/users/new` no longer shows an empty Roles section — checkboxes render for all 8 SoupFinance-relevant roles
- `RELEVANT_ROLES` in `soupfinance-web/src/features/settings/UserFormPage.tsx` (lines 46–55) still all match

---

## Bug 3 & 4 — Tenant resolution

These 403s are direct consequences of `sb_user.tenant_id IS NULL` after registration. See **plans/soupfinance-tenant-resolution-fix.md** — same plan covers both.

The user-creation flow described in Bug 1 must also set `tenant_id` on the freshly-created `SbUser` and `Agent` (rows that get created when an admin adds a teammate via `/rest/agent/save.json`). Add this to the fix:

```groovy
sbUser.tenantId = (springSecurityService.currentUser as SbUser).tenantId
agent.tenantId  = (springSecurityService.currentUser as SbUser).tenantId
```

So that newly-created teammates inherit the calling admin's tenant.

---

## Test plan (backend repo)

1. **Unit** — `AgentControllerSpec`:
   - "save without authorities creates SbUser + Agent and returns 201"
   - "save with `authorities:[{authority:'ROLE_USER'}]` creates SbUserSbRole row"
   - "save twice with same role does NOT throw DataIntegrityViolation"
   - "save inherits tenant_id from current user onto new SbUser and Agent"
2. **Unit** — `SbRoleControllerSpec`:
   - "GET /rest/sbRole/index.json returns 200 with list of `{id,authority}`"
3. **Integration** — boot real Grails, hit endpoints with X-Auth-Token from `soup.support`:
   - `POST /rest/agent/save.json` end-to-end with authorities
   - `GET /rest/sbRole/index.json`
4. **Smoke (against tas.soupmarkets.com after deploy):**
   - Register tenant → confirm email → login → `Settings → Users → Add User` → save → 200 + new user in list

---

## Why this matters

User creation is completely broken for every tenant onboarded via the new `/account/register.json` flow. Existing tenants (Demo Securities, SAS) with `tenant_id` already set on their users may not see the 403s but the `SbUserSbRole.exists()` and `sbRole/index.json` 500s affect **all** tenants — including production admins managing existing teams.

## Owner / next action

- Backend (soupmarkets-web): pick this up alongside `plans/soupfinance-tenant-resolution-fix.md`
- Frontend (this repo): merged via SOUPFIN-2 — `feature/20260523-112243-auto-fix-request-soupfin-2-issue-cannot-ad`
