# Non-Functional Requirements

[← Back to PRD Index](../PRD.md)

---

## Performance

| Metric | Target |
|--------|--------|
| Page Load (initial) | < 3 seconds |
| Page Load (subsequent) | < 1 second |
| API Response | < 500ms (90th percentile) |
| Bundle Size | < 500KB gzipped |
| Time to Interactive | < 3.5 seconds |

### Optimization Strategies

- Code splitting by route
- Lazy loading of feature modules
- TanStack Query caching (5-min stale time)
- Image optimization
- Tree shaking unused code

---

## Security

| Requirement | Implementation |
|-------------|----------------|
| Authentication | Token-based (X-Auth-Token header) |
| Authorization | Role-based access control (RBAC) |
| Data Isolation | Tenant-level query filtering |
| Token Storage | Dual-storage strategy (Remember Me) |
| HTTPS | Required for all connections |
| CORS | Restricted to known domains |

### Security Headers

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
```

### Sensitive Data

- Passwords never stored in frontend
- Tokens stored in appropriate storage based on Remember Me
- No sensitive data in URL parameters
- API keys never exposed to client

---

## Accessibility

| Requirement | Standard |
|-------------|----------|
| Keyboard Navigation | Full support for all interactive elements |
| Screen Readers | ARIA labels on all form controls |
| Color Contrast | WCAG 2.1 AA (4.5:1 for text) |
| Focus Indicators | Visible focus rings |
| Alt Text | Required for all images |

### ARIA Implementation

```typescript
<button
  aria-label="Delete invoice"
  aria-describedby="delete-warning"
>
  Delete
</button>
```

---

## Browser Support

| Browser | Versions |
|---------|----------|
| Chrome | Latest 2 versions |
| Firefox | Latest 2 versions |
| Safari | Latest 2 versions |
| Edge | Latest 2 versions |

**Not Supported:**
- Internet Explorer (any version)
- Opera Mini

---

## Responsiveness

| Breakpoint | Range | Layout |
|------------|-------|--------|
| Mobile | 320px - 767px | Single column, collapsible nav |
| Tablet | 768px - 1023px | Two column where appropriate |
| Desktop | 1024px+ | Full sidebar, multi-column |

### Tailwind Breakpoints

```css
/* Mobile first approach */
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

---

## Dark Mode

| Aspect | Implementation |
|--------|----------------|
| Strategy | CSS class on `<html>` element |
| Classes | `dark:bg-*`, `dark:text-*` |
| Persistence | localStorage `theme` key |
| System Preference | Detected via `prefers-color-scheme` |

### Implementation

```typescript
// Toggle dark mode
document.documentElement.classList.toggle('dark');
localStorage.setItem('theme', 'dark');
```

### Required Variants

All components must include dark mode variants:

```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
  Content
</div>
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Network Error | Toast notification, retry button |
| 401 Unauthorized | Redirect to login |
| 403 Forbidden | Error message, no redirect |
| 404 Not Found | Error page with navigation |
| 500 Server Error | Error page, support contact |
| Validation Error | Inline field errors |

---

## Logging & Monitoring

| Type | Implementation |
|------|----------------|
| Client Errors | Console logging (development) |
| API Errors | Error boundary + toast |
| Performance | React DevTools (development) |
| Analytics | Optional third-party integration |

---

## Data Retention

| Data Type | Retention |
|-----------|-----------|
| Session Token | Until logout or expiry |
| User Preferences | Indefinite (localStorage) |
| Form Drafts | 24 hours (optional) |
| Cache | 5 minutes (TanStack Query) |

---

## Offline Support

| Feature | Status |
|---------|--------|
| Service Worker | Not implemented |
| Offline Mode | Not supported |
| Data Sync | Requires connection |

**Note:** SoupFinance requires active internet connection for all operations.
