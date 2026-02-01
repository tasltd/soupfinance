# User Roles & Permissions

[← Back to PRD Index](../PRD.md)

---

## Available Roles

| Role | Code | Description |
|------|------|-------------|
| Administrator | `ROLE_ADMIN` | Full system access, all operations |
| User | `ROLE_USER` | Basic user access to assigned modules |
| Finance Reports | `ROLE_FINANCE_REPORTS` | View all financial reports |
| Invoices | `ROLE_INVOICE` | Create, edit, view, send invoices |
| Bills | `ROLE_BILL` | Create, edit, view bills |
| Ledger Transactions | `ROLE_LEDGER_TRANSACTION` | Post/reverse transactions, create journal entries |
| Chart of Accounts | `ROLE_LEDGER_ACCOUNT` | View and manage chart of accounts |
| Vendors | `ROLE_VENDOR` | Manage vendors |
| Vouchers | `ROLE_VOUCHER` | Create and manage payment vouchers |

---

## Permission Model

### Multi-Role Assignment
- Users can have multiple roles assigned
- Roles are additive (more roles = more access)
- Stored as authorities in UserAccess entity

### Security Levels

| Level | Implementation |
|-------|----------------|
| **Endpoint-Level** | Backend enforces `@Secured` annotations on controllers |
| **Feature-Level** | Frontend hides features based on user roles |
| **Data-Level** | All queries filtered by tenantId (Account) |

---

## Role Capabilities Matrix

| Capability | ADMIN | USER | FINANCE | INVOICE | BILL | LEDGER_TXN | LEDGER_ACCT | VENDOR | VOUCHER |
|------------|-------|------|---------|---------|------|------------|-------------|--------|---------|
| View Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage Users | ✓ | - | - | - | - | - | - | - | - |
| View Reports | ✓ | - | ✓ | - | - | - | - | - | - |
| Create Invoices | ✓ | - | - | ✓ | - | - | - | - | - |
| Create Bills | ✓ | - | - | - | ✓ | - | - | - | - |
| Post Transactions | ✓ | - | - | - | - | ✓ | - | - | - |
| Manage COA | ✓ | - | - | - | - | - | ✓ | - | - |
| Manage Vendors | ✓ | - | - | - | - | - | - | ✓ | - |
| Create Vouchers | ✓ | - | - | - | - | - | - | - | ✓ |

---

## Authentication Flow

### Token-Based Authentication
1. User submits username/password to `/login.json`
2. Server returns X-Auth-Token
3. Token included in all subsequent requests as header
4. Token validated on each request via `/rest/user/current.json`

### Dual-Storage Strategy (Remember Me)

| Setting | Storage | Behavior |
|---------|---------|----------|
| Remember Me: ON | localStorage | Persists across browser sessions |
| Remember Me: OFF | sessionStorage | Cleared when browser closes |

### Logout
- Both storage locations cleared
- Token invalidated on server
- User redirected to login page

---

## User Account Structure

```typescript
interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  designation?: string;
  emailContacts?: EmailContact[];
  phoneContacts?: PhoneContact[];
  userAccess?: {
    username: string;
    enabled: boolean;
  };
  authorities?: SbRole[];
  disabled?: boolean;
  archived?: boolean;
}
```

---

## Default Admin User

On tenant registration:
- First user automatically receives `ROLE_ADMIN`
- Admin can create additional staff members
- Admin assigns roles to staff
