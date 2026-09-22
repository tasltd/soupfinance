# SOUPFIN-62 — `CorporateController.current()` Endpoint (Backend Plan)

**PM Issue:** SOUPFIN-62 — *Backend: CorporateController has no current action, so /rest/corporate/current.json 404s*
**Target repo for the actual fix:** `soupmarkets-web` (per `.claude/rules/backend-changes-workflow.md` and the SOUPFIN-13 directive)
**Status in soupfinance:** documented only — no backend file is edited from this repo
**Filed:** 2026-09-22

---

## 1. Context

`soupfinance-web/src/api/endpoints/corporate.ts` ships `getCurrentCorporate()`,
which calls `GET /rest/corporate/current.json`. That action does not exist.

`grails-app/controllers/soupbroker/kyc/CorporateController.groovy` defines
`index`, `archived`, `show`, `next`, `create`, `printCorporate`, `save`, `edit`,
`update`, `delete` — there is no `current`.

SOUPFIN-55 added `resolveOnboardingCorporate()`, which tries `current.json`
first and falls back to `GET /rest/corporate/index.json?max=1`. The fallback
takes the first corporate in the tenant. That happens to be right under
tenant-per-account, but it is a guess: it cannot tell *which* corporate belongs
to the signed-in user, and it breaks the moment a tenant holds more than one.

## 2. Reproduction (verified 2026-09-22)

LXC backend `10.115.213.183:9090`, authenticated as `soup.support` with the
`Api-Authorization` ApiConsumer header:

| Request | Result |
|---------|--------|
| `GET /rest/corporate/current.json` | **404** — Grails renders the HTML `/notFound` view, not JSON |
| `GET /rest/corporate/index.json?max=1` | 200, one corporate row |
| `GET /rest/user/current.json` | 200 `{ id, username, email, firstName, lastName, roles, tenantId, agentId }` |

The 404 body being HTML matters for clients: an `Accept: application/json`
request still gets an HTML error page.

## 3. Required Change

### 3.1 Add a `current` action to `CorporateController`

**File:** `grails-app/controllers/soupbroker/kyc/CorporateController.groovy`

Mirror the two existing precedents:

* `SbUserController.current()` (`grails-app/controllers/soupbroker/security/SbUserController.groovy:33`)
  — resolves the signed-in user, 401s when absent.
* `ClientPortalInterceptor.before()` (`grails-app/controllers/soupbroker/ClientPortalInterceptor.groovy:41`)
  — resolves a client-portal user to a client id via
  `Contact.findByClientUser(springSecurityService.currentUser)?.sourceId`.

```groovy
/**
 * Corporate whose KYC application belongs to the signed-in user.
 *
 * Two resolution paths, in order:
 *   1. Client-portal user  — Contact.clientUser -> Contact.sourceId -> Corporate.get(sourceId).
 *      Corporate shares its id with Client (foreign-key id generator), so the
 *      client id IS the corporate id.
 *   2. Agent / tenant user — the tenant's own corporate. Under tenant-per-account
 *      (SoupFinance) the Account holds exactly one corporate being onboarded.
 *
 * 404 when neither path yields a corporate — "this user has no corporate to
 * resume" is a legitimate answer, not an error.
 */
@Secured(["ROLE_ADMIN", "ROLE_USER", "ROLE_CLIENT_PORTAL"])
def current() {
    def user = springSecurityService.currentUser
    if (!user) {
        render status: 401
        return
    }

    Corporate corporate = corporateService.current(user)
    if (!corporate) {
        // Keep the shape JSON so API clients do not get the HTML notFound view
        render status: 404, contentType: 'application/json', text: '{"error":"No corporate found for the current user"}'
        return
    }

    respond corporate
}
```

`allowedMethods` stays as-is (`current` is a GET and is not listed there today;
add `current: "GET"` only if the team prefers to be explicit).

### 3.2 Add `CorporateService.current(SbUser)`

**File:** `grails-app/services/soupbroker/kyc/CorporateService.groovy`

Keep the resolution logic in the service so it is unit-testable and reusable.

```groovy
@ReadOnly
Corporate current(SbUser user) {
    if (!user) return null

    // 1) Client-portal login: Contact -> sourceId -> Corporate (shared PK with Client)
    def contact = Contact.findByClientUser(user)
    if (contact?.sourceId) {
        Corporate portalCorporate = Corporate.get(contact.sourceId)
        if (portalCorporate && !portalCorporate.archived) return portalCorporate
    }

    // 2) Agent / tenant login: the tenant's corporate. Prefer a match on the
    //    agent's email so a tenant holding several corporates still resolves
    //    deterministically; otherwise fall back to the oldest non-archived one.
    def agent = agentService.getSelectedAgent(user)
    if (!agent?.tenantId) return null

    return Tenants.withId(agent.tenantId) {
        def candidates = Corporate.createCriteria().list {
            eq 'archived', false
            order 'dateCreated', 'asc'
        }
        if (!candidates) return null
        String agentEmail = agent.email?.toLowerCase()
        return (agentEmail
            ? candidates.find { c -> c.emailContacts*.email*.toLowerCase().contains(agentEmail) }
            : null) ?: candidates.first()
    }
}
```

Notes for the implementer:

* `Corporate` shares its `id` with `Client` (`id generator: 'foreign', params: [property: 'client']`,
  `Corporate.groovy:444`), which is why `Corporate.get(contact.sourceId)` works.
* `Corporate` is `MultiTenant`, so path 2 must run inside `Tenants.withId(...)`;
  `agentService.getSelectedAgent` / `AgentService.current()` are `@WithoutTenant`
  and are the supported way to reach the tenant id.
* `Corporate.getEmailContacts()` already has a `ClientContact` → `sourceId`
  fallback, so the email match works for legacy rows too.
* Do **not** silently return the first corporate when the email match fails
  *and* more than one candidate exists without logging it — log at `warn` so the
  ambiguity is visible, exactly the failure mode this ticket is about.

### 3.3 URL mapping

`/rest/$controller/$action?/$id?(.$format)?` (`UrlMappings.groovy:176`) already
routes `current`, so no mapping change is strictly required. For symmetry with
`/rest/user/current` (`UrlMappings.groovy:143-144`), the team may add:

```groovy
"/rest/corporate/current"(controller: "corporate", action: "current", method: "GET")
"/rest/corporate/current.json"(controller: "corporate", action: "current", method: "GET")
```

These MUST sit above the generic `/rest/$controller/...` mapping if added — the
ordering comments at the top of `UrlMappings.groovy` are load-bearing.

### 3.4 View

`respond corporate` reuses the existing `grails-app/views/corporate/_corporate.gson`
/ `show.gson`, so the response body matches `GET /rest/corporate/show/{id}.json`
field for field. No new GSON template.

## 4. Interceptor check

`corporate` is **not** in `TradingModuleInterceptor`'s match list
(`TradingModuleInterceptor.groovy:27`), so no module gate applies and this
action will not 403 for SERVICES-category tenants such as SoupFinance.

`ClientPortalInterceptor` matches `controller: ~/(individual|corporate)/,
action: ~/(show|edit|next|update)/` — `current` is not matched, which is correct:
the action resolves the contact itself rather than relying on `params.client`.

## 5. Tests the backend change must ship

| Level | File | Cases |
|-------|------|-------|
| Unit | `src/test/groovy/soupbroker/kyc/CorporateServiceSpec.groovy` | portal user resolves via `Contact.clientUser`; agent user resolves the tenant corporate; email match wins over ordering when a tenant has two; archived corporate is skipped; null user → null |
| Functional | `src/integration-test/groovy/soupbroker/kyc/CorporateFunctionalSpec.groovy` | `loginAsUser()` + `GET /rest/corporate/current.json` → 200 and `id` equals the tenant's corporate; a user with no corporate → **404 with a JSON body**; unauthenticated → 401/403; response fields match `show/{id}.json` |

Run with JDK 19 (`~/.sdkman/candidates/java/19.0.2-tem`) after
`source env-variables.sh`; check the JUnit XML counts rather than the exit code.

## 6. Frontend contract (already in place)

No frontend change is needed once the action exists:

```typescript
// soupfinance-web/src/api/endpoints/corporate.ts
resolveOnboardingCorporate()
  -> getCurrentCorporate()            // GET /rest/corporate/current.json
  -> falls back to listCorporates({ max: 1 })  // only while current.json 404s
```

`getCurrentCorporate()` treats **404 only** as "no corporate" (SOUPFIN-62); any
other status now propagates so a 500 or 403 from the new action cannot be
mistaken for an empty result. When the action ships, `resolveOnboardingCorporate`
stops making the second call — the unit test
`prefers current.json when the backend supports it` pins that.

## 7. Acceptance

- [ ] `GET /rest/corporate/current.json` returns 200 with the signed-in user's corporate
- [ ] Returns **404 with a JSON body** (not the HTML `/notFound` view) when there is none
- [ ] A client-portal user gets *their* corporate, not the tenant's first row
- [ ] A tenant holding two corporates resolves deterministically and logs the ambiguity
- [ ] Unit + functional specs above pass
- [ ] Once deployed, drop the `listCorporates` fallback from `resolveOnboardingCorporate` in a follow-up soupfinance ticket

## 8. Related

- `plans/soupfinance-agent-current-endpoint.md` — the same pattern for `AgentController.current()`
- `plans/soupfin-13-backend-consolidation-directive.md` — why backend fixes land in soupmarkets-web
- SOUPFIN-55 — added `resolveOnboardingCorporate` and the KYC onboarding entry point

## 9. Removal gate for the frontend fallback (SOUPFIN-69)

SOUPFIN-69 tracks the follow-up in the last checkbox of §7: deleting the
`listCorporates({ max: 1 })` fallback from `resolveOnboardingCorporate()`. It
stays **blocked** until §3.1 is merged into soupmarkets-web *and* deployed to
the tenant the frontend talks to.

**Re-verified 2026-09-22 — still blocked.**

| Check | Result |
|-------|--------|
| `def current()` in `CorporateController.groovy` on `master` (→ tas.soupmarkets.com) | absent |
| same on `authentication-base-on-multi-tenancy-descriminator` (→ demo / SoupFinance LXC) | absent |
| same on `master_stable_last` (→ Fincap / Ashfield) | absent |
| `git log --all -S"corporateService.current" -- grails-app` | no commit, on any of the 1332 refs |
| `GET /rest/corporate/current.json` on LXC `10.115.213.183:9090`, authenticated as `soup.support` | **404**, `text/html` — the `notFound` view |
| `GET /rest/corporate/index.json?max=1` same session | 200, one corporate row |
| `GET /rest/user/current.json` same session (auth control) | 200 JSON |

Removing the fallback while `current.json` 404s makes
`resolveOnboardingCorporate()` return `null` for **every** user, so
`useKycOnboarding().needsOnboarding` is always false and the dashboard KYC
banner never renders. That reverts SOUPFIN-55 outright: before it, the four
`/onboarding/*` routes were reachable only from an emailed link.

**Unblock check** — run this before reopening SOUPFIN-69; it must print `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Accept: application/json' -H "X-Auth-Token: $TOKEN" \
  https://tas.soupmarkets.com/rest/corporate/current.json
```

Then apply the SOUPFIN-69 definition of done: `resolveOnboardingCorporate`
calls `current.json` only; the integration case
`falls back to the corporate list when current.json 404s`
(`src/api/__tests__/integration/corporate.integration.test.ts:332`) becomes an
assertion that a 404 means no corporate; and
`e2e/soupfin-62-corporate-current.spec.ts` keeps
`once current.json answers, the index fallback is not called at all` and drops
`a 500 from current.json still leaves the KYC entry point usable`.
