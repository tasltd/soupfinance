# Research: Vendor Pages Implementation

**Date**: 2026-01-20T13:15:00Z
**Query**: Create VendorListPage and VendorFormPage for SoupFinance
**Duration**: ~15 minutes

## Executive Summary

Implemented vendor list and form pages following existing invoice/bill patterns. Project uses React 19 + TypeScript + Vite + TailwindCSS v4 with React Query for data fetching and React Hook Form + Zod for form validation.

## Detailed Findings

### Files Found

- `/src/features/invoices/InvoiceListPage.tsx` - Primary pattern for list page
- `/src/features/invoices/InvoiceFormPage.tsx` - Pattern for form page (stub)
- `/src/features/bills/BillListPage.tsx` - Simple list stub
- `/src/features/bills/BillFormPage.tsx` - Simple form stub
- `/src/api/endpoints/vendors.ts` - Vendor API already exists with full CRUD
- `/src/api/index.ts` - Already exports vendor functions
- `/src/types/index.ts` - Vendor type already defined
- `/src/App.tsx` - Router configuration
- `/src/components/forms/Input.tsx` - Form input component
- `/src/components/forms/Select.tsx` - Form select component
- `/src/components/forms/Textarea.tsx` - Form textarea component

### Patterns Discovered

1. **List Page Pattern** (from InvoiceListPage):
   - Page header with title + "New" button
   - React Query useQuery for data fetching
   - Table with headers + rows
   - Loading state message
   - Empty state with icon + CTA
   - data-testid attributes on all interactive elements
   - Status badges with color coding

2. **Form Page Pattern** (from InvoiceFormPage):
   - useParams() for id, isEdit = !!id
   - useNavigate() for cancel button
   - Page header with title (dynamic based on edit mode)
   - Cancel and Save buttons
   - Form container with border

3. **Design System Tokens**:
   - Primary: `bg-primary`, `text-primary`, `hover:bg-primary/90`
   - Surface: `bg-surface-light dark:bg-surface-dark`
   - Border: `border-border-light dark:border-border-dark`
   - Text: `text-text-light dark:text-text-dark`
   - Subtle: `text-subtle-text`
   - Icons: Material Symbols Outlined

4. **Vendor API Functions** (from vendors.ts):
   - `listVendors(params)` - GET /rest/vendor/index.json
   - `getVendor(id)` - GET /rest/vendor/show/:id.json
   - `createVendor(data)` - POST /rest/vendor/save.json
   - `updateVendor(id, data)` - PUT /rest/vendor/update/:id.json
   - `deleteVendor(id)` - DELETE /rest/vendor/delete/:id.json

5. **Vendor Type** (from types/index.ts):
   ```typescript
   export interface Vendor extends BaseEntity {
     name: string;
     email?: string;
     phoneNumber?: string;
     address?: string;
     taxIdentificationNumber?: string;
     paymentTerms?: number; // days
     notes?: string;
   }
   ```

### Route Convention

From App.tsx, routes follow pattern:
- List: `/vendors`
- Create: `/vendors/new`
- Edit: `/vendors/:id`
- Edit (alt): `/vendors/:id/edit`

## Files Created

### 1. VendorListPage.tsx
`/src/features/vendors/VendorListPage.tsx`

Features implemented:
- Page header with "Vendors" title and "New Vendor" button
- Search input with debounced filtering
- Table with columns: Name, Email, Phone, Payment Terms, Actions
- Row actions: View, Edit, Delete icons
- Delete confirmation modal with warning
- Loading state
- Empty state with CTA
- Full data-testid coverage

### 2. VendorFormPage.tsx
`/src/features/vendors/VendorFormPage.tsx`

Features implemented:
- Create/Edit mode detection via useParams
- Zod validation schema with:
  - name: required, max 255 chars
  - email: optional, valid format
  - phoneNumber: optional, max 50 chars
  - address: optional, max 500 chars
  - taxIdentificationNumber: optional, max 50 chars
  - paymentTerms: optional, integer 0-365
  - notes: optional, max 2000 chars
- React Hook Form integration
- Auto-populate form on edit mode
- Error banner for mutation failures
- Sectioned form layout (Basic Info, Payment Terms, Address, Notes)
- Mobile-friendly bottom action buttons
- Full data-testid coverage

### 3. index.ts
`/src/features/vendors/index.ts`
- Module exports for VendorListPage and VendorFormPage

### 4. App.tsx (Updated)
Added vendor routes:
- `/vendors` - VendorListPage
- `/vendors/new` - VendorFormPage (create)
- `/vendors/:id` - VendorFormPage (edit)
- `/vendors/:id/edit` - VendorFormPage (edit, alt route)

## data-testid Attributes

### VendorListPage
- `vendor-list-page` - Page container
- `vendor-list-heading` - Page title
- `vendor-new-button` - New vendor button
- `vendor-search-container` - Search wrapper
- `vendor-search-input` - Search input
- `vendor-table-container` - Table wrapper
- `vendor-list-loading` - Loading state
- `vendor-list-table` - Table element
- `vendor-row-{id}` - Table row
- `vendor-link-{id}` - Vendor name link
- `vendor-view-{id}` - View action
- `vendor-edit-{id}` - Edit action
- `vendor-delete-{id}` - Delete action
- `vendor-list-empty` - Empty state
- `vendor-create-first-button` - Create first vendor CTA
- `vendor-delete-modal` - Delete modal
- `vendor-delete-modal-close` - Modal close button
- `vendor-delete-modal-cancel` - Modal cancel button
- `vendor-delete-modal-confirm` - Modal confirm button

### VendorFormPage
- `vendor-form-page` - Page container
- `vendor-form-heading` - Page title
- `vendor-form-cancel` - Cancel button
- `vendor-form-save` - Save button
- `vendor-form-error` - Error banner
- `vendor-form-container` - Form element
- `vendor-form-name` - Name input
- `vendor-form-email` - Email input
- `vendor-form-phone` - Phone input
- `vendor-form-tin` - TIN input
- `vendor-form-payment-terms` - Payment terms input
- `vendor-form-address` - Address textarea
- `vendor-form-notes` - Notes textarea
- `vendor-form-cancel-mobile` - Mobile cancel button
- `vendor-form-save-mobile` - Mobile save button

## Recommendations

1. Run `npm run build` to verify TypeScript compilation
2. Test routes manually in browser
3. Write E2E tests for the vendor CRUD flow
4. Consider adding a VendorDetailPage for read-only view (optional)
