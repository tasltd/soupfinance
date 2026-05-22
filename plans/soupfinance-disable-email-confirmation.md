# SoupFinance — Disable Email Confirmation on Registration

**Status:** Draft — pending soupmarkets-web implementation
**Owner (frontend):** SoupFinance team
**Owner (backend):** soupmarkets-web team
**Target deploy:** As soon as backend lands

---

## Context

Today the SoupFinance registration flow forces every new tenant through email confirmation before they can log in:

1. User submits `/register` form (no password collected)
2. `POST /account/register.json` creates `Account` + `Agent` + `SbUser` with `enabled = false`
3. Backend sends a confirmation email containing a tokenised link to `/confirm-email?token=xxx`
4. User clicks link → frontend `ConfirmEmailPage` → `POST /account/confirmEmail.json` with password
5. Backend validates token, sets password, sets `enabled = true`
6. User can finally log in

Product wants registration to be **single-step**: collect the password during registration and let the user log in immediately. Email confirmation should be removable "for now" but easy to re-enable.

This document specifies the **backend changes required** in `soupmarkets-web` to support that. The matching frontend changes are prepared on the SoupFinance side in the same PR cycle but will not be deployed until the backend ships.

---

## Goals

| Goal | Detail |
|------|--------|
| Single-step registration | Accept password at `/account/register.json`; no second round-trip required |
| Account enabled immediately | `SbUser.enabled = true` and `Agent` ready to log in on response |
| Toggleable | A config flag re-enables the email confirmation flow without a code change |
| Backwards-compatible | Existing `/account/confirmEmail.json` and `/account/resendConfirmation.json` keep working for users who already received emails before the rollout |
| Tenant-aware | The flag must be addressable per ApiConsumer (SoupFinance app only), not globally for every soupmarkets-web client |

---

## Non-goals

- Removing the `ConfirmEmailPage` route or backend endpoints. The flow stays available for: (a) existing pending users, (b) future re-enable, (c) password reset which reuses the token machinery.
- Changing the OTP/2FA flow (`/client/authenticate.json`, `/client/verifyCode.json`). It was never wired into registration in the first place — see `soupfinance-tenant-architecture-refactor.md`.
- Changing `AccountController` tenant resolution behaviour (`@WithoutTenant` etc.).

---

## Required backend changes (`soupmarkets-web`)

### 1. Config flag — `soupfinance.requireEmailConfirmation`

Add a per-ApiConsumer setting that defaults to `true` (preserve current behaviour for any other consumer) but is set to `false` for the SoupFinance ApiConsumer.

| Location | Change |
|----------|--------|
| `api_consumer` table | Add nullable column `require_email_confirmation BOOLEAN DEFAULT TRUE` (Flyway migration). |
| `ApiConsumer` domain | Add `Boolean requireEmailConfirmation = true` |
| Bootstrap / seed data | Update SoupFinance row to `require_email_confirmation = FALSE` |
| `ApiAuthenticatorInterceptor` | After resolving the consumer, expose `consumer.requireEmailConfirmation` to downstream actions (e.g., via `request.apiConsumer`) |

**Why per-consumer, not global?** soupmarkets-web is multi-tenant; other consumers (Soupmarkets admin, brokerage portal) still want the email-confirmation safety net. Only the SoupFinance ApiConsumer toggles off.

### 2. `AccountController.register` action

```groovy
// Pseudocode — adjust to match existing controller style
def register(TenantRegistrationCommand cmd) {
    if (!cmd.validate()) {
        respond([success: false, errors: cmd.errors], status: 400)
        return
    }

    boolean requireEmailConfirmation = request.apiConsumer?.requireEmailConfirmation ?: true

    if (!requireEmailConfirmation && !cmd.password) {
        respond([success: false, errors: [password: 'Password is required']], status: 400)
        return
    }

    Account.withTransaction {
        Account account = accountService.createTenantAccount(cmd)
        Agent agent = agentService.createAdminAgent(account, cmd)
        SbUser user = sbUserService.createUser(
            agent,
            cmd.email,
            requireEmailConfirmation ? null : cmd.password,
            enabled: !requireEmailConfirmation,
            roles: ['ROLE_ADMIN', 'ROLE_USER'],
        )

        if (requireEmailConfirmation) {
            confirmationTokenService.issueAndSend(user)
        }

        respond([
            success           : true,
            accountId         : account.id,
            agentId           : agent.id,
            email             : user.username,
            requiresConfirmation: requireEmailConfirmation,
        ])
    }
}
```

Key behaviours:
- `cmd.password` becomes **required** when `requireEmailConfirmation == false`; rejected (or ignored — pick one and document) when `true`.
- `SbUser.enabled` is set to the inverse of `requireEmailConfirmation`.
- `SbUser.password` is bcrypt-hashed via the existing `passwordEncoder` (`{bcrypt}$2a$10$...`) — DO NOT store plaintext.
- Tenant fields on Agent/SbUser (`tenantId = account.id`) must still be set — see `soupfinance-tenant-resolution-fix.md`. This change does NOT regress that.
- Response payload gains `requiresConfirmation` so the frontend can decide its post-register UX without re-reading config.

### 3. `TenantRegistrationCommand`

Add an optional `password` field with the same validation rules as `EmailConfirmationCommand.password` today:

| Field | Constraint |
|-------|------------|
| `password` | nullable; if present: min 8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit |
| `password` cross-check | required iff `request.apiConsumer.requireEmailConfirmation == false` |

### 4. Audit + logging

- Log the per-request decision (`requireEmailConfirmation=true/false`, `consumer=...`) at `INFO` so we can see the toggle take effect in `/root/tomcat9078/logs/catalina.out`.
- Emit an event on the audit log: `ACCOUNT_REGISTERED` with payload `{accountId, agentId, requireEmailConfirmation}`.

### 5. Tests (backend)

| Test | Spec |
|------|------|
| `AccountControllerSpec.register_skipsConfirmation_whenConsumerFlagOff` | Posts to `/account/register.json` with consumer flag off + password → expects `success=true`, `SbUser.enabled=true`, no `ConfirmationToken` row |
| `AccountControllerSpec.register_requiresPassword_whenConfirmationDisabled` | Same flag, omit password → expects 400 with `errors.password` |
| `AccountControllerSpec.register_keepsLegacyFlow_whenFlagOn` | Default consumer (flag true) → expects `enabled=false`, ConfirmationToken issued, email queued |
| `AccountControllerIntegrationSpec.registerThenLogin_whenFlagOff` | End-to-end: register → POST `/rest/api/login` → expects access_token immediately |

### 6. Flyway migration

```sql
-- VYYYYMMDDHHmm__api_consumer_email_confirmation_flag.sql
ALTER TABLE api_consumer
    ADD COLUMN require_email_confirmation BOOLEAN NOT NULL DEFAULT TRUE;

-- Disable for SoupFinance consumer
UPDATE api_consumer
   SET require_email_confirmation = FALSE
 WHERE name = 'SoupFinance Web App';
```

Run order: this migration must precede the controller change in the same release.

---

## Frontend changes (this repo — staged in same PR cycle, not deployed until backend lands)

The matching SoupFinance frontend changes are listed here so the reviewer can verify both halves stay in sync. **They will be committed but not deployed until the backend rolls out.**

| File | Change |
|------|--------|
| `src/api/endpoints/registration.ts` | `TenantRegistration` interface gains `password: string` (required). `RegistrationResponse` gains optional `requiresConfirmation?: boolean`. |
| `src/features/corporate/RegistrationPage.tsx` | Add two password inputs (password + confirm). Validate per same rules as `ConfirmEmailPage` (8+ chars, upper, lower, digit). On `success === true && requiresConfirmation === false` (the new path) → `navigate('/login', { state: { registeredEmail, fromRegistration: true } })`. On `requiresConfirmation === true` (legacy/fallback) → show the existing "Check Your Email" screen. |
| `src/features/auth/LoginPage.tsx` | If `location.state?.fromRegistration` → render a green "Account ready — sign in to continue" banner above the form. |
| `src/api/endpoints/__tests__/registration.test.ts` | Add a case that sends a password and asserts it's in the JSON body. |
| `e2e/registration.spec.ts` | Update "successful registration shows email confirmation screen" → renamed to "successful registration redirects to login when confirmation disabled"; keep one test for the legacy path mocked with `requiresConfirmation: true`. |

The frontend code remains capable of handling both paths so we can flip the backend flag back to `true` without redeploying the frontend.

---

## Rollout plan

1. **Backend PR** lands in `soupmarkets-web` with the controller change, command class, migration, tests, and the seed update for the SoupFinance consumer.
2. **Deploy to staging** (`tas.soupmarkets.com` staging or LXC). Verify with curl:
   ```bash
   curl -X POST https://tas.soupmarkets.com/account/register.json \
        -H "Content-Type: application/json" \
        -H "Api-Authorization: Basic $SOUPFINANCE_AUTH" \
        -d '{"companyName":"Test","businessType":"SERVICES","adminFirstName":"A","adminLastName":"B","email":"qa+$(date +%s)@example.com","country":"GH","password":"TestPass1"}'
   ```
   Then `curl -X POST .../rest/api/login` with the same credentials → expect 200 + token.
3. **Deploy backend to production.**
4. **Deploy SoupFinance frontend** (`./deploy/deploy-to-production.sh`).
5. **Smoke test** on `app.soupfinance.com`:
   - Register a new tenant with password → expect redirect to `/login` + "Account ready" banner.
   - Log in with the same credentials → expect dashboard.
   - Confirm no email is sent (check inbox + backend mail queue).
6. Monitor `app.soupfinance.com-ssl-error.log` and Sentry `soupmarkets` project for 1 hour.

---

## Re-enabling email confirmation later

Flip the flag without any code change or redeploy:

```sql
UPDATE api_consumer
   SET require_email_confirmation = TRUE
 WHERE name = 'SoupFinance Web App';
```

The frontend already handles `requiresConfirmation === true` → renders the existing "Check Your Email" screen. Email links and `ConfirmEmailPage` are untouched.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Password sent over the wire with weak validation | Same validation rules as today's `ConfirmEmailPage`; HTTPS-only via Cloudflare/Apache; bcrypt hash on save |
| User typos email → can't recover password without confirmation flow | `/account/forgotPassword.json` still works (independent of registration confirmation) |
| Bots register thousands of enabled accounts | Add CAPTCHA on `/register` (separate plan); rate-limit `POST /account/register.json` by ApiConsumer + IP |
| Tenant data leak if `tenant_id` not set on new SbUser | Existing `soupfinance-tenant-resolution-fix.md` already covers this. Backend tests in §5 must assert `SbUser.tenant_id == account.id` |
| Old in-flight confirmation emails for users who registered before rollout | Backend keeps `/account/confirmEmail.json` working; users with pending tokens can still complete confirmation |

---

## Open questions

1. Should the password field be added to the registration form unconditionally on the frontend (and the backend ignores it when `requireEmailConfirmation = true`), or should the frontend hide it based on a probe call? **Recommendation:** Unconditional — saves a round-trip and lets the backend reject a missing password cleanly.
2. Do we want to email the user a "your account is ready" notification even without confirmation? **Recommendation:** Yes, send a welcome email asynchronously after register; not blocking.
3. Should we audit which ApiConsumers have the flag off? **Recommendation:** Yes — admin-only Confluence/PM doc plus a `GET /admin/apiConsumers/index.json` filter so support can spot misconfiguration quickly.

---

## References

- `plans/soupfinance-tenant-architecture-refactor.md` — Tenant-per-Account model and registration responsibilities
- `plans/soupfinance-tenant-resolution-fix.md` — Tenant ID propagation requirements (must continue to hold)
- `plans/soupfinance-agent-current-endpoint.md` — Related backend endpoint plan
- `.claude/rules/backend-changes-workflow.md` — Why this plan exists in `plans/` and not in code yet
