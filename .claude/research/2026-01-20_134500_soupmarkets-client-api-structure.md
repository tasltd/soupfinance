# Research: Soupmarkets Web Backend Client API Structure

**Date**: 2026-01-20T13:45:00
**Query**: Explore soupmarkets-web Grails backend client API structure for SoupFinance frontend integration
**Duration**: ~15 minutes

## Executive Summary

The soupmarkets-web backend is a Grails 6.2.3 monolith providing two API layers:
1. **Admin API** (`/rest/*`) - For Admin SPA, requires ROLE_ADMIN/ROLE_USER
2. **Client API** (`/client/*`) - For mobile apps/SDKs, uses 2FA authentication

SoupFinance appears to be a corporate accounting platform targeting admin users, so it primarily uses the `/rest/*` Admin API endpoints with Bearer token authentication.

## Detailed Findings

### Authentication Architecture

#### 1. Admin Authentication (SoupFinance uses this)
- **Endpoint**: `POST /rest/login`
- **Auth Type**: Bearer token (JWT-like)
- **Request Format**: Form-encoded (`username`, `password`)
- **Response**: `{ access_token, token_type, username, roles }`
- **2FA**: Optional for admin users via `CustomLoginController`
- **Roles**: `ROLE_ADMIN`, `ROLE_USER`, `ROLE_REPORTS`

**Source**: `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/src/api/auth.ts:30-53`

#### 2. Client Portal Authentication (Mobile/SDK apps)
- **Endpoint**: `POST /rest/client/authenticate.json`
- **Auth Type**: 2FA via SMS/Email code
- **Flow**:
  1. Submit contact (phone/email) -> Receive 5-digit code
  2. Submit code -> Session authenticated with ROLE_CLIENT_PORTAL
- **Role**: `ROLE_CLIENT_PORTAL`

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/kyc/ClientController.groovy:195-321`

#### 3. API Consumer Authentication (External SDKs)
- **Header**: `Api-Authorization: Basic base64(apiId:secret)` or `Authorization: HMAC apiId:signature`
- **Interceptor**: `ApiAuthenticatorInterceptor`
- **Rate Limiting**: 3 requests per 3 seconds per endpoint

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/ApiAuthenticatorInterceptor.groovy`

### Finance-Related Endpoints (Admin API)

All endpoints require ROLE_ADMIN or ROLE_USER. Request format is FormData for POST/PUT.

#### Invoice Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/invoice/index.json` | List invoices (paginated) |
| GET | `/rest/invoice/archived.json` | List archived invoices |
| GET | `/rest/invoice/show/{id}.json` | Get invoice details |
| POST | `/rest/invoice/save.json` | Create invoice |
| PUT | `/rest/invoice/update/{id}.json` | Update invoice |
| DELETE | `/rest/invoice/delete/{id}.json` | Soft delete invoice |
| POST | `/rest/invoice/preview.json` | Generate PDF preview |

**Key Fields**: `invoiceNumber`, `status`, `accountServices`, `total`, `paidAmount`, `amountDue`, `invoiceDate`, `paymentDate`, `currency`

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/InvoiceController.groovy`

#### Invoice Items
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/rest/invoiceItem/save.json` | Add line item |
| PUT | `/rest/invoiceItem/update/{id}.json` | Update line item |
| DELETE | `/rest/invoiceItem/delete/{id}.json` | Remove line item |

#### Invoice Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/invoicePayment/index.json?invoice.id={id}` | List payments for invoice |
| POST | `/rest/invoicePayment/save.json` | Record payment |
| DELETE | `/rest/invoicePayment/delete/{id}.json` | Delete payment |

#### Bill (Vendor Expenses) Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/bill/index.json` | List bills (paginated) |
| GET | `/rest/bill/archived.json` | List archived bills |
| GET | `/rest/bill/show/{id}.json` | Get bill details |
| POST | `/rest/bill/save.json` | Create bill |
| PUT | `/rest/bill/update/{id}.json` | Update bill |
| DELETE | `/rest/bill/delete/{id}.json` | Soft delete bill |
| POST | `/rest/bill/preview.json` | Generate PDF preview |

**Key Fields**: `billNumber`, `status`, `vendor`, `total`, `paidAmount`, `amountDue`, `billDate`, `paymentDate`, `currency`

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/BillController.groovy`

#### Bill Items & Payments
- Similar pattern to Invoice: `/rest/billItem/*`, `/rest/billPayment/*`

#### Voucher (Deposits/Payments)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/voucher/index.json` | List vouchers |
| GET | `/rest/voucher/show/{id}.json` | Get voucher (supports PDF) |
| POST | `/rest/voucher/save.json` | Create voucher with approval |
| PUT | `/rest/voucher/update/{id}.json` | Update (restricted if approved) |
| DELETE | `/rest/voucher/delete/{id}.json` | Delete (ROLE_ADMIN only) |

**Voucher Types**: `DEPOSIT` (client deposits), `PAYMENT` (withdrawals)

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/VoucherController.groovy`

### Ledger/Chart of Accounts Endpoints

#### Ledger Accounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/ledgerAccount/index.json` | List accounts |
| GET | `/rest/ledgerAccount/show/{id}.json` | Get account |
| GET | `/rest/ledgerAccount/balance/{id}.json` | Get account with balance |
| POST | `/rest/ledgerAccount/save.json` | Create account |
| PUT | `/rest/ledgerAccount/update/{id}.json` | Update account |
| DELETE | `/rest/ledgerAccount/delete/{id}.json` | Delete account |

**Key Fields**: `name`, `description`, `number`, `ledgerAccountCategory`, `parentAccount`, `currency`, `calculatedBalance`, `systemAccount`

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/LedgerAccountController.groovy`

#### Ledger Transactions (Journal Entries)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/ledgerTransaction/index.json` | List transactions |
| GET | `/rest/ledgerTransaction/show/{id}.json` | Get transaction |
| GET | `/rest/ledgerTransaction/singleShow/{id}.json` | Get single entry |
| POST | `/rest/ledgerTransaction/save.json` | Create single entry |
| POST | `/rest/ledgerTransaction/saveMultiple.json` | Create balanced group |
| PUT | `/rest/ledgerTransaction/update.json` | Update single entry |
| PUT | `/rest/ledgerTransaction/updateMultiple.json` | Update group |
| DELETE | `/rest/ledgerTransaction/delete/{id}.json` | Delete transaction |

**Transaction Modes**: Single entry (linked to journals) or Double entry (balanced debits=credits)

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/LedgerTransactionController.groovy`

### KYC/Corporate Endpoints

#### Corporate Registration (for SoupFinance corporate onboarding)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/corporate/index.json` | List corporates |
| GET | `/rest/corporate/show/{id}.json` | Get corporate details |
| POST | `/rest/corporate/save.json` | Create corporate |
| PUT | `/rest/corporate/update/{id}.json` | Update corporate |
| DELETE | `/rest/corporate/delete/{id}.json` | Delete corporate |
| GET | `/rest/corporate/printCorporate/{id}` | Generate PDF report |

**Key Fields**: `name`, `client.relationshipManager`, `taxIdentificationNumber`, `industry`, `website`, `postalAddress`, `location`

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/kyc/CorporateController.groovy`

#### Corporate Account Persons (Directors/Signatories)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/corporateAccountPerson/index.json?corporate.id={id}` | List directors |
| GET | `/rest/corporateAccountPerson/show/{id}.json` | Get director |
| POST | `/rest/corporateAccountPerson/save.json` | Add director |
| PUT | `/rest/corporateAccountPerson/update/{id}.json` | Update director |
| DELETE | `/rest/corporateAccountPerson/delete/{id}.json` | Remove director |

#### Corporate Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/corporateDocuments/index.json?corporate.id={id}` | List documents |
| POST | `/rest/corporateDocuments/save.json` | Upload document (multipart/form-data) |
| DELETE | `/rest/corporateDocuments/delete/{id}.json` | Delete document |

### Vendor Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/vendor/index.json` | List vendors |
| GET | `/rest/vendor/show/{id}.json` | Get vendor |
| POST | `/rest/vendor/save.json` | Create vendor |
| PUT | `/rest/vendor/update/{id}.json` | Update vendor |
| DELETE | `/rest/vendor/delete/{id}.json` | Delete vendor |

**Vendor Types**: `MARKET_MAKER`, `BROKER`, `DEALER`, `EXCHANGE`, `CSD`

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/trading/VendorController.groovy`

### Financial Reports Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/financeReports/accountBalances.json` | Account balances report |
| GET | `/rest/financeReports/accountTransactions.json` | Account transactions report |

**Query Params**: `from`, `to`, `ledgerAccount`, `isParentChecked`, `f` (export format: csv, xlsx, pdf)

**PDF Generation**: Add `print=true` param for PDF output, `send=true` to email

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/finance/report/FinanceReportsController.groovy`

### Client Registration (Self-Signup)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/rest/client/register.json` | Register new client (Individual or Corporate) |

**Required Fields**: `phoneNumber` or `email`, `type` (INDIVIDUAL/CORPORATE)
**Conditional**: `pinResetQuestion`, `pinResetAnswer` (if API consumer requires)

**Source**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/kyc/ClientController.groovy:327-434`

### Common Query Parameters

All list endpoints support:
| Param | Description | Default |
|-------|-------------|---------|
| `max` | Page size | 10 (max 1000) |
| `offset` | Pagination offset | 0 |
| `sort` | Sort field | `dateCreated` |
| `order` | Sort direction | `desc` |
| `search` | Keyword search | - |
| `from` | Date range start | - |
| `to` | Date range end | - |
| `f` | Export format (csv, xlsx, pdf) | - |
| `fields` | Fields to return | fieldList |

### Request Format Notes

1. **POST/PUT**: Use `application/x-www-form-urlencoded` (FormData), NOT JSON
2. **Foreign Keys**: Format as `"entity.id": "uuid-string"` (e.g., `"corporate.id": "abc123"`)
3. **All IDs**: UUID strings, never integers
4. **Soft Delete**: `archived=true` flag, not physical delete
5. **Multi-tenant**: Session-based tenant isolation via `tenantId`

### SoupFinance Frontend API Implementation

The SoupFinance frontend already has API endpoints implemented in:
- `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/src/api/`

| File | Endpoints Covered |
|------|-------------------|
| `auth.ts` | Login, logout, token management |
| `client.ts` | Axios instance, FormData helpers |
| `endpoints/invoices.ts` | Invoice CRUD, items, payments |
| `endpoints/bills.ts` | Bill CRUD, items, payments |
| `endpoints/ledger.ts` | LedgerAccount, LedgerTransaction |
| `endpoints/vendors.ts` | Vendor CRUD |
| `endpoints/corporate.ts` | Corporate CRUD, directors, documents |

### Missing/Incomplete API Coverage

Based on backend capabilities, SoupFinance frontend may need:
1. **Finance Reports**: `/rest/financeReports/*` endpoints (P&L, Balance Sheet, etc.)
2. **Voucher Management**: `/rest/voucher/*` for deposits/payments
3. **Dashboard Stats**: Backend has caching for dashboard data
4. **Scheme Integration**: Bills can link to fund schemes

## Raw Data

### URL Mappings (key client patterns)
From UrlMappings.groovy, the `/client` prefix routes are handled by ClientPortalInterceptor for authenticated clients.

### Interceptor Chain
1. `ApiAuthenticatorInterceptor` (order: HIGHEST_PRECEDENCE + 1) - API auth validation
2. `ClientPortalInterceptor` (order: HIGHEST_PRECEDENCE + 20) - Client portal session injection

## Recommendations

1. **Use Admin API**: SoupFinance should continue using `/rest/*` endpoints with Bearer token auth (already implemented)

2. **Add Finance Reports API**: Implement endpoints for:
   - `/rest/financeReports/accountBalances.json`
   - `/rest/financeReports/accountTransactions.json`
   - P&L and Balance Sheet reports

3. **Add Voucher API**: Implement voucher endpoints for deposit/payment tracking

4. **Corporate Onboarding**: The `/rest/corporate/*` endpoints support full corporate KYC - consider if self-signup flow is needed

5. **Export Functionality**: All list endpoints support `?f=csv|xlsx|pdf` for data export - can be surfaced in UI

6. **Rate Limiting**: Be aware of 3 req/3s limit on SDK endpoints (though admin API may have different limits)
