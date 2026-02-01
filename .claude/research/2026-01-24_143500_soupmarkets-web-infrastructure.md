# Research: soupmarkets-web Infrastructure

**Date**: 2026-01-24 14:35 UTC
**Query**: Understand build artifacts, environment configuration, Tomcat usage, and LXC infrastructure for soupmarkets-web
**Duration**: ~10 minutes

## Executive Summary

The soupmarkets-web project has comprehensive infrastructure for build, deployment, and testing. It uses Grails 6.2.3 with WAR deployment to Tomcat 9, has extensive LXC-based parallel test infrastructure, and connects to MariaDB databases. There is NO local Tomcat installation - all Tomcat instances are on remote production servers.

## Detailed Findings

### 1. Build Artifacts (WAR Files)

**WAR Build Configuration** (`build.gradle` lines 20, 298-305):
```groovy
plugins {
    id "war"
}

tasks.named("bootWar") {
    archiveFileName.set("${appName}-${appVersion}.war")
}

tasks.named("war") {
    archiveFileName.set("${appName}-${appVersion}-plain.war")
}
```

**Current WAR Files** (in `build/libs/`):
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/build/libs/soupmarkets-1.0.1.war` (main bootWar)
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/build/libs/soupmarkets-1.0.1-plain.war` (plain war)

**Build Commands**:
```bash
# Build WAR (requires Java 19+ for compile, produces soupmarkets-{version}.war)
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew bootWar

# Build and deploy to specific server
./gradlew assembleDeployToDemo      # Demo server
./gradlew assembleDeployToEdge      # Edge server
./gradlew assembleDeployToSoupmarkets   # Production
./gradlew assembleDeployToFincap    # Fincap server
./gradlew assembleDeployToAshfield  # Ashfield C5
```

**Version Info** (`gradle.properties`):
- App Name: `soupmarkets`
- App Version: `1.0.1`
- Grails Version: `6.2.3`
- GORM Version: `8.1.0`

### 2. Environment Configuration (Database)

**Environment Variables** (`env-variables.sh`):
```bash
# Database Configuration
export TEST_DBUSER="soupbroker"
export TEST_DBPASS="soupbroker"
export TEST_DB="soupbroker"
export DBUSER="soupbroker"
export DBPASS="soupbroker"

# Server Configuration
export SERVER_PORT="9090"
export SERVER_URL="http://localhost:${SERVER_PORT}"

# Application Flags
export DISABLE_2FA="true"
export ENABLE_SCHEDULER="true"
export SPA_ENABLED="true"
```

**DataSource Configuration** (`grails-app/conf/application.groovy`):

| Environment | JDBC URL Pattern | Driver |
|-------------|------------------|--------|
| Development | `jdbc:mariadb://${DBHOST:-localhost}:${DBPORT:-3306}/${DEV_DB or DBUSER}` | `org.mariadb.jdbc.Driver` |
| Test | `jdbc:mariadb://${DBHOST:-localhost}:${DBPORT:-3306}/${TEST_DB:-soupbroker}` | `org.mariadb.jdbc.Driver` |
| Production | `jdbc:mariadb://${DBHOST:-localhost}:${DBPORT:-3306}/${DB_NAME or DBUSER}` | `org.mariadb.jdbc.Driver` |

**Key Database Environment Variables**:
- `DBHOST` - MariaDB host (default: localhost)
- `DBPORT` - MariaDB port (default: 3306)
- `DBUSER` - Database username (default: soupbroker)
- `DBPASS` - Database password (default: soupbroker)
- `TEST_DB` - Test database name (default: soupbroker)
- `DB_NAME` - Production database name
- `DEV_DB` - Development database name

### 3. Tomcat Usage (Production Servers Only)

**NO LOCAL TOMCAT** - All Tomcat instances are on remote production servers.

**Production Server Tomcat Paths**:

| Server | IP | Tomcat Path | Service |
|--------|-----|-------------|---------|
| **Demo/SAS** | 140.82.32.141 | `/root/tomcat9078/` | `soupbroker.service` |
| **Edge** | 140.82.32.141 | `/root/tomcat-edge/` | `soupmarkets-edge.service` |
| **Fincap** | 45.77.52.235 | `/root/tomcat9078/` | `soupbroker.service` |
| **Ashfield C5** | 38.54.63.138 | `/mnt/data/tomcat9078/` | `soupasset-c5.service` |
| **Soupmarkets Prod** | 65.20.112.224 | `/root/tomcat9078/` | `soupbroker.service` |

**Deploy Scripts** (in project root):
- `deploy-to-demo.sh` - Demo server (140.82.32.141)
- `deploy-to-edge.sh` - Edge server (140.82.32.141 tomcat-edge)
- `deploy-to-soupmarkets.sh` - Production (65.20.112.224)
- `deploy-to-fincap.sh` - Fincap (45.77.52.235)
- `deploy-to-ashfield.sh` - Ashfield C5 (38.54.63.138, requires `~/.ssh/crypttransact_rsa`)
- `deploy-to-all-servers.sh` - All servers

**Deploy Script Pattern**:
```bash
WAR_FILE=$(find build/libs/ -type f -regex ".*/soupmarkets-[0-9.]*\.war" | sort -V | tail -n 1)
rsync -carvhz -e ssh "$WAR_FILE" root@SERVER:~/ROOT.war --progress --delete
ssh root@SERVER "rm -Rf tomcat9078/webapps/ROOT.war"
ssh root@SERVER "unzip -qq ROOT.war -d soupwebapp"
ssh root@SERVER "rsync -carvhzq soupwebapp/ tomcat9078/webapps/ROOT/ --delete"
ssh root@SERVER "systemctl restart soupbroker.service"
```

### 4. LXC Infrastructure (Parallel Test Execution)

**LXC Directory**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/lxc/`

**LXC Scripts**:

| Script | Purpose |
|--------|---------|
| `setup-lxc.sh` | Initial LXC setup |
| `create-base-container.sh` | Create base Ubuntu container with Java 17 |
| `create-golden-container.sh` | Create golden snapshot with pre-warmed caches |
| `setup-mariadb.sh` | Setup MariaDB container for tests |
| `run-parallel-tests-lxc.sh` | Run parallel functional tests |
| `seed-databases-optimized.sh` | Optimized database seeding |

**LXC Container Architecture**:
```
Host Machine
├── soupmarkets-test-image (base image with Java 17 + project files)
├── soupmarkets-golden/test-ready (snapshot with pre-compiled + Gradle cache)
├── soupmarkets-mariadb (MariaDB container)
│   └── Databases: soupbroker_test_{kyc,finance,trading,setting,schemes,tools,misc}
└── test-{kyc,finance,trading,setting,schemes,tools,misc} (parallel test containers)
```

**Seed Data Location**:
- `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/docker/seed-data.sql.gz` (~2.2GB compressed)

**Database Seeding Strategy** (optimized):
1. Import seed data into `soupbroker_seed_source` database (one-time)
2. Apply schema migrations from `lxc/migrations/*.sql`
3. Clone source to 7 test databases using parallel `mysqldump | mysql`
4. Skip large tables data (audit_log, flow, api_log) - schema only

**Test Modules** (7 parallel containers):
1. `kyc` - KYC module tests
2. `finance` - Finance module tests
3. `trading` - Trading module tests
4. `setting` - Setting module tests
5. `schemes` - Schemes module tests
6. `tools` - Tools module tests
7. `misc` - Sales, security, API, promotions, integration, report, base, job tests

**Run Commands**:
```bash
# Run all tests with seeded data (default)
./lxc/run-parallel-tests-lxc.sh

# Run specific modules
./lxc/run-parallel-tests-lxc.sh kyc finance

# Force rebuild seed data
./lxc/run-parallel-tests-lxc.sh --force-reseed

# Use golden snapshot for faster startup
./lxc/run-parallel-tests-lxc.sh --use-golden
```

### 5. Docker Infrastructure (Alternative to LXC)

**Docker Directory**: `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/docker/`

**Docker Files**:
- `docker-compose.test.yml` - Parallel test orchestration
- `Dockerfile.test` - Test container image
- `seed-databases.sh` - Database seeding script
- `init-test-db.sql` - Initial database setup
- `run-parallel-tests.sh` - Docker test runner

**Note**: LXC is preferred over Docker for performance (lower overhead, faster cloning).

## Recommendations

1. **For local development**: Use `./gradlew bootRun` with `source env-variables.sh` (runs embedded Tomcat on port 9090)

2. **For testing**: Use LXC infrastructure with `./lxc/run-parallel-tests-lxc.sh`

3. **For deployment**: Build WAR with `./gradlew bootWar`, then use appropriate deploy script

4. **For SoupFinance backend**: The soupmarkets-web Grails backend runs on port 9090 locally. No local Tomcat installation needed - Grails includes embedded Tomcat.

## Raw Data

### File Paths Referenced

| Category | Path |
|----------|------|
| WAR Output | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/build/libs/soupmarkets-*.war` |
| Environment | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/env-variables.sh` |
| Build Config | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/build.gradle` |
| Gradle Props | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/gradle.properties` |
| App Config | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/conf/application.yml` |
| DataSource | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/grails-app/conf/application.groovy` |
| Deploy Scripts | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/deploy-to-*.sh` |
| LXC Scripts | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/lxc/*.sh` |
| Docker Config | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/docker/docker-compose.test.yml` |
| Seed Data | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/docker/seed-data.sql.gz` |
| Test Analysis | `/home/ddr/Documents/code/soupmarkets/soupmarkets-web/lxc/TEST_FAILURE_ANALYSIS.md` |
