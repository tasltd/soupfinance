# Deployment Restrictions (CRITICAL)

## Allowed Deployments

| Target | Script | Allowed |
|--------|--------|---------|
| `soupfinance-web` frontend | `./deploy/deploy-to-production.sh` | YES |
| `soupfinance-landing` | `./deploy-landing.sh` | YES |
| `soupfinance-backend` LXC | `./deploy-war.sh` | YES (local dev only) |

## FORBIDDEN Deployments

**NEVER deploy to any Soupmarkets production IPs or servers:**

- ❌ `140.82.32.141` (Soupmarkets backend/Tomcat) - DO NOT DEPLOY
- ❌ `tas.soupmarkets.com` - DO NOT DEPLOY
- ❌ `edge.soupmarkets.com` - DO NOT DEPLOY
- ❌ Any other Soupmarkets infrastructure - DO NOT DEPLOY

## Reason

SoupFinance is a client application that consumes the Soupmarkets API. The Soupmarkets backend (soupmarkets-web) is managed separately and deployments to it require a different workflow through the soupmarkets-web repository.

## What You CAN Do

1. Deploy the SoupFinance React frontend to `app.soupfinance.com` (65.20.112.224)
2. Deploy the SoupFinance landing page to `www.soupfinance.com` (65.20.112.224)
3. Deploy WAR files to the local LXC backend for development testing

## What You CANNOT Do

1. Push code or deploy to any Soupmarkets backend servers
2. Modify or restart services on Soupmarkets production servers
3. Run `./gradlew` tasks that deploy to Soupmarkets production
