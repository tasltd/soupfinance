/**
 * Radio Component
 * Reusable radio button group with vertical layout
 * Reference: soupfinance-designs/form-radio-button-styles/, design-system.md
 */
import { forwardRef, type InputHTMLAttributes } from 'react';

// Added: Option interface for radio options
export interface RadioOption {
  value: string;
  label: string;
}

// Added: Props interface for Radio component
export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  /** Name attribute for the radio group (required for grouping) */
  name: string;
  /** Array of options to display */
  options: RadioOption[];
  /** Currently selected value */
  value?: string;
  /** Change handler for selection */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Label text displayed above the radio group */
  label?: string;
  /** Error message - triggers error styling when present */
  error?: string;
  /** Additional CSS classes for the container */
  containerClassName?: string;
}

/**
 * Radio button group component following SoupFinance design system
 * Supports: vertical layout, labels, error states, dark mode, disabled
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ name, options, value, onChange, label, error, disabled, containerClassName = '', ...props }, ref) => {
    // Added: Disabled styling for option labels
    const optionLabelClass = disabled
      ? 'text-subtle-text cursor-not-allowed'
      : 'text-text-light dark:text-text-dark cursor-pointer';

    return (
      <div className={`flex flex-col ${containerClassName}`}>
        {/* Group label */}
        {label && (
          <span className="text-sm font-medium pb-3 text-text-light dark:text-text-dark">
            {label}
          </span>
        )}

        {/* Radio options - vertical layout */}
        <div className="flex flex-col gap-3">
          {options.map((option, index) => (
            <label key={option.value} className="inline-flex items-center gap-3">
              {/* Radio input with custom styling */}
              <input
                ref={index === 0 ? ref : undefined}
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={onChange}
                disabled={disabled}
                className={`
                  size-5 border-border-light dark:border-border-dark
                  text-primary focus:ring-primary focus:ring-offset-0
                  bg-surface-light dark:bg-surface-dark
                  checked:border-primary
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors cursor-pointer
                `}
                {...props}
              />

              {/* Option label */}
              <span className={`text-sm font-medium ${optionLabelClass}`}>
                {option.label}
              </span>
            </label>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <span className="text-sm text-danger mt-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </span>
        )}
      </div>
    );
  }
);

Radio.displayName = 'Radio';
