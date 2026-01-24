/**
 * AlertBanner Component
 * Full-width banner for displaying alerts with icon, message, action, and dismiss
 * Reference: soupfinance-designs/alert-banner-*, design-system.md Status Badges section
 */
import type { ReactNode } from 'react';

// Added: Variant type for alert banner styles
export type AlertVariant = 'success' | 'error' | 'warning' | 'info';

// Added: Props interface for AlertBanner component
export interface AlertBannerProps {
  /** Alert variant determines colors and icon */
  variant: AlertVariant;
  /** Main message to display */
  message: string;
  /** Optional action button configuration */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Callback when dismiss button is clicked */
  onDismiss?: () => void;
  /** Optional custom icon (overrides default) */
  icon?: ReactNode;
  /** Additional CSS classes for the container */
  className?: string;
}

// Added: Variant configuration mapping for consistent styling
const variantConfig: Record<AlertVariant, {
  bgClass: string;
  textClass: string;
  borderClass: string;
  icon: string;
}> = {
  success: {
    bgClass: 'bg-green-100 dark:bg-green-900/30',
    textClass: 'text-green-800 dark:text-green-300',
    borderClass: 'border-green-200 dark:border-green-800',
    icon: 'check_circle',
  },
  error: {
    bgClass: 'bg-red-100 dark:bg-red-900/30',
    textClass: 'text-red-800 dark:text-red-300',
    borderClass: 'border-red-200 dark:border-red-800',
    icon: 'error',
  },
  warning: {
    bgClass: 'bg-yellow-100 dark:bg-yellow-900/30',
    textClass: 'text-yellow-800 dark:text-yellow-300',
    borderClass: 'border-yellow-200 dark:border-yellow-800',
    icon: 'warning',
  },
  info: {
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    textClass: 'text-blue-800 dark:text-blue-300',
    borderClass: 'border-blue-200 dark:border-blue-800',
    icon: 'info',
  },
};

/**
 * Alert banner component following SoupFinance design system
 * Displays full-width notification with optional action and dismiss
 */
export function AlertBanner({
  variant,
  message,
  action,
  onDismiss,
  icon,
  className = '',
}: AlertBannerProps) {
  const config = variantConfig[variant];

  return (
    <div
      role="alert"
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border
        ${config.bgClass}
        ${config.textClass}
        ${config.borderClass}
        ${className}
      `}
    >
      {/* Icon - custom or default based on variant */}
      <span className="material-symbols-outlined text-xl shrink-0">
        {icon ?? config.icon}
      </span>

      {/* Message text - takes remaining space */}
      <span className="flex-1 text-sm font-medium">{message}</span>

      {/* Optional action button */}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`
            text-sm font-bold px-3 py-1.5 rounded-md
            hover:bg-black/10 dark:hover:bg-white/10
            transition-colors shrink-0
          `}
        >
          {action.label}
        </button>
      )}

      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className={`
            p-1 rounded-md
            hover:bg-black/10 dark:hover:bg-white/10
            transition-colors shrink-0
          `}
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>
      )}
    </div>
  );
}
