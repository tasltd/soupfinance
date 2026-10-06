# Feature: Auth & Registration

**Module:** Auth & Registration (TASCIM `11cc7878-f108-405b-988b-626341cda5a5`)
**Reviewed:** 2026-10-06 against `main` (f80bf22 / 083a461)

## 1. Overview

Tenant self-signup (tenant-per-Account), email confirmation, password login with remember-me
dual storage, token validation and session-expiry handling.

| Route | Component | Endpoint(s) |
|-------|-----------|-------------|
| `/login` | `src/features/auth/LoginPage.tsx` | `POST /rest/api/login` (`src/api/auth.ts`) |
| `/register` | `src/features/corporate/RegistrationPage.tsx` | `POST /account/register.json` (`registerTenant`, `accountClient`) |
| `/confirm-email` | `src/features/auth/ConfirmEmailPage.tsx` | `POST /account/confirmEmail.json` |
| `/resend-confirmation` | `src/features/auth/ResendConfirmationPage.tsx` | `POST /account/resendConfirmation.json` |
| `/forgot-password` | `src/features/auth/ForgotPasswordPage.tsx` | `POST /account/forgotPassword.json` (**backend missing**) |
| `/reset-password` | `src/features/auth/ResetPasswordPage.tsx` | `POST /account/resetPassword.json` (**backend missing**) |
| `/verify` | `src/features/auth/VerifyPage.tsx` | `/client/authenticate.json`, `/client/verifyCode.json` (corporate OTP) |

State and plumbing:
- `src/stores/authStore.ts` — `login`, `logout` (`clearSessionState`, SOUPFIN-58), `initialize`, `validateToken` (`GET /rest/user/current.json` enriches `tenantId`).
- `src/api/client.ts` — `apiClient` / `accountClient` interceptors: `X-Auth-Token`, 401 → `/login` (lines ~113-127, ~190-198).
- `src/api/errors.ts` — `getLoginErrorMessage` (SOUPFIN-29).
- `src/App.tsx` — `ProtectedRoute` / `PublicRoute`.

Tests: `src/stores/__tests__/authStore.test.ts`, `src/api/__tests__/{auth-login,auth-2fa,client,errors}.test.ts`,
`src/api/endpoints/__tests__/registration.test.ts`, `src/features/auth/__tests__/{LoginPage,VerifyPage}.test.tsx`,
E2E `e2e/auth.spec.ts`, `e2e/registration.spec.ts`, `e2e/soupfin-29-login-error-message.spec.ts`,
integration `e2e/integration/01-auth.integration.spec.ts`, `auth.integration.spec.ts`.

## 2. Current status

Works on main:
- Login with friendly error text (SOUPFIN-29, merged 96a6c7f / fd4e0d4).
- Remember-me dual storage, token validation on mount, `tenantId` enrichment on reload.
- Logout clears auth + account storage (SOUPFIN-58 fix in `authStore.clearSessionState`).

Broken / missing:
- **401 interceptor leaves `auth-storage`** → expired session bounces to a dead `/dashboard` (SOUPFIN-49). Fix exists only on unmerged branch `feature/20260827-164812-…-soupfin-49-…` (36 behind main).
- **Forgot/reset password**: UI exists, backend actions do not (`registration.ts:250-279` comments; `plans/SOUPFINANCE_BACKEND_CHANGES_NEEDED.md` §8d).
- **Registration tenant_id**: backend Issue #7 (Agent/SbUser `tenant_id` NULL) still listed open; never verified end-to-end on LXC.
- **No i18n**: none of the auth pages or RegistrationPage call `useTranslation` even though `locales/*/auth.json` exists.
- **No session-expired UX**: designs `modal-session-timeout/`, `error-session-expired-page/` unimplemented.
- **Test gaps**: no unit tests for RegistrationPage, ConfirmEmail, ForgotPassword, ResetPassword, ResendConfirmation.
- `registration.ts` still exports deprecated `registerCorporate`, `checkPhoneExists`, `checkEmailExists` stubs (cleanup candidate).

## 3. Task review

| ID | Title | State change | Evidence / notes |
|----|-------|--------------|------------------|
| SOUPFIN-29 | Raw 401 on login/signup | Done → Done (unchanged) | 96a6c7f, 092473c; `soupfin-29-login-error-message.spec.ts` |
| SOUPFIN-49 | 401 interceptor leaves auth-storage | Backlog → **In Review** | Fix + tests on unmerged branch 621d9ed (WIP); main `client.ts:114-126` still buggy. Rebase, reuse `clearSessionState`, merge |
| SOUPFIN-185 | i18n: auth & registration pages | **new** (Todo) | No `useTranslation` in any auth page |
| SOUPFIN-186 | Backend: forgot/reset password endpoints | **new** (Backlog, backend-required) | BACKEND_CHANGES_NEEDED §8d |
| SOUPFIN-187 | Backend: registration sets tenant_id on Agent/SbUser | **new** (Backlog, backend-required) | BACKEND_CHANGES_NEEDED Issue #7; root cause behind SOUPFIN-2 |
| SOUPFIN-188 | Session timeout modal + session-expired notice | **new** (Backlog) | Designs unimplemented; depends on SOUPFIN-49 |
| SOUPFIN-189 | Unit tests for registration/password pages | **new** (Todo) | Only LoginPage/VerifyPage tested |

(Tenant-currency-after-login SOUPFIN-53 and logout-currency SOUPFIN-58 are tracked in `settings-users.md`.)

## 4. Remaining work plan

1. **Session correctness** — rebase and merge the SOUPFIN-49 branch on top of the SOUPFIN-58 `clearSessionState` helper; one shared clear path for logout, invalid token and 401. Closes **SOUPFIN-49**.
2. **Session-expired UX** — one-shot flag + LoginPage banner, optional idle modal. Closes **SOUPFIN-188**.
3. **Backend verification of signup** — plan + LXC proof that `tenant_id` is set; integration spec register → confirm → login → data call 200. Closes **SOUPFIN-187** (coordinate with SOUPFIN-144 which edits the same register action).
4. **Password recovery** — backend plan for `forgotPassword` / `resetPassword`; then LXC integration spec and expired-token UI. Closes **SOUPFIN-186**.
5. **Tests** — page tests for registration & password flows. Closes **SOUPFIN-189**.
6. **i18n** — move all auth strings to `auth` namespace (4 locales). Closes **SOUPFIN-185**.
7. Cleanup: remove deprecated stubs in `registration.ts` once no callers (fold into step 5).

## 5. Backend dependencies

| Need | Task | Plan |
|------|------|------|
| `tenant_id` on Agent + SbUser at registration | SOUPFIN-187 | `plans/soupfinance-tenant-resolution-fix.md`, `plans/SOUPFINANCE_BACKEND_CHANGES_NEEDED.md` (#7) |
| `AccountController.forgotPassword` / `resetPassword` | SOUPFIN-186 | to write (BACKEND_CHANGES_NEEDED §8d is the outline) |
| Optional single-step signup (skip email confirm) | — (product decision) | `plans/soupfinance-disable-email-confirmation.md` (Draft) |
| COA seeding + module enablement in `register.json` | SOUPFIN-144 (COA epic SOUPFIN-142) | COA plans |

All backend work happens in soupmarkets-web per `.claude/rules/backend-changes-workflow.md`.

## 6. Related QBO-parity / COA tasks

- SOUPFIN-151 — capture industry at registration and onboarding (adds a field to `/register`).
- SOUPFIN-144 / SOUPFIN-142 — registration seeds the Chart of Accounts and enables Ledger/Accounting modules.
- SOUPFIN-101 — external accountant invite (new invite-acceptance sign-in path will reuse confirm-email/reset flows).

## 7. Definition of done

- A new user can register, confirm, log in and load data on LXC and production with no 403/500 (integration spec green).
- Forgotten password can be recovered end-to-end.
- Session expiry always lands on the login form with an explanatory message; no stale "authenticated" state survives a 401.
- All auth/registration pages translated in en/de/fr/nl.
- Every auth page has unit tests; mock E2E + LXC integration suites green in Firefox.
