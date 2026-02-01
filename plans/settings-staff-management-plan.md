# SoupFinance Settings & User Management Implementation Plan

**Created**: 2026-01-30
**Updated**: 2026-01-30
**Status**: COMPLETED
**Priority**: HIGH

---

## Overview

Implement comprehensive Settings functionality for SoupFinance including:
1. **User Management** - Create, edit, manage users (agents) who can log in
2. **Account Bank Details** - Link bank accounts to COA ledger accounts
3. **Account Configuration** - Business settings and preferences
4. **Frontend Logging** - Tagged logging with API consumer identification

> **Note**: Users are mapped to the `Agent` domain in the backend. Account Persons (directors/signatories) are managed directly within the User edit form, not as a separate page.

---

## 1. Frontend Logging with SoupFinance Tags

### Objective
All frontend logs should include `[SOUPFINANCE]` tag (or API consumer name) so backend logs can identify which application generated the request.

### Implementation ✅

#### 1.1 Create Logger Utility
```typescript
// src/utils/logger.ts
const APP_NAME = 'SOUPFINANCE';

export const logger = {
  info: (message: string, data?: unknown) => {
    console.log(`[${APP_NAME}] ${message}`, data ?? '');
  },
  warn: (message: string, data?: unknown) => {
    console.warn(`[${APP_NAME}] ${message}`, data ?? '');
  },
  error: (message: string, error?: unknown) => {
    console.error(`[${APP_NAME}] ${message}`, error ?? '');
  },
  debug: (message: string, data?: unknown) => {
    if (import.meta.env.DEV) {
      console.debug(`[${APP_NAME}] ${message}`, data ?? '');
    }
  },
  api: (method: string, url: string, status?: number, duration?: number) => {
    const msg = `API ${method} ${url}${status ? ` -> ${status}` : ''}${duration ? ` (${duration}ms)` : ''}`;
    console.log(`[${APP_NAME}] ${msg}`);
  }
};
```

#### 1.2 Add Request Header for Backend Identification
```typescript
// In apiClient interceptor - add X-Api-Consumer header
apiClient.interceptors.request.use((config) => {
  config.headers['X-Api-Consumer'] = 'SOUPFINANCE';
  // ... existing token logic
});
```

#### 1.3 Add Request/Response Logging
```typescript
// Request logging
apiClient.interceptors.request.use((config) => {
  config.metadata = { startTime: Date.now() };
  logger.api(config.method?.toUpperCase() || 'GET', config.url || '');
  return config;
});

// Response logging
apiClient.interceptors.response.use(
  (response) => {
    const duration = Date.now() - (response.config.metadata?.startTime || 0);
    logger.api(response.config.method?.toUpperCase() || 'GET',
               response.config.url || '',
               response.status,
               duration);
    return response;
  },
  (error) => {
    logger.error(`API Error: ${error.config?.url}`, error.response?.data);
    // ... existing error handling
  }
);
```

---

## 2. Settings Page Structure

### Route Structure
```
/settings                    - Settings overview/redirect
/settings/users              - User management (list, add, edit)
/settings/users/new          - Add new user
/settings/users/:id          - Edit user (includes Account Person management)
/settings/bank-accounts      - Account bank details
/settings/bank-accounts/new  - Add bank account
/settings/bank-accounts/:id  - Edit bank account
/settings/account            - Account configuration
```

### Navigation Addition
Add "Settings" section to SideNav with sub-items:
- Users (formerly "Staff Management")
- Bank Accounts
- Account Settings

> **Note**: Account Persons are managed within the User form, not as a separate navigation item.

---

## 3. User Management (Agent Domain)

### Backend Endpoints (Already Exist)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/agent/index.json` | List agents |
| GET | `/rest/agent/show/{id}.json` | Get agent |
| POST | `/rest/agent/save.json` | Create agent |
| PUT | `/rest/agent/update.json` | Update agent |
| DELETE | `/rest/agent/delete/{id}.json` | Delete agent |
| PUT | `/rest/agent/updateAccess/{id}` | Update password |

### Frontend Implementation ✅

#### 3.1 Types (`src/types/settings.ts`)
```typescript
export interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  designation?: string;
  address?: string;
  emailContacts?: EmailContact[];
  phoneContacts?: PhoneContact[];
  userAccess?: {
    id: number;
    username: string;
    enabled: boolean;
  };
  account?: { id: string };
  accountPerson?: { id: string };
  authorities?: SbRole[];
  disabled?: boolean;
  archived?: boolean;
  dateCreated?: string;
  lastUpdated?: string;
}

export interface AgentFormData {
  firstName: string;
  lastName: string;
  otherNames?: string;
  designation?: string;
  address?: string;
  email: string;
  phone?: string;
  username: string;
  password?: string;
  roles: string[];
  createAsAccountPerson?: boolean; // If true AND admin role, create AccountPerson
  isDirector?: boolean;
  isSignatory?: boolean;
}

export interface EmailContact {
  id: string;
  email: string;
}

export interface PhoneContact {
  id: string;
  phone: string;
}

export interface SbRole {
  id: number;
  authority: string;
}
```

#### 3.2 API Endpoints (`src/api/endpoints/settings.ts`)
```typescript
// Agent/User endpoints
export const agentApi = {
  list: (params?: ListParams) =>
    apiClient.get('/agent/index.json', { params }),

  get: (id: string) =>
    apiClient.get(`/agent/show/${id}.json`),

  create: (data: AgentFormData) =>
    apiClient.post('/agent/save.json', toFormData(transformAgentData(data))),

  update: (id: string, data: AgentFormData) =>
    apiClient.put('/agent/update.json', toFormData({ id, ...transformAgentData(data) })),

  delete: (id: string) =>
    apiClient.delete(`/agent/delete/${id}.json`),

  updatePassword: (id: string, password: string) =>
    apiClient.put(`/agent/updateAccess/${id}`, toFormData({ password })),
};
```

#### 3.3 User List Page (`src/features/settings/UserListPage.tsx`) ✅
- Table with columns: Name, Email, Role, Director/Signatory, Status, Actions
- Shows Account Person badge inline when user has accountPerson linked
- Search/filter functionality
- Add new user button
- Edit/Delete actions

#### 3.4 User Form Page (`src/features/settings/UserFormPage.tsx`) ✅
Form fields:
- First Name* (required)
- Last Name* (required)
- Other Names
- Designation/Job Title
- Email* (required) - also becomes username
- Phone
- Address
- Password* (required for new, optional for edit)
- Roles (multi-select): ROLE_ADMIN, ROLE_USER, ROLE_FINANCE_REPORTS, etc.
- **Account Person Section** (shown when editing user with accountPerson OR creating new admin):
  - [ ] Create as Director
  - [ ] Create as Signatory
  - [ ] Key Contact
  - Contract Note Signatory
  - Finance Reports Signatory

#### 3.5 Account Person Integration Logic ✅
Account Person management is integrated directly into the User form:
- When editing a user with an existing AccountPerson, the Account Person section is displayed
- When creating a new user with ROLE_ADMIN, a checkbox enables Account Person creation
- The form saves/updates both the Agent and linked AccountPerson in sequence

```typescript
// After successful agent creation/update
if (showAccountPersonSection && hasAdminRole) {
  await accountPersonApi.save({
    firstName: data.firstName,
    surname: data.lastName,
    otherNames: data.otherNames,
    jobTitle: data.designation,
    keyContact: data.isKeyContact,
    director: data.isDirector ?? false,
    signatory: data.isSignatory ?? false,
    contractNoteSignatory: data.contractNoteSignatory,
    financeReportsSignatory: data.financeReportsSignatory,
    agent: { id: agentId }, // Link to agent
  });
}
```

---

## 4. Account Bank Details Management

### Backend Endpoints (Already Exist)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/accountBankDetails/index.json` | List bank accounts |
| GET | `/rest/accountBankDetails/show/{id}.json` | Get bank account |
| POST | `/rest/accountBankDetails/save.json` | Create bank account |
| PUT | `/rest/accountBankDetails/update.json` | Update bank account |
| DELETE | `/rest/accountBankDetails/delete/{id}.json` | Delete bank account |

### Key Relationship: Ledger Account Link
Each AccountBankDetails links to a LedgerAccount for double-entry accounting:
- When a bank account receives money → debit the linked ledger account
- When money is paid from bank → credit the linked ledger account

### Frontend Implementation ✅

#### 4.1 Types
```typescript
export interface AccountBankDetails {
  id: string;
  accountName: string;
  accountNumber: string;
  bank?: { id: string; name: string };
  bankForOtherOption?: string;
  bankBranch?: string;
  priority: 'PRIMARY' | 'SECONDARY';
  currency?: string;
  ledgerAccount?: { id: string; name: string; accountNumber: string };
  defaultClientDebtAccount?: boolean;
  defaultClientEquityAccount?: boolean;
  archived?: boolean;
}

export interface AccountBankDetailsFormData {
  accountName: string;
  accountNumber: string;
  bankId?: string;
  bankForOtherOption?: string;
  bankBranch?: string;
  priority: 'PRIMARY' | 'SECONDARY';
  currency?: string;
  ledgerAccountId?: string; // Link to COA
  defaultClientDebtAccount?: boolean;
  defaultClientEquityAccount?: boolean;
}
```

#### 4.2 Bank Account Form ✅
Form fields:
- Account Name* (holder name at bank)
- Account Number*
- Bank (dropdown from Bank list, or "Other")
- Bank Branch
- Priority (PRIMARY/SECONDARY)
- Currency
- **Linked Ledger Account** (dropdown from Chart of Accounts - Bank/Cash accounts)
- [ ] Default for Client Debt Operations
- [ ] Default for Client Equity Operations

---

## 5. Account Persons (Directors/Signatories)

> **Important**: Account Persons are now managed directly within the User form page, not as a separate list page. This ensures that each Account Person is always linked to a User (Agent).

### Backend Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/accountPerson/index.json` | List account persons |
| GET | `/rest/accountPerson/show/{id}.json` | Get person |
| POST | `/rest/accountPerson/save.json` | Create person |
| PUT | `/rest/accountPerson/update.json` | Update person |
| DELETE | `/rest/accountPerson/delete/{id}.json` | Delete person |

### Types
```typescript
export interface AccountPerson {
  id: string;
  firstName?: string;
  surname?: string;
  otherNames?: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  jobTitle?: string;
  keyContact?: boolean;
  director?: boolean;
  signatory?: boolean;
  contractNoteSignatory?: boolean;
  tradingReportsSignatory?: boolean;
  financeReportsSignatory?: boolean;
  complianceReportsSignatory?: boolean;
  emailContacts?: EmailContact[];
  phoneContacts?: PhoneContact[];
  archived?: boolean;
}
```

---

## 6. Account Configuration

### Backend: Account Domain Fields
The Account domain has many configuration fields. Key ones for SoupFinance:
- `name` - Company name
- `currency` - Default currency
- `countryOfOrigin` - Country
- `businessLicenceCategory` - TRADING or SERVICES
- `emailSubjectPrefix` - Email prefix
- `smsIdPrefix` - SMS prefix
- `startOfFiscalYear` - Fiscal year start

### Frontend Implementation ✅
Simple form to update account settings:
- Company Name
- Business Type (read-only or admin-only)
- Default Currency
- Country
- Email Subject Prefix
- Fiscal Year Start Date

---

## 7. File Structure

```
src/
├── features/
│   └── settings/
│       ├── index.ts                    # Exports
│       ├── SettingsLayout.tsx          # Layout with sub-navigation
│       ├── UserListPage.tsx            # User list (formerly StaffListPage)
│       ├── UserFormPage.tsx            # Add/Edit user with Account Person
│       ├── BankAccountListPage.tsx     # Bank accounts list
│       ├── BankAccountFormPage.tsx     # Add/Edit bank account
│       └── AccountSettingsPage.tsx     # Account configuration
├── api/
│   └── endpoints/
│       └── settings.ts                 # Settings API endpoints
├── types/
│   └── settings.ts                     # Settings types (or add to index.ts)
└── utils/
    └── logger.ts                       # Logging utility
```

---

## 8. Implementation Order

### Phase 1: Foundation (Priority: CRITICAL) ✅
1. ✅ Create logger utility with SoupFinance tags
2. ✅ Update apiClient with X-Api-Consumer header and logging
3. ✅ Add Settings types
4. ✅ Add Settings API endpoints

### Phase 2: User Management (Priority: HIGH) ✅
5. ✅ Create SettingsLayout component
6. ✅ Create UserListPage (refactored from StaffListPage)
7. ✅ Create UserFormPage with Account Person integration
8. ✅ Add routes to App.tsx
9. ✅ Add Settings to SideNav

### Phase 3: Bank Accounts (Priority: HIGH) ✅
10. ✅ Create BankAccountListPage
11. ✅ Create BankAccountFormPage with Ledger Account link

### Phase 4: Account Settings (Priority: MEDIUM) ✅
12. ✅ Create AccountSettingsPage

---

## 9. Backend Requirements

**No backend changes needed** - all endpoints already exist:
- `/rest/agent/*` - User management
- `/rest/accountPerson/*` - Account persons (linked to agents)
- `/rest/accountBankDetails/*` - Bank accounts
- `/rest/ledgerAccount/*` - For dropdown selection

**Note**: The backend should log the `X-Api-Consumer` header value in its access logs.

---

## 10. Testing Checklist

### User Management
- [ ] Create new user
- [ ] Create user with admin role + enable Account Person
- [ ] Edit user details
- [ ] Edit user's Account Person settings (director/signatory)
- [ ] Change user password
- [ ] Delete user

### Bank Accounts
- [ ] Create bank account linked to ledger account
- [ ] Edit bank account
- [ ] Delete bank account

### Account Settings
- [ ] View account settings
- [ ] Update account settings

### Logging
- [ ] Verify logs show [SOUPFINANCE] tags
- [ ] Verify X-Api-Consumer header sent to backend

### E2E Tests
- [ ] settings.spec.ts - User list page tests
- [ ] settings.spec.ts - User form tests
- [ ] settings.spec.ts - Bank account tests
- [ ] settings.spec.ts - Account settings tests

---

## Changelog

### 2026-01-30 - Refactoring: Staff → Users
- **Renamed**: "Staff" to "Users" throughout to avoid payroll connotations
- **Renamed**: StaffListPage → UserListPage
- **Renamed**: StaffFormPage → UserFormPage
- **Removed**: Separate AccountPersonListPage and AccountPersonFormPage
- **Integrated**: Account Person management into UserFormPage
- **Updated**: Routes from `/settings/staff/*` to `/settings/users/*`
- **Updated**: Navigation labels in SettingsLayout and SideNav

---

## Sources

- [React Admin Best Practices](https://marmelab.com/react-admin/)
- [RBAC Implementation](https://www.permit.io/blog/implementing-react-rbac-authorization)
- [Frontend Logging Best Practices](https://blog.pixelfreestudio.com/best-practices-for-logging-and-monitoring-frontend-applications/)
- [API Logging Best Practices](https://blog.dreamfactory.com/api-request-logging-best-practices)
