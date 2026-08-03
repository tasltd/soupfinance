/**
 * MoneyInput Component
 *
 * Added (SOUPFIN-30 #16): A single money-entry control shared by every amount
 * field (journal entry debit/credit, voucher amount, ...). It fixes two bugs
 * that were reported against the journal entry page:
 *
 *  1. **Letters were accepted.** `<input type="number">` still lets the user
 *     type `e`, `E`, `+` and `-` (they are legal in the scientific-notation
 *     grammar). The browser then reports the control as *empty* rather than
 *     invalid, so the value silently became NaN/0. We block those keys and
 *     sanitise pasted text.
 *  2. **The currency symbol was hardcoded to `$`.** The prefix now comes from
 *     the tenant's configured currency (`useCurrencySymbol()`), so a GHS tenant
 *     sees ₵ and a USD tenant sees $.
 *
 * The control keeps `type="number"` so react-hook-form's `valueAsNumber` and
 * native step/min validation keep working.
 */
import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { useCurrencySymbol } from '../../stores';

/** Keys that `type="number"` permits but that are never valid in an amount. */
const BLOCKED_KEYS = ['e', 'E', '+', '-'];

/**
 * Left padding must clear the currency prefix. Symbols are 1–3 characters
 * across the supported currencies ("$", "₵", "GH₵", "CFA", "KSh", ...), and a
 * fixed `pl-8` clipped the value against the wider ones. Classes are spelled out
 * because Tailwind cannot see dynamically built class names.
 */
function paddingForSymbol(symbol: string): string {
  if (symbol.length <= 1) return 'pl-8';
  if (symbol.length === 2) return 'pl-11';
  return 'pl-14';
}

export interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  /** Label text displayed above the input */
  label?: string;
  /** Error message - triggers error styling when present */
  error?: string;
  /** Additional CSS classes for the <input> itself */
  inputClassName?: string;
  /** Additional CSS classes for the container */
  containerClassName?: string;
  /**
   * Override the currency symbol shown as the prefix. Defaults to the tenant's
   * configured currency symbol from the account store.
   */
  currencySymbol?: string;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      label,
      error,
      inputClassName = '',
      containerClassName = '',
      currencySymbol,
      disabled,
      required,
      id,
      onKeyDown,
      onPaste,
      ...props
    },
    ref
  ) => {
    // Fix (SOUPFIN-30 #6): explicit id/label association.
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const tenantSymbol = useCurrencySymbol();
    const symbol = currencySymbol ?? tenantSymbol;

    const borderClass = error
      ? 'border-danger focus:border-danger focus:ring-danger/20'
      : 'border-border-light dark:border-border-dark focus:border-primary focus:ring-primary/20';

    /** Reject the letter/sign keys `type="number"` would otherwise accept. */
    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (BLOCKED_KEYS.includes(event.key)) {
        event.preventDefault();
      }
      onKeyDown?.(event);
    };

    /** Reject a paste that is not a plain positive decimal number. */
    const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = event.clipboardData.getData('text').trim();
      if (!/^\d*\.?\d*$/.test(pasted)) {
        event.preventDefault();
      }
      onPaste?.(event);
    };

    return (
      <div className={`flex flex-col ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium pb-2 text-text-light dark:text-text-dark"
          >
            {label}
            {required && <span className="text-danger ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {/* Currency prefix — width scales with multi-character symbols. */}
          <span
            className="absolute inset-y-0 left-0 flex items-center pl-3 text-subtle-text text-sm pointer-events-none"
            data-testid="money-input-currency-symbol"
          >
            {symbol}
          </span>
          <input
            ref={ref}
            id={inputId}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            aria-label={props['aria-label'] ?? (label ? undefined : 'Amount')}
            disabled={disabled}
            required={required}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className={`
              w-full h-12 ${paddingForSymbol(symbol)} pr-4 rounded-lg border
              ${borderClass}
              bg-surface-light dark:bg-surface-dark
              text-right text-text-light dark:text-text-dark
              focus:outline-none focus:ring-2
              disabled:opacity-60 disabled:cursor-not-allowed
              ${inputClassName}
            `}
            {...props}
          />
        </div>

        {error && (
          <span className="text-sm text-danger mt-1.5 flex items-center gap-1">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </span>
        )}
      </div>
    );
  }
);

MoneyInput.displayName = 'MoneyInput';
