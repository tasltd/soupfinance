# Research: Corporate KYC Domain Model in Soupmarkets Backend

**Date**: 2026-01-20 14:30:00
**Query**: Research corporate KYC domain classes and requirements in soupmarkets-web Grails backend
**Duration**: ~15 minutes
**Backend Path**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web`

---

## Executive Summary

The Soupmarkets backend uses a **composition pattern** (not inheritance) for Corporate KYC entities where Corporate shares the same primary key as the base Client entity via foreign key mapping. Corporate KYC requires 3 main domain classes (Corporate, CorporateDocuments, CorporateAccountPerson) plus the base Client entity. The approval workflow follows a multi-state progression from PENDING → APPROVED → COMPLIANCE → EXECUTIVE.

---

## Detailed Findings

### 1. Corporate KYC Domain Model

**Core Domain Classes:**
1. **Client** (`soupbroker.kyc.Client`) - Base client entity (abstract parent)
2. **Corporate** (`soupbroker.kyc.Corporate`) - Company/organization client type
3. **CorporateDocuments** (`soupbroker.kyc.CorporateDocuments`) - Document uploads container
4. **CorporateAccountPerson** (`soupbroker.kyc.CorporateAccountPerson`) - Directors/signatories
5. **Contact** (`soupbroker.Contact`) - Base for EmailContact and PhoneContact

**Inheritance Strategy:**
- **Pattern**: Foreign key ID mapping (NOT table-per-subclass inheritance)
- Corporate and Client **share the same UUID** as primary key
- `Corporate.id` is a foreign key to `Client.id`
- Corporate delegates property access to Client via `propertyMissing()` and `methodMissing()`

### 2. Corporate Domain Fields (All Required for Full Onboarding)

#### Company Registration Information
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | String | Yes | Registered company name (auto-capitalized) |
| `certificateOfIncorporationNumber` | String | No | Company registration number |
| `certificateToCommenceBusinessNumber` | String | No | Business commencement certificate |
| `registrationDate` | Date | No | Date of incorporation |
| `licenceNumber` | String | No | Business license number |
| `countryOfIncorporation` | String | No | ISO 3166-1 alpha-3 country code |
| `domesticRegionOfIncorporation` | DomesticRegion | No | State/region |
| `domesticSubRegionOfIncorporation` | DomesticSubRegion | No | City/district |
| `parentCompanyCountryOfIncorporation` | String | No | Parent company country (for subsidiaries) |

#### Business Details
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessCategory` | BusinessCategory | No | Legal entity type |
| `businessCategoryForOtherOption` | String | No | Custom category if OTHER |
| `natureOfBusiness` | String | No | Business description |
| `industry` | ClientIndustry | No | Industry classification |
| `annualTurnOver` | AnnualTurnOver | No | Revenue bracket |

**BusinessCategory Enum Values:**
- `SOLE_PROPRIERTORSHIP`
- `PARTNERSHIP`
- `LIMITED_LIABILITY`
- `LIMITED_BY_GUARANTEE`
- `CHARITIES_AND_NGOS`
- `OTHER`

#### Contact Information
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `principalPlaceOfBusiness` | String | No | Physical business address |
| `postalAddress` | String | No | Mailing address |
| `digitalAddress` | String | No | Ghana Post GPS address |
| `location` | String | No | Street address |
| `website` | String | No | Company website URL |
| `taxIdentificationNumber` | String | No | TIN/VAT number |

#### Account Configuration
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountMandateRule` | AccountMandateRule | No | Signing authority rules |
| `accountMandateRuleForOtherOption` | String | No | Custom mandate if OTHER |
| `acceptTermsAndConditions` | boolean | No | Terms acknowledgment |
| `declaration` | boolean | No | Information accuracy declaration |

#### Risk & Compliance
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `is_FATCA_Applicable` | boolean | No | US tax reporting flag |
| `shareholdersOrPartners` | List<IndividualUSA_FATCA_ComplianceInformation> | No | FATCA shareholder data |
| `clientScreening` | String | No | Due diligence notes |
| `natureOfHighRiskExposure` | String | No | High-risk activity description |
| `existingSubsidiaryAccount` | boolean | No | Subsidiary account flag |

#### Client Properties (via delegation)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `state` | ApprovalState | Yes | KYC approval state (default: PENDING) |
| `riskProfile` | RiskProfile | No | Investment risk tolerance |
| `pinCode` | String | No | SHA-256 encrypted PIN |
| `extReference` | String | No | External system reference (unique) |
| `notes` | String | No | Free-text notes |

### 3. CorporateDocuments Domain (Document Requirements)

All document fields are **optional** (`SoupBrokerFile` references):

| Document | Purpose |
|----------|---------|
| `certificateOfIncorporation` | Company registration certificate |
| `certificateToCommerceBusiness` | Business commencement certificate |
| `boardResolution` | Board authorization to open account |
| `memorandumAndArticlesOfAssociation` | Company constitution |
| `partnershipDeed` | Partnership agreement (for partnerships) |
| `constitutionOfUnregisteredAssociation` | Unregistered association docs |
| `actGazetterForGovernmentAgency` | Government agency gazette |
| `evidenceOfRegistrationWithOtherGovernmentAgencies` | Additional registration proof |
| `powerOfAttorney` | Power of attorney document |
| `letterOfIndemnity` | Indemnity letter |
| `proofOfCompanyAddress` | Address verification |

**Completion Tracking:**
- `getPercentageCompleted()` calculates document upload progress
- Corporate has `getOverallPercentageCompleted()` = average of info + docs completion

### 4. CorporateAccountPerson Domain (Directors/Signatories)

Each authorized person requires:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `corporate` | Corporate | Yes | Parent corporate entity |
| `surname` | String | No | Last name |
| `firstName` | String | No | First name |
| `otherNames` | String | No | Middle names |
| `dateOfBirth` | Date | No | Birth date |
| `gender` | Gender | No | MALE/FEMALE |
| `residentialStatus` | ResidentialStatus | No | Resident/Non-resident |
| `residentialAddress` | String | No | Home address |
| `taxID_Number` | String | No | Personal TIN |
| `nationality` | Nationality | No | Citizenship |

**Work Permit (for non-residents):**
| Field | Type | Description |
|-------|------|-------------|
| `residentPermitNumber` | String | Permit number |
| `permitIssueDate` | Date | Issue date |
| `permitPlaceOfIssue` | String | Issuing authority |
| `permitExpiryDate` | Date | Expiry date |
| `evidenceOfWorkPermit` | SoupBrokerFile | Permit scan |

**Identity Information:**
| Field | Type | Description |
|-------|------|-------------|
| `identityType` | IdentityType | PASSPORT, DRIVERS_LICENSE, etc. |
| `ID_Number` | String | ID number |
| `issueDate` | Date | ID issue date |
| `expiryDate` | Date | ID expiry date |
| `placeOfIssue` | String | ID issuing location |
| `proofOfIdentity` | SoupBrokerFile | ID scan |

**Role Flags:**
| Field | Type | Description |
|-------|------|-------------|
| `keyContact` | boolean | Primary contact person |
| `signatory` | boolean | Authorized to sign |
| `director` | boolean | Board director |
| `jobTitle` | String | Position in company |

**Signatures & Documents:**
| Field | Type | Description |
|-------|------|-------------|
| `accountMandateSignature` | SoupBrokerFile | Signature specimen |
| `passportSizedPhoto` | SoupBrokerFile | Photo |
| `emailIndemnitySignature` | SoupBrokerFile | Email indemnity signature |
| `emailIndemnity` | Date | Email indemnity date |
| `allowEmailIndemnity` | boolean | Email indemnity consent |

**Relationship:**
- Corporate has many: `signatoriesAndDirectorsList` (CorporateAccountPerson)
- Each Corporate must have at least one `keyContact = true` person

### 5. KYC Approval Workflow States

**ApprovalState Enum** (priority-based):

| State | Priority | Description |
|-------|----------|-------------|
| `REJECTED` | -1 | Application rejected, cannot trade |
| `BLOCKED` | 0 | Account blocked, trading suspended |
| `PENDING` | 1 | Awaiting initial review (default) |
| `UPDATED` | 2 | Client info updated, awaiting re-verification |
| `CHECKED` | 3 | Initial review completed |
| `APPROVED` | 4 | Approved for trading |
| `COMPLIANCE` | 5 | Compliance officer approved |
| `EXECUTIVE` | 6 | Executive/final approval |
| `ALL` | 7 | Filter value (not a real state) |

**Workflow Progression:**
```
PENDING → CHECKED → APPROVED → COMPLIANCE → EXECUTIVE
   ↓
REJECTED (at any stage)
   ↓
BLOCKED (post-approval suspension)
```

**State Tracking:**
- `Client.state` holds current approval state
- `ClientAccountApproval` records state changes with agent and timestamp
- `Client.getStateAgent()` returns the agent who performed current state approval

### 6. Individual vs Corporate Comparison

| Aspect | Individual | Corporate |
|--------|-----------|-----------|
| **Base Entity** | Client (shared ID) | Client (shared ID) |
| **Personal Info** | IndividualBasicInformation | Corporate.name |
| **Identity** | IndividualIdentityInformation | CorporateAccountPerson (multiple) |
| **Documents** | Individual domain fields | CorporateDocuments (embedded) |
| **Address** | IndividualAddressInformation | Corporate fields |
| **Employment** | IndividualEmploymentInformation | Corporate.industry |
| **Risk** | IndividualRiskAssessment | Corporate.natureOfHighRiskExposure |
| **Bank Details** | IndividualBankDetails | ClientBankDetails (via Client) |
| **Contact** | ClientContact | ClientContact (via Client) |

**Shared via Client:**
- `state` (ApprovalState)
- `riskProfile` (RiskProfile)
- `clientGroupList` (Set<ClientGroup>)
- `bankDetailsList` (Set<ClientBankDetails>)
- `depositoryAccountList` (Set<ClientDepositoryAccount>)
- `portfolioList` (Set<ClientPortfolio>)
- `emergencyContactList` (Set<ClientEmergencyContact>)
- `investmentFundAccount` (LedgerAccount)
- `investmentSecurityAccount` (LedgerAccount)

### 7. Controllers & API Endpoints

#### REST API (Admin/Agent)
**CorporateController** (`/rest/corporate/*`)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/rest/corporate/index.json` | List active corporates | ADMIN, USER |
| GET | `/rest/corporate/archived.json` | List archived corporates | ADMIN, USER |
| GET | `/rest/corporate/show/{id}.json` | Get corporate details | ADMIN, USER, CLIENT_PORTAL |
| GET | `/rest/corporate/create.json` | Get blank template | ADMIN, USER, CLIENT_PORTAL |
| POST | `/rest/corporate/save.json` | Create new corporate | ADMIN, USER |
| PUT | `/rest/corporate/update.json` | Update existing | permitAll |
| DELETE | `/rest/corporate/delete/{id}.json` | Delete corporate | ADMIN, USER |
| GET | `/rest/corporate/printCorporate/{id}` | Generate PDF | ADMIN, USER |

**Export Support:**
- Append `?f=csv`, `?f=excel`, or `?f=pdf` to index/archived endpoints
- Removes pagination, exports all matching records

**Field List (Index Table):**
```groovy
['name', 'client.relationshipManager', 'client.extReference', 'dateCreated',
 'client.state', 'client.stateAgent', 'client.emailContacts', 'client.phoneContacts',
 'client.depositoryAccount', 'postalAddress', 'location', 'website',
 'taxIdentificationNumber', 'industry']
```

#### Client-Facing API
**Note:** No `/client/corporate` endpoints found in URL mappings.

**Assumption:** Corporate registration likely uses:
- `/client/individual/save.json` with `clientType` parameter, OR
- Generic client registration endpoint

**Recommended Investigation:**
- Check UrlMappings.groovy for `/client/*` routes
- Look for ClientRegistrationController or similar
- Check if Corporate uses same endpoint as Individual with type discrimination

### 8. Multi-Tenancy

**Discriminator-Based Isolation:**
- All domains extend `SbDomain` with `tenantId` column
- Corporate inherits multi-tenancy from Client
- Each brokerage firm (Account/Tenant) has isolated client data
- Cross-tenant queries require `Tenants.withoutId {}` wrapper

**Tenant Assignment:**
- `beforeInsert()` sets `client.account = Account.findById(Tenants.currentId())`
- Account is automatically set based on current authenticated tenant context

### 9. Validation & Constraints

**Corporate Constraints:**
- `name` is nullable: false (required)
- `taxIdentificationNumber` unique: false (can duplicate across tenants)
- `certificateOfIncorporationNumber` unique: false
- Other fields: all nullable

**Client Constraints:**
- `investmentFundAccount` must be LIABILITY type
- `investmentSecurityAccount` must be LIABILITY type
- `extReference` must be unique
- `pinCode` automatically SHA-256 hashed on insert/update

### 10. Relationships

**Corporate hasMany:**
- `signatoriesAndDirectorsList` → CorporateAccountPerson

**Corporate hasOne:**
- `corporateDocuments` → CorporateDocuments
- `client` → Client (via foreign key ID)

**Corporate belongsTo:**
- `client` → Client

**Client hasMany (inherited by Corporate):**
- `clientContactList` → ClientContact
- `bankDetailsList` → ClientBankDetails
- `depositoryAccountList` → ClientDepositoryAccount
- `portfolioList` → ClientPortfolio
- `emergencyContactList` → ClientEmergencyContact
- `invoiceList` → Invoice
- `clientApprovalList` → ClientAccountApproval
- `kycClientGroupList` → KycClientGroup
- `changeRequestList` → ClientChangeRequest
- `sanctionsCheckList` → ClientSanctionListsCheck

### 11. File Uploads (SoupBrokerFile)

**Document Upload Pattern:**
- All documents stored as `SoupBrokerFile` references
- SoupBrokerFile likely includes: filename, contentType, fileSize, uploadDate, filePath/URL
- Documents can be uploaded via multipart/form-data
- No inline base64 encoding based on domain structure

**Document Types:**
- Company registration certificates
- Board resolutions
- Identity documents for directors/signatories
- Signature specimens
- Photos

### 12. Contact Management

**Contact Pattern:**
- Base `Contact` domain with polymorphic subclasses (EmailContact, PhoneContact)
- Linked via `ClientContact` join table
- Source tracking: `sourceName`, `sourceId`, `sourceProperty`
- Priority: PRIMARY or SECONDARY
- Verification: `authCode`, `verified` flag

**Corporate Contact Access:**
- `client.emailContacts` → Set<EmailContact>
- `client.phoneContacts` → Set<PhoneContact>
- CorporateAccountPerson also has own contacts

### 13. Data Serialization

**JSON Rendering:**
- Corporate uses Grails default JSON rendering (likely GSon templates)
- Fields exposed based on controller fieldList
- Nested properties accessed via dot notation: `client.state`, `client.emailContacts`

**FormData Binding (POST/PUT):**
- Use `application/x-www-form-urlencoded`
- Foreign keys: `client.id`, `corporate.id`, `industry.id`
- Nested objects: `corporateDocuments.certificateOfIncorporation.id`

### 14. Factory Methods

**Corporate Creation:**
```groovy
// Via factory method
def corporate = Corporate.create([
    name: "ACME Corporation Ltd",
    businessCategory: BusinessCategory.LIMITED_LIABILITY,
    // ... other params
])

// OR via constructor
def corporate = new Corporate([
    name: "ACME Corporation Ltd",
    // ... params
])
```

**Automatic Client Creation:**
- If `client` not provided in params, factory method creates new Client
- Client and Corporate saved separately but share same ID

---

## Raw Data

### File Locations

**Domain Classes:**
```
/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/domain/soupbroker/kyc/
├── Client.groovy                  # Base client entity
├── Corporate.groovy               # Corporate client type
├── CorporateDocuments.groovy      # Document container
├── CorporateAccountPerson.groovy  # Directors/signatories
└── Individual.groovy              # Individual client type (not read)
```

**Controllers:**
```
/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/controllers/soupbroker/kyc/
├── CorporateController.groovy           # REST CRUD endpoints
├── CorporateDocumentsController.groovy  # Document management
├── CorporateAccountPersonController.groovy # Director/signatory management
└── ClientController.groovy              # Base client operations
```

**Enums:**
```
/home/ddr/Documents/code/soupmarkets/soupmarkets-web/src/main/groovy/soupbroker/
├── kyc/ApprovalState.groovy       # KYC workflow states
├── BusinessCategory.groovy        # Legal entity types
└── Contact.groovy                 # Contact base class
```

### Key Service Classes (Not Read)
- `CorporateService` - CRUD operations
- `CorporateUtilityService` - List transformations
- `ClientService` - Base client operations

---

## Recommendations

### For SoupFinance React App Implementation

1. **Multi-Step Registration Flow:**
   ```
   Step 1: Company Info (name, registration, business details)
   Step 2: Directors & Signatories (CorporateAccountPerson - at least 1)
   Step 3: Document Uploads (CorporateDocuments)
   Step 4: Review & Submit
   ```

2. **Form State Management:**
   - Use Zustand store for registration state persistence
   - Support save-and-continue (draft state)
   - Track completion percentage per step

3. **API Integration:**
   - POST `/rest/corporate/save.json` with FormData serialization
   - Handle validation errors per field
   - Upload documents separately (multipart/form-data)

4. **Field Groupings:**
   ```typescript
   interface CorporateRegistration {
     // Step 1: Company Info
     name: string;
     certificateOfIncorporationNumber?: string;
     registrationDate?: Date;
     businessCategory?: BusinessCategory;
     industryId?: string;
     // ... 25+ company fields

     // Step 2: Directors (minimum 1)
     directors: CorporateAccountPerson[];

     // Step 3: Documents
     corporateDocuments: {
       certificateOfIncorporation?: File;
       boardResolution?: File;
       // ... 11 document fields
     };

     // Client-level fields
     client: {
       state?: 'PENDING';
       riskProfile?: RiskProfile;
       // ... inherited Client fields
     };
   }
   ```

5. **Status Tracking:**
   - Display KYC status badge (PENDING, APPROVED, etc.)
   - Show completion percentage (info + docs)
   - Highlight missing required fields

6. **Document Upload UX:**
   - Drag-drop file upload zones
   - Preview uploaded documents
   - Show upload progress
   - Validate file types (PDF, JPG, PNG)
   - Max file size enforcement

7. **Director/Signatory Management:**
   - Add/remove directors dynamically
   - At least one must be marked as `keyContact`
   - Each director needs identity info + signature specimen

8. **Validation:**
   - Client-side validation before submit
   - Match backend constraints (name required, etc.)
   - Unique company registration number check
   - TIN format validation

9. **Error Handling:**
   - Display Grails validation errors per field
   - Show global error banner for save failures
   - Handle 401/403 for auth issues

10. **Contact Info:**
    - Use polymorphic Contact pattern for emails/phones
    - Support multiple contacts with priority (PRIMARY/SECONDARY)
    - Email verification workflow with OTP

---

## Next Steps

1. **Investigate Client-Facing Registration API:**
   - Check UrlMappings.groovy for `/client/*` routes
   - Find how public corporate registration works
   - Determine if separate endpoint or type parameter

2. **Document Upload Implementation:**
   - Research `SoupBrokerFile` domain structure
   - Check upload endpoints (multipart/form-data)
   - Understand file storage mechanism (local vs cloud)

3. **Enum Values:**
   - Get full enum definitions for:
     - RiskProfile
     - AccountMandateRule
     - ClientIndustry
     - DomesticRegion/DomesticSubRegion
     - Nationality
     - IdentityType
     - Gender
     - ResidentialStatus

4. **Individual KYC Research:**
   - Compare Individual domain structure
   - Understand shared vs type-specific fields
   - Determine if UI should support both types

5. **Service Layer Analysis:**
   - Read CorporateService.groovy for business logic
   - Check validation rules beyond domain constraints
   - Understand approval workflow automation

6. **Testing Strategy:**
   - Review existing functional tests for Corporate
   - Understand test data patterns
   - Check OtpService for test authentication

---

## Summary

The Soupmarkets backend uses a sophisticated KYC system with:
- **3-tier structure**: Client (base) → Corporate (company) → CorporateDocuments (files)
- **6-state approval workflow**: PENDING → CHECKED → APPROVED → COMPLIANCE → EXECUTIVE
- **Multi-person authorization**: CorporateAccountPerson for directors/signatories
- **Comprehensive document tracking**: 11 document types in CorporateDocuments
- **Multi-tenant isolation**: Discriminator-based via tenantId column
- **Foreign key ID sharing**: Corporate and Client share same UUID

**Key Implementation Considerations:**
- FormData serialization (NOT JSON) for POST/PUT
- Nested object references via `field.id` pattern
- Multi-step registration with draft persistence
- Document upload via SoupBrokerFile references
- At least one director with `keyContact = true` required
- Completion tracking for UX progress indicators
