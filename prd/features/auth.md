# Authentication & Registration

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Handle user authentication, tenant registration, and onboarding.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| AUTH-1 | As a new business owner, I want to register my company so I can start using SoupFinance | P0 |
| AUTH-2 | As a registered user, I want to log in with username/password so I can access my account | P0 |
| AUTH-3 | As a user, I want my session to persist (Remember Me) so I don't have to log in repeatedly | P1 |
| AUTH-4 | As a new registrant, I want to confirm my email and set password to activate my account | P0 |

---

## Functional Requirements

### Registration Flow

1. User provides: company name, business type (TRADING/SERVICES), admin name, email
2. System creates: Account (tenant), Agent (admin user), default Chart of Accounts
3. Confirmation email sent with verification token
4. User sets password via confirmation link
5. User logs in and accesses dashboard

**Important:** Password is NOT collected during registration. It's set during email confirmation.

### Login Flow

1. User enters username/password
2. System validates credentials
3. Token stored (localStorage if "Remember Me", sessionStorage otherwise)
4. User redirected to dashboard

### Remember Me (Dual-Storage Strategy)

| Setting | Storage | Behavior |
|---------|---------|----------|
| Checked | localStorage | Persists across browser sessions |
| Unchecked | sessionStorage | Cleared when browser closes |

### Logout

- Both storage locations cleared
- Token invalidated on server
- User redirected to login page

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| LoginPage | `/login` | Username/password form with Remember Me |
| RegisterPage | `/register` | Tenant registration form |
| ConfirmEmailPage | `/confirm-email` | Password setup after email verification |
| VerifyPage | `/verify` | OTP verification (if enabled) |

---

## API Endpoints

```
POST /account/register.json          - Register new tenant
POST /account/confirmEmail.json      - Verify email & set password
POST /account/resendConfirmation.json - Resend confirmation email
POST /login.json                     - User login
POST /logout.json                    - User logout
GET  /rest/user/current.json         - Validate token / get current user
```

---

## Request/Response Examples

### Register Tenant

**Request:**
```
POST /account/register.json
Content-Type: application/x-www-form-urlencoded

companyName=Acme+Corp&businessType=TRADING&adminFirstName=John&adminLastName=Doe&email=john@acme.com
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email."
}
```

### Login

**Request:**
```
POST /login.json
Content-Type: application/json

{
  "username": "john@acme.com",
  "password": "secretpassword"
}
```

**Response:**
```json
{
  "access_token": "abc123...",
  "username": "john@acme.com",
  "roles": ["ROLE_ADMIN", "ROLE_USER"]
}
```

---

## Validation Rules

| Field | Rule |
|-------|------|
| Email | Valid email format, unique across tenants |
| Company Name | Required, 2-100 characters |
| Business Type | Required, TRADING or SERVICES |
| Password | Min 8 chars, set during confirmation |

---

## Security Considerations

- Confirmation tokens expire after 24 hours
- Failed login attempts may trigger rate limiting
- Passwords hashed server-side (never stored plain)
- X-Auth-Token header used (not Bearer)
