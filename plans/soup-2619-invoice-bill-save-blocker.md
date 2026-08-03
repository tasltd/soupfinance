# SOUP-2619 Backend Plan — invoice/bill save blocker (422 unique number) + empty bill CSRF token

**Status:** backend work; must be executed from a `soupmarkets-web` session (see
[.claude/rules/backend-changes-workflow.md](../.claude/rules/backend-changes-workflow.md)).
**PM item:** SOUP-2619 (urgent, still **To Do**), project SOUP.
**Target branch:** `authentication-base-on-multi-tenancy-descriminator` (the multi-tenant branch).
**Verified against:** LXC backend `10.115.213.183:9090`, 2026-08-03.

## Context

SoupFinance (`app.soupfinance.com`) cannot create any invoice or bill. Every
`POST /rest/invoice/save.json` and `POST /rest/bill/save.json` is rejected with
`422 Property [number] ... must be unique`. This blocks the core billing workflow and also
blocks verification of the line-item persistence issue.

## Finding 1 — number generator uses `last()`, which orders by UUID id

`InvoiceService.save()` and `BillService.save()` derive the next document number from
GORM's `last()`:

```groovy
def lastInvoice = last()            // Invoice.last()
invoice.number = (lastInvoice?.number ?: 0) + 1
```

`last()` orders by the **identifier**, and identifiers here are random UUID strings, so it
returns an arbitrary row rather than the highest-numbered one. On a tenant whose highest
invoice is `4` it can return the row numbered `3`, regenerate `4`, and collide with the
`number unique: ['numberPrefix', 'tenantId']` constraint (SOUP-1932) on every attempt.

The javadoc on `InvoiceService.last()` claims "ordered by dateCreated descending", which the
implementation does not do — worth correcting either way, but `dateCreated` ordering would
still be wrong here because the sequence must be keyed on `number`.

### A fix already exists and is essentially ready

Branch `feature/20260803-131137-auto-fix-request-soup-2619-issue-backend-u` (remote, already
pushed) is a clean fast-forward on top of the multi-tenant branch — 2 commits ahead, 0 behind.
It adds `DocumentNumberSequencer` plus `nextNumber()`/`maxNumberForPrefix()` on both services:

- takes `MAX(number)` via a criteria projection scoped to `numberPrefix` (tenant applied
  implicitly because the domains are `MultiTenant`), matching the uniqueness constraint exactly
- advances to the next **free** number rather than blindly `+1`
- deliberately does **not** exclude archived rows, since an archived row still occupies its
  number and reusing it would re-violate the constraint
- ships `DocumentNumberSequencerSpec` (162 lines) and `DocumentNumberSequenceSpec` (295 lines)

Review notes for whoever lands it:

1. **The two commit messages must be rewritten before merge.** One is literally
   `Session fix-soup-2619-131136-dvmi: [API Error: 400 Access denied ...]` and the other is
   `Session ...: Work in progress`. Both violate the commit-message rules (no AI/session
   references; imperative, purpose-describing subject).
2. The branch also touches `CLAUDE.md`, `FinanceMcpToolsService`, and several unrelated
   `*ControllerSpec` files. Confirm those are intended and not incidental churn.
3. Re-run the finance integration specs in a **single JVM** (one `./gradlew integrationTest`
   invocation with multiple `--tests` flags) per the sequential-integration-test rule.

## Finding 2 — `BillController.create()` returns no CSRF token (confirmed, reproduced)

The production report noted bill saves going out as
`POST /rest/bill/save.json?SYNCHRONIZER_TOKEN=&SYNCHRONIZER_URI=`. This is **not** a frontend
bug and is **not** fixed by using the module-prefixed path. Probed directly against the LXC
backend with a valid `X-Auth-Token`:

| Endpoint | HTTP | `SYNCHRONIZER_TOKEN` in body |
|---|---|---|
| `GET /rest/invoice/create.json` | 200 | **present** |
| `GET /rest/finance/invoice/create.json` | 200 | **present** |
| `GET /rest/bill/create.json` | 200 | **absent** |
| `GET /rest/finance/bill/create.json` | 200 | **absent** |

`bill/create.json` returns a bare empty-`Bill` JSON (keys: `id`, `number`, `numberPrefix`,
`billDate`, `total`, … ) with no token at any nesting level. The frontend's `getCsrfToken()`
therefore takes its documented fallback branch, logs a warning, and returns empty strings so
the request can still proceed — which is exactly what is observed in production.

**Fix:** make `BillController.create()` emit `SYNCHRONIZER_TOKEN`/`SYNCHRONIZER_URI` the same
way `InvoiceController.create()` does. Until it does, `withForm` on bill save is effectively
unenforced — the save is currently only being stopped by the DB constraint, not by CSRF.

## Finding 3 — line-item persistence (SOUP-2619 issue #2) is already fixed, just not deployed

`saveWithItems(...)` + `IndexedLineItemBinder.extract(params, 'invoiceItemList' | 'billItemList')`
is wired into both `InvoiceController` (lines 314, 362) and `BillController` (lines 329, 377)
on the multi-tenant branch under SOUP-2474. So the "No line items / GH₵0.00" symptom against
`app.soupfinance.com` most likely reflects a **deployed WAR that predates SOUP-2474**, not a
missing fix.

Action: confirm the build currently deployed to `tas.soupmarkets.com` contains SOUP-2474
before writing any new binding code. Re-test line items only after Finding 1 unblocks saves —
until then the path cannot be exercised at all.

## Suggested order of work

1. Rewrite the two commit messages on the SOUP-2619 branch.
2. Review the sequencer diff; confirm the unrelated file churn is intended.
3. Add the `BillController.create()` CSRF token fix (Finding 2) — not currently on the branch.
4. Run the finance unit + integration specs in one JVM; fix every failure, including
   pre-existing ones.
5. Merge to `authentication-base-on-multi-tenancy-descriminator` **locally**, then push to sync.
6. Deploy, then re-verify: create an invoice and a bill end to end and confirm the line items
   and totals persist.

## Out of scope for the SoupFinance repo

No frontend change is required for any of the three findings. Finding 2 in particular cannot be
fixed frontend-side — both candidate paths return the same token-less body.
