# Dashboard

[← Back to PRD Index](../../PRD.md)

---

## Purpose

Provide financial overview and KPI tracking at a glance.

---

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| DASH-1 | As a business owner, I want to see my key financial metrics so I can monitor business health | P0 |
| DASH-2 | As a user, I want to see recent invoices so I can quickly access pending work | P1 |
| DASH-3 | As a user, I want to see trend indicators so I can understand financial direction | P1 |

---

## Functional Requirements

### KPI Cards (4 metrics)

| Metric | Description | Trend |
|--------|-------------|-------|
| Total Revenue | YTD or MTD revenue | ↑↓ vs previous period |
| Outstanding Invoices | Unpaid amount and count | ↑↓ vs previous period |
| Expenses (MTD) | Current month expenses | ↑↓ vs previous month |
| Net Profit | Revenue minus expenses | ↑↓ vs previous period |

### Recent Activity

- Last 5 invoices with status and amount
- Quick navigation to invoice detail
- Sortable columns
- Status badges (color-coded)

---

## Page

| Page | Route | Description |
|------|-------|-------------|
| DashboardPage | `/dashboard` | Main dashboard view |

---

## Components

### KPI Card

```tsx
<KpiCard
  title="Total Revenue"
  value={125000}
  trend={12.5}
  trendDirection="up"
  currency="USD"
/>
```

### Recent Invoices Table

| Column | Description |
|--------|-------------|
| Invoice # | Link to invoice detail |
| Client | Client name |
| Amount | Total amount |
| Status | Badge (DRAFT, SENT, PAID, etc.) |
| Date | Issue date |

---

## Data Hook

```typescript
function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.get('/rest/dashboard/stats.json'),
  });
}
```

---

## Wireframe Reference

`soupfinance-designs/screenshots/dashboard.png`
