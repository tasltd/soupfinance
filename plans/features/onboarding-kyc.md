# Feature: Onboarding & KYC

**Module:** Onboarding & KYC (TASCIM `5775a946-d8fa-46e2-9a3b-f5e04151814e`)
**Reviewed:** 2026-10-06 against `main`

## 1. Overview

Company verification (KYC) wizard for a signed-in tenant, plus the in-app entry point and
the free-beta announcement shown during onboarding.

| Step | Route | Component | Endpoint(s) (`src/api/endpoints/corporate.ts`) |
|------|-------|-----------|-----------------------------------------------|
| Entry | dashboard banner | `src/components/feedback/KycOnboardingBanner.tsx`, `src/hooks/useKycOnboarding.ts` | `resolveOnboardingCorporate()` → `GET /rest/corporate/current.json`, fallback `GET /rest/corporate/index.json?max=1` |
| 1 Company | `/onboarding/company?id=` | `src/features/corporate/CompanyInfoPage.tsx` | `GET show/:id`, `PUT update/:id` |
| 2 Directors | `/onboarding/directors?id=` | `DirectorsPage.tsx` | `/rest/corporateAccountPerson/{index,save,update,delete}` |
| 3 Documents | `/onboarding/documents?id=` | `DocumentsPage.tsx` | `/rest/corporateDocuments/{index,save,delete}` (multipart), `POST /rest/corporate/submitKyc/:id.json` |
| 4 Status | `/onboarding/status?id=` | `KycStatusPage.tsx` | `GET show/:id` (`kycStatus`) |

Tests: `src/features/corporate/__tests__/{CompanyInfo,Directors,Documents,KycStatus}Page.test.tsx`,
`src/components/feedback/__tests__/KycOnboardingBanner.test.tsx`, `src/hooks/__tests__/useKycOnboarding.test.tsx`,
E2E `e2e/onboarding.spec.ts`, `soupfin-55-kyc-entry-point.spec.ts`, `soupfin-62-corporate-current.spec.ts`,
`soupfin-84-kyc-help-links.spec.ts`, `soupfin-86-kyc-back-button.spec.ts`. No LXC integration spec.

## 2. Current status

Works on main:
- Dashboard banner opens the wizard (SOUPFIN-55, cee050c).
- Step 1 Back returns to `/dashboard` (SOUPFIN-86, ace4d2c — `CompanyInfoPage.tsx:178`).
- `current.json` failures no longer read as "no corporate" (SOUPFIN-62 frontend part, f0404de).

Broken / missing:
- **Documents page still tells users to upload director IDs on the Directors page** (`DocumentsPage.tsx:378`); fix only on unmerged branch `feature/20260929-153547-…-soupfin-85-…` (SOUPFIN-85).
- **No CSRF on KYC POSTs** — `createCorporate`, `addDirector`, `uploadDocument`, `submitKyc` never fetch `SYNCHRONIZER_TOKEN`; Grails answers 302 without it. Unit tests mock the API, so nothing has proven the wizard persists against a real backend. `submitKyc` action existence unverified.
- **Corporate bootstrap**: `createCorporate` has no caller; under tenant-per-Account a fresh tenant may have no Corporate at all, and the wizard requires `?id=`. Needs a decision once `corporate/current.json` exists (SOUPFIN-62).
- **Director ID upload** missing (SOUPFIN-87; backend field `CorporateAccountPerson.proofOfIdentity` exists).
- **Free-beta banner** + blank invoice PDF fix only on unmerged branch (SOUPFIN-89).
- **No i18n** in any onboarding page despite `locales/*/corporate.json`.

## 3. Task review

| ID | Title | State change | Evidence / notes |
|----|-------|--------------|------------------|
| SOUPFIN-55 | KYC wizard has no entry point | In Review → **Done** | cee050c on main; banner + hook tests; `soupfin-55-kyc-entry-point.spec.ts` |
| SOUPFIN-62 | Backend: no `CorporateController.current` | In Review → **Backlog** | Frontend mitigation f0404de merged; backend action unconfirmed. Plan `plans/soupfin-62-corporate-current-endpoint.md` |
| SOUPFIN-69 | Drop corporate index fallback | In Progress → **Cancelled** | Duplicate of SOUPFIN-70 |
| SOUPFIN-70 | Drop corporate index fallback | In Review → **Backlog** | Blocked on SOUPFIN-62 deploy |
| SOUPFIN-85 | Documents page points to nonexistent ID upload | In Review (unchanged) | Fix 8324f24 on unmerged branch; merge after rebase (15 behind) |
| SOUPFIN-86 | Step 1 Back → /register | In Review (**should be Done**) | ace4d2c on main + `soupfin-86-kyc-back-button.spec.ts`. State change was blocked by the permission system — needs a manual move |
| SOUPFIN-87 | Director ID (proofOfIdentity) upload | Backlog (unchanged) | Needs SOUPFIN-196 save path first |
| SOUPFIN-89 | Free-beta banner + blank invoice PDF (retitled from "free beta usage") | Backlog → **In Review** | 07ce682 + ed11dff on unmerged branch `…-soupfin-89-issue-free-bet`; `utils/pdf/index.ts:54` still `left=-9999px` on main. Banner text says "until November 2027"; product now says "free until end of 2027" — fix the text before merging |
| SOUPFIN-196 | KYC POSTs send no CSRF; verify on LXC | **new** (Todo, bug) | `corporate.ts:22,149,191,226` |
| SOUPFIN-198 | i18n: onboarding pages | **new** (Todo) | No `useTranslation` in `features/corporate/*` |

## 4. Remaining work plan

1. **Merge ready branches**: rebase + merge SOUPFIN-85 (remove dead director-ID card) and SOUPFIN-89 (banner copy updated to "free until end of 2027"; PDF fix — check it against invoice work in SOUPFIN-92). Closes **SOUPFIN-85, SOUPFIN-89**.
2. **Make the wizard persist for real**: CSRF on every save, verify `submitKyc`, LXC integration spec walking all 4 steps with screenshots. Closes **SOUPFIN-196** (may create a backend-required follow-up for `submitKyc`).
3. **Corporate resolution**: backend `current` action (plan exists) → then drop the index fallback and decide how a tenant with no Corporate starts KYC (create one on step 1 via `createCorporate`). Closes **SOUPFIN-62, SOUPFIN-70**.
4. **Director ID upload** on the person modal (base64 `proofOfIdentity`), show it in the directors table, restore Documents-step guidance, update the user guide. Closes **SOUPFIN-87**.
5. **i18n** for all four steps and the banner. Closes **SOUPFIN-198**.

## 5. Backend dependencies

| Need | Task | Plan |
|------|------|------|
| `CorporateController.current` | SOUPFIN-62 | `plans/soupfin-62-corporate-current-endpoint.md` |
| `submitKyc` action (if missing) | from SOUPFIN-196 | to write after LXC check |
| `CorporateAccountPerson.proofOfIdentity` binding via save/update | SOUPFIN-87 | verify on LXC first; field already exists |

## 6. Related QBO-parity / COA tasks

- SOUPFIN-151 — industry captured at registration *and onboarding* (adds a field to step 1).
- SOUPFIN-142 / SOUPFIN-147 — COA template picker; first-run onboarding is the natural place to surface "set up your chart of accounts".
- SOUPFIN-101 — accountant invite (KYC directors vs. invited users should stay distinct).

## 7. Definition of done

- A signed-in tenant with no approved KYC sees the banner, completes all four steps on LXC, and every step persists (integration spec green).
- Corporate resolved from `current.json` only; no index fallback.
- Directors can attach an ID; Documents step text matches what the UI can do.
- Free-beta banner shows the agreed end date; all onboarding text is translated in en/de/fr/nl.
