# Feature: Dashboard, Layout, Mobile & A11y

**Reviewed**: 2026-10-06 (main @ f80bf22 / 083a461) · **TASCIM module**: Dashboard, Layout, Mobile & A11y (`17cd2b05-…`)

## 1. Overview

The signed-in app shell (sidebar, top bar, mobile drawer) and the `/dashboard` landing page that every user sees after login.

| Area | Path |
|------|------|
| Route | `/dashboard` (also `/` and `*` redirect here) — `soupfinance-web/src/App.tsx:262` |
| Page | `src/features/dashboard/DashboardPage.tsx` (KPI cards, KYC banner, backend-warning banner, Recent Invoices) |
| Stats hook | `src/hooks/useDashboardStats.ts` — client-side totals from `listInvoices({max:1000})` + `listBills({max:1000})` |
| Animations | `src/hooks/useGsapAnimations.ts` (`useDashboardEntrance`, `data-anim` attributes) |
| Layout | `src/components/layout/MainLayout.tsx`, `SideNav.tsx`, `TopNav.tsx`, `LanguageSwitcher.tsx`; state in `src/stores/uiStore.ts` |
| i18n | `src/i18n/` — 4 languages × 12 namespaces; `locales/*/dashboard.json` exists but the dashboard does not use it |
| API | `GET /rest/invoice/index.json`, `GET /rest/bill/index.json` (via `api/endpoints/invoices.ts`, `bills.ts`) |
| Unit tests | `src/hooks/__tests__/useDashboardStats.test.tsx`, `src/components/layout/__tests__/{SideNav,nav-accessible-names,phone-width-layout}.test.tsx` |
| E2E | `e2e/dashboard.spec.ts` (14/16 failing, SOUPFIN-77), `e2e/soupfin-63-nav-accessible-names.spec.ts`, `e2e/soupfin-76-mobile-drawer-closes.spec.ts`, `e2e/soupfin-91-phone-width.spec.ts` |
| Designs | `financial-overview-dashboard/`, `empty-state-welcome-dashboard/`, `loading-dashboard-skeleton/`, `interactive-notification-dropdown/`, `interactive-user-profile-dropdown/`, `form-search-autocomplete/`, `mobile-*` (12) |

## 2. Current status

**Works**
- The nav chrome has clean accessible names (SOUPFIN-63, 77cb51c).
- The mobile drawer closes on every navigation (SOUPFIN-76, 00bb97e).
- No signed-in page scrolls sideways on phones (SOUPFIN-91, 71be30d: `min-w-0` on the MainLayout column, truncated top-bar user name).
- The dashboard has KPI skeletons, a stats error state, a 403/5xx permission-warning banner, a KYC onboarding banner, a "Need Help?" link and GSAP entrance.

**Broken / missing (evidence)**
- `DashboardPage.tsx` has no `useTranslation`. Every string is English while `dashboard.json` sits unused. "View all" is a raw `<a href>` that reloads the page. Rows are not clickable. Recent Invoices loading is plain "Loading...". There is no DashboardPage unit test.
- KPIs: `calculateStats` hardcodes every `*Change` to 0. Net profit mixes all-time revenue with MTD expenses. Data is truncated at 1000 records. There is no Overdue KPI.
- Designed sections missing: Cash Flow Over Time chart, Invoice Status breakdown, quick actions, recent bills. The welcome / first-run dashboard and setup checklist are not built.
- Top bar:
  - The notifications red dot is always on and the panel is a static "no data" stub that does not close on Escape or outside click. The panel clips at 320/360px (SOUPFIN-94).
  - The global search input has no handlers.
  - The avatar has no menu.
- Mobile: no bottom nav and no card lists (all 12 `mobile-*` designs unbuilt).
- A11y: about 357 feature-page icon spans still leak ligatures into accessible names (SOUPFIN-71). There is no automated axe audit.

## 3. Task review

| ID | Title | State | Evidence / notes |
|----|-------|-------|------------------|
| SOUPFIN-63 | SideNav icon ligature leaks into link names | In Review → **Done** | 77cb51c (#39), nav-accessible-names.test.tsx, soupfin-63 spec |
| SOUPFIN-71 | Sweep aria-hidden onto remaining feature icons | In Review → **Todo** | Not merged. 360 spans on main; WIP branch `…soupfin-71-issue-sweep-ar` (28a8819) timed out |
| SOUPFIN-76 | Mobile drawer stays open after nav | In Review → **Done** | 00bb97e; SideNav.tsx:93-99; SideNav.test.tsx:224-258; soupfin-76 spec |
| SOUPFIN-78 | Main column does not shrink on phones | Backlog → **Cancelled** | Duplicate of SOUPFIN-91 (min-w-0 landed in 71be30d) |
| SOUPFIN-91 | Top bar forces 514px page | Backlog → **Done** | 71be30d (#57); phone-width-layout.test.tsx; soupfin-91 spec |
| SOUPFIN-94 | Rows + notifications panel clip on small phones | Backlog → **In Review** | Unmerged WIP branch `…soupfin-94-issue-rows-and` (5d094aa) covers all five spots + spec |
| SOUPFIN-195 | Dashboard i18n, SPA links, skeleton, unit tests | new → Todo | |
| SOUPFIN-197 | KPIs: period comparison, Overdue, server summary | new → Backlog | backend-required |
| SOUPFIN-199 | Cash Flow chart, Invoice Status, quick actions | new → Backlog | |
| SOUPFIN-201 | Welcome dashboard + setup checklist | new → Todo | |
| SOUPFIN-203 | Notifications stub: fake badge, close behaviour, derived alerts | new → Todo | bug |
| SOUPFIN-204 | Global search does nothing | new → Todo | bug |
| SOUPFIN-205 | User profile menu | new → Backlog | |
| SOUPFIN-206 | Mobile bottom nav + card lists | new → Backlog | |
| SOUPFIN-207 | Automated axe checks | new → Backlog | |

Related, owned by Testing/QA: SOUPFIN-77 (`e2e/dashboard.spec.ts` fails 14/16). SOUPFIN-195 should be done alongside it.

## 4. Remaining work plan

1. **Finish phone layout.** Rebase, verify and merge the SOUPFIN-94 branch. Harvest any still-needed overflow fixes from the SOUPFIN-78 branch (4fe1ffe). Closes SOUPFIN-94.
2. **Stop the shell lying to users.** Remove the fake notification dot and add close and focus behaviour plus derived alerts (SOUPFIN-203). Either wire the global search or hide it (SOUPFIN-204). Update guide line 373 (SOUPFIN-213, Help module).
3. **Dashboard hygiene.** Translate the page, use client-side links, add skeleton rows and a DashboardPage unit test. Fix e2e/dashboard.spec.ts together with SOUPFIN-77. Closes SOUPFIN-195.
4. **First-run experience.** Welcome dashboard with setup checklist (SOUPFIN-201). It absorbs the KycOnboardingBanner placement.
5. **Accessibility.** Per-area icon sweep (SOUPFIN-71), then an axe baseline spec (SOUPFIN-207).
6. **Real KPIs (backend).** Write `plans/soupfinance-dashboard-summary-endpoint.md`, implement it in soupmarkets-web, then switch useDashboardStats (SOUPFIN-197).
7. **Design completion.** Charts, invoice status, quick actions (SOUPFIN-199); profile menu (SOUPFIN-205); mobile bottom nav and card lists (SOUPFIN-206).

## 5. Backend dependencies

- **SOUPFIN-197**: dashboard summary endpoint (revenue, expenses, net profit, outstanding, overdue for current and previous period) that works on a SERVICES tenant. The plan is not yet written; create `plans/soupfinance-dashboard-summary-endpoint.md` and its soupmarkets-web counterpart first. Context: `plans/soupfinance-ledger-accounting-module-enablement.md` (financeReports 403 on SERVICES).
- Persistent notifications (read/unread, server-pushed) are not planned. SOUPFIN-203 is deliberately frontend-only.

## 6. Related QBO-parity / COA tasks

- SOUPFIN-137: AI assistant (insights, reminders). Future source for dashboard insights and notifications.
- SOUPFIN-124: vendor bill tracking with due-date reminders. Feeds "bills due" alerts in SOUPFIN-203.
- SOUPFIN-108: cash flow forecasting. Would extend the SOUPFIN-199 cash-flow chart.
- SOUPFIN-138: collaboration (@mentions). Would add notification types.
- SOUPFIN-142: COA seeding epic. Prerequisite for meaningful ledger-based KPIs on new tenants.

## 7. Definition of done

- Every signed-in page fits 320px with no clipped controls (soupfin-91/94 specs green).
- The dashboard is fully translated in en/de/fr/nl and has unit tests for loading, error, warning, empty and populated states. e2e/dashboard.spec.ts passes.
- KPIs come from a server summary with a real previous-period comparison and include Overdue.
- New tenants see the welcome dashboard with a working setup checklist.
- No dead controls in the top bar: search works, the notifications badge reflects real alerts, and the profile menu exists.
- No icon ligature leaks into an accessible name. The axe spec has no serious or critical violations outside a documented, shrinking allow-list.
