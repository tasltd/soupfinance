# Port Configuration Rules

## E2E Test Port
- **E2E tests use port 5180** (not the default Vite port 5173)
- This avoids conflicts with other services that may be running on port 5173
- Configured in `soupfinance-web/playwright.config.ts`

## Port Conflict Handling
When encountering port conflicts:
1. **Never disable other services** to free up ports
2. Configure this project to use alternative ports instead
3. Use dedicated ports for testing (5180 for E2E, 5181 for component tests, etc.)

## Port Assignments
| Service | Port | Notes |
|---------|------|-------|
| Vite dev server | 5173 | Default, may be used by other projects |
| E2E tests | 5180 | Dedicated for Playwright tests |
| Storybook | 6006 | Component documentation |
| LXC Backend | 9090 | Spring Boot / Grails backend |
| MariaDB | 3306 | Database in LXC container |

## If Port 5173 is in Use
The E2E tests will automatically start on port 5180, avoiding conflicts. For manual development:
```bash
# Start dev server on alternative port
npm run dev -- --port 5174
```
