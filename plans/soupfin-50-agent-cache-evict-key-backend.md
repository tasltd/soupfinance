# SOUPFIN-50 — `/rest/agent/show/{id}.json` serves a stale read after update

**Target repo:** `soupmarkets-web` (NOT soupfinance — filed per `.claude/rules/backend-changes-workflow.md`)
**Verified against:** LXC backend `10.115.213.183:9090`, JVM up since 2026-08-27 11:51:32 UTC
**Date:** 2026-08-28

---

## 1. Symptom

After a successful `PUT /rest/agent/update/{id}.json` (HTTP 200), `show/{id}.json` keeps
returning the **pre-update** values indefinitely. The DB, `index.json` and the PUT response
are all correct.

```
agent 028fb6a1a8f5422db0e4d127ccec956d
  PUT response (200) lastUpdated = 2026-08-28T09:30:16Z
  MariaDB row        last_updated= 2026-08-28 09:30:16
  index.json         lastUpdated = 2026-08-28T09:30:16Z
  show/{id}.json     lastUpdated = 2026-08-21T13:52:27Z   <-- 7 days stale
```

**User-facing:** a SoupFinance admin edits a user, saves, sees the change on the Users list,
re-opens that user's Edit form and is shown the OLD values. Saving again silently reverts
the edit.

### Correction to the original ticket evidence

The ticket's table reported `designation: NULL` from `show` as a staleness signal. That is a
**false signal** — `show/{id}.json` does not render `designation` at all (the key is absent
from the payload; `index.json` does render it). The genuine signal is **`lastUpdated`**.
Do not chase the designation field.

---

## 2. Root cause (measured, not inferred)

Two annotations in `grails-app/services/soupbroker/security/AgentService.groovy` disagree on
the *type* of the cache key:

```groovy
AgentService.groovy:553   @Cacheable(value='agent', key={id})               // java.lang.String
AgentService.groovy:205   @CacheEvict(value='agent', key={"${agent?.id}"})  // GStringImpl   <-- defect
```

`grails.plugin.cache.CustomCacheKeyGenerator$CacheKey` stores the closure result in a field
declared `private final java.lang.Object simpleKey` — there is **no `String` coercion**.
Groovy defines `GString.hashCode()` as `37 + toString().hashCode()` and
`GString.equals(Object)` as `that instanceof GString`, so a GString key can never match the
String key it was meant to evict.

Measured directly against `org.grails.plugins:cache:7.0.0`:

| comparison | result |
|---|---|
| `String.hashCode()` | `-1265982271` |
| `GString.hashCode()` | `-1265982234` (differs by exactly 37) |
| CacheKey(plain) vs CacheKey(plain), **different method names** | **true** — method name is NOT part of equality |
| CacheKey(GString) vs CacheKey(GString) | true |
| **CacheKey(plain) vs CacheKey(GString)** | **false** ← the defect |
| `HashMap.remove()` with GString key against a plain-keyed entry | **fails** (entry survives) |
| `HashMap.remove()` with plain key against a plain-keyed entry | succeeds |

The "different method names still compare equal" row is what makes the one-line fix valid:
`@CacheEvict` on `save()` genuinely *can* evict an entry cached by `get()` — once the key
types match.

### It is NOT Hibernate L2 / EhCache

The ticket's original guess. Ruled out: `Agent` has no `cache` mapping, `cache-ehcache` is
commented out in `build.gradle:238`, and `index.json` (uncached) is always fresh.

### Why it fires on *every* update from the SoupFinance UI

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

### Self-invocation ruled out

`AgentController.update` calls `agentService.save(agent)` at line 248 — an external call
through the Spring proxy, so `@CacheEvict` does fire. The failure is purely the key mismatch.

---

## 3. The fix (one line)

`grails-app/services/soupbroker/security/AgentService.groovy:205`

```diff
-    @CacheEvict(value='agent',key={"${agent?.id}"})
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
| `agent` | `AgentService:553` plain | `AgentService:205` **GString** | **this ticket** |
| `SbRoleGroup` | `SbRoleGroupService:21` plain + `:138` GString | `:150` GString | separate ticket (below) |

The other 59 GString keys are self-consistent (GString read + GString evict), which works
because GString-vs-GString compares equal. **No other call site changes.**

---

## 5. Verification steps (post-fix, on the LXC backend)

```bash
AUTH=$(printf 'soupfinance-web:<secret>' | base64 -w0)
TOKEN=<from /rest/api/login>
B=http://10.115.213.183:9090
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

Pass criterion: step 3 matches `SELECT last_updated FROM agent WHERE id=...`.
Today step 3 returns the step-1 value.

**Suggested regression test** (`soupmarkets-web`, integration):
`AgentServiceCacheEvictionSpec` — read via `agentService.get(id,'json')`, mutate + `save()`,
re-read, assert `lastUpdated` advanced. This fails on the current code and passes after the
one-line change.

---

## 6. Related defect — file/track separately

`SbRoleGroupService` has the same *class* of bug in a different shape:

```groovy
:21    @Cacheable(value="SbRoleGroup", key={id})        // plain  (interface ISbRoleGroupService)
:138   @Cacheable(value='SbRoleGroup', key={"${id}"})   // GString
:150   @CacheEvict(value='SbRoleGroup', key={"${id}"})  // GString
```

The evict at :150 clears the GString-keyed entry from :138 but **never** the plain-keyed entry
from :21, so role-group reads through the interface method stay stale. Also note :150 puts a
`@CacheEvict` on `findById`, a *read* method, which is suspicious in its own right.

---

## 7. Why this was not fixed in the soupfinance repo

`.claude/rules/backend-changes-workflow.md` forbids modifying `soupmarkets-web` from the
soupfinance context. Additionally `soupmarkets-web` is currently checked out on
`fix/SOUP-2980-ghana-settlement-calendar` with a large volume of uncommitted work, so an
edit there would be actively unsafe.

**No client-side workaround is recommended.** `show` and `edit` both hit the same
`@Cacheable` read; `index.json` ignores an `id=` filter (measured: `?id=<uuid>` still returns
all 1000 rows); and sourcing the edit form from `index.json` costs **1.24 MB / 6.5 s** on the
shared LXC seed DB (1000 rows @ ~1244 B/row). On a real SoupFinance tenant that list is small,
so it is *technically* viable — but it masks the defect and would need its own SOUPFIN-45
regression re-run. Decide explicitly before building it.
