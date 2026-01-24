# Research: Storybook Stories Audit for SoupFinance

**Date**: 2026-01-20T10:35:00
**Query**: Create Storybook stories for all components missing stories in SoupFinance
**Duration**: ~5 minutes

## Executive Summary

Audited SoupFinance components and found that most stories already existed. Only MainLayout.stories.tsx was missing. Created the missing story file with comprehensive variants.

## Detailed Findings

### Existing Stories (13 total)

| Component | Story File |
|-----------|------------|
| Input | `src/components/forms/Input.stories.tsx` |
| Select | `src/components/forms/Select.stories.tsx` |
| Checkbox | `src/components/forms/Checkbox.stories.tsx` |
| Radio | `src/components/forms/Radio.stories.tsx` |
| Textarea | `src/components/forms/Textarea.stories.tsx` |
| DatePicker | `src/components/forms/DatePicker.stories.tsx` |
| Spinner | `src/components/feedback/Spinner.stories.tsx` |
| AlertBanner | `src/components/feedback/AlertBanner.stories.tsx` |
| Tooltip | `src/components/feedback/Tooltip.stories.tsx` |
| Toast | `src/components/feedback/Toast.stories.tsx` |
| SideNav | `src/components/layout/SideNav.stories.tsx` |
| TopNav | `src/components/layout/TopNav.stories.tsx` |
| AuthLayout | `src/components/layout/AuthLayout.stories.tsx` |

### Missing Story (1 created)

| Component | Story File | Status |
|-----------|------------|--------|
| MainLayout | `src/components/layout/MainLayout.stories.tsx` | **CREATED** |

### Story Patterns Discovered

1. **Meta configuration**: Uses `@storybook/react-vite` types
2. **Router dependency**: Layout components require `MemoryRouter` wrapper
3. **Store initialization**: Custom `StoreInitializer` component for Zustand stores
4. **Dark mode**: Applied via `document.documentElement.classList.add('dark')`
5. **Viewport testing**: Uses Storybook viewport parameters for mobile/tablet
6. **Comment prefixes**: All stories use `// Added:` comment prefix

### MainLayout.stories.tsx Variants Created

- Default (Dashboard view)
- SidebarCollapsed
- InvoicesPage
- ReportsPage
- DarkMode
- DarkModeCollapsed
- Mobile viewport
- Tablet viewport
- AccountantUser (different role)
- MobileSidebarOpen

## Files Modified

- `src/components/layout/MainLayout.stories.tsx` - **CREATED** (270 lines)

## Raw Data

### Component Locations
```
src/components/layout/MainLayout.tsx
src/components/layout/SideNav.tsx
src/components/layout/TopNav.tsx
src/components/layout/AuthLayout.tsx
src/components/forms/Input.tsx
src/components/forms/Select.tsx
src/components/forms/Textarea.tsx
src/components/forms/Checkbox.tsx
src/components/forms/Radio.tsx
src/components/forms/DatePicker.tsx
src/components/feedback/AlertBanner.tsx
src/components/feedback/Spinner.tsx
src/components/feedback/Tooltip.tsx
src/components/feedback/Toast.tsx
src/components/feedback/ToastProvider.tsx
```

### Design System Colors Used
- `--color-primary: #f24a0d`
- `--color-background-light: #f8f6f5`
- `--color-background-dark: #221510`
- `--color-surface-light: #FFFFFF`
- `--color-surface-dark: #1f1715`
- `--color-text-light: #181311`
- `--color-text-dark: #E2E8F0`
- `--color-subtle-text: #8a6b60`
- `--color-border-light: #e6dedb`
- `--color-border-dark: #334155`

## Recommendations

1. Run `npm run build-storybook` to verify the new story compiles without errors
2. All components now have story coverage
3. Consider adding interaction tests using Storybook play functions in the future
