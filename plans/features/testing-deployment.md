# Feature: Testing, QA & Deployment

**Module (TASCIM):** Testing, QA & Deployment (`f7104e6e-5bf3-48d2-857c-62d6abbe3e44`)
**Reviewed:** 2026-10-06 against main `f80bf22` / `083a461`

## 1. Overview

| Area | Location | Notes |
|------|----------|-------|
| Unit tests | `soupfinance-web/vitest.config.ts`, `src/test/setup.ts`, `src/**/__tests__` | jsdom, axios mocked globally, v8 coverage (no thresholds) |
| Mock E2E | `playwright.config.ts`, `e2e/*.spec.ts` (~42 files), `e2e/fixtures.ts` | Firefox only, port 5180, `retries: CI?2:0`, `workers: CI?1:auto` |
| Unmocked-API guard | `e2e/fixtures.ts:1393` `installUnmockedApiGuard`, `:1299` `mockAmbientApi` | Opt-in; used by 10 specs |
| LXC / integration E2E | `playwright.lxc.config.ts`, `playwright.integration.config.ts`, `e2e/integration/` (17 files) | Firefox, workers=1; run by hand only |
| Scripts | `package.json` | `lint`, `build`, `test:run`, `test:coverage`, `test:e2e*`, `test:e2e:lxc*` (no `test:e2e:integration`) |
| CI | none | No `.github/` directory anywhere in the repo |
| Deploy | `deploy/deploy-to-production.sh` (6 steps), `deploy/apache-soupfinance.conf` (canonical) | `deploy-to-demo.sh` is a stale duplicate with no checks |

**Gateway change (c11c998 + f80bf22, SOUP-3531):** `/rest/`, `/account/`, `/client/` and `/application/` now proxy to
`balancer://soupfinance_api` over front-door mutual TLS (`/etc/apache2/soup-front-door/pki`), with a sticky `SFROUTE` cookie.
f80bf22 left **Demo's gateway as the only active member**. Fincap, Ashfield and the Grails fallback are hot standby (`status=+H`),
because Go cache evictions only reach Demo's Grails. The trailing-slash, RewriteCond and dual-VHost rules are still respected.
Also: `ProxyTimeout 30` (the old docs say report calls can take 30-60 s, so watch for 504s), and 502/503/504 serve `/maintenance.html`.

## 2. Current status (evidence)

- **Unit:** `npm run test:run` gives **76 files, 1712/1712 passed** (65 s). CLAUDE.md still says 1095/53.
- **Lint:** `npm run lint` gives **0 errors, 98 warnings** (mostly `react-hooks/incompatible-library` on RHF `watch()`).
- **Mock E2E:** not run in this review (the Firefox download is blocked in the review container). Known from task history:
  - Specs without the guard still bounce to `/login` when unmocked `/rest` calls reach a live `:9090` (17, 77, 82).
  - `landing-page.spec.ts:9` hits live `https://www.soupfinance.com` (66).
  - "shows loading state" tests race under parallel workers (66).
- **Unmerged work:** the SOUPFIN-77 dashboard fix is on branch `…soupfin-77-issue-e2e-dash` (088f0d6). The SOUPFIN-82 fix was never pushed.
  The SOUPFIN-48 `trackApi401s` work was never merged. Several auto-fix branches carry work for a different ticket than their name says.
- **Security:** the canonical Apache config commits the real `Api-Authorization` Basic value, and the rule docs commit the decoded
  secret and the production DB password (SOUPFIN-217).
- **Deploy script:** the API smoke check accepts a 500. The frontend rsync has no rollback. No tests run before deploy.
  There is no check for balancer or PKI health (SOUPFIN-220).

## 3. Task review

| ID | Title (short) | State change | Evidence / notes |
|----|---------------|--------------|------------------|
| SOUPFIN-12 | Merge feature/auto-fix branches | Done (unchanged) | e25ce54 / ef81485 |
| SOUPFIN-13 | Backend consolidation directive | Done (unchanged) | a00b19b, `plans/soupfin-13-backend-consolidation-directive.md` |
| SOUPFIN-17 | Harden SOUPFIN-16 client E2E | Backlog → **Todo** | `soupfin-16-v2-fixes.spec.ts:303` still has no guard or ambient mocks |
| SOUPFIN-26 | Playwright chromium vs Firefox docs | Backlog → **Done** | f67bbd4: all 3 configs Firefox-only |
| SOUPFIN-31 | user-journeys 401 → login | Done (unchanged) | a778583; spec uses the guard |
| SOUPFIN-32 | Same as 26 | Backlog → **Cancelled** | Duplicate of 26 |
| SOUPFIN-36 | Migrate mock suite to Firefox | Backlog → **Done** | f67bbd4 (MoneyInput allow-list, settings/payments mocks). Loading flake → 66 |
| SOUPFIN-48 | bills.spec form → /login | Backlog → **In Review** | TaxEntry mock `fixtures.ts:694` + guard (db08ecc) on main; needs a Firefox run to confirm 44/44 |
| SOUPFIN-66 | Non-deterministic mock suite | Backlog → **Todo** | landing-page.spec still hits prod; loading-state races remain |
| SOUPFIN-77 | dashboard.spec 14/16 fail | Backlog → **In Review** | Fix on unmerged branch 088f0d6 |
| SOUPFIN-79 | soupfin-63 nav flake | In Review → **Done** | dc0d24a on main |
| SOUPFIN-80 | Guard in Payments/Accounting specs | In Review → **Done** | db08ecc on main |
| SOUPFIN-82 | 6 tests bounce to /login | Backlog → **Todo** | Fix never pushed; 4 specs still unguarded |
| SOUPFIN-83 | SideNav 50-cycle timeout | In Review → **Done** | 6cfcdd9; `SideNav.test.tsx:316` 20 s; suite 1712/1712 |
| SOUPFIN-88 | Same as 83 | Cancelled (unchanged) | Duplicate of 83 |
| **SOUPFIN-217** | Remove committed Api-Authorization secret + rotate | new, Todo, urgent | |
| **SOUPFIN-218** | CI quality gate (GitHub Actions) | new, Todo, high | |
| **SOUPFIN-219** | Default guard fixture + dead proxy target in mock mode | new, Todo, high | |
| **SOUPFIN-220** | Harden deploy script for the balancer | new, Todo, high | |
| **SOUPFIN-221** | Refresh deploy rules and test inventory docs | new, Todo, medium | |
| **SOUPFIN-222** | Scheduled LXC integration run | new, Backlog, medium | |

## 4. Remaining work plan

1. **Stop the bleeding (security):** SOUPFIN-217. Template the secret into a server-only include, scrub the docs, and request rotation
   (backend plan in `plans/` first).
2. **Make the mock suite deterministic:**
   - Merge the SOUPFIN-77 dashboard hunk.
   - SOUPFIN-219: an auto fixture with guard + `mockAmbientApi` + `assertNone`, and `VITE_PROXY_TARGET=http://127.0.0.1:9` in the webServer env. This closes 17, 82 and 77.
   - SOUPFIN-66: move landing-page.spec to an opt-in project, and make loading-state tests promise-gated.
   - Confirm SOUPFIN-48 with a Firefox run.
3. **CI gate:** SOUPFIN-218 (see section 4a).
4. **Deploy safety:** SOUPFIN-220. Pre-deploy gate, real JSON API smoke, PKI/balancer checks, symlinked releases with rollback,
   `/version.json`, and retire `deploy-to-demo.sh`.
5. **Docs:** SOUPFIN-221 (balancer topology, real test counts, missing script names).
6. **Integration cadence:** SOUPFIN-222.

### 4a. CI / quality-gate plan

| Trigger | Job | Required? | Budget |
|---------|-----|-----------|--------|
| Every PR + push to main (`soupfinance-web/**`) | `npm ci` → `lint --max-warnings=<ratchet, 98 today>` → `npm run build` → `npm run test:run` (+ coverage artifact) | **Yes** | < 5 min |
| Every PR | Mock E2E: `playwright install --with-deps firefox`, `CI=1 npm run test:e2e`, proxy target dead, report artifact | Advisory until 219/66/82 land, then **Yes** | < 15 min, 2 shards if needed |
| Every PR | gitleaks secret scan | Yes (after 217) | < 1 min |
| Nightly (LXC host) | `test:e2e:integration` against LXC, counts posted | Alert, not blocking PRs | < 30 min |
| Before production deploy | Green CI on the HEAD SHA + an LXC run of that SHA within 24 h; then the deploy script's own smoke | Blocking (script refuses) | |

**Flake policy**
- CI retries stay at 2. Any test that passes only on retry is reported as *flaky* in the Playwright report.
- A test that flakes twice in a week gets a ticket within a day. It may be quarantined with `test.fixme` and a ticket ID for at most 7 days.
- No raw `waitForTimeout` or timed-delay-only loading assertions in new tests. Gate mocks on promises the test releases.
- Every mock spec runs under the unmocked-API guard. An unmocked `/rest` call is a hard failure, never a flake.
- Unit tests that measure loops or timing get explicit timeouts (the SOUPFIN-83 pattern). The 5 s default is for ordinary tests.
- Never fix a flake by raising global timeouts or `workers=1`. Fix the race.

**Deploy verification (post-deploy, automated in SOUPFIN-220)**
- All 11 SPA routes return 200 `text/html`.
- `POST /rest/api/login.json` with bad credentials returns 401 JSON, so the balancer, mTLS and Api-Authorization all work.
- `/version.json` equals the deployed SHA.
- At least one active balancer member.
- On failure, roll back both the config and the release symlink.
- Manual follow-up: log in as the support user and open the dashboard and invoices.

## 5. Backend dependencies

- Secret rotation for the `SoupFinance Web App` ApiConsumer and the DB password: soupmarkets-web/ops. Write the request in `plans/` first (SOUPFIN-217).
- Re-activating Fincap/Ashfield balancer members depends on cross-box cache eviction reaching Demo's Grails (SOUP-3531, Soupmarkets project). Not a SoupFinance code task.
- The integration suite depends on LXC backend seed data and the `api_consumer` row (CLAUDE.md, LXC troubleshooting).

## 6. Related QBO-parity / COA tasks

- **SOUPFIN-152**: COA seeding regression tests (unit, mock E2E, LXC). It must run under the SOUPFIN-219 fixture and be part of the SOUPFIN-222 nightly run.
- **SOUPFIN-141**: tenant backup/restore. Needs a cross-tenant isolation integration test once built.
- Every new QBO-parity feature (epic SOUPFIN-98) must ship with unit tests and a guarded mock E2E spec to pass the SOUPFIN-218 gate.

## 7. Definition of done

- CI runs lint (warning ratchet), build, unit and mock E2E on every PR. Lint, build and unit tests are required checks; E2E becomes required after step 2.
- The full mock E2E suite passes 3 runs in a row at default workers on Firefox, with no live network calls.
- No credentials in git, and a secret scan in CI.
- Deploys gate on green CI + a recent LXC run, verify the API through the balancer, and can roll back both config and frontend in one command.
- The nightly LXC integration run reports counts automatically.
- CLAUDE.md and `.claude/rules` match the deployed topology and the real test counts.
