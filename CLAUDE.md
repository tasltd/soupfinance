# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

| Task | Command |
|------|---------|
| Get issues | `./scripts/get-issues.sh --project SOUPFINANCE --markdown` |
| Dev server | `cd soupfinance-web && npm run dev` |
| Dev with backend | `cd soupfinance-web && npm run dev:lxc` |
| Build | `cd soupfinance-web && npm run build` |
| Lint | `cd soupfinance-web && npm run lint` |
| Unit tests | `cd soupfinance-web && npm run test:run` |
| Single test file | `cd soupfinance-web && npx vitest run src/path/to/test.ts` |
| Test by name | `cd soupfinance-web && npx vitest run -t "test name"` |
| E2E tests | `cd soupfinance-web && npm run test:e2e` |
| E2E single file | `cd soupfinance-web && npm run test:e2e -- e2e/auth.spec.ts` |
| E2E against LXC | `cd soupfinance-web && npm run test:e2e:lxc` |
| E2E all (LXC) | `cd soupfinance-web && npm run test:e2e:lxc:all` |
| E2E integration only | `cd soupfinance-web && npx playwright test --config=playwright.lxc.config.ts e2e/integration/` |
| E2E report | `cd soupfinance-web && npm run test:e2e:report` |
| E2E LXC report | `cd soupfinance-web && npm run test:e2e:lxc:report` |
| Test coverage | `cd soupfinance-web && npm run test:coverage` |
| Preview build | `cd soupfinance-web && npm run preview` |
| Storybook | `cd soupfinance-web && npm run storybook` |
| Build Storybook | `cd soupfinance-web && npm run build-storybook` |
| Start backend | `cd backend && ./tomcat-control.sh start` |
| Backend status | `cd backend && ./tomcat-control.sh status` |
| Deploy frontend | `cd soupfinance-web && ./deploy/deploy-to-production.sh` |
| Deploy landing | `cd soupfinance-landing && ./deploy-landing.sh` |

## Project Overview

**SoupFinance** is a corporate accounting/invoicing platform (React frontend + Grails backend). Part of the Soupmarkets ecosystem.

| Component | Purpose | Details |
|-----------|---------|---------|
| `soupfinance-web/` | React 19 + TypeScript + Vite 7 + TailwindCSS v4 | Main app — see `soupfinance-web/CLAUDE.md` for detailed patterns |
| `soupfinance-landing/` | Static HTML marketing site | www.soupfinance.com — see `soupfinance-landing/CLAUDE.md` |
| `backend/` | LXC container with Grails WAR | Local development backend |
| `soupfinance-designs/` | HTML mockups (114 screens) | Design reference only |
| `plans/` | Architecture plans and backend change requests | Implementation plans |
| `prd/` | Product Requirements Documents | Modular PRD (see `PRD.md` for index) |
| `docs/` | User journeys, validation reports | Reference documentation |
| `scripts/` | Utility scripts | `get-issues.sh` (symlink to shared scripts) |

**Tech Stack:** React 19 · TypeScript · Vite 7 · TailwindCSS v4 · Zustand (state) · TanStack Query (data) · React Hook Form + Zod (forms) · Recharts (charts) · Axios (HTTP) · Vitest + Playwright (tests) · Storybook 10 · i18next (4 languages: en/de/fr/nl, 12 namespaces)

---

## Critical Rules (MUST READ)

| Rule | File | Summary |
|------|------|---------|
| **Tenant Architecture** | [plans/soupfinance-tenant-architecture-refactor.md](plans/soupfinance-tenant-architecture-refactor.md) | Tenant-per-Account: Registration creates new `Account`, NOT Corporate |
| **Domain Architecture** | [.claude/rules/soupfinance-domain-architecture.md](.claude/rules/soupfinance-domain-architecture.md) | `www.soupfinance.com` = landing (NO login), `app.soupfinance.com` = React app |
| **Backend Tenant** | [.claude/rules/soupfinance-backend-tenant.md](.claude/rules/soupfinance-backend-tenant.md) | Uses TAS tenant at `tas.soupmarkets.com`, registration via `/account/*` |
| **Backend Changes** | [.claude/rules/backend-changes-workflow.md](.claude/rules/backend-changes-workflow.md) | Do NOT modify backend directly; create plans in `plans/` |
| **Gradle Concurrency** | [.claude/rules/gradle-concurrent-tasks.md](.claude/rules/gradle-concurrent-tasks.md) | NEVER run concurrent Gradle tasks in same project |
| **Port Configuration** | [.claude/rules/port-configuration.md](.claude/rules/port-configuration.md) | Vite 5173, E2E 5180, Storybook 6006, Backend 9090 |
| **Design System** | [.claude/rules/soupfinance-design-system.md](.claude/rules/soupfinance-design-system.md) | Tailwind v4 tokens, Manrope font, Material Symbols icons |
| **API JSON Only** | [.claude/rules/soupfinance-api-json.md](.claude/rules/soupfinance-api-json.md) | Use `application/json` for all requests, NOT form-urlencoded |
| **E2E Testing** | [.claude/rules/e2e-testing-patterns.md](.claude/rules/e2e-testing-patterns.md) | Token from sessionStorage (not localStorage), dual-storage strategy |
| **Deployment** | [.claude/rules/soupfinance-deployment.md](.claude/rules/soupfinance-deployment.md) | SSH key `crypttransact_rsa` required, NOT id_rsa |
| **Deployment Restrictions** | [.claude/rules/deployment-restrictions.md](.claude/rules/deployment-restrictions.md) | **NEVER** deploy to Soupmarkets prod IPs; only soupfinance frontend/landing |
| **Cloudflare SSL** | [.claude/rules/cloudflare-ssl-configuration.md](.claude/rules/cloudflare-ssl-configuration.md) | Apache MUST have SSL VirtualHost on port 443 for Cloudflare |
| **Server VHosts** | [.claude/rules/production-server-vhosts.md](.claude/rules/production-server-vhosts.md) | All Apache VHost configs for 65.20.112.224, proxy routes, SSL certs |

---

## Tenant Architecture (CRITICAL)

**Tenant-per-Account model:** Each customer gets their own `Account` (not Corporate entities in a shared tenant).

**Business Types:** TRADING (inventory/COGS) or SERVICES (labor expenses, no inventory)

| Flow | Endpoint | Notes |
|------|----------|-------|
| Registration | `POST /account/register.json` | Creates Account + Agent + SbUser |
| Email Confirm | `POST /account/confirmEmail.json` | Sets password, enables user |
| Invoice Clients | `/rest/invoiceClient/*` | NOT `/rest/client/*` (investment clients) |

---

## Architecture

### Frontend Structure (`soupfinance-web/src/`)

```
api/                    # Axios client + endpoint modules
├── client.ts          # Base instance, auth interceptors, CSRF helpers, response normalization
└── endpoints/         # Feature-specific: invoices, bills, vendors, ledger, corporate, reports, etc.
components/
├── layout/            # MainLayout, AuthLayout, SideNav, TopNav
├── forms/             # Input, Select, Textarea, Checkbox, Radio, DatePicker
├── feedback/          # AlertBanner, Spinner, Toast, Tooltip, ToastProvider
├── tables/            # Data table components
└── ErrorBoundary.tsx  # Global React error boundary
features/              # Page components by domain (auth, dashboard, invoices, bills, vendors,
│                      #   payments, ledger, accounting, reports, clients, corporate, settings)
hooks/                 # usePdf, useEmailSend, useDashboardStats, useLedgerAccounts, useTransactions
i18n/                  # 4 languages (en, de, fr, nl), 12 namespaces
schemas/               # Zod runtime validation (dev: throw, prod: log only)
stores/                # Zustand: authStore, uiStore, accountStore (currency/company settings)
types/                 # TypeScript interfaces mirroring Grails domains
utils/                 # frontendLogger (sends errors to /rest/frontendLog/batch.json), logger
App.tsx                # Routes + providers (ProtectedRoute, PublicRoute wrappers)
```

### API Patterns (CRITICAL)

| Pattern | Detail |
|---------|--------|
| **Auth Header** | `X-Auth-Token: {token}` (NOT Bearer) |
| **Login** | POST `/rest/api/login` with JSON body |
| **Data Content-Type** | `application/json` for all requests |
| **Token Validation** | GET `/rest/user/current.json` on app mount |
| **Invoice Clients** | `/rest/invoiceClient/*` (NOT `/rest/client/*` which is for investment clients) |
| **CSRF Token** | **REQUIRED** for all POST/PUT/DELETE - fetch from `create.json`/`edit.json` first |
| **Foreign Keys** | Use nested objects `{ vendor: { id: "uuid" } }` not `vendor.id` |
| **Registration** | Goes through `/account/*` proxy (not `/rest/*`) |
| **App Identification** | Backend identifies the app via the `Api-Authorization` header injected by the proxy (ApiAuthenticatorInterceptor resolves the ApiConsumer name) |

#### Grails REST URL Pattern

```
GET    /rest/{controller}/index.json         # List (paginated)
GET    /rest/{controller}/show/{id}.json     # Read
GET    /rest/{controller}/create.json        # Get CSRF token (for new)
GET    /rest/{controller}/edit/{id}.json     # Get CSRF token (for update)
POST   /rest/{controller}/save.json          # Create
PUT    /rest/{controller}/update/{id}.json   # Update
DELETE /rest/{controller}/delete/{id}.json   # Delete (soft)
```

#### CSRF Token Flow

1. GET `/rest/{controller}/create.json` → response includes `SYNCHRONIZER_TOKEN` + `SYNCHRONIZER_URI`
2. Include both in subsequent POST/PUT/DELETE JSON body
3. For updates: call `edit.json` instead of `create.json`
4. Without token, POST returns 302 redirect (not JSON)
5. Use `getCsrfToken()` / `getCsrfTokenForEdit()` helpers from `client.ts`

#### File/Image Upload

Backend `SoupBrokerFileUtilityService` accepts three formats for any `SoupBrokerFile` property:
- **Base64 String**: `logo: "data:image/png;base64,..."` (auto-detected via `Base64.isBase64()`)
- **Public URL**: `logo: "https://example.com/logo.png"` (backend downloads it)
- **MultipartFile**: Standard multipart form upload with `{fieldName}File` convention

#### Response Normalization

Backend can return fields as either objects or arrays. Use helpers from `client.ts`:
- `normalizeToArray(value)` → always returns array
- `normalizeToObject(value)` → always returns object (first item if array)
- `normalizeClientAccountResponse(data)` → normalizes common response fields

#### Module-Prefixed Controllers

Some controllers have module prefixes: `/rest/finance/bill/*`, `/rest/trading/vendor/*`, `/rest/kyc/corporate/*`

Available modules: `trading`, `finance`, `funds`, `setting`, `tools`, `sales`, `kyc`, `clients`, `admin`, `staff`

#### API Quirks

- `/rest/sbUser/index.json` requires `?sort=id` (default sort not available)
- Finance reports: Use `/rest/financeReports/*` (NOT `/rest/report/*` which returns 404)
- `/rest/bill/index.json` may return 302 — needs `Accept: application/json` header

### Proxy Configuration & Api-Authorization

Both the Vite dev server and production Apache proxy API requests to the Grails backend. The proxy injects an `Api-Authorization: Basic base64(consumerId:secret)` header on **all** proxied paths. This authenticates the app as an `ApiConsumer` with the backend's `ApiAuthenticatorInterceptor` — the secret never reaches the browser.

| Path | Target | Notes |
|------|--------|-------|
| `/rest/*` | Backend (Grails) | Main API |
| `^/account/` | Backend | Tenant registration (regex to avoid matching `/accounting/*`) |
| `/client/*` | Backend | Public client APIs |

| Environment | Where credentials live |
|-------------|----------------------|
| Development | `.env.lxc.local` (git-ignored) — `VITE_API_CONSUMER_ID` + `VITE_API_CONSUMER_SECRET` |
| Production | Apache VHost config on 65.20.112.224 (`RequestHeader set Api-Authorization ...`) |

### Routing Conventions

- REST-style: `/invoices`, `/invoices/new`, `/invoices/:id`, `/invoices/:id/edit`
- `ProtectedRoute`: Requires auth, validates token on mount, shows loading while initializing
- `PublicRoute`: Redirects to dashboard if authenticated
- Settings nested: `/settings/users`, `/settings/bank-accounts`, `/settings/account`

---

## Testing

### Unit Tests (Vitest + React Testing Library)

- Axios globally mocked in `src/test/setup.ts` — no real HTTP in unit tests
- Render with `QueryClientProvider` + `MemoryRouter` wrappers
- Mock API at module level: `vi.mock('../../../api/endpoints/invoices', ...)`
- Mock hooks when needed: `vi.mock('../../../hooks', ...)`

### E2E Tests (Playwright)

| Mode | Command | Config |
|------|---------|--------|
| Mock (default) | `npm run test:e2e` | `playwright.config.ts` (port 5180) |
| Mock headed | `npm run test:e2e:headed` | Same, with browser UI |
| Mock interactive | `npm run test:e2e:ui` | Playwright UI |
| LXC backend | `npm run test:e2e:lxc` | `playwright.lxc.config.ts` |
| LXC headed | `npm run test:e2e:lxc:headed` | Same, with browser UI |
| LXC all tests | `npm run test:e2e:lxc:all` | All tests (mock + integration) against real backend |

**Key patterns:**
- Auth token dual-storage: ALWAYS check both `localStorage` and `sessionStorage` (`rememberMe=true` → localStorage, default → sessionStorage)
- Use `isLxcMode()` from fixtures to conditionally skip mock-only tests
- Use `data-testid` attributes: `{feature}-page`, `{feature}-form`, `{feature}-submit-button`, `{feature}-table`
- Handle session expiry in LXC mode before asserting
- Integration tests live in `e2e/integration/` and follow `*.integration.spec.ts` naming (only run against LXC backend)

### Test Credentials (LXC Backend)

| Username | Password | Roles | Use Case |
|----------|----------|-------|----------|
| `soup.support` | `secret` | ROLE_ADMIN, ROLE_USER | Primary admin (seed data, works cross-tenant) |
| `fui@techatscale.io` | `fui@techatscale.io` | ROLE_ADMIN, ROLE_USER | TAS tenant admin (fallback) |
| `fui.nusenu` | `secret` | ROLE_USER | Demo tenant user |

---

## Local Backend (LXC)

```bash
cd backend
./tomcat-control.sh start               # Start (starts LXC containers if needed)
./tomcat-control.sh status              # Check status, get container IP (10.115.213.183)
./tomcat-control.sh logs                # View Tomcat logs
./tomcat-control.sh stop                # Stop when done
```

**Deploy new WAR** (requires soupmarkets-web repo):
```bash
cd /path/to/soupmarkets-web
source env-variables.sh && ./gradlew assembleDeployToSoupfinance
```

**Database** (LXC MariaDB): Host `soupmarkets-mariadb`, DB `soupbroker_soupfinance`, User `soupbroker`

**Request flow:** Browser → Vite dev server (5173) → proxy `/rest/*` → LXC Backend (10.115.213.183:9090) → MariaDB (10.115.213.114:3306)

---

## Deployment

| Property | Value |
|----------|-------|
| Origin Server | 65.20.112.224 |
| Backend API | tas.soupmarkets.com (via Apache proxy) |
| Deploy Dir | /var/www/soupfinance |
| SSH Key | `~/.ssh/crypttransact_rsa` (NOT id_rsa) |

**CRITICAL:** Sites only accessible via domain names, NEVER via direct IP. **NEVER** deploy to Soupmarkets production IPs (140.82.32.141, tas.soupmarkets.com, edge.soupmarkets.com).

**Production architecture:** Client → Cloudflare (DNS/SSL) → Apache (65.20.112.224) → Static files OR proxy `/rest/*` `/account/*` to tas.soupmarkets.com

---

## Implementing Features

1. Check `soupfinance-designs/` for HTML mockups (114 screens covering all UI states)
2. Use existing feature modules as templates (copy invoice patterns for new entities)
3. Follow design system: primary `#f24a0d`, font Manrope, icons Material Symbols Outlined
4. Include dark mode variants (`dark:` prefix)
5. Add i18n keys to all 4 language files in `src/i18n/locales/{lang}/`
6. Backend changes needed? Create a plan in `plans/` — do NOT modify backend directly
7. All implementation plans (frontend and backend) go in `plans/`; backend-specific plans also go in the `soupmarkets-web` repo

## Git

| Remote | URL |
|--------|-----|
| origin | https://github.com/tasltd/soupfinance |
| gitlab | git@gitlab.com:tasltd/soupfinance.git |

Part of **Soupmarkets** ecosystem (see `../CLAUDE.md`).

**Important:** Only commit/push changes to this repo. If backend changes are needed in soupmarkets-web, inform the user but do not commit to other repos.

**Note:** For detailed frontend patterns (API layer, hooks, state management, testing), see `soupfinance-web/CLAUDE.md`.
