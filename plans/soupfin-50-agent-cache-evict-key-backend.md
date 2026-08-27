# SOUPFIN-50 — `/rest/agent/show/{id}.json` serves a stale read after update

**Status:** root cause isolated and measured; fix is a two-line change in **soupmarkets-web**.
**Repo to change:** `soupmarkets-web` (NOT soupfinance — filed here per
[.claude/rules/backend-changes-workflow.md](../.claude/rules/backend-changes-workflow.md)).
**Measured on:** LXC backend `10.115.213.183:9090`, WAR running since `2026-08-27 11:51:32 UTC`,
DB `soupbroker_seed_source`. Date of investigation: 2026-08-27.

---

## Context

The SoupFinance Users screen (`/settings/users`) edits staff through `AgentController`.
A user edits a user, saves successfully, sees the new value on the list — then re-opens
that user's Edit form and is shown the **old** values. Saving again silently re-submits
stale data.

Frontend call site: `soupfinance-web/src/features/settings/UserFormPage.tsx:83`
→ `agentApi.get(id)` → `GET /rest/agent/show/{id}.json`.

---

## 1. Reproduction (measured, not inferred)

`PUT /rest/agent/update/{id}.json` on agent `028fb6a1a8f5422db0e4d127ccec956d`,
then read the same agent four ways:

| Source | designation | lastUpdated |
|---|---|---|
| `PUT .../agent/update/{id}.json` response (HTTP 200) | `SOUPFIN50 Probe A` | `2026-08-27T20:25:14Z` |
| MariaDB `agent` row | `SOUPFIN50 Probe A` | `2026-08-27 20:25:14` |
| `GET /rest/agent/index.json` | `SOUPFIN50 Probe A` | `2026-08-27T20:25:14Z` |
| **`GET /rest/agent/show/{id}.json`** | **`null`** | **`2026-08-21T13:52:27Z`** |

Two controls that narrow the cause:

* **Fresh auth token** → still stale. Not session- or request-scoped.
* **Agent whose `show` was never read in this JVM's lifetime** → *also* stale, returning a
  value older than the pre-update DB row. So it is not "a read populated the cache and the
  update failed to evict it"; the entry predates the request entirely and simply never leaves.

Staleness persisted for **4+ hours** and is cleared only by a JVM restart.

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
field typed **`Object`** — it is *not* coerced to `String`. `GString.equals(String)` is `false`
and their `hashCode()`s differ, so the evict key can never match the cached key.

Measured directly against the shipped plugin (`org.grails.plugins:cache:7.0.0`):

```
A get/String  vs get/String   (sanity, must be true) : true
B get/String  vs get/GString  (GString only)         : false   <-- the defect
C get/String  vs save/String  (method name only)     : true    <-- method name is NOT part of the key
D get/String  vs save/GString (as shipped)           : false

HashMap behaviour with the real key objects:
  remove(save/GString)  -> null                 | stale entry SURVIVES
  remove(save/String)   -> STALE_AGENT_OBJECT   | stale entry REMOVED
```

Line **C** is what makes the fix a one-liner: the target method name does *not* contribute to
key equality, so a `@CacheEvict` on `save` **can** evict an entry cached by `get` — it just has
to use the same key *type*.

### The ticket's suggested area is wrong — do not look there

SOUPFIN-50 hypothesised "a Hibernate second-level / EhCache entry that the update path never
evicts". That is not the mechanism, and a fix aimed at it will not work:

* `Agent.groovy` has **no `cache` mapping**, so `Agent` is not in Hibernate's L2 cache at all.
* The Grails `cache-ehcache` plugin is **commented out** in `build.gradle:238`; the active
  backing store is the plugin default `GrailsConcurrentMapCacheManager` — an in-memory
  `ConcurrentMap` with **no TTL and no eviction**, which is why the entry survives until restart.
* If it were Hibernate L2, `index.json` would be stale too. It is fresh. The only difference
  between the two paths is the `@Cacheable` annotation.

---

## 3. Blast radius

`key={"${...}"}` appears **61 times** across `grails-app/services/`. Most are harmless: a
GString key matches another GString key (measured: `true`), so a service that is consistently
interpolated evicts correctly.

The bug bites only where a **plain** `@Cacheable` key is paired with a **GString** `@CacheEvict`
key. Exactly **two** services are in that state:

| Service | `@Cacheable` | `@CacheEvict` | Effect |
|---|---|---|---|
| `security/AgentService.groovy` | `:553` `key={id}` | `:205` `key={"${agent?.id}"}` | **SOUPFIN-50** — agent `show` stale forever |
| `security/SbRoleGroupService.groovy` | `:21` `key={id}` (also `:138` `key={"${id}"}`) | `:150` `key={"${id}"}` | same defect — entries cached via `:21` are never evicted; role-group reads go stale after update |

`SbRoleGroupService` is the same root cause in a different feature and is fixed by the same
sweep. It was not separately reported.

---

## 4. Required changes

### `grails-app/services/soupbroker/security/AgentService.groovy`

```diff
-    @CacheEvict(value='agent',key={"${agent?.id}"})
+    // Fix (SOUPFIN-50): key must be the raw String id, not a GString. CustomCacheKeyGenerator
+    // stores the closure result as an Object and GString.equals(String) is false, so an
+    // interpolated evict key never matches the plain key used by @Cacheable on get(id, format)
+    // — agent/show/{id}.json then served a stale entry until the JVM restarted.
+    @CacheEvict(value='agent',key={agent?.id})
     Agent save(Agent agent){
```

### `grails-app/services/soupbroker/security/SbRoleGroupService.groovy`

Make all three annotations use the same plain key so cache and evict agree:

```diff
-    @Cacheable(value='SbRoleGroup',key={"${id}"})      // :138
+    @Cacheable(value='SbRoleGroup',key={id})
-    @CacheEvict(value='SbRoleGroup',key={"${id}"})     // :150
+    @CacheEvict(value='SbRoleGroup',key={id})
```

(`:21` already uses `key={id}` and stays as-is.)

No domain, controller, config or migration change is needed.

---

## 5. Tests to add in soupmarkets-web

### 5a. Unit — pin the key semantics so this cannot regress

`src/test/groovy/soupbroker/cache/CacheKeyStyleSpec.groovy`

* Assert `CustomCacheKeyGenerator` produces **equal** keys for a plain-`String` closure on
  `get` and a plain-`String` closure on `save` (proves the fix works across method names).
* Assert it produces **unequal** keys for plain vs GString (pins the trap that caused this).
* Assert a `HashMap` seeded with the `@Cacheable` key is actually emptied by `remove(evictKey)`.

### 5b. Integration — the actual round trip

`AgentServiceSpec` / `AgentControllerSpec`:

```groovy
def "agent show reflects an update (SOUPFIN-50)"() {
    given: def a = createAgent(designation: 'before')
    and:   agentService.get(a.id, 'json')            // populate the cache
    when:  a.designation = 'after'; agentService.save(a)
    then:  agentService.get(a.id, 'json').designation == 'after'
}
```

This is **red before the change and green after** — it is the acceptance test for this ticket.
Add the mirror case for `SbRoleGroupService`.

---

## 6. Verification after deploy

```bash
API=http://10.115.213.183:9090   # LXC; substitute the target env
AID=<agent-uuid>
curl -s "$API/rest/agent/show/$AID.json" -H "$AUTH"      # note lastUpdated
curl -s -X PUT "$API/rest/agent/update/$AID.json" -H "$AUTH" \
     -H 'Content-Type: application/json' \
     -d '{"id":"'$AID'","firstName":"Test","lastName":"User","designation":"SOUPFIN50 verify","userAccess":{"username":"<existing>"}}'
curl -s "$API/rest/agent/show/$AID.json" -H "$AUTH"      # MUST show the new designation
curl -s "$API/rest/agent/index.json?max=1000" -H "$AUTH"  # cross-check: agrees with show
```

Pass condition: `show`, `index` and the `agent` DB row all agree **without a restart**.

---

## 7. Follow-up in soupfinance (only after the backend fix ships)

* `soupfinance-web/e2e/integration/soupfin-45-user-update.integration.spec.ts` asserts backend
  state through `index.json` and carries a comment (lines 16–18) explaining that `show` is
  stale. Once this is fixed, that spec can assert through `show` and the comment should go.
* The memory playbook `soupfin-agent-show-serves-stale-read.md` should be deleted, not edited —
  its whole content is "do not trust `show`".

## 8. Why no frontend workaround was shipped

There is no correct client-side mitigation, so shipping a partial one would only mask a live
backend defect:

* `show` **and** `edit` both route through the same `@Cacheable` `agentService.get(id, format)`.
* `AgentService.findById` is uncached but **no controller action exposes it**.
* `GET /rest/agent/index.json` **ignores an `id=` filter** (verified: filtering by an old
  agent's id returned the unfiltered newest-N page), and the tenant holds **1316 agents**, so
  scanning the list to resolve one agent is O(n) and breaks past the `max=1000` cap.
