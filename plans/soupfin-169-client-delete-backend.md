# SOUPFIN-169: Client delete is a no-op over REST (Backend Plan)

**Repo:** soupmarkets-web, branch `authentication-base-on-multi-tenancy-descriminator`
**Parent:** SOUPFIN-7 item 1 ("client still listed after delete")
**Status:** reproduced 2026-10-13 against the SoupFinance LXC backend (10.115.213.183:9090, DB `soupbroker_dev`)
**Acceptance test:** `soupfinance-web/e2e/integration/clients-delete.integration.spec.ts`

## Context

SoupFinance deletes a client with one call: `DELETE /rest/client/delete/{id}.json`.
The client must then be gone from `GET /rest/client/index.json` and listed in
`GET /rest/client/archived.json`. Neither happens. Two separate defects cause it.

## Evidence (2026-10-13, ROLE_ADMIN user)

| Step | Call | Result |
|---|---|---|
| 1 | `POST /rest/client/save.json` (Individual) | 201. Creates the Client, a ClientContact, a ClientPortfolio and the Individual row |
| 2 | `DELETE /rest/client/delete/{id}.json` | **200** with `{ relatedList: [ClientContact x2, ClientPortfolio x2, Individual], targetControllerName: "client", targetId }` |
| 3 | `GET /rest/client/index.json?q=…` | client **still listed** |
| 4 | DB `client` row | `archived=0`, `deleted=0` (nothing changed) |
| 5 | `DELETE /rest/client/delete/{id}.json?relationChecked=true` | **204** |
| 6 | DB `client` row | `archived=1`, `deleted=1`; contact and portfolio rows kept |
| 7 | `GET /rest/client/index.json?q=…` | gone (correct) |
| 8 | `GET /rest/client/archived.json` (with or without `q`, `max=1000`) | **not listed** |

## Defect 1: the delete gate refuses every SoupFinance client

`DeleteInterceptor` (matches every `delete` action) forwards a JSON delete to
`UtilityController.deleteChecker` unless `params.relationChecked` or
`params.fromUtilityController` is set. For an admin, `deleteChecker` collects
every record pointing at the target. If the list is empty it forwards to the real
delete (SOUP-1935 #2). If it is not empty it answers **200 + relatedList** and
deletes nothing, expecting the Angular SPA's two-step confirm.

Every client created through SoupFinance (or the KYC form) has a ClientContact,
a ClientPortfolio and an Individual/Corporate row. So the list is never empty and
the REST delete is always a no-op. The 200 status reads as success to any REST
consumer.

`ClientService.doDelete` is a soft-delete (it sets flags and removes no rows), so
these linked records cannot be orphaned by it. The gate protects against nothing
for this domain.

### Required change

In `UtilityController.deleteChecker`, for a **JSON request by a ROLE_ADMIN user**
whose target controller performs a soft-delete, forward to the target's `delete`
action even when `relatedList` is not empty. That is the same path the HTML
page's "Delete Target Only" button takes today
(`deleteAllRelatedEntities?onlyTarget=true`).

The narrowest safe form is an allow-list of controllers whose `delete` only
archives, starting with `client`:

```groovy
// Soft-delete targets: archiving keeps every linked row, so linked records
// are not a reason to refuse. SOUPFIN-169.
private static final Set<String> SOFT_DELETE_TARGETS = ['client'] as Set

if (isJsonFormat) {
    if (relatedList.isEmpty() || SOFT_DELETE_TARGETS.contains(targetControllerName)) {
        params.fromUtilityController = true
        forward(controller: targetControllerName, action: 'delete', id: id)
        return
    }
    respond([relatedList: ...])   // unchanged for hard-delete domains
}
```

Do **not** extend this to domains whose `delete` removes the row.

If a client must be refused (for example it has unpaid invoices), answer **409**
with a body that names the blocking records, never 200. A 200 that changes
nothing is the bug.

## Defect 2: a deleted client never appears in archived.json

`ClientService.doDelete` sets `archived = true` **and** `deleted = true`
(SOUP-1748). `ClientController.archived` sets `params.deleted = false` before
calling `searchArchivedList`, so it filters those rows out. A client deleted
through the API therefore vanishes from both lists and cannot be found or
restored. On `soupbroker_dev`, `archived.json?max=1000` returns 0 rows for the
tenant.

### Required change (pick one, state which in the PR)

- **A (preferred):** `doDelete` sets only `archived = true`. "Deleted" then means
  archived, and `archived.json` lists it. Check first that nothing else relies on
  `deleted = true` for clients (grep `deleted` in `ClientService`, `Client`, the
  client GSON views and the SPA).
- **B:** keep both flags and drop `params.deleted = false` from
  `ClientController.archived`, or stop the archived list filtering on `deleted`.

## Related gap (separate ticket, security)

`DeleteInterceptor.before()` honours `relationChecked` and
`fromUtilityController` straight from request parameters. The ROLE_ADMIN check
that turns a non-admin's delete into a `DeleteRequest` lives only in
`deleteChecker`. A ROLE_USER who appends `?relationChecked=true` (or
`?fromUtilityController=true`) skips both the dependency check **and** the admin
approval and reaches `ClientController.delete` directly, which is
`@Secured(["ROLE_ADMIN","ROLE_USER"])`. This was read from the code, not tested
with a non-admin user. Fix: only honour those flags for ROLE_ADMIN, or set
`fromUtilityController` as a request attribute rather than a parameter.

SoupFinance does not send either flag. It must not start doing so as a workaround,
because that would make the bypass the normal path for non-admins.

## Tests to add in soupmarkets-web

- `ClientFunctionalSpec` (or `UtilityControllerFunctionalSpec`):
  - admin JSON `DELETE /rest/client/delete/{id}.json` on a client with a contact
    and a portfolio returns 204; the client is absent from `index.json` and
    present in `archived.json`; contact and portfolio rows still exist.
  - the same delete on a hard-delete domain with linked records still returns the
    `relatedList` (no behaviour change there).
  - ROLE_USER delete with `?relationChecked=true` creates a `DeleteRequest` and
    leaves the client active (after the security fix).

## Frontend status (soupfinance, SOUPFIN-169)

- `deleteClient` now rejects with `ClientDeleteBlockedError` when the response
  carries a non-empty `relatedList`. The Clients list and detail pages keep the
  modal open and say the client was not deleted, instead of reporting success.
- Once Defect 1 ships the DELETE returns 204 and the frontend works unchanged.
- The LXC spec above passes only when both defects are fixed.

## Running the acceptance test

`soup.support` no longer has the seed password on `soupbroker_dev`. Any ROLE_ADMIN
works:

```bash
cd soupfinance-web
E2E_ADMIN_USERNAME=<admin> E2E_ADMIN_PASSWORD=<password> \
  npx playwright test --config=playwright.lxc.config.ts \
  e2e/integration/clients-delete.integration.spec.ts
```
