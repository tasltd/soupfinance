# Invoice Client Backend Plan

**Created**: 2026-01-30
**Status**: PENDING
**Priority**: P1
**Related Frontend**: soupfinance-web client CRUD pages

---

## Context

SoupFinance needs a simplified Client management API for invoice recipients. The existing `/rest/client/*` endpoints are for investment clients with full KYC and order functionality. SoupFinance tenants need a simpler API to manage their billing contacts.

## Requirements

### API Endpoints Needed

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/rest/invoiceClient/index.json` | GET | List clients with pagination, search |
| `/rest/invoiceClient/show/:id.json` | GET | Get single client |
| `/rest/invoiceClient/save.json` | POST | Create new client |
| `/rest/invoiceClient/update/:id.json` | PUT | Update client |
| `/rest/invoiceClient/delete/:id.json` | DELETE | Soft delete client |

### Relationship to Existing Domain

The InvoiceClient API should work with the existing Client domain hierarchy:
- `Client` (base class) → `Individual` / `Corporate`
- Use simplified fields for invoice recipients (not full KYC)

### Required Controller Actions

Update or create controller with these actions:

```groovy
@Secured(["ROLE_ADMIN", "ROLE_USER"])
class InvoiceClientController {

    // List clients for current tenant
    // Filter out investment-specific fields
    // Support search by name, email
    def index(Integer max) { ... }

    // Get client with simplified fields
    def show(String id) { ... }

    // Create Individual or Corporate with basic info
    // Required: clientType, email
    // For INDIVIDUAL: firstName, lastName
    // For CORPORATE: companyName
    def save() { ... }

    // Update client basic info
    def update(String id) { ... }

    // Soft delete
    def delete(String id) { ... }
}
```

### Service Layer

```groovy
class InvoiceClientService {

    def list(params) {
        // Query Client domain filtered by current tenant
        // Return simplified DTO (no investment fields)
    }

    def get(id) {
        // Get client, verify tenant ownership
        // Return as simplified DTO
    }

    def create(cmd) {
        if (cmd.clientType == 'INDIVIDUAL') {
            return createIndividual(cmd)
        } else {
            return createCorporate(cmd)
        }
    }

    def update(cmd) {
        // Update existing client basic info
    }

    def delete(id) {
        // Soft delete (set archived = true)
    }
}
```

### Command Object

```groovy
class InvoiceClientCommand {
    String id
    String clientType  // 'INDIVIDUAL' or 'CORPORATE'
    String email       // Required
    String phone
    String address

    // Individual
    String firstName
    String lastName

    // Corporate
    String companyName
    String contactPerson
    String registrationNumber
    String taxNumber
}
```

### Response DTO

```json
{
  "id": "uuid",
  "clientType": "INDIVIDUAL",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "address": "123 Main St",
  "firstName": "John",
  "lastName": "Doe",
  "dateCreated": "2026-01-30T10:00:00Z"
}
```

## Notes

1. **Do NOT expose investment-specific fields**: Orders, portfolios, KYC status, etc.
2. **Tenant isolation**: Clients are scoped to the current Account tenant
3. **Reuse existing domain**: Work with Client/Individual/Corporate, don't create new domain
4. **Exclude actions for investment**: No order-related actions like `placeOrder`, `getOrders`
5. **Simple validation**: Just email format, required fields based on type

## Files to Modify

1. Create `InvoiceClientController.groovy` OR add actions to existing controller
2. Create `InvoiceClientService.groovy`
3. Create `InvoiceClientCommand.groovy` (command object)

## Frontend Integration

Frontend API is ready at:
- `soupfinance-web/src/api/endpoints/clients.ts`
- Uses `/rest/invoiceClient/*` endpoints
- Types: `InvoiceClient`, `InvoiceClientInput`, `InvoiceClientType`
