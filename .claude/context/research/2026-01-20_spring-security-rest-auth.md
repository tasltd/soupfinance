# Research: Spring Security REST Authentication & Client User Connections

**Date**: 2026-01-20
**Query**: Spring Security REST authentication setup and client user connections in soupmarkets-web
**Source**: soupmarkets-web Grails backend

---

## Executive Summary

The Soupmarkets platform uses **Spring Security REST plugin** (v3.0.1) with token-based stateless authentication. Authentication uses JWT-style tokens stored in a GORM domain (`AuthenticationToken`). The platform supports TWO user types: **Agents** (internal staff) and **Contacts** (client users), with different authentication flows.

**Key Findings**:
- Token-based auth via `spring-security-rest-gorm` plugin
- Tokens stored in `AuthenticationToken` domain (username → token mapping)
- Admin API: `/rest/api/login` endpoint for SPA authentication
- Client API: NO dedicated `/client/login` endpoint - uses custom controllers
- Agents linked to `SbUser` via `userAccess` FK
- Contacts linked to `SbUser` via `clientUser` FK
- Multi-tenant support: Discriminator-based (`tenantId` column)

---

## 1. Spring Security REST Plugin Configuration

### Plugin Version & Dependencies

**File**: `build.gradle`
```groovy
implementation 'org.grails.plugins:spring-security-core:5.1.1'
implementation 'org.grails.plugins:spring-security-ui:4.0.0-RC1'
implementation 'org.grails.plugins:spring-security-rest-gorm:3.0.1'
```

### Configuration

**File**: `grails-app/conf/application.groovy` (lines 817-836)

```groovy
// Token storage using GORM domain
grails.plugin.springsecurity.rest.token.storage.useGorm = true
grails.plugin.springsecurity.rest.token.storage.gorm.tokenDomainClassName = 'soupbroker.security.AuthenticationToken'
grails.plugin.springsecurity.rest.token.storage.gorm.tokenValuePropertyName = 'token'
grails.plugin.springsecurity.rest.token.storage.gorm.usernamePropertyName = 'username'

// Login endpoint configuration
grails.plugin.springsecurity.rest.login.active = true
grails.plugin.springsecurity.rest.login.endpointUrl = '/rest/api/login'
grails.plugin.springsecurity.rest.login.useJsonCredentials = true
grails.plugin.springsecurity.rest.login.usernamePropertyName = 'username'
grails.plugin.springsecurity.rest.login.passwordPropertyName = 'password'
grails.plugin.springsecurity.rest.login.failureStatusCode = 401

// Logout endpoint
grails.plugin.springsecurity.rest.logout.endpointUrl = '/rest/api/logout'

// Token validation
grails.plugin.springsecurity.rest.token.validation.active = true
grails.plugin.springsecurity.rest.token.validation.endpointUrl = '/rest/api/validate'
grails.plugin.springsecurity.rest.token.validation.headerName = 'X-Auth-Token'
grails.plugin.springsecurity.rest.token.validation.useBearerToken = false
```

### URL Mappings

**File**: `grails-app/controllers/soupbroker/UrlMappings.groovy` (lines 19-21)

```groovy
"/rest/api/login"(controller: "api", action: "login")
"/rest/api/logout"(controller: "api", action: "logout")
"/rest/api/validate"(controller: "api", action: "validate")
```

**Note**: These routes only exist when `SPA_ENABLED=true` (line 17).

---

## 2. Authentication Flow

### Admin/Agent Authentication (SPA)

```
1. Frontend POST /rest/api/login
   Body: { "username": "user@example.com", "password": "password123" }

2. Spring Security REST plugin validates credentials
   - Looks up SbUser by username
   - Validates password via BCrypt encoder
   - Creates AuthenticationToken record

3. Response: { "token": "abc-123-uuid", "username": "user@example.com" }

4. Frontend stores token in localStorage

5. Subsequent API calls include:
   Header: X-Auth-Token: abc-123-uuid

6. Spring Security REST plugin validates token
   - Looks up AuthenticationToken by token value
   - Retrieves username from token record
   - Loads SbUser and associated Agent(s)
   - Sets up security context
```

### Client/Contact Authentication (Mobile SDKs)

**No dedicated `/client/login.json` endpoint found.**

Instead, the platform uses:
- **2FA authentication via custom controllers** (`CustomLoginController`, `AuthenticatorController`)
- **Contact-based verification** via `Contact.clientUser` field

**File**: `grails-app/controllers/soupbroker/CustomLoginController.groovy`

Key methods:
- `verification()` - Sends 2FA code via SMS/email
- `verifyCode()` - Validates 2FA code

**Flow**:
```
1. Client submits email/phone + password to /2fa/verification
   - Looks up Contact by email/phone
   - Retrieves sourceId (Agent or other entity)
   - Gets userAccess (SbUser) from Agent
   - Validates password
   - Generates 6-digit code
   - Sends via SMS/email
   - Stores in TwoFactorAuth domain

2. Client submits code to /2fa/verifyCode
   - Validates code from TwoFactorAuth
   - Marks code as expired/deleted
   - Returns success

3. Client must then authenticate via standard login
   (exact endpoint TBD - likely uses same /rest/api/login)
```

---

## 3. User/Agent Domain Structure

### SbUser (Authentication)

**File**: `grails-app/domain/soupbroker/security/SbUser.groovy`

```groovy
class SbUser implements Serializable, Auditable {
    String tenantId          // Not strictly tenant-scoped
    String username          // Unique across all tenants
    String password          // BCrypt encrypted
    String email             // Optional, for password reset

    boolean enabled = true
    boolean accountExpired
    boolean accountLocked
    boolean passwordExpired

    // Get directly assigned roles
    Set<SbRole> getAuthorities() {
        SbUserSbRole.findAllBySbUser(this)*.sbRole as Set
    }
}
```

**Mapping**:
- ID: Auto-increment Long (not UUID)
- Password: Backticked column name (SQL reserved word)
- Cache: Enabled

**Key Points**:
- Handles authentication (who are you?)
- Stores login credentials
- Can be linked to multiple Agents across tenants
- Roles assigned via junction tables (`SbUserSbRole`, `SbUserSbRoleGroup`)

### Agent (Authorization)

**File**: `grails-app/domain/soupbroker/security/Agent.groovy`

```groovy
class Agent extends SbDomain implements Auditable, MultiTenant<Agent> {
    // Personal info
    String firstName
    String lastName
    String otherNames

    // Authentication link
    SbUser userAccess        // FK to SbUser

    // Organization
    String designation       // Job title
    Department department    // Determines base permissions

    // Virtual contact fields (transient, used during creation)
    String phone             // Creates PhoneContact records
    String email             // Creates EmailContact records

    // Tenant association
    Account account          // FK to tenant (set from Account.current())

    // UI preferences
    Theme theme = Theme.HORIZONTAL_DARK
    boolean daylightChanges = false

    // Trading
    String pinCode
    String traderCode

    // Role assignments
    Set<SbRole> authorities = []          // Direct roles
    Set<SbRoleGroup> groupAuthorities = []  // Group roles

    // Access control
    Boolean disabled = false
    boolean noAlert
    boolean enableStatsAlert
    AppMode appMode = AppMode.LEGACY

    // Get effective roles (direct + group + overrides)
    Set<SbRole> getEffectiveRoles() {
        Set<SbRole> effectiveRoles = new HashSet<>(authorities ?: [])
        groupAuthorities?.each { group ->
            effectiveRoles.addAll(group.authorities ?: [])
        }
        roleOverrides?.each { override ->
            if (override.granted) {
                effectiveRoles.add(override.role)
            } else {
                effectiveRoles.remove(override.role)
            }
        }
        return effectiveRoles
    }
}
```

**Mapping**:
- Extends `SbDomain` (UUID primary key)
- Multi-tenant via `tenantId` discriminator
- Soft-delete via `archived` flag

**Key Points**:
- Handles authorization (what can you do?)
- Links to SbUser via `userAccess` FK
- One SbUser can have multiple Agents (across tenants)
- Permissions calculated from: Department + Direct roles + Group roles + Overrides
- Module access controlled via `Department.hasModuleAccess()`

### Contact (Client User Base)

**File**: `grails-app/domain/soupbroker/Contact.groovy`

```groovy
class Contact extends SbDomain implements MultiTenant<Contact>, Auditable {
    // Priority
    Priority priority = Priority.PRIMARY

    // Source linking (polymorphic)
    String sourceName        // "soupbroker.kyc.Individual"
    String sourceProperty    // "emailContacts"
    String sourceId          // UUID of owning entity

    // Verification
    String authCode          // Unique OTP code
    boolean verified

    // Client user account (for portal authentication)
    SbUser clientUser        // FK to SbUser

    // Get specific contact type
    def getSpecContact() {
        if(this.instanceOf(Contact))
            return EmailContact.get(id)?: PhoneContact.get(id)
    }
}
```

**Subclasses**:
- `EmailContact` - Stores email address
- `PhoneContact` - Stores phone number

**Key Points**:
- Polymorphic association to any domain via `sourceName`/`sourceId`
- Verified contacts can have `SbUser` linked via `clientUser` FK
- Used for client portal authentication
- Supports OTP verification via `authCode`

---

## 4. Client User Connection Mechanism

### How Clients Have Users

The platform allows **clients** (Individual, Corporate) to have **users** (for portal access):

```
Individual/Corporate
    ↓ hasMany
  Contact (EmailContact/PhoneContact)
    ↓ clientUser FK
  SbUser (login credentials)
    ↓ authenticated via
  AuthenticationToken
```

**Setup Process**:
1. Client (Individual/Corporate) is created during KYC
2. Contact (EmailContact/PhoneContact) is created and linked to client via `sourceId`
3. Contact is verified (via OTP sent to email/phone)
4. `SbUser` is created with username/password
5. `Contact.clientUser` is set to the created `SbUser`
6. Client can now log in via `/rest/api/login` (or custom 2FA flow)

**File**: `grails-app/domain/soupbroker/Contact.groovy` (line 84)
```groovy
SbUser clientUser  // FK to authentication user
```

**Example Query**:
```groovy
// Find all contacts with portal access for an Individual
def individual = Individual.get(uuid)
def portalContacts = individual.emailContacts.findAll { it.clientUser != null }
```

---

## 5. Role-Based Access Control

### Admin API (`/rest/*`) vs Client API (`/client/*`)

**Admin API**:
- Secured by Spring Security
- Requires ROLE_ADMIN or ROLE_USER
- SPA uses this for internal agent access
- Endpoints: `/rest/{controller}/{action}.json`

**Client API**:
- Custom controllers (not standard Spring Security REST)
- Public endpoints via `@Secured("permitAll")`
- Used by mobile SDKs and client portal
- Endpoints: `/client/*` (but NO `/client/login.json` found)

### Public Endpoints

**File**: `src/main/groovy/soupbroker/PublicEndpointConfig.groovy`

```groovy
static final List<String> PUBLIC_DATA_CONTROLLERS = [
    'security', 'securityType', 'securitySubType', 'flow',
    'issuer', 'bank', 'market', 'exchange', 'depository',
]

static final Map<String, List<String>> PUBLIC_CONTROLLER_ACTIONS = [
    'register': ['forgotPassword', 'resetPassword', 'register', 'verification'],
    'signUp': ['index', 'show'],
    'authenticator': ['sendCode', 'verifyCode', 'lookup', 'testLogin', 'testOtp', 'testVerifyOtp'],
    'customLogin': ['index'],
    'clientIndustry': ['index'],
    // ... more reference data endpoints
]
```

**Generated Rules**:
- `/security/index.json` → permitAll
- `/rest/security/index.json` → permitAll
- `/register/forgotPassword` → permitAll
- `/authenticator/sendCode.json` → permitAll

---

## 6. Token Format and Storage

### AuthenticationToken Domain

**File**: `grails-app/domain/soupbroker/security/AuthenticationToken.groovy`

```groovy
class AuthenticationToken {
    String username      // Maps to SbUser.username
    String token         // UUID or similar unique string
    Date refreshed = new Date()

    def afterLoad() {
        // Auto-refresh tokens older than 1 day
        if (refreshed < new Date() -1) {
            refreshed = new Date()
            save()
        }
    }
}
```

**Token Lifecycle**:
1. Created during login (username → generated token UUID)
2. Stored in `authentication_token` table
3. Validated on each request via token lookup
4. Auto-refreshed if > 24 hours old (on load)
5. Deleted on logout

**Token Format**:
- Plain UUID string (not JWT)
- Stored as-is in database (not hashed)
- Sent via `X-Auth-Token` header
- No expiration policy beyond refresh tracking

**Security Considerations**:
- Tokens are NOT encrypted/hashed in database
- Revocation requires deleting the record
- No built-in expiration (only refreshed tracking)
- Should only be transmitted over HTTPS

---

## 7. Multi-Tenancy & Cross-Tenant Access

### Discriminator-Based Multi-Tenancy

**File**: `grails-app/conf/application.yml` (lines 7-10)

```yaml
grails:
  gorm:
    multiTenancy:
      mode: DISCRIMINATOR
      tenantResolverClass: soupbroker.SoupDiscriminatorTenantResolver
```

**How It Works**:
1. All domains extend `SbDomain` which has `tenantId` column
2. GORM automatically adds `WHERE tenantId = ?` to queries
3. Tenant resolved from:
   - **Admin**: Currently logged-in Agent's account
   - **Public**: Hostname via `TenantFromHostnameInterceptor`

### Cross-Tenant User Access

**Scenario**: User has agents in multiple tenants (Demo + SAS)

```
SbUser: user@example.com
  ↓ userAccess FK
Agent 1: Demo Securities (tenantId = demo-uuid)
Agent 2: Strategic African Securities (tenantId = sas-uuid)
```

**Login Flow**:
1. User logs in with username/password
2. Backend finds SbUser
3. Queries for ALL agents where `Agent.userAccess = SbUser`
4. SPA shows tenant selection if multiple agents found
5. User selects tenant → sets active Agent
6. All subsequent requests use that Agent's tenantId

**File Reference**: `soupmarkets-web/docs/MULTI-TENANCY.md` (mentioned in CLAUDE.md)

---

## 8. Client Controller (No Direct Login Endpoint)

### ClientController API

**File**: `grails-app/controllers/soupbroker/kyc/ClientController.groovy`

**Key Endpoints**:
```groovy
@Secured(["ROLE_ADMIN", "ROLE_USER"])
GET  /rest/client/index.json          // List clients
GET  /rest/client/show/{id}.json      // Get client
POST /rest/client/save.json           // Create/update
DELETE /rest/client/delete/{id}.json  // Delete

@Secured(["permitAll"])
GET  /rest/client/individualList.json // Public client list
POST /authenticate.json                // 2FA authentication
POST /pinResetRequest.json             // Request PIN reset
POST /pinResetConfirm.json             // Confirm PIN reset
GET  /myProfile.json                   // Get logged-in client profile
GET  /holdings.json                    // Get client holdings
```

**Authentication Method**: `authenticate.json` (line 200+)
- Sends/verifies 2FA codes
- Custom authentication flow (NOT Spring Security REST)
- Uses `Contact.clientUser` to link to SbUser

**Missing**: No `/client/login.json` endpoint
- SDKs likely use custom authentication controllers
- Or use the same `/rest/api/login` endpoint

---

## 9. Recommendations for SoupFinance Integration

### Authentication Strategy

**Option 1: Use Existing Spring Security REST**
- Reuse `/rest/api/login` endpoint
- Store tokens in `AuthenticationToken` domain
- Send via `X-Auth-Token` header

**Option 2: Custom Client Authentication**
- Create `/client/login.json` endpoint
- Follow Contact → SbUser → Token pattern
- Support email/phone + password login

### User Registration Flow

For self-service corporate registration (SoupFinance requirement):

```
1. POST /register/register.json
   - Create Corporate entity
   - Create BasicInformation
   - Create EmailContact with verification code

2. GET /authenticator/verifyCode/{code}
   - Verify email
   - Mark Contact as verified

3. POST /register/completeRegistration
   - Create SbUser with username/password
   - Link Contact.clientUser to SbUser
   - Create AuthenticationToken
   - Return token to frontend

4. Subsequent requests use token
```

### Token Storage (Frontend)

**Admin SPA Pattern**:
- Store token in localStorage
- Attach to all requests via interceptor
- Include in `X-Auth-Token` header

**Mobile SDK Pattern**:
- Store token in secure storage (Keychain/Keystore)
- Include in all API requests
- Handle 401 responses → redirect to login

---

## 10. Summary Table

| Aspect | Details |
|--------|---------|
| **Auth Plugin** | Spring Security REST GORM v3.0.1 |
| **Token Storage** | `AuthenticationToken` domain (username → token) |
| **Admin Login** | `/rest/api/login` (JSON credentials) |
| **Client Login** | Custom 2FA flow via `/2fa/*` or `/authenticator/*` |
| **Token Header** | `X-Auth-Token` (not Bearer) |
| **Token Format** | Plain UUID string (not JWT) |
| **Token Expiry** | Auto-refresh after 24 hours (no hard expiry) |
| **User Domain** | `SbUser` (Long ID, BCrypt password) |
| **Agent Domain** | `Agent` (UUID ID, extends SbDomain, multi-tenant) |
| **Contact Domain** | `Contact` (UUID ID, links to SbUser via clientUser FK) |
| **Multi-Tenancy** | Discriminator-based (`tenantId` column) |
| **Cross-Tenant** | One SbUser can have multiple Agents (different tenants) |
| **Roles** | Direct + Group + Overrides, calculated in Agent.getEffectiveRoles() |
| **Permissions** | Department-based + role-based + agent-level overrides |

---

## 11. Files Referenced

| File | Purpose |
|------|---------|
| `build.gradle:152` | Spring Security REST plugin dependency |
| `grails-app/conf/application.groovy:817-836` | REST auth configuration |
| `grails-app/conf/application.yml:7-10` | Multi-tenancy configuration |
| `grails-app/controllers/soupbroker/UrlMappings.groovy:19-21` | Login/logout endpoints |
| `grails-app/controllers/soupbroker/CustomLoginController.groovy` | Custom 2FA authentication |
| `grails-app/controllers/soupbroker/kyc/ClientController.groovy` | Client management & portal auth |
| `grails-app/domain/soupbroker/security/SbUser.groovy` | User authentication domain |
| `grails-app/domain/soupbroker/security/Agent.groovy` | Agent authorization domain |
| `grails-app/domain/soupbroker/Contact.groovy` | Client contact base class |
| `grails-app/domain/soupbroker/security/AuthenticationToken.groovy` | Token storage domain |
| `src/main/groovy/soupbroker/PublicEndpointConfig.groovy` | Public endpoint definitions |

---

## 12. Next Steps for SoupFinance

1. **Review existing authentication patterns** in `soupmarkets-web/spa/` Angular SPA
2. **Decide on user model**: Corporate users vs Agent users vs both
3. **Implement token storage** in React app (localStorage or sessionStorage)
4. **Create API client** with token interceptor (similar to `spa/src/app/api-http.service.ts`)
5. **Handle 401 responses** → clear token, redirect to login
6. **Support multi-tenant selection** if needed (dropdown after login)
7. **Implement self-service registration** for Corporate entities

---

**Research Duration**: ~45 minutes
**Files Read**: 11 domain/controller files + 3 config files
**Lines Analyzed**: ~3,500 lines of code
