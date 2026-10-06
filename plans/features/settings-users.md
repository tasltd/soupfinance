# Feature: Settings, Users & Tenant Currency

**Module:** Settings, Users & Tenant Currency (TASCIM `7eda17fe-4ccd-4c1d-b6b8-7ab4f87ab2f8`)
**Reviewed:** 2026-10-06 against `main`

## 1. Overview

Company profile (Account), staff users (Agent + SbUser + roles), company bank accounts, and the
tenant currency used to format every amount in the app.

| Route | Component | Endpoint(s) (`src/api/endpoints/settings.ts`) |
|-------|-----------|----------------------------------------------|
| `/settings` | `src/features/settings/SettingsLayout.tsx` | — |
| `/settings/users`, `/new`, `/:id` | `UserListPage.tsx`, `UserFormPage.tsx` | `agentApi` (`/rest/agent/*`), `rolesApi` (`/rest/sbRole/index.json`), `accountPersonApi` |
| `/settings/bank-accounts`, `/new`, `/:id` | `BankAccountListPage.tsx`, `BankAccountFormPage.tsx` | `accountBankDetailsApi`, `banksApi` (`dedupeBanksByName`), ledger accounts |
| `/settings/account` | `AccountSettingsPage.tsx` | `accountSettingsApi` → `GET/PUT /account/{show,update}/{tenantId}.json` via `accountClient` |

Tenant currency: `src/stores/accountStore.ts` (`CURRENCIES`, `formatCurrency`, persisted as `account-storage`),
fetched once by `src/App.tsx:207-216` when `tenantId` is known; reset on logout by `authStore.clearSessionState`.

Tests: `src/features/settings/__tests__/{AccountSettings,BankAccountForm,UserForm,UserList}Page.test.tsx`,
`src/api/endpoints/__tests__/settings.test.ts`, `src/stores/__tests__/authStore.test.ts` (SOUPFIN-58),
E2E `e2e/settings.spec.ts`, `soupfin-23-account-settings-redirect.spec.ts`, `soupfin-58-logout-currency.spec.ts`,
integration `e2e/integration/settings.integration.spec.ts`, `soupfin-45-user-update.integration.spec.ts`.
No test for `BankAccountListPage`.

## 2. Current status

Works on main:
- User create/edit with role resolution, inline errors, update submits (SOUPFIN-2, 24, 45).
- Bank account form: required bank, de-duplicated bank list, module-disabled handling (SOUPFIN-3/14/33).
- Account settings: SMS prefix ≤ 11 validation, logo/favicon upload, fiscal-year date sanitising, locked form when load fails (SOUPFIN-5/16/18/23).
- Logout clears the previous tenant's currency (SOUPFIN-58: `authStore.ts:30-42`, `soupfin-58-logout-currency.spec.ts`).

Broken / missing:
- **Currency wrong right after login** until reload — `login()` never fetches `tenantId` (SOUPFIN-53). Fix e359607 only on unmerged branch.
- **Currency change in settings not applied** until reload; form default `GHS` vs store default `USD`; unknown codes silently become USD (SOUPFIN-200).
- **Country select** stores ISO code while backend holds the name — saved country never shows selected (SOUPFIN-22, `AccountSettingsPage.tsx:214` vs `:441`).
- **Backend residue**: account show missing profile fields, finance-module gating (SOUPFIN-15); stale `agent/show` after update (SOUPFIN-50); role-group cache key mismatch (SOUPFIN-51); dirty bank seed data (SOUPFIN-34).
- **No i18n** in any settings page; no `settings` namespace (SOUPFIN-202).
- Account email/phone contacts (multi-contact) not editable — gap analysis §10; left as a follow-up note, no task yet.
- Report pages hardcoding USD are tracked under Reports (SOUPFIN-54).

## 3. Task review

| ID | Title | State change | Evidence / notes |
|----|-------|--------------|------------------|
| SOUPFIN-2 | Cannot add users (roles 500, tenant_id) | Done (unchanged) | b39d4bd. Backend root cause now tracked as SOUPFIN-187 (Auth module) |
| SOUPFIN-3 | Cannot add bank account | Done (unchanged) | Frontend items in BankAccountFormPage (bank required, dedupe, module banner); backend residue in SOUPFIN-15/34 |
| SOUPFIN-5 | Account settings fields/validation/SMS 500 | Done (unchanged) | Zod `.max(11)` :40-42, logo upload (SOUPFIN-16); backend fields → SOUPFIN-15 |
| SOUPFIN-15 | Backend follow-up: account fields, finance module | Backlog (unchanged) | `plans/soupfinance-soupfin-14-backend-issues.md`, `plans/soupfinance-finance-module-tenant-enablement.md` |
| SOUPFIN-22 | Country select ISO vs name | Backlog → **Todo** | Still broken on main |
| SOUPFIN-23 | Unloaded form on API failure | Done (unchanged) | 878ec56; `soupfin-23-account-settings-redirect.spec.ts` |
| SOUPFIN-24 | User list crash on role.authority | In Review → **Done** | fe9728d; UserListPage test |
| SOUPFIN-34 | Bank seed data quality | Backlog (unchanged) | Backend/data; frontend dedupe is the safety net |
| SOUPFIN-45 | Update button on users | In Review → **Done** | 9a9d049; integration spec |
| SOUPFIN-50 | Backend: stale agent show | In Review → **Backlog** | Only plan on main (`plans/soupfin-50-agent-cache-evict-key-backend.md`) |
| SOUPFIN-51 | Backend: SbRoleGroup evict key | Backlog (unchanged) | Static audit only |
| SOUPFIN-53 | Currency not applied after sign-in | In Review (unchanged) | Fix e359607 on unmerged branch `…-soupfin-53-issue-tenant-c`; main `auth.ts:82-87` still omits tenantId |
| SOUPFIN-58 | Logout leaves previous currency | Backlog (**should be Done**) | Fix + tests on main (`authStore.ts:21-42`, `soupfin-58-logout-currency.spec.ts`). State change was blocked by the permission system — needs a manual move |
| SOUPFIN-200 | Currency change not applied until reload | **new** (Todo, bug) | `AccountSettingsPage.tsx` onSuccess only invalidates query |
| SOUPFIN-202 | i18n: settings pages | **new** (Todo) | No `useTranslation` in `features/settings/*` |

## 4. Remaining work plan

1. **Tenant currency correctness**: rebase + merge SOUPFIN-53 branch (login awaits `validateToken`); then refresh accountStore after settings save and unify defaults/currency list. Closes **SOUPFIN-53, SOUPFIN-200** (SOUPFIN-58 already fixed).
2. **Account settings data fidelity**: country stored and shown consistently (ISO code, mapped in `accountSettingsApi`), reload test. Closes **SOUPFIN-22**.
3. **Backend follow-ups** (soupmarkets-web, plans exist): account show fields + finance module (SOUPFIN-15), agent show cache eviction (SOUPFIN-50), role-group key alignment (SOUPFIN-51), bank table clean-up (SOUPFIN-34). Verify each on LXC, then re-run `settings.integration.spec.ts`.
4. **i18n** for all settings pages with a new `settings` namespace. Closes **SOUPFIN-202**.
5. Follow-ups to consider once the above lands: BankAccountListPage unit test; company email/phone contacts editor.

## 5. Backend dependencies

| Need | Task | Plan |
|------|------|------|
| `/account/show` returns all profile fields; finance module enabled | SOUPFIN-15 | `plans/soupfinance-soupfin-14-backend-issues.md`, `plans/soupfinance-finance-module-tenant-enablement.md` |
| Agent show cache eviction | SOUPFIN-50 | `plans/soupfin-50-agent-cache-evict-key-backend.md` |
| SbRoleGroup cache key alignment | SOUPFIN-51 | same plan, §6 |
| Bank table clean-up | SOUPFIN-34 | to write |
| User creation / agent current | — | `plans/soupfinance-user-creation-backend.md`, `plans/soupfinance-agent-current-endpoint.md` |

## 6. Related QBO-parity / COA tasks

- SOUPFIN-101 — external accountant invite and Accountant role (extends `/settings/users`).
- SOUPFIN-102 — custom user roles and granular permissions (replaces fixed `SOUPFINANCE_ROLE_LABELS`).
- SOUPFIN-125 — multi-currency transactions (builds on the tenant base currency here).
- SOUPFIN-132 — bank reconciliation (builds on bank accounts + linked ledger account).
- SOUPFIN-153 — docs alignment for COA status (account setup docs).

## 7. Definition of done

- Every amount shows the tenant currency on first render after login, after logout/login as another tenant, and immediately after changing it in settings.
- Account settings round-trip every field (incl. country) on LXC and production.
- Users can be created, edited and re-opened with fresh values (backend SOUPFIN-50 fixed).
- Settings pages translated in en/de/fr/nl; unit, mock E2E and LXC integration suites green in Firefox.
