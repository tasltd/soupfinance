# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SoupFinance** is a corporate accounting/invoicing platform with a React frontend and HTML design assets. Part of the Soupmarkets ecosystem.

| Component | Tech Stack | Status |
|-----------|------------|--------|
| `soupfinance-web/` | React 19 + TypeScript + Vite 7 + TailwindCSS v4 | Active development |
| `soupfinance-landing/` | Static HTML + TailwindCSS | Marketing site |
| `soupfinance-designs/` | HTML mockups + screenshots (114 screens) | Design reference |
| `backend/` | LXC container running Spring Boot WAR | Local development |

## Tenant Architecture

**Status:** Registration Complete, Client CRUD Pending
**See [plans/soupfinance-tenant-architecture-refactor.md](plans/soupfinance-tenant-architecture-refactor.md) for full details.**

| Aspect | Description |
|--------|-------------|
| **Registration** | `POST /account/register.json` creates Account + Agent + SbUser (tenant-isolated) |
| **Email Confirmation** | `POST /account/confirmEmail.json` sets password and enables user |
| **Business Type** | TRADING (inventory-based, has COGS) or SERVICES (labor expenses, no inventory) |
| **Invoice Clients** | Use `/rest/invoiceClient/*` (NOT `/rest/client/*` which is for investment clients) |

**Backend Branch**: `feature/soupfinance-tenant-registration` (worktree: `soupmarkets-web-soupfinance-tenant/`)

---

## Critical Rules (MUST READ)

| Rule | Location | Summary |
|------|----------|---------|
| **Tenant Architecture** | [plans/soupfinance-tenant-architecture-refactor.md](plans/soupfinance-tenant-architecture-refactor.md) | Tenant-per-Account: Registration creates new `Account`, NOT Corporate |
| **Domain Architecture** | [.claude/rules/soupfinance-domain-architecture.md](.claude/rules/soupfinance-domain-architecture.md) | `www.soupfinance.com` = landing (NO login), `app.soupfinance.com` = React app |
| **Backend Tenant** | [.claude/rules/soupfinance-backend-tenant.md](.claude/rules/soupfinance-backend-tenant.md) | Uses TAS tenant at `tas.soupmarkets.com`, registration via `/account/*` |
| **Backend Changes** | [.claude/rules/backend-changes-workflow.md](.claude/rules/backend-changes-workflow.md) | Do NOT modify backend directly; create plans in `.claude/plans/` |
| **Gradle Concurrency** | [.claude/rules/gradle-concurrent-tasks.md](.claude/rules/gradle-concurrent-tasks.md) | NEVER run concurrent Gradle tasks in same project |
| **Port Configuration** | [.claude/rules/port-configuration.md](.claude/rules/port-configuration.md) | Vite 5173, E2E 5180, Storybook 6006, Backend 9090 |
| **Design System** | [.claude/rules/soupfinance-design-system.md](.claude/rules/soupfinance-design-system.md) | Tailwind v4 tokens, Manrope font, Material Symbols icons |
| **E2E Testing** | [.claude/rules/e2e-testing-patterns.md](.claude/rules/e2e-testing-patterns.md) | Token from sessionStorage (not localStorage), dual-storage strategy |
| **Deployment** | [.claude/rules/soupfinance-deployment.md](.claude/rules/soupfinance-deployment.md) | SSH key `crypttransact_rsa` required, NOT id_rsa |
| **Cloudflare SSL** | [.claude/rules/cloudflare-ssl-configuration.md](.claude/rules/cloudflare-ssl-configuration.md) | **CRITICAL**: Apache MUST have SSL VirtualHost on port 443 for Cloudflare |

## Quick Commands

### React App (soupfinance-web/)

```bash
cd soupfinance-web

# Development
npm install && npm run dev              # Start dev server (port 5173, mock/no backend)
npm run dev:lxc                         # Dev against LXC backend (uses .env.lxc)
npm run build                           # Production build (runs tsc -b first)
npm run preview                         # Preview production build locally
npm run lint                            # ESLint

# Unit/Integration Tests (Vitest)
npm run test                            # Watch mode
npm run test:run                        # CI mode
npm run test:coverage                   # With coverage report
npx vitest run src/api/__tests__/client.test.ts    # Single file
npx vitest run -t "should attach Bearer token"    # By name

# E2E Tests (Playwright) - port 5180
npm run test:e2e                        # Headless with mocks
npm run test:e2e:headed                 # With browser UI
npm run test:e2e:ui                     # Interactive Playwright UI
npm run test:e2e -- e2e/auth.spec.ts    # Single file

# E2E against LXC backend (real API, no mocks)
npm run test:e2e:lxc                    # Headless
npm run test:e2e:lxc:headed             # With browser UI
npm run test:e2e:lxc:integration        # Integration tests only
npm run test:e2e:report                 # View last mock E2E report
npm run test:e2e:lxc:report             # View last LXC E2E report

# Storybook (component docs)
npm run storybook                       # Port 6006
npm run build-storybook                 # Build static docs
```

### Local Backend (LXC)

```bash
cd backend
./tomcat-control.sh start               # Start backend (starts LXC containers if needed)
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

### Landing Page (soupfinance-landing/)

```bash
cd soupfinance-landing
python3 -m http.server 8000             # Preview locally
./deploy-landing.sh                     # Deploy to production
```

## Architecture

### React App Structure

```
soupfinance-web/src/
├── api/                    # Axios client + endpoint modules
│   ├── client.ts          # Base instance + toFormData/toQueryString helpers
│   └── endpoints/         # Feature-specific (invoices, bills, ledger, vendors, corporate, reports)
├── components/
│   ├── layout/            # MainLayout, AuthLayout, SideNav, TopNav
│   ├── forms/             # Input, Select, Textarea, Checkbox, Radio, DatePicker
│   ├── feedback/          # AlertBanner, Spinner, Toast, Tooltip
│   └── tables/            # Data table components
├── features/              # Page components by domain
│   ├── auth/, dashboard/, invoices/, bills/, vendors/, payments/
│   ├── ledger/, accounting/, reports/
│   ├── clients/           # NEW: Individual/Corporate client management
│   └── corporate/         # Company profile management
├── i18n/                  # 4 languages (en, de, fr, nl), 12 namespaces
├── stores/                # Zustand (authStore, uiStore)
├── types/                 # TypeScript interfaces (mirrors Grails domains)
└── App.tsx                # Routes + providers
```

**Key Tech:** Zustand (state) · TanStack Query (data) · React Hook Form + Zod (forms) · Recharts (charts) · Axios (HTTP) · Vitest + Playwright (tests) · Storybook 10 (docs)

### API Patterns (CRITICAL)

| Pattern | Detail |
|---------|--------|
| **Auth Header** | `X-Auth-Token: {token}` (NOT Bearer) |
| **Login** | POST `/rest/api/login` with JSON body |
| **Data Content-Type** | `application/x-www-form-urlencoded` for POST/PUT |
| **Token Validation** | GET `/rest/user/current.json` on app mount |
| **Invoice Clients** | `/rest/invoiceClient/*` (NOT `/rest/client/*` which is for investment clients) |

**Proxy Configuration:** Vite proxies `/rest/*`, `/client/*`, and `/account/*` to backend (default `localhost:9090`, or `VITE_PROXY_TARGET` from `.env.lxc`).

**API Quirks:**
- `/rest/sbUser/index.json` requires `?sort=id` (default `dateCreated` sort not available for SbUser domain)

### Test Credentials (LXC Backend)

| Username | Password | Roles | Use Case |
|----------|----------|-------|----------|
| `test.admin` | `secret` | ROLE_ADMIN, ROLE_USER | Full admin access |
| `test.user` | `secret` | ROLE_USER | Minimal user access |
| `test.finance` | `secret` | ROLE_USER + Finance roles* | Finance CRUD testing |
| `soup.support` | `secret` | ROLE_ADMIN, ROLE_USER | Legacy admin (seed data) |
| `admin` | `secret` | ROLE_ADMIN, ROLE_USER | Legacy admin (seed data) |

*Finance roles: ROLE_INVOICE, ROLE_BILL, ROLE_LEDGER_TRANSACTION, ROLE_VENDOR, ROLE_FINANCE_REPORTS, ROLE_LEDGER_ACCOUNT, ROLE_VOUCHER

### Test Organization

```
soupfinance-web/
├── src/**/__tests__/           # Unit/integration (Vitest)
├── e2e/                        # E2E tests (Playwright)
│   ├── fixtures.ts             # authenticatedPage, mockApiResponse(), domain mocks
│   └── integration/            # LXC backend integration tests
├── playwright.config.ts        # Mock mode config (port 5180)
├── playwright.lxc.config.ts    # LXC backend config
└── playwright.integration.config.ts  # Integration-only config
```

**Important:**
- Axios is globally mocked in `src/test/setup.ts`
- E2E tests auto-start Vite dev server (see `playwright.config.ts`)
- Pages MUST fetch from API, never use mock data as fallback in production
- Use `isLxcMode()` from fixtures to conditionally skip mock-only tests

## Deployment

### Production (app.soupfinance.com)

| Property | Value |
|----------|-------|
| Origin Server | 65.20.112.224 |
| Backend API | tas.soupmarkets.com (proxied via Apache) |
| Deploy Directory | /var/www/soupfinance |
| CDN | Cloudflare |

```bash
cd soupfinance-web
./deploy/deploy-to-production.sh        # Deploy frontend to app.soupfinance.com
./deploy/deploy-to-demo.sh              # Deploy frontend (alternate)
```

**CRITICAL:** Sites are ONLY accessible via domain names, NEVER via direct IP.

### Production Logs & Debugging

| Log | Server | Path |
|-----|--------|------|
| Frontend Apache | 65.20.112.224 | `/var/log/apache2/app.soupfinance.com-*.log` |
| Backend Tomcat | 140.82.32.141 | `/root/tomcat9078/logs/catalina.out` |

**Quick SSH:** `ssh root@140.82.32.141` → `tail -f /root/tomcat9078/logs/catalina.out | grep -iE 'error|exception'`

### SSH Config (Recommended)

Add to `~/.ssh/config`:
```
Host soupfinance-prod
    HostName 65.20.112.224
    User root
    IdentityFile ~/.ssh/crypttransact_rsa
    IdentitiesOnly yes
```
Then use: `ssh soupfinance-prod`

## When Implementing Features

1. Check `soupfinance-designs/` for the relevant mockup
2. Reference [.claude/rules/soupfinance-design-system.md](.claude/rules/soupfinance-design-system.md) for component patterns
3. Use existing feature modules as templates (e.g., copy invoice patterns for new entities)
4. Use Tailwind v4 tokens from `src/index.css` (`text-primary`, `bg-background-light`, etc.)
5. Include dark mode variants (`dark:bg-background-dark`)
6. Add Storybook stories for new reusable components

## Design System Quick Reference

| Property | Value |
|----------|-------|
| Primary Color | `#f24a0d` (orange) |
| Font | Manrope (Google Fonts) |
| Icons | Material Symbols Outlined |
| Dark Mode | `class` strategy on `<html>` |

See [.claude/rules/soupfinance-design-system.md](.claude/rules/soupfinance-design-system.md) for full component catalog (114 screens).

## Git Remotes

| Remote | URL |
|--------|-----|
| origin (GitHub) | https://github.com/tasltd/soupfinance |
| gitlab | git@gitlab.com:tasltd/soupfinance.git |

## Parent Project

Part of **Soupmarkets** ecosystem. Backend runs on port 9090. See `../CLAUDE.md` for ecosystem docs.
