# AgentController.current() Endpoint — Backend Plan

## Context

The SoupFinance frontend needs the current user's agent (with `account.id` = tenant_id) for account settings resolution. Currently `AgentService.current()` exists but is only used internally — it's not exposed via the AgentController.

While `/rest/user/current.json` (SbUserController) already returns `tenantId` and `agentId`, a dedicated `/rest/agent/current.json` endpoint would be useful when the frontend needs the full agent object (not just IDs).

## Current State

### AgentService (already has the method)
```groovy
// AgentService.groovy lines 242-244
@ReadOnly
@WithoutTenant
Agent current(){
    return findByUserAccess(springSecurityService.currentUser)
}
```

### AgentController (missing the action)
Standard CRUD only: `index`, `archived`, `show`, `create`, `save`, `edit`, `updateAccess`, `update`, `delete`. No `current` action.

### SbUserController.current() (already exposes tenantId)
```groovy
// /rest/user/current.json — already returns:
// { id, username, email, firstName, lastName, roles, tenantId, agentId }
```

## Required Change

### Add `current` action to AgentController

**File:** `grails-app/controllers/soupbroker/security/AgentController.groovy`

```groovy
// Add after the existing show() action:
@Secured(["ROLE_ADMIN", "ROLE_USER"])
def current() {
    def agent = agentService.current()
    if (!agent) {
        render status: 404
        return
    }
    respond agent
}
```

### URL Mapping

The existing Grails REST URL mappings should auto-map this to:
- `GET /rest/agent/current.json`

If not (because `current` is not a standard REST action), add explicit mapping in `UrlMappings.groovy`:
```groovy
"/rest/agent/current"(controller: "agent", action: "current", method: "GET")
```

### Allowed Methods

Update the `static allowedMethods` in AgentController:
```groovy
static allowedMethods = [save: "POST", update: "PUT", delete: "DELETE", current: "GET"]
```

## Expected Response

Same as `/rest/agent/show/{id}.json` — full agent GSON view including:
- `id`, `firstName`, `lastName`, `designation`
- `account: { id: "...", name: "..." }` — the tenant
- `emailContacts`, `phoneContacts`
- `userAccess: { id, username, enabled }`
- `authorities`

## Frontend Usage (Future)

```typescript
// When full agent object is needed:
const response = await apiClient.get<Agent>('/agent/current.json');
const currentAgent = response.data;
const tenantId = currentAgent.account?.id;
```

## Priority

LOW — The frontend currently uses `tenantId` from `/rest/user/current.json` (already fetched during auth validation). This endpoint is for future use when the full agent object is needed (e.g., user profile page showing firstName, lastName, emailContacts, phoneContacts).

## Current Frontend Architecture (Implemented 2026-02-10)

The account settings flow no longer calls `/rest/agent/index.json`. Instead:

1. `authStore.validateToken()` calls `GET /rest/user/current.json`
2. Response `{ tenantId, agentId, ... }` is captured — `tenantId` enriched into auth store
3. `accountSettingsApi.get()` reads `tenantId` from `useAuthStore.getState().user.tenantId`
4. Fetches `GET /account/show/{tenantId}.json` via `accountClient` (not apiClient)

This eliminates the extra agent API call. The `agentId` is also stored for future use with this endpoint.
