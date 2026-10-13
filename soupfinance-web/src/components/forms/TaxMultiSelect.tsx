/**
 * TaxMultiSelect - pick 0..n tax entries for one line item
 * Reference: soupfinance-designs/form-multiselect-dropdown/
 *
 * Added (SOUPFIN-168): an invoice line can carry several taxes at once. Ghana
 * stacks NHIL 2.5% + GETFund 2.5% + VAT 15% on the same line, and the backend
 * stores one TaxEntryInvoiceItem row per entry. A single <select> could only
 * hold one, so a line saved with three taxes came back into the form with one.
 *
 * Selected entries show as removable chips; the menu lists every entry with a
 * checkbox. No selection means the line is untaxed ("No Tax").
 *
 * The menu is portalled to <body> with fixed positioning. The line-items table
 * scrolls horizontally, and an absolutely positioned child of a scroll
 * container is clipped by it.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TaxMultiSelectOption {
  /** Real TaxEntry UUID */
  id: string;
  name: string;
  /** Percentage, e.g. 2.5 */
  rate: number;
  /** Short label for the chip (the TaxEntry abbreviation, e.g. `NHIL`). Falls back to `name`. */
  shortName?: string;
}

export interface TaxMultiSelectProps {
  /** Selectable entries. The "No Tax" sentinel (empty id) is ignored if passed. */
  options: TaxMultiSelectOption[];
  /** Selected TaxEntry ids, in the order they were picked */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Accessible name for the control, e.g. "Taxes for line 1" */
  ariaLabel: string;
  /** Base data-testid; parts get suffixes (-toggle, -menu, -option-<id>, -chip-<id>) */
  testId: string;
  disabled?: boolean;
}

/** Menu wording, as the single-select dropdown had it: "National Health Insurance Levy (2.5%)". */
function optionLabel(option: TaxMultiSelectOption): string {
  return option.rate ? `${option.name} (${option.rate}%)` : option.name;
}

/** Chip wording, kept short so three taxes fit in a table cell: "NHIL 2.5%". */
function chipLabel(option: TaxMultiSelectOption): string {
  const label = option.shortName || option.name;
  return option.rate ? `${label} ${option.rate}%` : label;
}

export function TaxMultiSelect({
  options,
  value,
  onChange,
  ariaLabel,
  testId,
  disabled = false,
}: TaxMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const selectable = options.filter((option) => option.id);
  const selected = value
    .map((id) => selectable.find((option) => option.id === id))
    .filter((option): option is TaxMultiSelectOption => !!option);

  /**
   * Fixed position, kept inside the viewport. A fixed element cannot be scrolled
   * into view, so a menu that runs off the bottom leaves "Done" unreachable: on a
   * tenant with ~25 tax entries and a line near the bottom of the screen, it did.
   * Opens upward when there is more room above, and caps its height to the room.
   */
  const placeMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 4;
    const margin = 8;
    const width = Math.max(rect.width, 224);
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    setMenuStyle({
      position: 'fixed',
      left,
      minWidth: width,
      maxHeight: Math.max(openUp ? spaceAbove : spaceBelow, 120),
      ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
  }, []);

  /** Position from the trigger first, so the menu never paints at 0,0. */
  const openMenu = () => {
    if (disabled) return;
    placeMenu();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // Capture phase: the table's own horizontal scroll must move the menu too.
    window.addEventListener('scroll', placeMenu, true);
    window.addEventListener('resize', placeMenu);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', placeMenu, true);
      window.removeEventListener('resize', placeMenu);
    };
  }, [open, placeMenu]);

  const toggleEntry = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const removeEntry = (id: string) => {
    onChange(value.filter((v) => v !== id));
  };

  return (
    <div
      ref={triggerRef}
      role="group"
      aria-label={ariaLabel}
      onClick={openMenu}
      className={`flex min-h-10 w-full flex-wrap items-center gap-1 rounded-lg border bg-white px-2 py-1 text-sm dark:bg-background-dark ${
        open
          ? 'border-primary ring-1 ring-primary/50'
          : 'border-border-light dark:border-border-dark'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      data-testid={testId}
    >
      {selected.length === 0 ? (
        <span className="flex-1 text-left text-subtle-text" data-testid={`${testId}-empty`}>
          No Tax
        </span>
      ) : (
        selected.map((option) => (
          <span
            key={option.id}
            className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
            data-testid={`${testId}-chip-${option.id}`}
          >
            <span className="truncate" title={optionLabel(option)}>{chipLabel(option)}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                // Removing a chip must not also open the menu.
                event.stopPropagation();
                removeEntry(option.id);
              }}
              className="flex items-center rounded hover:bg-primary/20"
              aria-label={`Remove ${option.name}`}
              data-testid={`${testId}-remove-${option.id}`}
            >
              {/* Inline size: the icon font's own stylesheet sets 24px and wins over text-sm. */}
              <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">
                close
              </span>
            </button>
          </span>
        ))
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
        className="ml-auto flex items-center text-subtle-text hover:text-primary"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Choose ${ariaLabel.toLowerCase()}`}
        data-testid={`${testId}-toggle`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
          {open ? 'arrow_drop_up' : 'arrow_drop_down'}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="group"
            aria-label={ariaLabel}
            style={menuStyle}
            // React bubbles portal events up the component tree, so without this
            // a click on "Done" would close the menu and then reopen it.
            onClick={(event) => event.stopPropagation()}
            className="z-50 flex max-h-80 flex-col rounded-lg border border-border-light bg-surface-light shadow-lg dark:border-border-dark dark:bg-surface-dark"
            data-testid={`${testId}-menu`}
          >
            {/* Only the list scrolls; "No tax" and "Done" stay in reach however long it is. */}
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {selectable.length === 0 ? (
                <p className="px-3 py-2 text-sm text-subtle-text">No tax entries are set up.</p>
              ) : (
                selectable.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-text-light hover:bg-primary/5 dark:text-text-dark"
                  >
                    <input
                      type="checkbox"
                      checked={value.includes(option.id)}
                      onChange={() => toggleEntry(option.id)}
                      className="size-4 rounded border-border-light text-primary focus:ring-primary/50 dark:border-border-dark"
                      data-testid={`${testId}-option-${option.id}`}
                    />
                    <span>{optionLabel(option)}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex shrink-0 justify-between border-t border-border-light px-3 py-2 dark:border-border-dark">
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={value.length === 0}
                className="text-sm font-medium text-subtle-text hover:text-primary disabled:opacity-40"
                data-testid={`${testId}-clear`}
              >
                No tax
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm font-bold text-primary"
                data-testid={`${testId}-done`}
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
