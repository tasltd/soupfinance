# Backend Changes Workflow

## Rule: Do NOT make direct backend changes from soupfinance context

When working in the soupfinance project and needing backend (soupmarkets-web) changes:

1. **Do NOT** directly modify backend files from this project context
2. **Instead**: Create a plan file in `.claude/plans/` describing the needed changes
3. A separate Claude process with proper soupmarkets-web context will execute the plan

## Why This Workflow?

- The soupfinance context lacks full understanding of the soupmarkets-web backend
- Backend domain models, services, and controllers have complex interdependencies
- Changes made without proper context may break existing functionality

## How to Create a Backend Plan

Create a markdown file in `.claude/plans/` with:

```markdown
# [Feature Name] Backend Plan

## Context
What frontend feature requires this backend change

## Required Changes

### Controller Updates
- Which controller needs changes
- What actions to add/modify

### Service Updates
- Which services need changes
- Business logic requirements

### Domain/Model Updates
- Any new fields or relationships

## API Endpoints Needed
Document the expected request/response format

## Notes
Any special considerations or constraints
```

## Example

If frontend needs `/rest/invoiceClient/*` endpoints:

1. Create `.claude/plans/invoice-client-backend.md`
2. Document the controller, service, and domain requirements
3. Frontend can proceed with mock API until backend is ready
