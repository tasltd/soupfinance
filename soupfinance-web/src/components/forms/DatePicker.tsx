/**
 * DatePicker Component
 * Wrapper around native date input with SoupFinance styling
 * Reference: soupfinance-designs/new-invoice-form/, design-system.md Form Inputs section
 */
import { forwardRef, type InputHTMLAttributes } from 'react';

// Added: Props interface for DatePicker component
export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  /** Label text displayed above the input */
  label?: string;
  /** Error message - triggers error styling when present */
  error?: string;
  /** Helper text displayed below the input */
  helperText?: string;
  /** Additional CSS classes for the container */
  containerClassName?: string;
}

/**
 * DatePicker component following SoupFinance design system
 * Wraps native date input with consistent styling
 * Supports: labels, error states, min/max dates, dark mode
 */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ label, error, helperText, containerClassName = '', disabled, required, ...props }, ref) => {
    // Added: Compute border color based on error state
    const borderClass = error
      ? 'border-danger focus:border-danger focus:ring-danger/20'
      : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20';

    // Added: Disabled styling
    const disabledClass = disabled
      ? 'bg-background-light/50 dark:bg-background-dark/50 text-subtle-text cursor-not-allowed'
      : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark';

    return (
      <label className={`flex flex-col ${containerClassName}`}>
        {/* Label with optional required indicator */}
        {label && (
          <span className="text-sm font-medium pb-2 text-text-light dark:text-text-dark">
            {label}
            {required && <span className="text-danger ml-1">*</span>}
          </span>
        )}

        {/* Date input field */}
        <input
          ref={ref}
          type="date"
          disabled={disabled}
          required={required}
          className={`
            h-12 px-4 rounded-lg border
            ${borderClass}
            ${disabledClass}
            focus:outline-none focus:ring-2
            text-base font-normal
            transition-colors
            [&::-webkit-calendar-picker-indicator]:cursor-pointer
            [&::-webkit-calendar-picker-indicator]:opacity-60
            [&::-webkit-calendar-picker-indicator]:hover:opacity-100
          `}
          {...props}
        />

        {/* Error message */}
        {error && (
          <span className="text-sm text-danger mt-1.5 flex items-center gap-1">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </span>
        )}

        {/* Helper text */}
        {!error && helperText && (
          <span className="text-sm text-subtle-text mt-1.5">{helperText}</span>
        )}
      </label>
    );
  }
);

DatePicker.displayName = 'DatePicker';
