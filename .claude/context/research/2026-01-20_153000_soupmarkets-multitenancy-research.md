# Research: Soupmarkets Multi-Tenancy Architecture

**Date**: 2026-01-20 15:30:00
**Query**: Multi-tenancy setup in soupmarkets-web Grails backend - tenant domain, creation, isolation, default data
**Duration**: ~20 minutes

## Executive Summary

Soupmarkets uses **discriminator-based multi-tenancy** where `Account` is the tenant entity and all other domains extend `SbDomain` with a `tenantId` column. The platform has 2-3 active tenants: Demo Securities (used by demo.soupmarkets.com and edge.soupmarkets.com), Strategic African Securities (sas.soupmarkets.com), and production Soupmarkets. Tenant resolution is thread-safe with multi-layer caching, and default data includes ledger account categories, payment methods, and system accounts.

## Detailed Findings

### 1. Tenant Domain Class Structure

**Location**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/Account.groovy`

**Account is THE tenant entity**:
- Does NOT extend multi-tenancy trait (Account IS the tenant)
- Account.id serves as `tenantId` for all other entities
- All other domains extend `SbDomain` which has `tenantId` property

**Key Account Properties**:

| Category | Properties |
|----------|------------|
| **Basic Info** | name, address, location, countryOfOrigin, designation, slogan |
| **Branding** | logo (SoupBrokerFile), favicon, website, emailSubjectPrefix, smsIdPrefix |
| **Default Accounts** | defaultPayableAccount, defaultSecurityAccount, defaultProprietaryAccount, defaultReceivableAccount |
| **Configuration** | currency, startOfFiscalYear, businessLicenceCategory (BROKER/ASSET_MANAGER) |
| **Feature Toggles** | 25+ boolean flags for jobs, emails, compliance, reporting |
| **UI Settings** | preferredTemplateLayout (HORIZONTAL/VERTICAL), automateActingAs |
| **Status** | disabled (boolean), archived (boolean) |

### 2. Multi-Tenancy Mechanism (SbDomain Base Class)

**Location**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/src/main/groovy/soupbroker/SbDomain.groovy`

All tenant-scoped domains extend `SbDomain`:

```groovy
abstract class SbDomain implements CommonMethods {
    String tenantId  // Discriminator column for multi-tenancy
    String id        // UUID string (not integer)
    String serialised // Keyword search field (toString() of domain)
    boolean archived  // Soft-delete flag
    Date dateCreated
    Date lastUpdated

    static mapping = {
        id generator: 'uuid', type: "string"
    }
}
```

**Important**: All IDs are UUID strings, never integers.

### 3. Current Tenant Resolution (Account.current())

**Method**: `Account.getCurrent()` in Account.groovy (lines 626-675)

**Thread-Safe Multi-Layer Resolution**:

```
Priority 1: ThreadLocal (request-scoped)
    ↓
Priority 2: ConcurrentHashMap cache (5-min expiry)
    ↓
Priority 3: Tenants.currentId() (GORM tenant resolver)
    ↓
Priority 4: Session attributes ('tenantId', 'selectedTenantAccountId', 'agentId')
    ↓
Priority 5: SpringSecurity currentUser → Agent.account
    ↓
Priority 6: Database lookup
```

**Key Implementation Details**:
- Cache expiry: 5 minutes (300,000ms)
- Thread-safe via `ConcurrentHashMap` and `ThreadLocal`
- Fallback to authenticated user's Agent.account when no GORM tenant context
- `Account.clearCurrent()` must be called to prevent memory leaks
- `Account.refreshCurrent()` forces cache reload

**Multi-Tenant User Support**:
A single user can have multiple `Agent` records across different tenants. The login flow:
1. User logs in → system checks for multiple agents
2. If multiple: show tenant selector (`AuthenticatorController.selectTenant`)
3. Selected tenant stored in session: `session.setAttribute('tenantId', account.id)`
4. `Account.getCurrent()` reads session to resolve correct tenant

### 4. Existing Tenants

**Identified Tenants** (from HostnameResolver.groovy and docs):

| Hostname | Account Name Pattern | Description |
|----------|---------------------|-------------|
| `sas.soupmarkets.com` | `Strategic African Securities%` | SAS tenant |
| `demo.soupmarkets.com` | `Demo Securities%` | Demo tenant |
| `edge.soupmarkets.com` | `Demo Securities%` | Edge uses Demo data |
| `soupmarkets.com` | `Soupmarkets%` | Production |
| `localhost` / `127.0.0.1` | `Demo Securities%` | Local development default |

**Note**: Account names may have suffixes (e.g., "Demo Securities & Asset Limited"). Hostname resolution uses `LIKE` queries with `%` wildcard.

**No "techatscale" tenant found** in the codebase. This would be a new tenant to create.

### 5. Tenant Creation Process

**No dedicated tenant creation service found**. Tenants appear to be created manually or via database import. However, the pattern can be inferred from:

**Test tenant creation** (from MultiTenancyTestSupport.groovy:42):
```groovy
def testAccount = new Account(
    id: testTenantId,
    name: "Test Account",
    currency: Currency.getInstance("USD")
)
```

**Default Account Creation Pattern** (from Account.groovy methods):

1. Create Account entity with basic properties
2. Auto-create default ledger accounts via:
   - `checkAndGetDefaultPayableAccount()` → "OTHER LIABILITIES" category
   - `checkAndGetDefaultSecurityAccount()` → "SECURITIES UNDER CUSTODY" category
   - `checkAndGetDefaultProprietaryAccount()` → "TRADING PORTFOLIO" category
   - `checkAndGetDefaultReceivableAccount()` → "OTHER ASSETS" or "ACCOUNT RECEIVABLE" category

These methods check for existing accounts and create system accounts if missing.

### 6. Default Data Seeded for Tenants

**Ledger Account Categories** (required for default accounts):
Based on Account.groovy references, these categories must exist:
- "OTHER LIABILITIES" (for payable account)
- "SECURITIES UNDER CUSTODY" (for security holdings)
- "TRADING PORTFOLIO" (for proprietary trading)
- "OTHER ASSETS" (for receivables)
- "ACCOUNT RECEIVABLE" (alternative for receivables)

**Standard ledger categories** (inferred from report templates and services):
- ASSETS
- LIABILITIES
- EQUITY
- INCOME
- EXPENSES

**Other default entities** (from TestSetupService imports):
- SecurityType, SecuritySubType (trading securities)
- Market, Exchange, Depository (trading venues)
- RequestChannel (order channels)
- PaymentMethod (payment types)
- IdentityType (ID document types)
- ContractNoteConfig, CashReportConfig (report settings)

**Important**: Most default data appears to be seeded via database import (`docker/seed-data.sql.gz` mentioned in LXC docs), NOT via Grails bootstrap code.

### 7. Cross-Tenant Operations

**@WithoutTenant Annotation**:
Used for services that need to query across tenants or when tenant context isn't set:

```groovy
@WithoutTenant
class MyJobService {
    void processAllTenants() {
        def accounts = Account.withTransaction(readOnly: true) {
            Account.findAllByDisabled(false)
        }
        accounts.each { Account account ->
            Tenants.withId(account.id) {
                // Process tenant-specific data
            }
        }
    }
}
```

**Tenants.withoutId {}**: Closure wrapper for bypassing tenant filtering
**Tenants.withId(id) {}**: Closure wrapper for explicit tenant context
**Tenants.eachTenant {}**: Iterate all tenants

### 8. Tenant-Specific Settings

Accounts have extensive configuration via boolean flags (Account.groovy lines 195-278):

| Category | Examples |
|----------|----------|
| **Email Reports** | emailClientSummaryStatement, emailClientTransactionStatement, emailClientCustodyStatement |
| **Scheduled Jobs** | enableInterestAndMaturityPaymentJob, enablePortfolioFeeGeneration, enableWeeklyClientStatement |
| **Notifications** | enableMonthlyApprovalStateNotification, enableIdExpiryNotification, enableClientOrderNotice |
| **Compliance** | enableSanctionsListCheck, enableExceptionsReport |
| **Features** | enableClientAccountNumbers, enableFinanceToTradeApprovals, enableSecuritiesUpdatesFromDailyTradingData |

All default to `false` (column default: 0) unless specified.

**Business Licence Category**:
- `BROKER`: Trade-focused dashboard (executions, commissions, order flow)
- `ASSET_MANAGER`: AUM-focused dashboard (NAV, returns, net flows, schemes)

### 9. Public Endpoint Tenant Resolution

**TenantFromHostnameInterceptor** (mentioned in docs/MULTI-TENANCY.md):
For public endpoints (`@Secured(['permitAll'])`), sets `tenantId` in session based on hostname.

**HostnameResolver.getTenantIdForHostname()** (lines 158-196):
Maps hostname to Account.id for unauthenticated requests:
- Looks up Account by name pattern using `LIKE` query
- Returns Account.id for use as tenantId
- Used by public APIs (securities, markets, flows, register endpoints)

## Recommendations for Creating "techatscale" Tenant

### Minimal Tenant Creation Steps

1. **Create Account record** (in database or via Grails console):
```groovy
Account.withTransaction {
    def techatscaleAccount = new Account(
        name: "TechAtScale Finance",
        designation: "Corporate Accounting Platform",
        currency: Currency.getInstance("USD"), // or GHS, EUR, etc.
        businessLicenceCategory: BusinessLicenceCategory.BROKER, // or ASSET_MANAGER
        emailSubjectPrefix: "[TechAtScale]",
        smsIdPrefix: "TAS",
        preferredTemplateLayout: TemplateLayout.HORIZONTAL,
        disabled: false,
        archived: false
    ).save(flush: true)

    println "Created tenant: ${techatscaleAccount.id}"
}
```

2. **Create default ledger accounts** (automatically via Account methods):
```groovy
Tenants.withId(techatscaleAccountId) {
    Account.withTransaction {
        def account = Account.get(techatscaleAccountId)
        account.checkAndGetDefaultPayableAccount()
        account.checkAndGetDefaultSecurityAccount()
        account.checkAndGetDefaultProprietaryAccount()
        account.checkAndGetDefaultReceivableAccount()
    }
}
```

3. **Seed ledger account categories** (if not already present):
These must exist before creating default accounts. Check existing tenants or seed manually:
```groovy
def categories = [
    [name: "ASSETS", group: LedgerGroup.BALANCE_SHEET],
    [name: "LIABILITIES", group: LedgerGroup.BALANCE_SHEET],
    [name: "EQUITY", group: LedgerGroup.BALANCE_SHEET],
    [name: "INCOME", group: LedgerGroup.INCOME_STATEMENT],
    [name: "EXPENSES", group: LedgerGroup.INCOME_STATEMENT],
    [name: "OTHER ASSETS", group: LedgerGroup.BALANCE_SHEET],
    [name: "OTHER LIABILITIES", group: LedgerGroup.BALANCE_SHEET],
    [name: "SECURITIES UNDER CUSTODY", group: LedgerGroup.BALANCE_SHEET],
    [name: "TRADING PORTFOLIO", group: LedgerGroup.BALANCE_SHEET],
    [name: "ACCOUNT RECEIVABLE", group: LedgerGroup.BALANCE_SHEET]
]

Tenants.withId(techatscaleAccountId) {
    categories.each { cat ->
        LedgerAccountCategory.withTransaction {
            if (!LedgerAccountCategory.findByName(cat.name)) {
                new LedgerAccountCategory(
                    name: cat.name,
                    ledgerGroup: cat.group
                ).save(flush: true)
            }
        }
    }
}
```

4. **Create admin user and agent**:
```groovy
// Create SbUser (shared across tenants)
Tenants.withoutId {
    def user = new SbUser(
        username: "admin@techatscale.com",
        password: "temporaryPassword", // Will be hashed
        enabled: true
    ).save(flush: true)

    // Create Agent (tenant-specific)
    Tenants.withId(techatscaleAccountId) {
        new Agent(
            userAccess: user,
            account: Account.get(techatscaleAccountId),
            firstName: "TechAtScale",
            lastName: "Admin",
            disabled: false
        ).save(flush: true)
    }
}
```

5. **Configure hostname mapping** (if hosting on separate subdomain):
Add to HostnameResolver.groovy:
```groovy
if (hostname?.contains('techatscale.soupmarkets.com')) {
    accountNamePattern = 'TechAtScale Finance%'
}
```

### Full Tenant Bootstrap Script Template

```groovy
import grails.gorm.multitenancy.Tenants
import soupbroker.*
import soupbroker.finance.*
import soupbroker.security.*

// Execute in Grails console or bootstrap script

Tenants.withoutId {
    Account.withTransaction {
        // 1. Create tenant account
        def account = new Account(
            name: "TechAtScale Finance",
            designation: "Corporate Accounting Platform",
            currency: Currency.getInstance("USD"),
            businessLicenceCategory: BusinessLicenceCategory.BROKER,
            emailSubjectPrefix: "[TechAtScale]",
            smsIdPrefix: "TAS",
            preferredTemplateLayout: TemplateLayout.HORIZONTAL,
            disabled: false,
            archived: false
        ).save(flush: true)

        def tenantId = account.id
        println "Created Account: ${account.name} (ID: ${tenantId})"

        // 2. Switch to tenant context
        Tenants.withId(tenantId) {
            // 3. Create ledger account categories (if not present)
            def categories = [
                [name: "ASSETS", group: LedgerGroup.BALANCE_SHEET],
                [name: "LIABILITIES", group: LedgerGroup.BALANCE_SHEET],
                [name: "EQUITY", group: LedgerGroup.BALANCE_SHEET],
                [name: "INCOME", group: LedgerGroup.INCOME_STATEMENT],
                [name: "EXPENSES", group: LedgerGroup.INCOME_STATEMENT],
                [name: "OTHER ASSETS", group: LedgerGroup.BALANCE_SHEET],
                [name: "OTHER LIABILITIES", group: LedgerGroup.BALANCE_SHEET],
                [name: "SECURITIES UNDER CUSTODY", group: LedgerGroup.BALANCE_SHEET],
                [name: "TRADING PORTFOLIO", group: LedgerGroup.BALANCE_SHEET],
                [name: "ACCOUNT RECEIVABLE", group: LedgerGroup.BALANCE_SHEET]
            ]

            categories.each { cat ->
                if (!LedgerAccountCategory.findByName(cat.name)) {
                    new LedgerAccountCategory(
                        name: cat.name,
                        ledgerGroup: cat.group
                    ).save(flush: true)
                    println "Created category: ${cat.name}"
                }
            }

            // 4. Create default ledger accounts
            account.checkAndGetDefaultPayableAccount()
            account.checkAndGetDefaultSecurityAccount()
            account.checkAndGetDefaultProprietaryAccount()
            account.checkAndGetDefaultReceivableAccount()
            println "Created default ledger accounts"
        }

        // 5. Create admin user (outside tenant context)
        Tenants.withoutId {
            def user = SbUser.findByUsername("admin@techatscale.com") ?: new SbUser(
                username: "admin@techatscale.com",
                password: "ChangeMe123!", // Will be hashed by Spring Security
                enabled: true
            ).save(flush: true)

            // 6. Create agent (inside tenant context)
            Tenants.withId(tenantId) {
                new Agent(
                    userAccess: user,
                    account: account,
                    firstName: "TechAtScale",
                    lastName: "Admin",
                    disabled: false
                ).save(flush: true)
                println "Created admin agent for tenant"
            }
        }

        println "✓ Tenant setup complete!"
        println "Account ID (tenantId): ${tenantId}"
        println "Login: admin@techatscale.com / ChangeMe123!"
    }
}
```

## Raw Data

### Files Examined

| File | Lines Read | Key Info |
|------|------------|----------|
| Account.groovy | 872 | Tenant domain, current() method, default accounts |
| SbDomain.groovy | 155 | Base class with tenantId, UUID IDs, soft-delete |
| MULTI-TENANCY.md | 192 | Multi-tenancy patterns, login flow, tenant context |
| HostnameResolver.groovy | 198 | Hostname → tenantId mapping for public endpoints |
| BootStrap.groovy | 300 | Startup initialization, no tenant creation |
| TestSetupService.groovy | 350 | Test data setup patterns |
| BootstrapListenerService.groovy | 250 | Cache warming, data migrations |

### Tenant-Related Domains Found

| Domain | Multi-Tenant? | Purpose |
|--------|---------------|---------|
| Account | No (IS the tenant) | Tenant configuration entity |
| Agent | Yes (has tenantId) | User → Tenant mapping |
| SbUser | No (shared) | Authentication credentials |
| LedgerAccount | Yes | Financial accounts |
| LedgerAccountCategory | Yes | Chart of accounts structure |
| Individual | Yes | KYC individual clients |
| Corporate | Yes | KYC corporate clients |
| Security | No (shared) | Trading securities |
| Market | No (shared) | Trading markets |

### Account.current() Resolution Priority

```
1. ThreadLocal._currentAccount.get()
   ↓ (if null)
2. ConcurrentHashMap._accountCache.get(tenantId) + timestamp check
   ↓ (if expired or null)
3. Tenants.currentId() → GORM tenant resolver
   ↓ (if null)
4. Session attributes → getTenantIdFromAuthenticatedUser()
   - session.getAttribute('tenantId')
   - session.getAttribute('selectedTenantAccountId')
   - session.getAttribute('agentId') → Agent.get().tenantId
   ↓ (if null)
5. SpringSecurity.currentUser → Agent.findByUserAccess(user).account.id
   ↓ (if null)
6. Database: Account.createCriteria().get { eq("id", tenantId); eq("disabled", false) }
```

## Next Steps for SoupFinance Integration

1. **Decision**: Run SoupFinance as separate tenant OR separate application?
   - **Separate tenant**: Shares backend, uses existing infra, multi-tenancy overhead
   - **Separate app**: Clean separation, independent deployment, no tenant coupling

2. **If separate tenant**:
   - Create "TechAtScale Finance" Account in Soupmarkets DB
   - Seed ledger categories and default accounts
   - Create admin user/agent
   - Configure hostname mapping (techatscale.soupmarkets.com)
   - Customize Account.businessLicenceCategory if needed
   - Deploy SoupFinance SPA pointing to Soupmarkets backend `/rest/*` endpoints

3. **If separate app**:
   - SoupFinance gets its own Grails backend (or use existing FastAPI plan)
   - No multi-tenancy needed
   - SoupFinance React app talks to SoupFinance backend only
   - Can reference Soupmarkets patterns but fully independent

## Conclusion

Soupmarkets' multi-tenancy is mature and production-tested with 2-3 active tenants. The discriminator pattern with `tenantId` column is clean and performant. Creating a new tenant requires manual database work or Grails console scripts - there's no built-in tenant provisioning API. Default data seeding appears to rely on database imports rather than Grails code, which means new tenants may need data copied from an existing tenant template.

**Recommendation**: For SoupFinance, consider if full multi-tenancy is needed or if a lighter integration (shared auth, separate data) would be simpler.
