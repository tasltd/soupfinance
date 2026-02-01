# Corporate KYC Domain Structure Research

**Date**: 2026-01-20 02:05
**Source**: Explore agent analyzing soupmarkets-web backend

## Summary

Comprehensive analysis of Soupmarkets corporate KYC domain structure for SoupFinance implementation.

---

## 1. Core Domain Classes

### Corporate Domain
**Path**: `soupmarkets-web/grails-app/domain/soupbroker/kyc/Corporate.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Registered company name (required) |
| `businessCategory` | BusinessCategory enum | LIMITED_LIABILITY, PARTNERSHIP, etc. |
| `certificateOfIncorporationNumber` | String | Company registration number |
| `registrationDate` | Date | Date of incorporation |
| `countryOfIncorporation` | String | Country of registration |
| `natureOfBusiness` | String | Business activities description |
| `industry` | ClientIndustry | Industry classification |
| `taxIdentificationNumber` | String | TIN/VAT number |
| `annualTurnOver` | AnnualTurnOver | Revenue bracket (lookup) |
| `accountMandateRule` | AccountMandateRule enum | Signing authority rules |
| `website` | String | Company website URL |
| `postalAddress` | String | Postal/mailing address |
| `location` | String | Physical street address |

### CorporateDocuments Domain
**Path**: `soupmarkets-web/grails-app/domain/soupbroker/kyc/CorporateDocuments.groovy`

| Document Field | Type | Description |
|----------------|------|-------------|
| `certificateOfIncorporation` | SoupBrokerFile | Certificate of incorporation |
| `boardResolution` | SoupBrokerFile | Board resolution for account opening |
| `memorandumAndArticlesOfAssociation` | SoupBrokerFile | Memorandum & Articles |
| `proofOfCompanyAddress` | SoupBrokerFile | Address proof |
| `powerOfAttorney` | SoupBrokerFile | Power of attorney |

### CorporateAccountPerson Domain
**Path**: `soupmarkets-web/grails-app/domain/soupbroker/kyc/CorporateAccountPerson.groovy`

| Field | Type | Description |
|-------|------|-------------|
| `surname` | String | Last name |
| `firstName` | String | First name |
| `dateOfBirth` | Date | Birth date |
| `nationality` | Nationality enum | Nationality |
| `identityType` | IdentityType enum | ID type |
| `ID_Number` | String | ID number |
| `keyContact` | boolean | Primary contact person |
| `signatory` | boolean | Authorized signatory |
| `director` | boolean | Company director |
| `jobTitle` | String | Position in company |

---

## 2. Key Enums

### BusinessCategory
```
SOLE_PROPRIERTORSHIP, PARTNERSHIP, LIMITED_LIABILITY,
LIMITED_BY_GUARANTEE, CHARITIES_AND_NGOS, OTHER
```

### ApprovalState
```
PENDING, APPROVED, REJECTED
```

### AccountMandateRule
```
ONE_TO_SIGN, EITHER_TO_SIGN, ALL_TO_SIGN, OTHERS
```

---

## 3. Registration API

**Endpoint**: `POST /client/register.json`

**Required Fields**:
- `firstName` or `name` (for corporate)
- `lastName` (for individual)
- `phoneNumber` OR `email`
- `pin` (PIN code)
- `type` (INDIVIDUAL or CORPORATE)

**Returns**:
```json
{
  "client": {
    "id": "uuid",
    "emailContacts": [...],
    "phoneContacts": [...],
    "accountServicesList": [...]
  }
}
```

---

## 4. Patterns for SoupFinance

1. **Corporate-Client Composition**: Corporate shares primary key with Client via foreign key ID mapping
2. **Multi-Tenancy**: All domains extend SbDomain with `tenantId` discriminator
3. **Soft Delete**: `archived` flag
4. **Document Upload**: Uses `SoupBrokerFile` for document storage
5. **Approval Workflow**: ClientAccountApproval tracks state changes

---

## 5. File Paths

| Domain | Path |
|--------|------|
| Corporate | `grails-app/domain/soupbroker/kyc/Corporate.groovy` |
| CorporateDocuments | `grails-app/domain/soupbroker/kyc/CorporateDocuments.groovy` |
| CorporateAccountPerson | `grails-app/domain/soupbroker/kyc/CorporateAccountPerson.groovy` |
| Client | `grails-app/domain/soupbroker/kyc/Client.groovy` |
| ClientController | `grails-app/controllers/soupbroker/kyc/ClientController.groovy` |
