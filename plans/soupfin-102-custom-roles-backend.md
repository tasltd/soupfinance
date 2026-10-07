# SOUPFIN-102 — Custom roles and granular permissions: backend plan (soupmarkets-web)

**Status:** frontend shipped on branch `feature/20261007-101025-auto-fix-request-soupfin-102-issue-custom`;
backend not started. Per `.claude/rules/backend-changes-workflow.md` this repo does not change
soupmarkets-web — a session with that repo's context executes this plan.

## Context

Settings → Roles (`/settings/roles`) lets a tenant admin build a role from a permission matrix
(area × view/create/edit/delete/approve), e.g. "Sales: create invoices, no bills". The frontend
already:

- reads and writes roles as `SbRoleGroup` through `/rest/sbRoleGroup/*`;
- represents each matrix cell as an `SbRole` whose authority is `ROLE_PERM_{AREA}_{ACTION}`;
- hides actions with `usePermission()` (`src/hooks/usePermission.ts`) using the authorities the
  user carries in `/rest/api/login` and `/rest/user/current.json` → `roles`;
- shows "You do not have permission" — never "module not enabled" — for a 403 whose body is a
  permission denial (`src/api/errors.ts`, `isPermissionDenialBody`).

**The API must be the authority.** Hiding a button is a courtesy. Every rule below must be enforced
server-side, or a custom-role user can still do everything with curl.

### What exists today (verified 2026-10-07 against soupmarkets-web `deba461ef0`)

| Item | State |
|------|-------|
| `SbRole` | `authority` globally unique, `tenantId` present but not used for scoping, `cache true` |
| `SbRoleGroup` | `name` **globally** unique, `tenantId` present, `getAuthorities()` reads `SbRoleGroupSbRole`; no `builtIn`; `cache true` |
| `SbRoleGroupController` | plain CRUD, `@Secured(["ROLE_ADMIN","ROLE_USER"])` — a ROLE_USER can create/delete groups today |
| Finance controllers (Invoice, Bill, Voucher, LedgerAccount, …) | class-level `@Secured(["ROLE_ADMIN","ROLE_USER"])` — **no** per-action permission check |
| Role-denied 403 body (Spring) | `{"timestamp":…,"status":403,"error":"Forbidden","path":"/rest/agent/create.json"}` |
| Module-disabled 403 body | `{"error":"Finance module is not enabled for this tenant"}` (`FinanceModuleInterceptor`) |
| `SbRoleGroupService` cache keys | `@Cacheable key={id}` (`:21`) vs `@Cacheable/@CacheEvict key={"${id}"}` (`:138`, `:150`) — the SOUPFIN-51 / SOUP-3157 mismatch: an update is never evicted |

## Required changes

### 1. Permission SbRoles (seed + migration)

Create one `SbRole` per catalogue cell. The list is `allPermissionAuthorities()` in
`soupfinance-web/src/permissions/catalog.ts` — keep the two in sync:

```
ROLE_PERM_INVOICES_{VIEW,CREATE,EDIT,DELETE,APPROVE}
ROLE_PERM_BILLS_{VIEW,CREATE,EDIT,DELETE,APPROVE}
ROLE_PERM_VENDORS_{VIEW,CREATE,EDIT,DELETE}
ROLE_PERM_CLIENTS_{VIEW,CREATE,EDIT,DELETE}
ROLE_PERM_PAYMENTS_{VIEW,CREATE,EDIT,DELETE,APPROVE}
ROLE_PERM_LEDGER_{VIEW,CREATE,EDIT,DELETE,APPROVE}
ROLE_PERM_REPORTS_VIEW
ROLE_PERM_SETTINGS_{VIEW,CREATE,EDIT,DELETE}
```

33 rows, `tenant_id = NULL` (system-wide, like the other roles). Idempotent SQL migration
(`INSERT … WHERE NOT EXISTS`). Until a row exists, its matrix cell is disabled in the UI with a
"not set up on the server yet" notice — nothing silently drops.

### 2. SbRoleGroup: tenant scoping, built-in flag, authority binding

Domain:
- add `Boolean builtIn = false` (column `built_in`, default false). Existing system groups
  (`tenant_id IS NULL`) are built in; migration sets `built_in = 1` for them.
- `name unique: 'tenantId'` instead of globally unique, so two tenants can both have "Sales".
  Migration: drop the old unique index on `name`, add `(tenant_id, name)`.

Controller/service:
- `index`/`show`: return the tenant's groups **plus** built-in groups. Never another tenant's.
- `save`/`update`: force `tenantId = Account.current().id` (ignore any client value) and
  `builtIn = false`. Bind `authorities: [{id}]` onto `SbRoleGroupSbRole` — replace the full set on
  update. **Only `ROLE_PERM_*` roles may be bound** — reject `ROLE_ADMIN`, `ROLE_SUPER_ADMIN` and
  any other authority with 422, or a tenant admin can mint an admin group.
- `update`/`delete` on a built-in group, or on another tenant's group: **403** with the
  permission-denial body (§4). The frontend already hides these actions and refuses the delete
  client-side; the server must refuse too.
- `delete`: soft-delete or hard-delete plus junction rows; agents holding the group lose it.
- Render JSON with `authorities` as `[{id, authority}]` and `builtIn`, `tenantId` explicitly (do not
  rely on `_domainClassInstance.gson`, which omits the derived `authorities`).
- Secure the controller with `ROLE_ADMIN` **or** `ROLE_PERM_SETTINGS_*` per action
  (index/show → VIEW, save → CREATE, update → EDIT, delete → DELETE). Today ROLE_USER can do all four.

Cache (SOUPFIN-51, SOUP-3157): make every `@Cacheable`/`@CacheEvict` on the `SbRoleGroup` region use
the same key type — `key={id}` everywhere, or `key={"${id}" as String}` everywhere. On save/update/
delete also evict the user-authority cache for agents holding the group (see §3), otherwise a
changed role takes effect only after a JVM restart. Same family as SOUPFIN-50
(`plans/soupfin-50-agent-cache-evict-key-backend.md` §7).

### 3. Authorities on the user

`/rest/api/login` → `roles` and `/rest/user/current.json` → `roles` must include the **expanded**
group authorities (each group's `ROLE_PERM_*` roles), not just the group names. The frontend refreshes
`roles` from `current.json` on every app load, so a role edit takes effect on the user's next reload.
Check `useRoleGroups` / `authorityJoinClassName` in `application.groovy`; the last two commits on
soupmarkets-web ("Sync agent role grants into the table login reads") touch the same path.

### 4. Enforcement: a permission interceptor

Add `PermissionInterceptor` (order after `FinanceModuleInterceptor`, so a disabled module still
reports as a disabled module):

1. If the user has `ROLE_ADMIN` or `ROLE_SUPER_ADMIN` → allow.
2. If the user has **no** `ROLE_PERM_*` authority → allow (legacy user; matches today's behaviour and
   the frontend's `isRestricted()`).
3. Otherwise map `controllerName` + `actionName` → (area, action) and require
   `ROLE_PERM_{AREA}_{ACTION}`. Any granted action in an area implies VIEW of that area (the frontend
   applies the same rule).

| Controllers | Area |
|---|---|
| invoice, invoiceItem, invoicePayment, invoiceTaxEntry, taxEntryInvoiceItem | INVOICES |
| bill, billItem, billPayment, billAttachedFile, taxEntryBillItem | BILLS |
| vendor | VENDORS |
| client, accountServices, clientPortfolio | CLIENTS |
| paymentAllocationGroup, pendingPayment, (voucher when type is a payment/receipt) | PAYMENTS |
| ledgerAccount, ledgerTransaction, ledgerTransactionGroup, ledgerJournal, voucher, voucherApproval | LEDGER |
| financeReports, reportSchedule, reportScheduleHistory | REPORTS |
| agent, sbRoleGroup, accountBankDetails, accountPerson | SETTINGS |

| Actions | Action |
|---|---|
| index, archived, show, structure, export, pdf | VIEW |
| create, save | CREATE |
| edit, update | EDIT |
| delete | DELETE |
| approve, reject, post, unpost | APPROVE |

Lookups the forms need (`serviceDescription`, `paymentMethod`, `sbRole`, `bank`, `currency`,
`taxEntry`) stay open to any authenticated user — gating them would break forms the role allows.

Denied → **403** with:

```json
{ "code": "PERMISSION_DENIED", "error": "Your role does not allow you to create invoices.", "permission": "ROLE_PERM_INVOICES_CREATE" }
```

`code: "PERMISSION_DENIED"` is what the frontend keys on (`isPermissionDenialBody`); the `error`
sentence is shown to the user verbatim. Do **not** reuse the module interceptor's wording
("… module is not enabled …"), which the frontend reads as a disabled module.

## Tests (soupmarkets-web)

- Spock unit: interceptor mapping table — one case per row above, plus admin bypass, legacy-user
  bypass, view-implied-by-create, and an unmapped controller.
- Functional (`*FunctionalSpec`), with a tenant user on a custom "Sales" role
  (`INVOICES_{VIEW,CREATE}` only):
  - `GET /rest/invoice/index.json` → 200; `POST /rest/invoice/save.json` → 201;
  - `GET /rest/bill/index.json` → 403 with `code = PERMISSION_DENIED`;
  - `DELETE /rest/invoice/delete/{id}.json` → 403;
  - `DELETE /rest/sbRoleGroup/delete/{builtInId}.json` as ROLE_ADMIN → 403;
  - `POST /rest/sbRoleGroup/save.json` binding `ROLE_ADMIN` → 422;
  - update a group's authorities, then `GET /rest/sbRoleGroup/show/{id}.json` and
    `/rest/user/current.json` for a member → both reflect the change **without a restart** (§2 cache);
  - tenant B cannot see or edit tenant A's groups.

## Frontend follow-ups once this lands

- `e2e/integration/soupfin-102-custom-roles.integration.spec.ts` already asserts the 403 body
  classification on the live backend; extend it with the "Sales" role round-trip above.
- Assign roles to users: `UserFormPage` still offers the fixed `SOUPFINANCE_ROLE_LABELS` list. Adding a
  role-group picker needs `Agent.groupAuthorities` binding on `agent/save|update` — verify it binds
  before building the picker.
