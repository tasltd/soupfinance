# SoupFinance: Gemini CLI Context

This file provides a comprehensive overview of the SoupFinance project, its architecture, development workflows, and conventions to guide future Gemini CLI interactions.

## 1. Project Overview

**SoupFinance** is a corporate accounting and invoicing platform designed for small-to-medium businesses (SMBs). It supports both **TRADING** (inventory-based) and **SERVICES** (labor-based) business models.

### Core Components
- **`soupfinance-web/`**: The main React SPA (Single Page Application).
- **`backend/`**: Management scripts for the Grails/Spring Boot backend running in LXC containers.
- **`soupfinance-landing/`**: Static marketing landing page (`www.soupfinance.com`).
- **`prd/` & `plans/`**: Extensive product requirements and implementation plans.

### Technology Stack
- **Frontend**: React 19, TypeScript, Vite 7, TailwindCSS v4, Zustand (state), TanStack Query (data fetching).
- **Backend**: Grails 6 / Spring Boot (running in LXC).
- **Database**: MariaDB (running in LXC).
- **Testing**: Vitest (unit/integration), Playwright (E2E/Integration).
- **Deployment**: Apache-based hosting with proxying to the Grails backend.

---

## 2. Building and Running

### Prerequisites
- **LXC Containers**: The backend requires `soupfinance-backend` and `soupmarkets-mariadb` containers to be running.
- **Environment**: Copy `soupfinance-web/.env.lxc.local.example` to `.env.lxc.local` and configure credentials.

### Key Commands

| Task | Location | Command |
| :--- | :--- | :--- |
| **Start Backend** | `backend/` | `./tomcat-control.sh start` |
| **Check Backend Status** | `backend/` | `./tomcat-control.sh status` |
| **Start Frontend (LXC)** | `soupfinance-web/` | `npm run dev:lxc` |
| **Run Unit Tests** | `soupfinance-web/` | `npm run test` |
| **Run E2E (LXC)** | `soupfinance-web/` | `npm run test:e2e:lxc` |
| **Production Build** | `soupfinance-web/` | `npm run build` |
| **Deploy to Prod** | `soupfinance-web/` | `./deploy/deploy-to-production.sh` |

---

## 3. Architecture & Conventions

### Frontend Structure (`soupfinance-web/src/`)
- **`features/`**: Organized by domain (e.g., `invoices`, `bills`, `ledger`). Each feature contains its own pages, forms, and tests.
- **`api/`**: 
    - `client.ts`: Configured Axios instances (`apiClient` for `/rest/*`, `accountClient` for `/account/*`).
    - `endpoints/`: Domain-specific API definitions.
- **`stores/`**: Zustand stores for `auth`, `ui`, and `account` (tenant) state.
- **`schemas/`**: Zod schemas for runtime validation.

### API & Data Patterns
- **CSRF Tokens**: Required for `POST` (save) operations. Fetch via `getCsrfToken(domain)` before posting. `PUT` and `DELETE` do **not** require CSRF.
- **Response Normalization**: Use `normalizeToArray` or `normalizeClientAccountResponse` in `api/client.ts` to handle inconsistent backend list/object formats.
- **Authentication**: Token-based via `X-Auth-Token` header. Dual storage in `localStorage` (remember me) or `sessionStorage`.
- **Foreign Keys**: Send nested objects (e.g., `{ vendor: { id: "uuid" } }`) rather than flat IDs.

### Styling (Tailwind v4)
- **No `tailwind.config.js`**: Configuration is via `@theme` in `src/index.css`.
- **Dark Mode**: Toggled via the `.dark` class on the `html` element. Always provide paired classes: `bg-surface-light dark:bg-surface-dark`.
- **Icons**: Material Symbols Outlined (`<span className="material-symbols-outlined">icon_name</span>`).

### Testing Conventions
- **Vitest**: Preferred for logic and component tests.
- **Playwright**: Used for E2E and real-backend integration tests.
- **LXC Integration Tests**: Must handle slow backend responses. Use `domcontentloaded` instead of `networkidle`.
- **Data Test IDs**: Use `data-testid` for all interactive elements and page containers.

---

## 4. Infrastructure & Deployment

### LXC Architecture
- **Backend IP**: Dynamic (check with `./tomcat-control.sh status`).
- **Proxy**: Vite (dev) and Apache (prod) proxy `/rest/*`, `/account/*`, and `/client/*` to the backend.
- **Api-Authorization**: A `Basic` auth header is injected by the proxy to identify the API consumer.

### Deployment
- **Target**: `app.soupfinance.com` (65.20.112.224).
- **Config**: `deploy/apache-soupfinance.conf` is the canonical Apache configuration.
- **Rule**: Never edit `deploy/app-soupfinance-com.conf` as it is not used.

---

## 5. Key Documentation Files
- `PRD.md`: Main product requirements index.
- `soupfinance-web/CLAUDE.md`: Extremely detailed developer guide for the frontend.
- `backend/README.md`: Detailed guide for backend management and API patterns.
- `plans/`: Implementation plans for ongoing features and fixes.
