# Research: Form and Feedback UI Components

**Date**: 2026-01-20
**Query**: Build reusable form and feedback UI components for SoupFinance
**Duration**: ~30 minutes

## Executive Summary

Created 11 reusable UI components (6 form components, 5 feedback components) following the SoupFinance design system. Components use Tailwind CSS v4 tokens, support dark mode, and include comprehensive TypeScript types.

## Detailed Findings

### Files Created

#### Form Components (`src/components/forms/`)
- `Input.tsx` - Text input with label, error, helper text, disabled states
- `Select.tsx` - Dropdown select with options array, placeholder, error states
- `Textarea.tsx` - Multi-line input with resize, label, error states
- `Checkbox.tsx` - Checkbox with label, primary color checked state
- `Radio.tsx` - Radio button group with vertical layout, options array
- `DatePicker.tsx` - Native date input wrapper with consistent styling
- `index.ts` - Barrel export file for all form components

#### Feedback Components (`src/components/feedback/`)
- `AlertBanner.tsx` - Full-width alert with variants (success/error/warning/info)
- `Spinner.tsx` - Loading spinner with size variants (sm/md/lg)
- `Toast.tsx` - Individual toast notification with auto-dismiss
- `ToastProvider.tsx` - React context + hook for toast management
- `Tooltip.tsx` - Hover tooltip with position variants (top/bottom/left/right)
- `index.ts` - Barrel export file for all feedback components

#### CSS Updates
- `src/index.css` - Added `--animate-toast-slide-in` animation and keyframes

### Design System Patterns Used

| Pattern | Implementation |
|---------|----------------|
| Colors | `text-primary`, `bg-surface-light`, `border-border-light`, etc. |
| Dark Mode | `dark:` prefix variants on all components |
| Typography | `text-sm font-medium` for labels, `text-base` for inputs |
| Border Radius | `rounded-lg` (8px) for inputs, buttons |
| Focus States | `focus:border-primary focus:ring-2 focus:ring-primary/20` |
| Error States | `border-danger`, `text-danger` with error icon |
| Disabled States | `opacity-50 cursor-not-allowed` |

### Component Props Reference

**Input.tsx**
```typescript
interface InputProps {
  label?: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  type?: string;
  disabled?: boolean;
  required?: boolean;
}
```

**Select.tsx**
```typescript
interface SelectProps {
  label?: string;
  options: { value: string; label: string }[];
  error?: string;
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}
```

**AlertBanner.tsx**
```typescript
interface AlertBannerProps {
  variant: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
}
```

**ToastProvider.tsx**
```typescript
// Usage:
const { showToast, hideToast, hideAllToasts } = useToast();
showToast({ variant: 'success', message: 'Saved!', duration: 5000 });
```

### Design Reference Files Examined

1. `soupfinance-designs/new-invoice-form/code.html` - Form input patterns
2. `soupfinance-designs/item-creation-modal/code.html` - Modal and button styles
3. `.claude/rules/soupfinance-design-system.md` - Full design system documentation

## Raw Data

### Color Tokens (from index.css)
```css
--color-primary: #f24a0d;
--color-background-light: #f8f6f5;
--color-surface-light: #FFFFFF;
--color-text-light: #181311;
--color-subtle-text: #8a6b60;
--color-border-light: #e6dedb;
--color-danger: #EF4444;
```

### Existing Pattern (from LoginPage.tsx)
```tsx
<input
  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
/>
```

## Recommendations

1. **Build Verification**: Run `npm run build` to verify TypeScript compilation
2. **Integration**: Wrap app with `<ToastProvider>` in App.tsx or main.tsx
3. **Usage Example**: Update InvoiceFormPage.tsx to use new form components
4. **Testing**: Add unit tests for form validation and toast auto-dismiss

## Next Steps

- [ ] Verify build passes
- [ ] Integrate ToastProvider into App.tsx
- [ ] Migrate existing forms to use new components
- [ ] Add Storybook stories for component documentation
