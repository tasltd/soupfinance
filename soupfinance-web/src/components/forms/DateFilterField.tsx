/**
 * DateFilterField — labelled, optional date filter input.
 *
 * Added (SOUPFIN-33 #1 + #6): The From/To range filters on Ledger Transactions and
 * the Accounting Transaction Register were raw <input type="date"> elements whose
 * sibling <label> had no `htmlFor` and whose input had no `id`. Two consequences:
 *
 *   1. The control had NO accessible name, so an empty native date picker was
 *      exposed to assistive tech / a11y snapshots as three anonymous spinbuttons
 *      reading "0 / 0 / 0" — the "0/0/0" users reported. (The bound React value was
 *      already sanitised to '' by SOUPFIN-30; the zero-date is the *unnamed empty
 *      spinbutton group*, not a real value.)
 *   2. It tripped the "No label associated with a form field" and "A form field
 *      element should have an id or name attribute" console violations.
 *
 * This component fixes both at the source: it always emits `id` + `name`, a real
 * `<label htmlFor>`, and — when no date is chosen — an `aria-describedby` hint that
 * states the filter is inactive, so "is this filter set?" is answerable without
 * squinting at an empty picker.
 */
import { useId } from 'react';
import { sanitizeDateInputValue } from '../../utils/date';

export interface DateFilterFieldProps {
  /** Visible label text, e.g. "From". */
  label: string;
  /** Current value (any shape — sanitised to '' unless a strict YYYY-MM-DD). */
  value?: string | number | null;
  /** Receives the raw input value (''  when the user clears the field). */
  onChange: (value: string) => void;
  /** Explicit element id. Auto-generated when omitted. */
  id?: string;
  /**
   * Accessible name. Defaults to the label, but callers should pass something
   * self-describing ("Filter transactions from date") because a bare "From" is
   * meaningless when a screen reader announces the control out of context.
   */
  ariaLabel?: string;
  /** Text announced while the filter is empty. */
  emptyHint?: string;
  min?: string;
  max?: string;
  className?: string;
  /** Wrapper layout classes. */
  containerClassName?: string;
  /** Label typography classes, so pages keep their existing look. */
  labelClassName?: string;
  'data-testid'?: string;
}

const DEFAULT_INPUT_CLASS =
  'h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50';

export function DateFilterField({
  label,
  value,
  onChange,
  id,
  ariaLabel,
  emptyHint = 'No date selected. All dates are included.',
  min,
  max,
  className = DEFAULT_INPUT_CLASS,
  containerClassName = '',
  labelClassName = 'block text-sm font-medium text-text-light dark:text-text-dark mb-1',
  'data-testid': testId,
}: DateFilterFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `date-filter-${generatedId}`;
  const hintId = `${inputId}-hint`;

  // Guarantees the native picker gets '' (→ locale placeholder) rather than a
  // null / "0000-00-00" / ISO-datetime value it would render as a zero date.
  const safeValue = sanitizeDateInputValue(value);
  const isEmpty = safeValue === '';

  return (
    <div className={containerClassName}>
      <label className={labelClassName} htmlFor={inputId}>
        {label}
      </label>
      <input
        type="date"
        id={inputId}
        name={inputId}
        aria-label={ariaLabel ?? label}
        // Only advertise the "nothing selected" hint while it is actually true.
        aria-describedby={isEmpty ? hintId : undefined}
        data-empty={isEmpty ? 'true' : 'false'}
        value={safeValue}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        data-testid={testId}
      />
      {/* Visually hidden: sighted users see the native mm/dd/yyyy placeholder. */}
      <span id={hintId} className="sr-only">
        {emptyHint}
      </span>
    </div>
  );
}
