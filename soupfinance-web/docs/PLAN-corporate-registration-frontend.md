# SoupFinance Corporate Registration - Frontend Implementation Plan

## Overview

Update the SoupFinance frontend registration flow to collect **minimal information** for quick account creation. Additional KYC details will be collected in subsequent onboarding steps.

## Design Philosophy

**Registration = Quick & Simple**
- Collect only essential information to create the account
- Get the user through registration quickly
- Reduce friction and drop-off

**Onboarding = Complete KYC**
- After login, guide users through completing their profile
- Collect remaining corporate details in steps
- Add directors, upload documents progressively

## Current Issues

### Issue #1: Wrong API Endpoint
**Current**: `RegistrationPage.tsx` imports and calls `createCorporate()` from `corporate.ts`
```typescript
import { createCorporate } from '../../api/endpoints/corporate';
// Calls: POST /rest/corporate/save.json (REQUIRES AUTH - Returns 403!)
```

**Required**: Should use `registerCorporate()` from `registration.ts`
```typescript
import { registerCorporate } from '../../api/endpoints/registration';
// Calls: POST /client/register.json (PUBLIC - No auth required)
```

### Issue #2: Too Many Fields at Registration
The current form collects too much information upfront (registration number, TIN, business category, etc.). These should be collected during onboarding, not registration.

### Issue #3: Missing Contact Person Fields
The registration form doesn't collect the primary contact person details needed for the backend to create a `CorporateAccountPerson`.

### Issue #4: Type Not Sent
The form doesn't send `type=CORPORATE` to distinguish from Individual registration.

## Implementation Plan

### Phase 1: Update Registration API Types

**File**: `src/api/endpoints/registration.ts`

#### 1.1 Update CorporateRegistration Interface (Minimal Fields)

```typescript
/**
 * Corporate registration data structure.
 * Collects MINIMAL information for quick account creation.
 * Full KYC details are collected in post-registration onboarding.
 */
export interface CorporateRegistration {
  // ===== REQUIRED =====
  type: 'CORPORATE';                         // Registration type
  name: string;                              // Company name
  contactFirstName: string;                  // Key contact first name
  contactLastName: string;                   // Key contact last name

  // At least one contact method required
  phoneNumber?: string;                      // Primary contact phone
  email?: string;                            // Primary contact email

  // ===== OPTIONAL (commonly known at registration) =====
  contactPosition?: string;                  // Key contact title/position
  certificateOfIncorporationNumber?: string; // Registration number (if known)
  businessCategory?: BusinessCategory;       // Business type (if known)
}

// Enum types
export type BusinessCategory =
  | 'LIMITED_LIABILITY'
  | 'PUBLIC_LIMITED'
  | 'PARTNERSHIP'
  | 'SOLE_PROPRIETORSHIP'
  | 'NON_PROFIT'
  | 'OTHER';
```

#### 1.2 Update toRegistrationFormData Function

```typescript
/**
 * Convert CorporateRegistration to URLSearchParams.
 * Sends all non-null fields to the backend.
 * Backend will bind any valid Corporate domain field.
 */
function toRegistrationFormData(data: CorporateRegistration): URLSearchParams {
  const params = new URLSearchParams();

  // Always include type
  params.append('type', 'CORPORATE');

  // Iterate through all properties and add non-null values
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      // Handle Date objects
      if (value instanceof Date) {
        params.append(key, value.toISOString().split('T')[0]);
      } else {
        params.append(key, String(value));
      }
    }
  });

  return params;
}
```

#### 1.3 Update Response Interface

```typescript
/**
 * Response from corporate registration endpoint.
 */
export interface CorporateRegistrationResponse {
  client: {
    id: string;
    name: string;
    certificateOfIncorporationNumber?: string;
    businessCategory?: string;
    phoneContacts?: Array<{
      phone: string;
      priority: string;
    }>;
    emailContacts?: Array<{
      email: string;
      priority: string;
    }>;
    accountServicesList?: Array<{
      id: string;
      quickReference: string;
    }>;
    signatoriesAndDirectorsList?: Array<{
      firstName: string;
      lastName: string;
      position: string;
      keyContact: boolean;
    }>;
  };
  message?: string;
}
```

### Phase 2: Update Registration Page

**File**: `src/features/corporate/RegistrationPage.tsx`

#### 2.1 Update Import

```typescript
// BEFORE
import { createCorporate } from '../../api/endpoints/corporate';

// AFTER
import { registerCorporate } from '../../api/endpoints/registration';
import type { CorporateRegistration, BusinessCategory } from '../../api/endpoints/registration';
```

#### 2.2 Update Form State (Minimal Fields Only)

```typescript
const [formData, setFormData] = useState({
  // Required
  type: 'CORPORATE' as const,
  name: '',
  contactFirstName: '',
  contactLastName: '',

  // Contact info (at least one required)
  email: '',
  phoneNumber: '',

  // Optional basic fields (commonly known)
  contactPosition: '',
  certificateOfIncorporationNumber: '',  // Optional - can add during onboarding
  businessCategory: '' as BusinessCategory | '',  // Optional - can add during onboarding
});
```

#### 2.3 Simplified Registration Form

The form should be simple with just the essential fields:

```tsx
<form onSubmit={handleSubmit} className="flex flex-col gap-6">
  {/* Company Name */}
  <label className="flex flex-col gap-2">
    <span className="text-sm font-medium">
      Company Name <span className="text-danger">*</span>
    </span>
    <input
      type="text"
      name="name"
      value={formData.name}
      onChange={handleChange}
      placeholder="Enter your company name"
      className="h-12 px-4 rounded-lg border ..."
    />
  </label>

  {/* Contact Person - First & Last Name (2-column) */}
  <div>
    <p className="text-sm font-medium mb-2">Primary Contact Person <span className="text-danger">*</span></p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <input
        type="text"
        name="contactFirstName"
        value={formData.contactFirstName}
        onChange={handleChange}
        placeholder="First name"
        className="h-12 px-4 rounded-lg border ..."
      />
      <input
        type="text"
        name="contactLastName"
        value={formData.contactLastName}
        onChange={handleChange}
        placeholder="Last name"
        className="h-12 px-4 rounded-lg border ..."
      />
    </div>
  </div>

  {/* Contact Info - Email & Phone (2-column) */}
  <div>
    <p className="text-sm font-medium mb-2">Contact Information <span className="text-danger">*</span></p>
    <p className="text-xs text-subtle-text mb-2">Provide at least email or phone number</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <input
        type="email"
        name="email"
        value={formData.email}
        onChange={handleChange}
        placeholder="Email address"
        className="h-12 px-4 rounded-lg border ..."
      />
      <input
        type="tel"
        name="phoneNumber"
        value={formData.phoneNumber}
        onChange={handleChange}
        placeholder="Phone number"
        className="h-12 px-4 rounded-lg border ..."
      />
    </div>
  </div>

  {/* Submit Button */}
  <button type="submit" className="h-14 rounded-lg bg-primary text-white font-bold">
    Create Account
  </button>

  {/* Note about completing profile later */}
  <p className="text-xs text-center text-subtle-text">
    You can complete your company profile after registration
  </p>
</form>
```

#### 2.4 Update Validation (Minimal Required Fields)

```typescript
const validateForm = (): boolean => {
  const errors: Record<string, string> = {};

  // Company name - required
  if (!formData.name.trim()) {
    errors.name = 'Company name is required';
  }

  // Contact person - required
  if (!formData.contactFirstName?.trim()) {
    errors.contactFirstName = 'First name is required';
  }
  if (!formData.contactLastName?.trim()) {
    errors.contactLastName = 'Last name is required';
  }

  // At least one contact method - required
  if (!formData.email?.trim() && !formData.phoneNumber?.trim()) {
    errors.contact = 'Email or phone number is required';
  }

  // Email format validation (if provided)
  if (formData.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    errors.email = 'Please enter a valid email address';
  }

  // Phone format validation (if provided)
  if (formData.phoneNumber?.trim() && !/^\+?\d{9,14}$/.test(formData.phoneNumber.replace(/\s/g, ''))) {
    errors.phoneNumber = 'Please enter a valid phone number';
  }

  setValidationErrors(errors);
  return Object.keys(errors).length === 0;
};
```

#### 2.5 Update Mutation

```typescript
const registerMutation = useMutation({
  mutationFn: registerCorporate,
  onSuccess: (response) => {
    // Navigate to 2FA verification with contact info
    const contact = formData.phoneNumber || formData.email;
    navigate('/verify', {
      state: {
        contact,
        corporateId: response.client?.id,
        companyName: response.client?.name,
      }
    });
  },
  onError: (error: Error) => {
    // Parse backend error codes if available
    const errorMessage = error.message || 'Registration failed. Please try again.';
    setValidationErrors({ form: errorMessage });
  },
});

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (validateForm()) {
    registerMutation.mutate(formData);
  }
};
```

### Phase 3: Update Types (if needed)

**File**: `src/types/index.ts`

```typescript
// Add or update these types if not present

export type BusinessCategory =
  | 'LIMITED_LIABILITY'
  | 'PUBLIC_LIMITED'
  | 'PARTNERSHIP'
  | 'SOLE_PROPRIETORSHIP'
  | 'NON_PROFIT'
  | 'OTHER';

export type ClientType = 'INDIVIDUAL' | 'CORPORATE';

export interface Corporate {
  id: string;
  name: string;
  certificateOfIncorporationNumber?: string;
  certificateToCommenceBusinessNumber?: string;
  registrationDate?: string;
  licenceNumber?: string;
  businessCategory?: BusinessCategory;
  countryOfIncorporation?: string;
  natureOfBusiness?: string;
  postalAddress?: string;
  digitalAddress?: string;
  location?: string;
  website?: string;
  taxIdentificationNumber?: string;
  // ... other fields as needed
}
```

### Phase 4: Update 2FA Verification Flow

**File**: `src/features/auth/VerifyPage.tsx` (if exists)

Ensure the verification page can receive the corporate ID and handle the flow:

```typescript
// Receive state from registration
const location = useLocation();
const { contact, corporateId, companyName } = location.state || {};

// After successful verification, redirect to onboarding or dashboard
const onVerificationSuccess = () => {
  if (corporateId) {
    navigate(`/onboarding/company?id=${corporateId}`);
  } else {
    navigate('/dashboard');
  }
};
```

## Implementation Checklist

### Phase 1: API Layer
- [ ] Update `CorporateRegistration` interface with all fields
- [ ] Add new type definitions (BusinessCategory, AnnualTurnOver, etc.)
- [ ] Update `toRegistrationFormData` to handle all fields
- [ ] Update response interface
- [ ] Add/update unit tests

### Phase 2: Registration Page
- [ ] Change import from `createCorporate` to `registerCorporate`
- [ ] Update form state with contact person fields
- [ ] Add contact person form section
- [ ] Update validation for new required fields
- [ ] Update mutation and error handling
- [ ] Add E2E tests

### Phase 3: Types
- [ ] Add missing type definitions to `types/index.ts`
- [ ] Ensure BusinessCategory enum matches backend

### Phase 4: Verification Flow
- [ ] Update verify page to receive corporate context
- [ ] Handle post-verification navigation

### Phase 5: Testing
- [ ] Test registration with all fields
- [ ] Test registration with minimal fields
- [ ] Test validation error display
- [ ] Test 2FA flow integration
- [ ] Test error handling for duplicate phone/email

## UI Mockup (Simplified Registration)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Create Your Account                                 │
│        Get started in seconds. Complete your profile later.            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Company Name *                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Enter your company name                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Primary Contact Person *                                               │
│  ┌──────────────────────────┐      ┌──────────────────────────────┐   │
│  │ First name               │      │ Last name                    │   │
│  └──────────────────────────┘      └──────────────────────────────┘   │
│                                                                         │
│  Contact Information *                                                  │
│  Provide at least email or phone number                                │
│  ┌──────────────────────────┐      ┌──────────────────────────────┐   │
│  │ Email address            │      │ Phone number                 │   │
│  └──────────────────────────┘      └──────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Create Account                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│           You can complete your company profile after registration      │
│                                                                         │
│                    Already have an account? Sign in                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Post-Registration Onboarding Flow

After registration and 2FA verification, users complete their KYC profile:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Registration Flow                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: Create Account (Registration)                                  │
│  ├── Company name                                                       │
│  ├── Contact person (first name, last name)                             │
│  └── Contact info (email and/or phone)                                  │
│                                                                         │
│  Step 2: Verify Identity (2FA)                                          │
│  └── OTP verification via email/SMS                                     │
│                                                                         │
│  Step 3: Complete Company Profile (Onboarding)                          │
│  ├── Registration number, TIN                                           │
│  ├── Business category, nature of business                              │
│  ├── Addresses (postal, physical, digital)                              │
│  └── Website, annual turnover                                           │
│                                                                         │
│  Step 4: Add Directors & Signatories                                    │
│  └── Add authorized persons                                             │
│                                                                         │
│  Step 5: Upload Documents                                               │
│  ├── Certificate of incorporation                                       │
│  ├── Tax registration                                                   │
│  └── Board resolution                                                   │
│                                                                         │
│  Step 6: Review & Submit for Approval                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Dependencies

This frontend plan depends on the backend changes documented in:
- `soupmarkets-web/.claude/plans/soupmarkets-corporate-registration-api.md`

The backend must support:
1. `type=CORPORATE` parameter
2. `CorporateRegisterCommand` with minimal fields
3. `contactFirstName`, `contactLastName` for CorporateAccountPerson creation
4. Return created corporate with ID for onboarding flow

## Timeline

| Task | Estimate |
|------|----------|
| Update registration.ts API types | 30 mins |
| Simplify RegistrationPage form | 1 hour |
| Update validation | 30 mins |
| Update mutation/navigation | 30 mins |
| Testing | 1 hour |
| **Total** | **3.5 hours** |

## Notes

1. **Simpler is Better**: The registration form now collects just 4 pieces of information:
   - Company name
   - Contact person (first + last name)
   - Contact info (email and/or phone)

2. **Backend Dependency**: These frontend changes require the backend `CorporateRegisterCommand`. Coordinate deployment.

3. **Onboarding Flow**: The existing onboarding pages (CompanyInfoPage, DirectorsPage, DocumentsPage) handle the remaining KYC fields after registration.

4. **User Experience**: Users can create an account in under 30 seconds and complete their profile at their own pace.
