# SOUPFIN-150: Say why a 403 happened (backend plan)

## Context

The backend answers **403** on the same URLs for two different reasons:

| Cause | Who answers | Body today (verified on the LXC backend, 2026-10-12) |
|---|---|---|
| Tenant lacks the module | `FinanceModuleInterceptor`, `TradingModuleInterceptor`, `CisModuleInterceptor`, `SouplifyModuleInterceptor` | `{"error": "Finance module is not enabled for this tenant"}` (plain text for non-JSON requests) |
| User lacks a role (e.g. `ROLE_LEDGER_ACCOUNT`) | Spring Security `sendError(403)`, rendered by Spring Boot | `{"timestamp": …, "status": 403, "error": "Forbidden", "path": "/rest/ledgerAccount/index.json"}` |

The SoupFinance frontend used to decide from the URL alone, so a role failure on
`/rest/ledgerAccount` read "Ledger module is not available". It now reads the body
(`classifyForbiddenBody` in `soupfinance-web/src/api/errors.ts`): it matches the
`"<Name> module is not enabled"` text and the Spring `"Forbidden"` envelope.

Matching English text works, but one wording change in an interceptor would break it
silently. This plan adds a stable machine-readable field.

## Required changes (soupmarkets-web)

### Module interceptors (4 files, same edit)

`grails-app/controllers/soupbroker/{Finance,Trading,Cis,Souplify}ModuleInterceptor.groovy`:
add `code` and `module` to the JSON body. Keep `error` unchanged so older clients keep working.

```json
{ "error": "Finance module is not enabled for this tenant",
  "code": "MODULE_DISABLED",
  "module": "FINANCE" }
```

`module` is the `ModuleGroup` enum name (`FINANCE`, `TRADING`, `CIS`, `SOUPLIFY`).

### Spring Security access-denied handler (optional, second step)

Register a REST `AccessDeniedHandler` for the `/rest/**` chains that renders

```json
{ "error": "Forbidden", "code": "ROLE_DENIED", "status": 403, "path": "/rest/…" }
```

The frontend already treats the current Spring Boot envelope as a role denial, so this
step only makes the contract explicit.

## Frontend contract (already implemented)

`classifyForbiddenBody` checks `code` first:

- `code: "MODULE_DISABLED"` → "module not available", module name from `module`
- `code: "ROLE_DENIED"` or `"ACCESS_DENIED"` → "You do not have permission, ask your admin"
- no `code` → falls back to the text match, then to the URL when the body is empty

## Tests to add in soupmarkets-web

- Functional spec per interceptor: tenant without the module, `GET …/index.json` →
  403 with `code == 'MODULE_DISABLED'` and the right `module`.
- Functional spec: tenant with the module but a user without the controller role →
  403 whose body has no `MODULE_DISABLED` code.
