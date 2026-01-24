/**
 * Checkbox Component
 * Reusable checkbox with label and primary color checked state
 * Reference: soupfinance-designs/form-checkbox-styles/, design-system.md
 */
import { forwardRef, type InputHTMLAttributes } from 'react';

// Added: Props interface for Checkbox component
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  /** Label text displayed next to the checkbox */
  label?: string;
  /** Additional CSS classes for the container */
  containerClassName?: string;
}

/**
 * Checkbox component following SoupFinance design system
 * Supports: labels, checked state with primary color, dark mode, disabled
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, containerClassName = '', disabled, ...props }, ref) => {
    // Added: Disabled styling for label text
    const labelClass = disabled
      ? 'text-subtle-text cursor-not-allowed'
      : 'text-text-light dark:text-text-dark cursor-pointer';

    return (
      <label className={`inline-flex items-center gap-3 ${containerClassName}`}>
        {/* Checkbox input with custom styling */}
        <input
          ref={ref}
          type="checkbox"
          disabled={disabled}
          className={`
            size-5 rounded border-border-light dark:border-border-dark
            text-primary focus:ring-primary focus:ring-offset-0
            bg-surface-light dark:bg-surface-dark
            checked:bg-primary checked:border-primary
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors cursor-pointer
          `}
          {...props}
        />

        {/* Label text */}
        {label && (
          <span className={`text-sm font-medium ${labelClass}`}>
            {label}
          </span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
