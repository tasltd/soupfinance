/**
 * Design-system surface for the claude.ai/design sync (.design-sync/).
 *
 * The app has no library entry point — this barrel is it. It exports exactly
 * the shared, app-agnostic pieces: the storied components, plus the stores and
 * i18n data the layout components read. The stores MUST ship from here: story
 * files drive the layouts by calling useUIStore/useAuthStore setters, and a
 * preview that bundled its own second copy of a zustand store would set state
 * the shipped component never sees (see cfg.storyImports.shim).
 *
 * Feature screens, API clients and route trees stay out — they are the app,
 * not the design system.
 */

// Forms
export { Input, type InputProps } from './src/components/forms/Input'
export { Select, type SelectProps, type SelectOption } from './src/components/forms/Select'
export { Textarea, type TextareaProps } from './src/components/forms/Textarea'
export { Checkbox, type CheckboxProps } from './src/components/forms/Checkbox'
export { Radio, type RadioProps, type RadioOption } from './src/components/forms/Radio'
export { DatePicker, type DatePickerProps } from './src/components/forms/DatePicker'

// Feedback
export { AlertBanner, type AlertBannerProps, type AlertVariant } from './src/components/feedback/AlertBanner'
export { Spinner, type SpinnerProps, type SpinnerSize } from './src/components/feedback/Spinner'
export { Toast, type ToastProps } from './src/components/feedback/Toast'
export { ToastProvider, useToast, type ToastData, type ShowToastOptions } from './src/components/feedback/ToastProvider'
export { Tooltip, type TooltipProps, type TooltipPosition } from './src/components/feedback/Tooltip'
export { ApiErrorState } from './src/components/feedback/ApiErrorState'

// Layout
export { AuthLayout } from './src/components/layout/AuthLayout'
export { MainLayout } from './src/components/layout/MainLayout'
export { SideNav } from './src/components/layout/SideNav'
export { TopNav } from './src/components/layout/TopNav'
export { LanguageSwitcher, LanguageSwitcherCompact } from './src/components/layout/LanguageSwitcher'
export { Logo } from './src/components/Logo'

// State the layout components read — shared identity with the previews
export * from './src/stores'
export { supportedLanguages, type SupportedLanguage } from './src/i18n'
