/**
 * Toast Component
 * Individual toast notification with auto-dismiss support
 * Reference: soupfinance-designs/alert-toast-notification-stack/, design-system.md
 */
import { useEffect } from 'react';
import type { AlertVariant } from './AlertBanner';

// Added: Props interface for Toast component
export interface ToastProps {
  /** Unique identifier for the toast */
  id: string;
  /** Toast variant determines colors and icon */
  variant: AlertVariant;
  /** Message to display */
  message: string;
  /** Auto-dismiss duration in milliseconds (0 = no auto-dismiss) */
  duration?: number;
  /** Callback when toast should be closed */
  onClose: (id: string) => void;
}

// Added: Variant configuration mapping for consistent styling
const variantConfig: Record<AlertVariant, {
  bgClass: string;
  textClass: string;
  borderClass: string;
  icon: string;
}> = {
  success: {
    bgClass: 'bg-green-100 dark:bg-green-900/90',
    textClass: 'text-green-800 dark:text-green-200',
    borderClass: 'border-green-200 dark:border-green-700',
    icon: 'check_circle',
  },
  error: {
    bgClass: 'bg-red-100 dark:bg-red-900/90',
    textClass: 'text-red-800 dark:text-red-200',
    borderClass: 'border-red-200 dark:border-red-700',
    icon: 'error',
  },
  warning: {
    bgClass: 'bg-yellow-100 dark:bg-yellow-900/90',
    textClass: 'text-yellow-800 dark:text-yellow-200',
    borderClass: 'border-yellow-200 dark:border-yellow-700',
    icon: 'warning',
  },
  info: {
    bgClass: 'bg-blue-100 dark:bg-blue-900/90',
    textClass: 'text-blue-800 dark:text-blue-200',
    borderClass: 'border-blue-200 dark:border-blue-700',
    icon: 'info',
  },
};

/**
 * Toast notification component following SoupFinance design system
 * Auto-dismisses after duration (default 5000ms)
 * Uses custom toast-slide-in animation defined in index.css
 */
export function Toast({ id, variant, message, duration = 5000, onClose }: ToastProps) {
  const config = variantConfig[variant];

  // Added: Auto-dismiss effect with cleanup
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  return (
    <div
      role="alert"
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg
        min-w-[300px] max-w-[400px]
        ${config.bgClass}
        ${config.textClass}
        ${config.borderClass}
        animate-toast-slide-in
      `}
    >
      {/* Icon based on variant */}
      <span className="material-symbols-outlined text-xl shrink-0">
        {config.icon}
      </span>

      {/* Message text */}
      <span className="flex-1 text-sm font-medium">{message}</span>

      {/* Close button */}
      <button
        type="button"
        onClick={() => onClose(id)}
        aria-label="Dismiss notification"
        className={`
          p-1 rounded-md
          hover:bg-black/10 dark:hover:bg-white/10
          transition-colors shrink-0
        `}
      >
        <span className="material-symbols-outlined text-lg">close</span>
      </button>
    </div>
  );
}
