# SOUPFIN-186: Password reset endpoints (backend plan)

**Target repo:** `soupmarkets-web` (do not implement from the soupfinance context; see
`.claude/rules/backend-changes-workflow.md`).
**Supersedes:** `plans/SOUPFINANCE_BACKEND_CHANGES_NEEDED.md` §8d.

## Context

The SoupFinance app ships `/forgot-password` and `/reset-password`
(`soupfinance-web/src/features/auth/ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`).
They call `forgotPassword()` and `resetPassword()` in
`soupfinance-web/src/api/endpoints/registration.ts`. Neither backend action exists.

Verified on 2026-10-13:

| Check | Result |
|---|---|
| `grep forgotPassword\|resetPassword` in `AccountController.groovy` (branches `authentication-base-on-multi-tenancy-descriminator`, `master`) | No match. Only the spring-security-ui SSR `RegisterController.forgotPassword` exists |
| `POST https://app.soupfinance.com/account/forgotPassword.json` | `302` to `https://tas.soupmarkets.com/login/auth` |
| `POST https://app.soupfinance.com/account/resetPassword.json` | `302` to the same login page |
| `POST https://app.soupfinance.com/account/resendConfirmation.json` (control) | `200 application/json` |

The login page sends `Access-Control-Allow-Origin: https://app.soupfinance.com`, so the
browser follows the 302 and the XHR resolves as **200 text/html**. Before SOUPFIN-186 the
forgot-password page reported "Reset link sent" for that (and for every error), and the
reset page would have reported "Password Reset Successfully" without changing anything.
Both pages now accept only a JSON `{ "success": true }` body and show an error otherwise.

A user who forgets their password has no recovery path.

## Do NOT copy the confirmation-token design

`AccountRegistrationService.generateConfirmationToken()` builds the token as
`base64("<agentId>:<epochMillis>")`. It is not signed and not stored, so anyone who
knows an agent id can mint a valid token. Agent ids are returned by
`/rest/user/current.json` and by agent listings. For a password reset that design is a
full account takeover. The reset token MUST be random, stored hashed, and single-use.
(The confirmation-token weakness itself is tracked separately; see the PM comment on
SOUPFIN-186 for the issue key.)

The same applies to `resolveFrontendUrl()`'s **Origin/Referer** fallback. For a reset
email that fallback lets an attacker post `forgotPassword` with `Origin: https://evil.example`
and have the victim's real token mailed inside a link to the attacker's host. The reset
link MUST be built only from server-side configuration (ApiConsumer `applicationUrl`,
then `callbackScopeUrl`, then `soupfinance.url`, then the default), never from request
headers.

## Required changes (soupmarkets-web)

### 1. Domain: `PasswordResetToken` (new)

`grails-app/domain/soupbroker/PasswordResetToken.groovy`

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (UUID) | Follow the `SbDomain` id convention |
| `sbUser` | `SbUser` | FK, indexed |
| `tokenHash` | `String` | SHA-256 hex of the raw token, `unique: true`, indexed. Never store the raw token |
| `expiresAt` | `Date` | `issuedAt + 60 minutes` (config `soupfinance.passwordReset.ttlMinutes`, default 60) |
| `usedAt` | `Date`, nullable | Set when the token is consumed |
| `requestIp` | `String`, nullable | For audit only |
| `dateCreated` | `Date` | |

- Not tenant-scoped: implement it **without** `MultiTenant` (like `SbUser` lookups in
  `register()`), because the request arrives with no tenant. Do not extend `SbDomain`
  if that forces a `tenantId` filter; if it must extend it, write and read inside
  `Tenants.withId(agent.account.id)` and look tokens up with `Tenants.withoutId { }`.
- Flyway/Liquibase migration for the new table (follow the repo's migration convention;
  see the `grails-flyway-migrations` skill).

### 2. Service: `PasswordResetService` (new, or methods on `AccountRegistrationService`)

```groovy
@WithoutTenant
Map requestReset(String email, String apiConsumerId, String requestIp)
@WithoutTenant
Map resetPassword(String token, String password, String confirmPassword)
```

**`requestReset`**

1. Normalise the email (`trim().toLowerCase()`). If blank or not an email shape, return
   `[success: false, code: 'EMAIL_INVALID', message: 'Enter a valid email address']`.
   This is the only non-200 outcome and it does not depend on whether an account exists.
2. Look up the user the same way `register()` does:
   `SbUser.findByUsernameOrEmail(email, email)`. Also accept an `Agent` whose
   `emailContacts` contains the address, then use `agent.userAccess`.
3. If no user, or the user is `accountLocked`, or archived: **do nothing** and return
   the generic success below. Do not send a different email, do not sleep a different
   amount of time (do the hash work regardless, see step 5).
4. Rate limit: if the user has 3 or more tokens created in the last 15 minutes, skip
   sending and return the generic success.
5. Generate the token: 32 bytes from `SecureRandom`, Base64URL without padding (43 chars).
   Store `sha256Hex(token)`. Mark every earlier unused token for that user as used
   (`usedAt = now`) so only the newest link works.
6. Build the link: `${frontendUrl}/reset-password?token=${URLEncoder.encode(token, 'UTF-8')}`
   where `frontendUrl` comes from the ApiConsumer `applicationUrl`, then
   `callbackScopeUrl`, then `soupfinance.url`, then `https://app.soupfinance.com`.
   **No Origin/Referer fallback** (see above).
7. Send via `emailSendingService.sendEmail(...)` with a new view
   `grails-app/views/accountRegistration/passwordResetEmail.gsp` (model: `agent`,
   `resetUrl`, `ttlMinutes`). Subject: `Reset your SoupFinance password`.
   Catch and log mail failures; still return the generic success.
8. Also accept users whose `enabled == false` because they never confirmed their email?
   **No.** Return the generic success and send nothing; they should use
   `/account/resendConfirmation.json`. (Optional: send the confirmation email instead.)
9. Return `[success: true, message: 'If an account exists for that email, a password reset link has been sent.']`.

**`resetPassword`**

1. Validate input before touching the database:
   - blank token: `TOKEN_INVALID`
   - `password` shorter than 8 characters: `PASSWORD_TOO_SHORT`
     (the SoupFinance form enforces 8; `confirmEmail` still allows 6, which is a separate gap)
   - `password != confirmPassword`: `PASSWORD_MISMATCH`
2. Look up `PasswordResetToken.findByTokenHash(sha256Hex(token))` with
   `Tenants.withoutId { }` and a pessimistic lock (`lock: true`) so two concurrent
   submissions cannot both succeed.
3. No row, or `usedAt != null`: `TOKEN_INVALID`.
   `expiresAt < now`: `TOKEN_EXPIRED`.
4. Set `sbUser.password = password` (plain text). `SbUserPasswordEncoderListener`
   encodes it on update through the `DelegatingPasswordEncoder`, which writes the
   `{bcrypt}$2a$10$…` form. Do NOT pre-hash, or it is hashed twice.
   Also set `passwordExpired = false` and leave `enabled`/`accountLocked` unchanged.
5. Set `usedAt = now` on this token **and** on every other unused token for the user.
   Do steps 4 and 5 in one transaction.
6. Revoke the user's existing REST tokens (the spring-security-rest token store) so a
   stolen session cannot outlive the reset. If the store has no per-user revoke, record
   that as a follow-up rather than skipping silently.
7. Optional: send a "your password was changed" notice to the account email.
8. Return `[success: true, message: 'Your password has been reset. You can now sign in.']`.

### 3. Controller: `AccountController` (two actions)

Add `forgotPassword: "POST", resetPassword: "POST"` to `allowedMethods`.

```groovy
@Secured("permitAll")
@WithoutTenant
def forgotPassword() {
    def json = request.JSON
    String apiConsumerId = extractApiConsumerId()
    def result = passwordResetService.requestReset(json.email as String, apiConsumerId, request.remoteAddr)
    response.status = result.code == 'EMAIL_INVALID' ? 400 : 200
    render result as JSON
}

@Secured("permitAll")
@WithoutTenant
def resetPassword() {
    def json = request.JSON
    def result = passwordResetService.resetPassword(json.token as String, json.password as String, json.confirmPassword as String)
    response.status = result.success ? 200 : 400
    render result as JSON
}
```

Confirm both URLs reach the actions anonymously through the same filter chain and
`ApiAuthenticatorInterceptor` path as `/account/confirmEmail.json`. If a static rule
lists the `/account/*` public actions, add these two.

## API contract (the frontend codes against this)

### `POST /account/forgotPassword.json`

Request: `{ "email": "jane@acme.com" }`

| Case | Status | Body |
|---|---|---|
| Any well-formed email (exists or not, locked, rate limited, mail failure) | `200` | `{ "success": true, "message": "If an account exists for that email, a password reset link has been sent." }` |
| Blank or malformed email | `400` | `{ "success": false, "code": "EMAIL_INVALID", "message": "Enter a valid email address" }` |

### `POST /account/resetPassword.json`

Request: `{ "token": "<43-char token>", "password": "…", "confirmPassword": "…" }`

| Case | Status | `code` | `message` |
|---|---|---|---|
| Success | `200` | absent | `Your password has been reset. You can now sign in.` |
| Unknown, malformed or already used token | `400` | `TOKEN_INVALID` | `This password reset link is invalid or has already been used.` |
| Expired token | `400` | `TOKEN_EXPIRED` | `This password reset link has expired.` |
| Password under 8 characters | `400` | `PASSWORD_TOO_SHORT` | `Password must be at least 8 characters` |
| Passwords differ | `400` | `PASSWORD_MISMATCH` | `Passwords do not match` |

Every body also carries `"success": false` on failure. The frontend
(`ResetPasswordPage`) shows a dedicated "link expired" screen with a "Request a new
link" button for `TOKEN_INVALID` and `TOKEN_EXPIRED`, and keeps the form with the
message for the password codes. When `code` is missing it falls back to the HTTP 400
plus the `message` text.

## Tests (soupmarkets-web)

Unit (`PasswordResetServiceSpec`, Spock data tables):

- unknown email, locked user, archived user, unconfirmed user: success result, no token row, no mail
- known email: one token row, raw token absent from the DB, `expiresAt` = now + TTL, one mail with a link on the ApiConsumer `applicationUrl`
- `Origin: https://evil.example` is ignored when building the link
- a second request marks the first token used; the first token then fails `TOKEN_INVALID`
- 4th request within 15 minutes sends no mail
- reset: valid token sets a `{bcrypt}` hash (assert `passwordEncoder.matches`), token `usedAt` set, reuse fails `TOKEN_INVALID`
- reset with expired token: `TOKEN_EXPIRED`, password unchanged
- reset with 7-char password, mismatched passwords, blank token: the codes above, token still unused
- overflow: 1,000 outstanding tokens for one user, the newest still resolves and a reset invalidates all 1,000; a 10,000-character password is rejected or hashed without error (bcrypt truncates at 72 bytes; decide and assert)

Functional (`AccountPasswordResetFunctionalSpec`): anonymous POST to both URLs returns
JSON (never a 302), then request, read the token from the captured mail, reset, and log
in through `/rest/api/login` with the new password; the old password fails.

## SoupFinance follow-up once deployed to the LXC backend

- `soupfinance-web/e2e/integration/` spec: request reset, read the token (DB or mail
  sink), open `/reset-password?token=…`, submit, log in with the new password, then
  prove the same link now shows the expired state.
- Remove the "endpoint does not exist yet" notes in `registration.ts`,
  `ForgotPasswordPage.tsx` and `ResetPasswordPage.tsx`.

## Deployment

`soupmarkets-web` deploy to the SoupFinance LXC first
(`assembleDeployToSoupfinanceBackend`), then the normal production channel owned by the
soupmarkets-web repo. SoupFinance never deploys the backend
(`.claude/rules/deployment-restrictions.md`).
