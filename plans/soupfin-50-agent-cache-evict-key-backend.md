# SOUPFIN-50 — `/rest/agent/show/{id}.json` serves a stale read after update

**Status:** root cause isolated, measured and FIXED in `soupmarkets-web`. Shipping together with
SOUP-3156 (a second, independent defect found while writing the acceptance test — see §9).
**Repo changed:** `soupmarkets-web` (NOT soupfinance — filed here per
[.claude/rules/backend-changes-workflow.md](../.claude/rules/backend-changes-workflow.md)).
**Measured on:** LXC backend `10.115.213.183:9090`, WAR running since `2026-08-27 11:51:32 UTC`,
DB `soupbroker_seed_source`. Investigated 2026-08-27 and 2026-08-28.

> This document is the merge of the two independent investigations that were carried out on
> consecutive days (branches `…20260827-202337…` and `…20260828-092839…`). Where they measured
> the same thing they agree; where they disagree, §2.5 records the discrepancy rather than
> silently preferring one.

---

## Context

The SoupFinance Users screen (`/settings/users`) edits staff through `AgentController`.
A user edits a user, saves successfully, sees the new value on the list — then re-opens
that user's Edit form and is shown the **old** values. Saving again silently re-submits
stale data.

Frontend call site: `soupfinance-web/src/features/settings/UserFormPage.tsx:83`
→ `agentApi.get(id)` → `GET /rest/agent/show/{id}.json`.

---

## 1. Symptom / reproduction (measured, not inferred)

`PUT /rest/agent/update/{id}.json` on agent `028fb6a1a8f5422db0e4d127ccec956d`,
then read the same agent four ways:

| Source | designation | lastUpdated |
|---|---|---|
| `PUT .../agent/update/{id}.json` response (HTTP 200) | `SOUPFIN50 Probe A` | `2026-08-27T20:25:14Z` |
| MariaDB `agent` row | `SOUPFIN50 Probe A` | `2026-08-27 20:25:14` |
| `GET /rest/agent/index.json` | `SOUPFIN50 Probe A` | `2026-08-27T20:25:14Z` |
| **`GET /rest/agent/show/{id}.json`** | **`null`** | **`2026-08-21T13:52:27Z`** (7 days stale) |

Staleness persisted for **4+ hours** and is cleared only by a JVM restart.

Control that narrows the cause: a **fresh auth token** is still stale, so this is neither
session- nor request-scoped.

### Correction to the original ticket evidence

The ticket's table reported `designation: NULL` from `show` as a staleness signal. That is a
**false signal** — `show/{id}.json` does not render `designation` at all (the key is absent
from the payload; `index.json` does render it). The genuine signal is **`lastUpdated`**.
Do not chase the designation field.

---

## 2. Root cause

`AgentController.show` → `agentService.get(id, params.format)`, which is cached:

```groovy
// grails-app/services/soupbroker/security/AgentService.groovy:553
@Cacheable(value='agent', key={id})          // <-- key is the String `id`
@ReadOnly
Agent get(Serializable id, String format) { get(id) }
```

`AgentController.update` → `agentService.save(agent)`, which tries to evict:

```groovy
// grails-app/services/soupbroker/security/AgentService.groovy:205
@CacheEvict(value='agent', key={"${agent?.id}"})   // <-- key is a GString
Agent save(Agent agent) { IAgentService.save(agent) }
```

`grails.plugin.cache.CustomCacheKeyGenerator$CacheKey` stores the closure's return value in a
field declared `private final java.lang.Object simpleKey` — it is **not** coerced to `String`.
Groovy defines `GString.hashCode()` as `37 + toString().hashCode()` and `GString.equals(Object)`
as `that instanceof GString`, so the evict key can never match the cached key.

Measured directly against the shipped plugin (`org.grails.plugins:cache:7.0.0`):

| comparison | result |
|---|---|
| `String.hashCode()` | `-1265982271` |
| `GString.hashCode()` | `-1265982234` (differs by exactly 37) |
| A — `get`/String vs `get`/String (sanity) | **true** |
| B — `get`/String vs `get`/GString | **false** ← the defect |
| C — `get`/String vs `save`/String (method name only) | **true** — method name is NOT part of key equality |
| D — `get`/String vs `save`/GString (as shipped) | **false** |

```
HashMap behaviour with the real key objects:
  remove(save/GString)  -> null                 | stale entry SURVIVES
  remove(save/String)   -> STALE_AGENT_OBJECT   | stale entry REMOVED
```

Line **C** is what makes the fix a one-liner: the target method name does *not* contribute to
key equality, so a `@CacheEvict` on `save` **can** evict an entry cached by `get` — it just has
to use the same key *type*.

### 2.1 It is NOT Hibernate L2 / EhCache — do not look there

SOUPFIN-50 hypothesised "a Hibernate second-level / EhCache entry that the update path never
evicts". That is not the mechanism, and a fix aimed at it will not work:

* `Agent.groovy` has **no `cache` mapping**, so `Agent` is not in Hibernate's L2 cache at all.
* The Grails `cache-ehcache` plugin is **commented out** in `build.gradle:238`; the active
  backing store is the plugin default `GrailsConcurrentMapCacheManager` — an in-memory
  `ConcurrentMap` with **no TTL and no eviction**, which is why the entry survives until restart.
* If it were Hibernate L2, `index.json` would be stale too. It is fresh. The only difference
  between the two paths is the `@Cacheable` annotation.

### 2.2 Why it fires on *every* update from the SoupFinance UI

The stale entry is only created if something reads the agent through the `@Cacheable`
`get(id, format)` **before** the write. Controlled A/B run, 4 agents whose rows predated the
JVM start (so guaranteed uncached):

| variant | `show` after update | verdict |
|---|---|---|
| read `show` first, then update ×2 | frozen at the pre-update value | **STALE** |
| update with no prior read ×2 | correct new value | **FRESH** |

And `AgentController.edit` (line 166) calls that *same* cached `get(id, params.format)`:

```groovy
AgentController.groovy:166   respond agentService.get(id, params.format), model: [...]
```

The frontend's `agentApi.update()` fetches its CSRF token from `/agent/edit/{id}.json`
immediately before the PUT, so the read-before-write is **guaranteed on every UI save**.
That is why users hit this 100% of the time rather than intermittently.

### 2.3 Self-invocation ruled out

`AgentController.update` calls `agentService.save(agent)` at line 248 — an external call
through the Spring proxy, so `@CacheEvict` does fire. The failure is purely the key mismatch.

### 2.5 UNRESOLVED DISCREPANCY between the two investigations

The 08-27 run recorded a control that the 08-28 run contradicts:

* **08-27:** "an agent whose `show` was never read in this JVM's lifetime → *also* stale,
  returning a value older than the pre-update DB row", concluding the entry "predates the
  request entirely and simply never leaves".
* **08-28:** the controlled A/B above found no-prior-read → **FRESH**.

These cannot both be right. The 08-28 measurement is the later one and the more controlled
(explicit A/B, 4 agents chosen because their rows predated JVM start), so it is the one relied
on here — but the 08-27 observation is **not** explained away, and if it is real it implies a
second population path into the `agent` cache that nobody has identified. Anyone touching this
area should re-run the no-prior-read control before assuming the read is the only way in.
Do not delete this section just because the headline fix works.

---

## 3. The fix (one line)

`grails-app/services/soupbroker/security/AgentService.groovy:205`

```diff
-    @CacheEvict(value='agent',key={"${agent?.id}"})
+    // Fix (SOUPFIN-50): key must be the raw String id, not a GString. CustomCacheKeyGenerator
+    // stores the closure result as an Object and GString.equals(String) is false, so an
+    // interpolated evict key never matches the plain key used by @Cacheable on get(id, format)
+    // — agent/show/{id}.json then served a stale entry until the JVM restarted.
+    @CacheEvict(value='agent',key={agent?.id})
     Agent save(Agent agent){
         IAgentService.save(agent)
     }
```

Rationale for fixing the **evict** rather than the read: the read at :553 takes `id` straight
from the caller, which is already the `String` UUID used everywhere else. Changing the read to
a GString would instead require every other evict on the `agent` cache to be a GString too.

---

## 4. Blast radius — audited, exactly 2 caches affected

Audit of **all 460** `@Cacheable`/`@CacheEvict`/`@CachePut` annotations under `grails-app/services`:

| key style | READ | EVICT |
|---|---|---|
| GString | 36 | 31 |
| plain | 8 | 3 |
| no key | 175 | 207 |

Only two caches mix key styles between read and evict:

| cache | read | evict | status |
|---|---|---|---|
| `agent` | `AgentService:553` plain | `AgentService:205` **GString** | **this ticket — fixed** |
| `SbRoleGroup` | `SbRoleGroupService:21` plain + `:138` GString | `:150` GString | separate ticket (§7) |

The other 59 GString keys are self-consistent (GString read + GString evict), which works
because GString-vs-GString compares equal. **No other call site changes.**

---

## 5. Tests

### 5a. Unit — pin the key semantics so this cannot regress ✅ SHIPPED

`src/test/groovy/soupbroker/cache/CacheKeyStyleSpec.groovy` (3 tests, green):

* Asserts `CustomCacheKeyGenerator` produces **equal** keys for a plain-`String` closure on
  `get` and a plain-`String` closure on `save` (proves the fix works across method names).
* Asserts it produces **unequal** keys for plain vs GString (pins the trap that caused this).
* Asserts a `HashMap` seeded with the `@Cacheable` key is actually emptied by `remove(evictKey)`.

### 5b. Integration — the actual round trip ⚠️ DOES NOT WORK AS WRITTEN

The originally proposed acceptance test:

```groovy
def "agent show reflects an update (SOUPFIN-50)"() {
    given: def a = createAgent(designation: 'before')
    and:   agentService.get(a.id, 'json')            // populate the cache
    when:  a.designation = 'after'; agentService.save(a)
    then:  agentService.get(a.id, 'json').designation == 'after'
}
```

**Measured: this passes WITHOUT the fix.** Under `@Rollback` everything shares one Hibernate
session, so `Agent.get(id)` returns the very instance the cache holds, and mutating it in place
makes a stale read look fresh. It is a decoration, not a test — do not add it.

Any real acceptance test must cross **separate HTTP requests** so the server has only the
context it creates itself. Writing that test is what uncovered SOUP-3156 (§9).

---

## 6. Verification after deploy

```bash
AUTH=$(printf 'soupfinance-web:<secret>' | base64 -w0)
TOKEN=<from /rest/api/login>
B=http://10.115.213.183:9090          # LXC; substitute the target env
AID=<any agent id>

# 1. read FIRST (this is what poisons the cache today)
curl -s -H "Api-Authorization: Basic $AUTH" -H "X-Auth-Token: $TOKEN" \
  "$B/rest/agent/show/$AID.json" | python3 -c "import sys,json;print(json.load(sys.stdin)['lastUpdated'])"

# 2. update
curl -s -X PUT --max-redirs 0 -H "Api-Authorization: Basic $AUTH" -H "X-Auth-Token: $TOKEN" \
  -H "Content-Type: application/json" "$B/rest/agent/update/$AID.json" -d '{"designation":"probe"}'

# 3. read again -> lastUpdated MUST now equal the DB value
curl -s -H "Api-Authorization: Basic $AUTH" -H "X-Auth-Token: $TOKEN" \
  "$B/rest/agent/show/$AID.json" | python3 -c "import sys,json;print(json.load(sys.stdin)['lastUpdated'])"
```

Pass criterion: step 3 matches `SELECT last_updated FROM agent WHERE id=...`, and `show`,
`index` and the DB row all agree **without a restart**. Today step 3 returns the step-1 value.

---

## 7. Related defect — `SbRoleGroupService`, track separately

```groovy
:21    @Cacheable(value="SbRoleGroup", key={id})        // plain  (interface ISbRoleGroupService)
:138   @Cacheable(value='SbRoleGroup', key={"${id}"})   // GString
:150   @CacheEvict(value='SbRoleGroup', key={"${id}"})  // GString
```

The evict at `:150` clears the GString-keyed entry from `:138` but **never** the plain-keyed
entry from `:21`, so role-group reads through the interface method stay stale. Also note `:150`
puts a `@CacheEvict` on `findById`, a *read* method, which is suspicious in its own right.

The 08-27 plan proposed fixing this in the same change (make `:138`/`:150` use `key={id}`);
the 08-28 plan proposed a separate ticket. **Not done here** — it is a different cache with a
different read path and no reproduction of its own yet, and bundling it would widen the blast
radius of a deploy that is already carrying two fixes. File it.

---

## 8. Follow-up in soupfinance (only after the backend fix ships everywhere)

* `soupfinance-web/e2e/integration/soupfin-45-user-update.integration.spec.ts` asserts backend
  state through `index.json` and carries a comment (lines 16–18) explaining that `show` is
  stale. Once this is deployed, that spec can assert through `show` and the comment should go.
* The memory playbook `soupfin-agent-show-serves-stale-read.md` should be deleted, not edited —
  its whole content is "do not trust `show`".
* The `agentApi.get` warning in `src/api/endpoints/settings.ts` stays until **every**
  environment is on the fixed build, since environments are redeployed independently.

---

## 9. SOUP-3156 — the defect found while writing the acceptance test

Writing a real (cross-request) acceptance test for §5b surfaced an independent 500:

```
A different object with the same identifier value was already associated
with the session : [soupbroker.security.SbRole#4]
```

`ISbRoleService.get(id)` is `@Cacheable(value="SbRole", key={id})`, and grails-plugin-cache
stores **object references on the heap** — so the instance returned on request N+1 is the one
loaded inside request N's closed session, i.e. **detached**. `AgentController.resolveAuthoritiesFromParams`
assigned that detached instance onto an attached `Agent`, giving Hibernate two objects for one
identifier. Same underlying theme as this ticket — a cache handing back something the caller
assumes is fresh — but a different cache and a different failure mode.

Fixed by adding `SbRoleService.getAttached(id)` and using it on the three **write** paths
(`AgentController:416`, `SbUserController:128`, `SbUserController:167`). The read cache is
deliberately kept. Full detail on SOUP-3156.

---

## 10. Why this was not fixed in the soupfinance repo

`.claude/rules/backend-changes-workflow.md` forbids modifying `soupmarkets-web` from the
soupfinance context.

**No client-side workaround was shipped**, because there is no correct one:

* `show` **and** `edit` both route through the same `@Cacheable` `agentService.get(id, format)`.
* `AgentService.findById` is uncached but **no controller action exposes it**.
* `GET /rest/agent/index.json` **ignores an `id=` filter** (measured: `?id=<uuid>` still returns
  all 1000 rows), and the seed tenant holds **1316 agents**, so scanning to resolve one agent is
  O(n) and breaks past the `max=1000` cap — costing **1.24 MB / 6.5 s** on the shared LXC seed DB
  (1000 rows @ ~1244 B/row).

On a real SoupFinance tenant that list is small, so a list-sourced edit form is *technically*
viable — but it masks a live backend defect and would need its own SOUPFIN-45 regression re-run.
Shipping the backend fix was the correct call instead.
