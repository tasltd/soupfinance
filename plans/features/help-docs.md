# Feature: Help & Documentation

**Reviewed**: 2026-10-06 (main @ f80bf22 / 083a461) · **TASCIM module**: Help & Documentation (`375a6f3b-…`)

## 1. Overview

An end-user guide written as static HTML with screenshots, shown inside the app at `/help`. Contextual "? Need Help?" links on every page header deep-link to the matching guide section.

| Area | Path |
|------|------|
| Guide | `soupfinance-web/public/user-guide/index.html` (1162 lines, 48 section ids), `styles.css`, `images/` (39 JPGs) |
| Screenshot generator | `soupfinance-web/e2e/user-guide-screenshots.spec.ts` + `scripts/size-user-guide-images.mjs` |
| Route | `/help` → `src/features/help/HelpPage.tsx` (iframe of `/user-guide/index.html`, hash passed through; App.tsx:344) |
| Contextual links | `src/components/help/HelpLink.tsx`, `helpSections.ts` (`HELP_SECTIONS` anchor list, validated against the guide by test); used in 32 feature files |
| Sidebar entry | `SideNav.tsx` Help link (bottom) |
| Tests | `src/features/help/__tests__/HelpPage.test.tsx`, `src/components/help/__tests__/HelpLink.test.tsx`, `e2e/soupfin-75-help-route.spec.ts`, `e2e/soupfin-81-need-help-links.spec.ts`, `e2e/soupfin-84-kyc-help-links.spec.ts` |
| Other docs | `docs/USER-JOURNEYS.md`, `docs/VALIDATION-REPORT.md` (developer-facing, possibly stale) |

## 2. Current status

**Works**
- The guide covers registration, sign-in, password, KYC verification, navigation, dashboard, clients, invoices, vendors, bills, payments, ledger, accounting, vouchers, all reports, scheduled reports, settings, and support/module-not-enabled.
- `/help` embeds the guide; "Open in new tab" works.
- Every page header (including the onboarding pages) has a "Need Help?" link to a valid anchor. A unit test fails if an anchor disappears.
- The guide uses the app logo (SOUPFIN-81).

**Gaps**
- English only. `HelpPage.tsx` and `HelpLink.tsx` hardcode English ("Help", "Open in new tab", "Need Help?"), so de/fr/nl users see English on every page.
- No dark mode. The iframe wrapper is `bg-white` and the guide CSS has no dark styles.
- Accuracy: guide line 373 says the top bar search "Looks across your records", but the search input has no handler (SOUPFIN-204). The bell is shown without explaining that notifications are not implemented yet (SOUPFIN-203).
- The guide is not part of the feature DoD, so new features (welcome dashboard, notifications, search) can ship undocumented.
- Production deploy of the SOUPFIN-81 changes is unconfirmed (app.soupfinance.com is unreachable from the review sandbox).

## 3. Task review

| ID | Title | State | Evidence / notes |
|----|-------|-------|------------------|
| SOUPFIN-52 | Guide documentation | Backlog → **Done** | d7bcc4a (guide + screenshots + generator spec), extended by 81a4238 |
| SOUPFIN-75 | Route for the documentation | In Review → **Done** | 09c52db (#46), App.tsx:344, HelpPage.test.tsx, soupfin-75 spec |
| SOUPFIN-81 | Logo change + "Need Help?" anchors (+ deploy) | In Review (unchanged) | f3160a8 + 284e533 on main with tests. Waiting on production deploy confirmation |
| SOUPFIN-84 | KYC section in the guide | In Review → **Done** | 81a4238; `verify-company`/`kyc-*` anchors; soupfin-84 spec |
| SOUPFIN-212 | Translate Help page + HelpLink; guide dark mode; guide-localisation decision | new → Backlog | |
| SOUPFIN-213 | Guide accuracy (search claim) + guide step in DoD; review docs/ | new → Todo | |

## 4. Remaining work plan

1. **Ship and confirm.** Deploy the frontend with `./deploy/deploy-to-production.sh` (the app deploy script is safe). Check `https://app.soupfinance.com/help` and `/user-guide/index.html#invoices`, then close SOUPFIN-81.
2. **Accuracy.** Fix the navigation/dashboard rows that describe missing behaviour, and add the "update the guide + regenerate screenshots" line to the soupfinance-web/CLAUDE.md DoD. Closes SOUPFIN-213.
3. **Localisation and theme.** Translate the HelpPage/HelpLink strings and add dark guide CSS. Pick a guide localisation strategy: either per-language copies at `/user-guide/{lang}/` or an "English only" notice. Closes SOUPFIN-212.
4. **Keep in step with features.** As SOUPFIN-201 (welcome dashboard), 203 (notifications), 204 (search) and 205 (profile menu) land, add or refresh their guide sections and `HELP_SECTIONS` entries in the same PR.

## 5. Backend dependencies

None. The guide is static and served by Apache from `/var/www/soupfinance/user-guide/` (the RewriteCond `!-f` lets real files bypass the SPA fallback).

## 6. Related QBO-parity / COA tasks

New QBO-parity features (SOUPFIN-98 epic children such as estimates, recurring invoices, bank feeds) each need a guide section when they ship, per step 2's DoD rule. SOUPFIN-142 (COA seeding) will change the Chart of Accounts screenshots (`chart-of-accounts.jpg`). Regenerate them after it lands.

## 7. Definition of done

- `/help` and all "Need Help?" links are live in production and land on the correct section.
- Help chrome is translated in all four locales. The guide is readable in dark mode, and its language policy is implemented and stated.
- No guide sentence describes behaviour the app does not have. Screenshots match the current UI.
- The feature DoD requires a guide update for any change to a documented page.
