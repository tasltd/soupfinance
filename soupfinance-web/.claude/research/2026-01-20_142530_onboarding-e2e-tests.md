# Research: Corporate Onboarding E2E Tests

**Date**: 2026-01-20T14:25:30Z
**Query**: Add comprehensive E2E Playwright tests for the corporate onboarding flow in SoupFinance
**Duration**: ~15 minutes

## Executive Summary

Created comprehensive E2E tests for the 4-page corporate KYC onboarding flow. The tests cover all UI interactions, form validations, navigation flows, and loading states across CompanyInfoPage, DirectorsPage, DocumentsPage, and KycStatusPage.

## Detailed Findings

### Files Found

- `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/e2e/auth.spec.ts` - Existing auth E2E tests (used as pattern reference)
- `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/e2e/registration.spec.ts` - Existing registration E2E tests (used as pattern reference)
- `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/e2e/fixtures.ts` - Mock data and API helpers
- `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/src/features/corporate/CompanyInfoPage.tsx` - Company info form with addresses and business details
- `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/src/features/corporate/DirectorsPage.tsx` - Directors CRUD with modal forms
- `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/src/features/corporate/DocumentsPage.tsx` - Document upload with drag-and-drop
- `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/src/features/corporate/KycStatusPage.tsx` - Status timeline and summary
- `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/src/types/index.ts` - TypeScript type definitions
- `/home/ddr/Documents/code/soupmarkets/soupfinance/soupfinance-web/src/api/endpoints/corporate.ts` - API endpoint definitions

### Onboarding Flow Structure

| Page | Route | Key Features |
|------|-------|--------------|
| Company Info | `/onboarding/company?id=:id` | Physical/postal addresses, industry dropdown, revenue/employee ranges |
| Directors | `/onboarding/directors?id=:id` | Directors CRUD list, add/edit modal, delete confirmation |
| Documents | `/onboarding/documents?id=:id` | File upload dropzone, document types, progress indicator |
| KYC Status | `/onboarding/status?id=:id` | Status timeline (PENDING/APPROVED/REJECTED), summary cards |

### API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/rest/corporate/show/:id.json` | Fetch corporate data |
| PUT | `/rest/corporate/update/:id.json` | Update company info |
| GET | `/rest/corporateAccountPerson/index.json` | List directors |
| POST | `/rest/corporateAccountPerson/save.json` | Add director |
| PUT | `/rest/corporateAccountPerson/update/:id.json` | Update director |
| DELETE | `/rest/corporateAccountPerson/delete/:id.json` | Delete director |
| GET | `/rest/corporateDocuments/index.json` | List documents |
| POST | `/rest/corporateDocuments/save.json` | Upload document |
| DELETE | `/rest/corporateDocuments/delete/:id.json` | Delete document |
| POST | `/rest/corporate/submitKyc/:id.json` | Submit KYC for review |

### Type Definitions Used

```typescript
interface Corporate {
  id: string;
  name: string;
  certificateOfIncorporationNumber: string;
  businessCategory: BusinessCategory;
  email: string;
  phoneNumber: string;
  kycStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface CorporateAccountPerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: 'DIRECTOR' | 'SIGNATORY' | 'BENEFICIAL_OWNER';
  corporate: { id: string };
}

interface CorporateDocuments {
  id: string;
  documentType: 'CERTIFICATE_OF_INCORPORATION' | 'BOARD_RESOLUTION' | 'MEMORANDUM' | 'PROOF_OF_ADDRESS';
  fileName: string;
  fileUrl: string;
  corporate: { id: string };
}
```

## Files Created/Modified

### Created: `e2e/onboarding.spec.ts`
Comprehensive E2E test suite with:
- **Company Info Page Tests** (8 tests): Form rendering, field validation, submission, skip/back navigation
- **Directors Page Tests** (10 tests): Empty state, add/edit/delete directors, modal interactions
- **Documents Page Tests** (8 tests): Upload slots, file upload, delete, submit flow
- **KYC Status Page Tests** (8 tests): Pending/approved/rejected states, navigation buttons
- **Full Flow Integration Test** (1 test): End-to-end journey through all 4 pages

### Modified: `e2e/fixtures.ts`
Added new mock helpers:
- `mockCorporate` - Extended with kycStatus and dateCreated
- `mockDirector` - New mock director data
- `mockDocument` - New mock document data
- `mockCorporateApi()` - Mock GET /corporate/show and current endpoints
- `mockDirectorsApi()` - Mock directors list endpoint
- `mockDocumentsApi()` - Mock documents list endpoint

## Test Coverage Summary

| Page | Tests | Coverage Areas |
|------|-------|----------------|
| CompanyInfoPage | 8 | Form rendering, field inputs, dropdowns, checkboxes, navigation, loading states |
| DirectorsPage | 10 | Empty state, list display, add modal, edit modal, delete confirmation, validation |
| DocumentsPage | 8 | Document slots, file upload, delete, required docs check, submit button state |
| KycStatusPage | 8 | Pending/approved/rejected banners, timeline, summary cards, navigation |
| Integration | 1 | Complete flow from company info to status |

**Total: 35 tests**

## Recommendations

1. **Run tests**: Execute `npx playwright test e2e/onboarding.spec.ts --headed` to verify
2. **Add data-testid attributes**: For more reliable selectors, consider adding data-testid to key elements in components
3. **Component isolation**: Some tests may need adjustment if component structure changes
4. **API error scenarios**: Consider adding tests for API failure cases

## Raw Data

### Existing Test Patterns Used

The tests follow established patterns from `auth.spec.ts` and `registration.spec.ts`:
- `takeScreenshot()` at key points
- `mockXxxApi()` helpers for route mocking
- `test.beforeEach()` for auth state setup
- `page.waitForURL()` for navigation verification
- `expect().toBeVisible()` / `expect().toBeDisabled()` assertions
