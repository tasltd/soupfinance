# SoupFinance Product Requirements Document (PRD)

**Version:** 1.0
**Last Updated:** January 2026
**Status:** Active Development

---

## Overview

**SoupFinance** is a corporate accounting and invoicing platform designed for small to medium businesses. It provides comprehensive financial management capabilities including invoicing, expense tracking, double-entry accounting, and financial reporting.

### Key Value Propositions

- **Multi-Tenant Architecture**: Each customer operates in an isolated Account with their own data
- **Business Type Flexibility**: Supports TRADING (inventory-based) and SERVICES (labor-based) businesses
- **Complete Accounting Suite**: Full double-entry bookkeeping with journal entries and vouchers
- **Professional Invoicing**: Create, send, track, and collect on customer invoices
- **Financial Visibility**: Real-time dashboards and comprehensive financial reports

### Target Users

- Small to medium business owners
- Finance managers and accountants
- Bookkeepers and administrative staff

---

## Document Structure

This PRD is modularized for easy navigation. Each section is a separate file that can be loaded independently.

### Core Sections

| Section | File | Description |
|---------|------|-------------|
| Product Overview | [prd/01-product-overview.md](prd/01-product-overview.md) | System components, domains, business types |
| User Roles | [prd/02-user-roles.md](prd/02-user-roles.md) | Roles, permissions, access control |
| Data Models | [prd/03-data-models.md](prd/03-data-models.md) | Entity definitions and relationships |
| Business Rules | [prd/04-business-rules.md](prd/04-business-rules.md) | Accounting, payment, and system rules |
| Internationalization | [prd/05-internationalization.md](prd/05-internationalization.md) | Languages and translation namespaces |
| Integrations | [prd/06-integrations.md](prd/06-integrations.md) | External services and backend integration |
| Non-Functional Requirements | [prd/07-non-functional-requirements.md](prd/07-non-functional-requirements.md) | Performance, security, accessibility |

### Feature Modules

| Feature | File | Priority |
|---------|------|----------|
| Authentication | [prd/features/auth.md](prd/features/auth.md) | P0 |
| Dashboard | [prd/features/dashboard.md](prd/features/dashboard.md) | P0 |
| Invoices | [prd/features/invoices.md](prd/features/invoices.md) | P0 |
| Bills | [prd/features/bills.md](prd/features/bills.md) | P0 |
| Vendors | [prd/features/vendors.md](prd/features/vendors.md) | P0 |
| Clients | [prd/features/clients.md](prd/features/clients.md) | P0 |
| Ledger | [prd/features/ledger.md](prd/features/ledger.md) | P0 |
| Accounting | [prd/features/accounting.md](prd/features/accounting.md) | P0 |
| Payments | [prd/features/payments.md](prd/features/payments.md) | P1 |
| Reports | [prd/features/reports.md](prd/features/reports.md) | P0 |
| Corporate KYC | [prd/features/corporate-kyc.md](prd/features/corporate-kyc.md) | P1 |
| Settings | [prd/features/settings.md](prd/features/settings.md) | P0 |

### Appendices

| Appendix | File | Description |
|----------|------|-------------|
| API Reference | [prd/appendix-api-reference.md](prd/appendix-api-reference.md) | Complete endpoint listing |
| Design References | [prd/appendix-design-references.md](prd/appendix-design-references.md) | Mockups and design system |

---

## Quick Reference

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 7, TailwindCSS v4 |
| State | Zustand, TanStack Query |
| Backend | Grails/Spring Boot (soupmarkets-web) |
| Auth | X-Auth-Token header |

### Domain Architecture

| Domain | Purpose |
|--------|---------|
| `www.soupfinance.com` | Marketing (public) |
| `app.soupfinance.com` | Application (authenticated) |

### Business Types

| Type | Description |
|------|-------------|
| TRADING | Inventory-based (retail, wholesale) |
| SERVICES | Labor-based (consulting, professional) |

---

*Document maintained by the SoupFinance development team.*
