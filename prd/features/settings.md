# Settings & Configuration

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Manage account settings, users, and bank accounts.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| SET-1 | As an admin, I want to add staff members so they can access the system | P0 |
| SET-2 | As an admin, I want to assign roles so staff have appropriate access | P0 |
| SET-3 | As an admin, I want to add bank accounts for payment processing | P1 |
| SET-4 | As an admin, I want to update company branding and settings | P1 |

---

## Settings Sections

### Account Settings

| Field | Description |
|-------|-------------|
| Company Name | Business name |
| Currency | Base currency |
| Country | Country of origin |
| Fiscal Year Start | First day of fiscal year |
| Logo | Company logo |
| Favicon | Browser favicon |
| Email Prefix | Subject line prefix |
| Slogan | Company tagline |

### User Management

| Action | Description |
|--------|-------------|
| Create Staff | Add new user with name, email, roles |
| Edit Staff | Update user details and roles |
| Disable | Temporarily disable access |
| Archive | Remove from active list |
| Reset Password | Admin password reset |

### Bank Accounts

| Field | Required | Description |
|-------|----------|-------------|
| Account Name | Yes | Display name |
| Account Number | Yes | Bank account number |
| Bank | Yes | Bank name (select or other) |
| Branch Code | No | Bank branch code |
| Currency | No | Account currency |
| Priority | Yes | PRIMARY or SECONDARY |
| Ledger Account | No | Linked GL account |

---

## User Roles

| Role | Code | Can Assign |
|------|------|------------|
| Administrator | ROLE_ADMIN | Admin only |
| User | ROLE_USER | Admin |
| Finance Reports | ROLE_FINANCE_REPORTS | Admin |
| Invoices | ROLE_INVOICE | Admin |
| Bills | ROLE_BILL | Admin |
| Ledger Transactions | ROLE_LEDGER_TRANSACTION | Admin |
| Chart of Accounts | ROLE_LEDGER_ACCOUNT | Admin |
| Vendors | ROLE_VENDOR | Admin |
| Vouchers | ROLE_VOUCHER | Admin |

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| SettingsLayout | `/settings` | Settings navigation |
| AccountSettingsPage | `/settings/account` | Company settings |
| UserListPage | `/settings/users` | Staff list |
| UserFormPage | `/settings/users/new`, `/settings/users/:id/edit` | Add/edit staff |
| BankAccountListPage | `/settings/bank-accounts` | Bank account list |
| BankAccountFormPage | `/settings/bank-accounts/new` | Add bank account |

---

## API Endpoints

```
# Account Settings
GET  /rest/account/current.json         - Get current account settings
PUT  /rest/account/update.json          - Update account settings

# Users/Staff (Agents)
GET  /rest/agent/index.json             - List active staff
GET  /rest/agent/archived.json          - List archived staff
POST /rest/agent/save.json              - Create staff member
GET  /rest/agent/show/:id.json          - Get staff details
PUT  /rest/agent/update.json            - Update staff
DELETE /rest/agent/delete/:id.json      - Archive staff
PUT  /rest/agent/updateAccess/:id.json  - Update credentials

# Bank Accounts
GET  /rest/accountBankDetails/index.json   - List bank accounts
POST /rest/accountBankDetails/save.json    - Add bank account
GET  /rest/accountBankDetails/show/:id.json - Get account details
PUT  /rest/accountBankDetails/update.json  - Update account
DELETE /rest/accountBankDetails/delete/:id.json - Delete account

# Roles
GET  /rest/sbRole/index.json            - List available roles

# Banks (reference data)
GET  /rest/bank/index.json              - List available banks
```

---

## Staff Creation Form

| Field | Required | Description |
|-------|----------|-------------|
| First Name | Yes | Staff first name |
| Last Name | Yes | Staff last name |
| Email | Yes | Contact email |
| Username | Yes | Login username |
| Password | Yes | Initial password |
| Roles | Yes | One or more roles |

---

## Account Branding

| Asset | Dimensions | Format |
|-------|------------|--------|
| Logo | 200x50px recommended | PNG, JPG, SVG |
| Favicon | 32x32px | PNG, ICO |

---

## Wireframe References

- `soupfinance-designs/screenshots/settings-account.png`
- `soupfinance-designs/screenshots/settings-users.png`
- `soupfinance-designs/screenshots/settings-bank-accounts.png`
