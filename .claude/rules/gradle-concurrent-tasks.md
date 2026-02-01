# Gradle Concurrent Task Rule (HARD RULE)

## The Rule

**NEVER run Gradle tasks if another process is already running a Gradle task in the same project folder.**

Gradle uses file locks on the `.gradle` directory. Running concurrent Gradle tasks in the same project causes:
- Build hangs
- Lock file conflicts
- Corrupted build caches
- Failed builds with cryptic errors

---

## Before Running Any Gradle Command

### Step 1: Check for running Gradle processes

```bash
# Check on host
pgrep -af "gradlew\|GradleDaemon" | grep -E "soupmarkets|soupfinance"

# Check in LXC containers
lxc exec soupfinance-backend -- pgrep -af "gradlew\|GradleDaemon" 2>/dev/null
```

### Step 2: Wait or skip

| Finding | Action |
|---------|--------|
| **Process found** | WAIT for it to complete |
| **No process** | Safe to run your command |

---

## Applies To

| Context | Example |
|---------|---------|
| Host machine | `./gradlew bootRun` in soupmarkets-web |
| LXC containers | Grails running in soupfinance-backend container |
| CI/CD pipelines | Multiple build jobs |
| Development | Multiple terminal sessions |

---

## Common Scenarios

### Scenario 1: LXC Backend + Host Development

If `soupfinance-backend` LXC container has Grails running on mounted `/app` (which is `soupmarkets-web`):
- Do NOT run `./gradlew` on the host in `soupmarkets-web`
- Wait for LXC Grails to stop, or stop it first

### Scenario 2: Multiple Terminal Sessions

If one terminal has `./gradlew bootRun` running:
- Do NOT run tests in another terminal with `./gradlew test`
- Wait for bootRun to start fully before running other tasks

### Scenario 3: Stuck Gradle Daemon

If Gradle appears hung:
```bash
# Kill all Gradle processes
pkill -9 -f "GradleDaemon\|gradlew"

# Clean up locks
rm -rf ~/.gradle/caches/*/transforms-*/.lock
rm -rf ~/.gradle/caches/*/*.lock

# Then retry
./gradlew bootRun
```

---

## Quick Check Script

```bash
#!/bin/bash
# check-gradle.sh - Check if safe to run Gradle

if pgrep -af "gradlew\|GradleDaemon" | grep -qE "soupmarkets|soupfinance"; then
    echo "⚠️  Gradle is running in soupmarkets project. Wait for it to finish."
    pgrep -af "gradlew\|GradleDaemon" | grep -E "soupmarkets|soupfinance"
    exit 1
else
    echo "✅ Safe to run Gradle"
    exit 0
fi
```

---

## How to Reference This Rule

```markdown
See **[.claude/rules/gradle-concurrent-tasks.md]** for Gradle concurrent task restrictions.
```
