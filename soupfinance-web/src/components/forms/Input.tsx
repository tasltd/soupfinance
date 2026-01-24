/**
 * Input Component
 * Reusable text input with label, error state, and helper text
 * Reference: soupfinance-designs/new-invoice-form/, design-system.md Form Inputs section
 */
import { forwardRef, type InputHTMLAttributes } from 'react';

// Added: Props interface for Input component with all supported options
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
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
 * Text input component following SoupFinance design system
 * Supports: labels, error states, helper text, dark mode, disabled states
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
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

        {/* Input field */}
        <input
          ref={ref}
          disabled={disabled}
          required={required}
          className={`
            h-12 px-4 rounded-lg border
            ${borderClass}
            ${disabledClass}
            placeholder:text-subtle-text
            focus:outline-none focus:ring-2
            text-base font-normal
            transition-colors
          `}
          {...props}
        />

        {/* Error message - displayed in red below input */}
        {error && (
          <span className="text-sm text-danger mt-1.5 flex items-center gap-1">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </span>
        )}

        {/* Helper text - displayed in subtle color when no error */}
        {!error && helperText && (
          <span className="text-sm text-subtle-text mt-1.5">{helperText}</span>
        )}
      </label>
    );
  }
);

Input.displayName = 'Input';
