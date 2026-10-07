# SOUPFIN-101: External Accountant Invite and Accountant Role — Backend Plan

**Status:** Backend not started. Frontend shipped against the contract below (SOUPFIN-101).
**Repo:** `soupmarkets-web` (do NOT implement from the soupfinance context — see
`.claude/rules/backend-changes-workflow.md`).
**Verified 2026-10-07:** `soupmarkets-web` has no accountant role, no `ROLE_ACCOUNTANT`, and no
invite flow for staff. The only "invite" domain is `soupbroker.kyc.TenantInviteCode` (SOUP-1809),
which registers *clients* through MCP and is not reusable here.

## Context

A SoupFinance tenant admin wants to bring in an outside bookkeeper. The admin enters the
accountant's email on **Settings → Users → Accountants**. The accountant gets an email, accepts,
and can then sign in and work on that tenant's books, but cannot manage the tenant's users.

Acceptance criteria (from the ticket):

1. An invited accountant can log in and sees only that tenant's data.
2. Revoking access ends access immediately.

## What already exists and is reused

| Piece | Where | Reuse |
|---|---|---|
| One `SbUser`, many `Agent`s across tenants | `SbUser` javadoc: "A single SbUser can be linked to multiple Agent records across different tenants" | An accountant is one login with one `Agent` per client tenant |
| Token email + set-password flow | `AccountRegistrationService.generateConfirmationToken` / `confirmEmail` | Same pattern for the accept link, with its own token purpose |
| Role groups | `SbRoleGroup`, `SbRoleGroupSbRole`, `SbUserSbRoleGroup` | The "Accountant" bundle |
| Frontend link resolution from `Api-Authorization` | `AccountController.extractApiConsumerId()` + `originUrl` | Accept link points at `app.soupfinance.com/accept-invite?token=` |

## Required Changes

### 1. Domain: `soupbroker.security.AccountantInvite` (new, `MultiTenant`)

```groovy
class AccountantInvite extends SbDomain implements MultiTenant<AccountantInvite> {
    String email                 // lower-cased, trimmed
    String firstName             // optional
    String lastName              // optional
    String status = 'PENDING'    // PENDING | ACCEPTED | REVOKED | EXPIRED
    String tokenHash             // SHA-256 of the raw token; the raw token is only ever emailed
    Date expiresAt               // now + 14 days; reset on resend
    Date lastSentAt
    Integer sendCount = 1
    Date acceptedAt
    Date revokedAt
    Agent invitedBy              // the admin who sent it
    Agent agent                  // set on accept: the accountant's Agent in THIS tenant

    static constraints = {
        importFrom SbDomain
        email email: true, blank: false, maxSize: 254
        firstName nullable: true, maxSize: 100
        lastName nullable: true, maxSize: 100
        status inList: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']
        tokenHash nullable: true, maxSize: 64
        expiresAt nullable: true
        lastSentAt nullable: true
        acceptedAt nullable: true
        revokedAt nullable: true
        invitedBy nullable: true
        agent nullable: true
    }
}
```

`EXPIRED` is derived on read (`status == 'PENDING' && expiresAt < now`) and written lazily, so no
scheduler is needed. A Flyway/Liquibase migration creates the table with an index on
`(tenant_id, email)` and a unique index on `token_hash`.

### 2. Role: `ROLE_ACCOUNTANT` and the "Accountant" role group

- Seed `SbRole(authority: 'ROLE_ACCOUNTANT')` (idempotent, in the same BootStrap block that seeds
  the other roles; `authority` is globally unique, so look it up before saving).
- Seed `SbRoleGroup(name: 'Accountant')` per tenant (or globally if role groups are global — check
  `SbRoleGroup` tenancy before writing) containing:
  - `ROLE_USER`, `ROLE_ACCOUNTANT`
  - every finance role: ledger accounts, ledger transactions / journals, vouchers, invoices,
    bills, vendors, payment methods, finance reports (`FinanceReportsController`), bank
    reconciliation, report schedules
  - **not** `ROLE_ADMIN`, `ROLE_ADMIN_ROOT`, nor any role that grants `AgentController`,
    `SbUserController`, `SbRoleController`, `SbRoleGroupController`, `AccountantInviteController`
    or `AccountController.update`.
- `@Secured` on `AgentController` mutating actions, `AccountantInviteController` and
  `AccountController.update` must exclude `ROLE_ACCOUNTANT` (they already require `ROLE_ADMIN`;
  confirm with a functional test that an accountant gets **403**, not 200).

### 3. Controller: `AccountantInviteController` (admin side, `/rest/accountantInvite/*`)

`@Secured(['ROLE_ADMIN'])`, tenant-scoped like every other `/rest/` controller. Responses are
plain JSON (render the fields explicitly; do not hand `AccountantInvite` to the generic
`_domainClassInstance.gson`, and never render `tokenHash`).

| Action | Method + URL | CSRF | Body | Success | Errors |
|---|---|---|---|---|---|
| `index` | `GET /rest/accountantInvite/index.json?max&offset&sort&order` | — | — | `200` array of invites, newest first | — |
| `create` | `GET /rest/accountantInvite/create.json` | — | — | `SYNCHRONIZER_TOKEN` + `SYNCHRONIZER_URI` | — |
| `save` | `POST /rest/accountantInvite/save.json?SYNCHRONIZER_TOKEN=&SYNCHRONIZER_URI=` | **yes** | `{ email, firstName?, lastName? }` | `201` invite | `422 { message }` invalid email; `409 { message }` pending invite or active accountant with that email already exists in this tenant; `409` the email belongs to a regular team member of this tenant |
| `resend` | `POST /rest/accountantInvite/resend/{id}.json` | no | — | `200` invite (new token, `expiresAt` reset, `lastSentAt` now, `sendCount + 1`) | `409 { message }` when status is not `PENDING`/`EXPIRED`; `429` more than 5 sends per invite per day |
| `revoke` | `POST /rest/accountantInvite/revoke/{id}.json` | no | — | `200` invite with `status: 'REVOKED'`, `revokedAt` | `409` already revoked |

Invite JSON shape (what the frontend reads — `soupfinance-web/src/types/settings.ts`
`AccountantInvite`):

```json
{
  "id": "uuid",
  "email": "ama@ledgerworks.example",
  "firstName": "Ama",
  "lastName": "Owusu",
  "status": "PENDING",
  "dateCreated": "2026-10-07T09:00:00Z",
  "lastSentAt": "2026-10-07T09:00:00Z",
  "sendCount": 1,
  "expiresAt": "2026-10-21T09:00:00Z",
  "acceptedAt": null,
  "revokedAt": null,
  "invitedBy": { "id": "uuid", "serialised": "Kofi Mensah" },
  "agent": null
}
```

`resend` and `revoke` are `POST`, not `PUT`/`DELETE`: they are commands on the invite, not
updates of its fields, and a revoked invite stays in the list as an audit row.

### 4. Public accept endpoints (`/account/*`, `@Secured('permitAll')`, `@WithoutTenant`)

They live on `AccountController` (or a sibling under `/account/`) because the accountant has no
token yet. The Apache proxy already forwards `/account/` with the `Api-Authorization` header.

| Action | Method + URL | Body | Success | Errors |
|---|---|---|---|---|
| `accountantInvite` | `GET /account/accountantInvite.json?token=` | — | `200 { status, email, firstName, lastName, companyName, existingUser }` | `404 { message: "This invitation link is not valid." }`; `410 { message, status }` for revoked / expired / already accepted |
| `acceptAccountantInvite` | `POST /account/acceptAccountantInvite.json` | `{ token, password?, confirmPassword? }` | `200 { success: true, message, username }` | `400 { success: false, message }` weak or mismatched password; `410` as above |

Accept logic (one transaction, all-or-nothing like SOUP-3155's `confirmEmail`):

1. Hash the token, load the invite with `@WithoutTenant`, reject unless `PENDING` and not expired.
2. Find `SbUser` by email (case-insensitive).
   - **Exists:** no password needed — the token proves control of the mailbox. Do not change the
     existing password. `existingUser: true` tells the page to skip the password fields.
   - **New:** create `SbUser(username: email, password, enabled: true, tenantId: invite.tenantId)`.
3. Inside `Tenants.withId(invite.tenantId)`: create `Agent(firstName, lastName, userAccess: sbUser,
   account: Account.get(invite.tenantId), tenantId: invite.tenantId)` and attach the "Accountant"
   role group (`SbUserSbRoleGroup`) for that tenant. `Agent.tenant_id` **must** be set — a NULL
   tenant gives `TenantNotFoundException` on every query (see
   `plans/soupfinance-tenant-resolution-fix.md`).
4. Set `invite.status = 'ACCEPTED'`, `acceptedAt`, `agent`, clear `tokenHash`.
5. Email the inviting admin: "{name} accepted your invitation."

### 5. Revoke must end access immediately (acceptance criterion 2)

Revoking an `ACCEPTED` invite must, in the same transaction:

1. Set the accountant's `Agent` in this tenant to `disabled = true` and remove that tenant's
   `SbUserSbRoleGroup` / `SbUserSbRole` rows for the user.
2. Delete every `AuthenticationToken` row (GORM token store) for that username **whose resolved
   tenant is this tenant**. If tokens are not tenant-bound (see section 6), delete all of the
   user's tokens: the accountant re-signs-in and only reaches tenants where they still have an
   enabled agent.
3. Evict the user's entries from any Spring Security / `@Cacheable('agent')` cache (SOUPFIN-50
   showed a stale `agent` cache surviving saves).

Then add a request-time guard (interceptor, ordered after tenant resolution) that rejects with
**401** any request whose (user, tenant) has no enabled `Agent`. This is the belt to the token
deletion's braces: a token cached anywhere still stops working on the next request. The
frontend's 401 interceptor already clears the session and sends the user to `/login`.

Revoking a `PENDING` invite just clears `tokenHash`; the accept endpoint then answers `410`.

### 6. Design question: an accountant who works for several client tenants

An accountant typically serves many SoupFinance customers. Two options:

| | A. One login, tenant switcher (recommended) | B. One login per tenant |
|---|---|---|
| Identity | One `SbUser` (their email); one `Agent` per client tenant | A separate `SbUser` per tenant; usernames must be unique, so `email+tenant` or similar |
| Fits existing model | Yes — `SbUser` is already documented as multi-agent | Fights it: `SbUser.username` is globally unique and `email` is the natural username |
| UX | Sign in once, pick a client | One password per client; password managers fight it |
| Revoke | Disables one `Agent`; other clients unaffected | Disables one `SbUser` |
| Work needed | Tenant must be bound per **token**, not per user (below) | Username scheme + `resendConfirmation`/`forgotPassword` must handle duplicates by email |

**Recommendation: A.** The blocking gap is tenant resolution:
`SoupDiscriminatorTenantResolver` resolves session → `sb_user.tenant_id` → hostname. The
SoupFinance SPA is stateless (X-Auth-Token, no session), so today the tenant comes from the single
`sb_user.tenant_id` column — an accountant with two agents would always land in one tenant. Option
A therefore needs:

1. `GET /rest/user/tenants.json` → `[{ tenantId, companyName, agentId, roles }]` for every enabled
   agent of the current user.
2. `POST /rest/user/switchTenant.json { tenantId }` → issues a **new** token bound to that tenant
   (store `tenantId` on `AuthenticationToken`), after checking the user has an enabled agent there.
   Returns the same payload as `/rest/user/current.json`.
3. The resolver reads the tenant from the token's `tenantId` before falling back to
   `sb_user.tenant_id`.
4. Login (`/rest/api/login`): when the user has more than one enabled agent, bind the token to the
   last-used tenant (or `sb_user.tenant_id`) and let the SPA offer the switcher.

Until (1)–(4) ship, an accountant accepting a second tenant's invite must be told
"You already work for another SoupFinance company; switching companies is coming soon" — or the
backend must refuse the second accept with `409`. Pick one and document it in the response
`message`; the frontend shows the message verbatim.

The frontend tenant switcher is a separate ticket (filed as a follow-up of SOUPFIN-101).

## Tests the backend change must ship

Functional specs (`*FunctionalSpec`, `BaseDomainFunctionalSpec` helpers):

1. Admin invites → `201`, email sent (assert via the mail mock), list shows `PENDING`.
2. Duplicate pending invite → `409`; invite to an existing team member → `409`.
3. Non-admin and accountant calling `save`/`resend`/`revoke` → `403`.
4. Accept as a new user → can log in; `/rest/user/current.json` shows the inviting tenant;
   `/rest/invoice/index.json` returns only that tenant's invoices (seed a second tenant with an
   invoice and assert it is absent).
5. Accept as an existing user (agent in tenant B) → still one `SbUser`, two agents.
6. Accountant `POST /rest/agent/save.json` → `403`; `GET /rest/financeReports/trialBalance.json` →
   `200`.
7. Revoke an accepted invite → the accountant's very next request with the old token → `401`.
8. Accept with a revoked / expired / already-used token → `410`; with a garbage token → `404`.
9. Overflow: 200 invites in one tenant list and paginate; resend 6 times in a day → `429`.

## Frontend status (already in soupfinance)

| Piece | File |
|---|---|
| Types | `soupfinance-web/src/types/settings.ts` (`AccountantInvite`) |
| API client | `soupfinance-web/src/api/endpoints/settings.ts` (`accountantInviteApi`) + `registration.ts` (`getAccountantInvite`, `acceptAccountantInvite`) |
| Accountants tab | `soupfinance-web/src/features/settings/AccountantListPage.tsx` at `/settings/users/accountants` |
| Accept page | `soupfinance-web/src/features/auth/AcceptInvitePage.tsx` at `/accept-invite?token=` |

Until this plan ships, `/rest/accountantInvite/index.json` answers 404 and the Accountants tab
shows "Accountant access isn't available on this server yet" instead of a raw error.
