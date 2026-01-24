/**
 * Select Component
 * Reusable dropdown select with label, error state, and helper text
 * Reference: soupfinance-designs/new-invoice-form/, design-system.md Form Inputs section
 */
import { forwardRef, type SelectHTMLAttributes } from 'react';

// Added: Option interface for type-safe option arrays
export interface SelectOption {
  value: string;
  label: string;
}

// Added: Props interface for Select component
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  /** Label text displayed above the select */
  label?: string;
  /** Array of options to display */
  options: SelectOption[];
  /** Error message - triggers error styling when present */
  error?: string;
  /** Helper text displayed below the select */
  helperText?: string;
  /** Placeholder option text (displayed as first disabled option) */
  placeholder?: string;
  /** Additional CSS classes for the container */
  containerClassName?: string;
}

/**
 * Select dropdown component following SoupFinance design system
 * Supports: labels, options array, error states, placeholder, dark mode
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      options,
      error,
      helperText,
      placeholder,
      containerClassName = '',
      disabled,
      required,
      ...props
    },
    ref
  ) => {
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

        {/* Select dropdown with custom arrow indicator */}
        <div className="relative">
          <select
            ref={ref}
            disabled={disabled}
            required={required}
            className={`
              appearance-none w-full h-12 px-4 pr-10 rounded-lg border
              ${borderClass}
              ${disabledClass}
              focus:outline-none focus:ring-2
              text-base font-normal
              transition-colors
            `}
            {...props}
          >
            {/* Placeholder option */}
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}

            {/* Option items */}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Dropdown arrow icon */}
          <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle-text text-xl">
            expand_more
          </span>
        </div>

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

Select.displayName = 'Select';
