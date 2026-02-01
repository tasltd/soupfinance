# Product Overview

[← Back to PRD Index](../PRD.md)

---

## System Components

| Component | Description | Technology |
|-----------|-------------|------------|
| **Web Application** | React SPA for authenticated users | React 19, TypeScript, Vite 7, TailwindCSS v4 |
| **Marketing Site** | Public landing page | Static HTML, TailwindCSS |
| **Backend API** | REST API services | Grails/Spring Boot (soupmarkets-web) |
| **Design System** | 114 screen mockups | HTML reference designs |

---

## Domain Architecture

| Domain | Purpose | Authentication |
|--------|---------|----------------|
| `www.soupfinance.com` | Marketing/landing page | None (public) |
| `app.soupfinance.com` | Web application | Required (X-Auth-Token) |

**Important:** Sites are ONLY accessible via domain names, NEVER via direct IP.

---

## Business Types

SoupFinance supports two business models that determine the default Chart of Accounts:

| Type | Description | Chart of Accounts |
|------|-------------|-------------------|
| **TRADING** | Inventory-based businesses (retail, wholesale, manufacturing) | Includes Inventory, COGS, Purchase accounts |
| **SERVICES** | Service-based businesses (consulting, professional services) | Focus on Labor, Operating Expenses |

### TRADING Business
- Suitable for retail, wholesale, manufacturing
- Includes inventory tracking accounts
- Cost of Goods Sold (COGS) accounts
- Purchase and inventory adjustment accounts

### SERVICES Business
- Suitable for consulting, professional services
- Focus on labor and operating expenses
- No inventory-related accounts
- Simplified expense structure

---

## Tenant Architecture

SoupFinance uses a **Tenant-per-Account** architecture:

- Each customer = separate Account (tenant)
- Complete data isolation between tenants
- All queries filtered by tenantId
- Default Chart of Accounts created based on businessType

### Registration Creates:
1. New Account (tenant discriminator)
2. Admin Agent (first user with ROLE_ADMIN)
3. Default Chart of Accounts
4. Default ledger account categories

---

## Technology Stack

### Frontend
- **React 19** + React DOM 19
- **TypeScript** ~5.9.3 (strict mode)
- **Vite 7.2.4** (build tool, dev server)
- **TailwindCSS 4.1.18** (styling with design tokens)
- **React Router 7** (routing)

### State Management
- **Zustand 5** (client state)
- **TanStack Query 5** (server state/caching)

### Forms & Validation
- **React Hook Form 7** (form management)
- **Zod 4** (schema validation)

### HTTP & i18n
- **Axios 1.13** (HTTP client)
- **i18next 25** (internationalization)

### Testing
- **Vitest 4** (unit/integration)
- **Playwright 1.57** (E2E)
- **Testing Library React 16** (component testing)

### Documentation
- **Storybook 10** (component docs)
