/**
 * Unit tests for DateFilterField (SOUPFIN-33 #1 + #6).
 *
 * Reported symptom: the Ledger Transactions and Transaction Register "From"/"To"
 * filters render as "0/0/0" (month=0, day=0, year=0).
 *
 * Root cause: the bound React value was ALREADY sanitised to '' (SOUPFIN-30), so the
 * zero-date is not a value bug — it is what an *unnamed* empty native date control
 * looks like in the accessibility tree. The sibling <label> carried no `htmlFor` and
 * the <input> carried no `id`, so the control had no accessible name and its three
 * empty spinbuttons were serialised as bare zeroes. That is the same defect reported
 * separately as #6 ("No label associated with a form field" / "A form field element
 * should have an id or name attribute").
 *
 * These tests therefore assert the ACCESSIBILITY CONTRACT (name, id/name attributes,
 * label association, empty-state description) as well as the value round-trip —
 * asserting only `input.value === ''` would pass against the broken version.
 */
import { describe, it, expect, vi } from 'vitest';
import { useState, type ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateFilterField } from '../DateFilterField';

function renderField(props: Partial<ComponentProps<typeof DateFilterField>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <DateFilterField
      label="From"
      ariaLabel="Filter transactions from date"
      value=""
      onChange={onChange}
      data-testid="date-filter"
      {...props}
    />
  );
  return { ...utils, onChange };
}

describe('DateFilterField — accessible name and id/name (SOUPFIN-33 #1/#6)', () => {
  it('exposes an accessible name so an empty picker is never an anonymous 0/0/0 group', () => {
    renderField();

    // getByLabelText resolves via the accessible name — it throws if the control
    // has none, which is exactly the pre-fix state.
    const input = screen.getByLabelText('Filter transactions from date') as HTMLInputElement;
    expect(input.type).toBe('date');
  });

  it('emits both id and name attributes (autofill + programmatic identification)', () => {
    renderField({ id: 'ledger-start-date-filter' });

    const input = screen.getByTestId('date-filter') as HTMLInputElement;
    expect(input.id).toBe('ledger-start-date-filter');
    expect(input.name).toBe('ledger-start-date-filter');
  });

  it('associates the visible <label> with the input via htmlFor', () => {
    const { container } = renderField({ id: 'from-date' });

    const label = container.querySelector('label');
    expect(label).not.toBeNull();
    expect(label?.getAttribute('for')).toBe('from-date');
    expect(label?.textContent).toBe('From');
  });

  it('auto-generates a unique id when none is supplied, and never collides', () => {
    render(
      <>
        <DateFilterField label="From" value="" onChange={vi.fn()} data-testid="a" />
        <DateFilterField label="To" value="" onChange={vi.fn()} data-testid="b" />
      </>
    );

    const a = screen.getByTestId('a') as HTMLInputElement;
    const b = screen.getByTestId('b') as HTMLInputElement;
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it('falls back to the label as the accessible name when ariaLabel is omitted', () => {
    render(<DateFilterField label="To" value="" onChange={vi.fn()} data-testid="t" />);

    expect((screen.getByLabelText('To') as HTMLInputElement).type).toBe('date');
  });
});

describe('DateFilterField — empty-state description (SOUPFIN-33 #1)', () => {
  it('describes the filter as inactive while no date is selected', () => {
    renderField({ value: '' });

    const input = screen.getByTestId('date-filter');
    const hintId = input.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)?.textContent).toBe(
      'No date selected. All dates are included.'
    );
    expect(input.getAttribute('data-empty')).toBe('true');
  });

  it('drops the "nothing selected" description once a date IS selected', () => {
    renderField({ value: '2026-08-01' });

    const input = screen.getByTestId('date-filter');
    // Announcing "all dates are included" over a set filter would be actively wrong.
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(input.getAttribute('data-empty')).toBe('false');
  });

  it('honours a caller-supplied empty hint', () => {
    renderField({ emptyHint: 'Optional — leave blank for all periods.' });

    const hintId = screen.getByTestId('date-filter').getAttribute('aria-describedby')!;
    expect(document.getElementById(hintId)?.textContent).toBe(
      'Optional — leave blank for all periods.'
    );
  });
});

describe('DateFilterField — value sanitisation (edge cases)', () => {
  // Each of these must reach the native input as '' so it renders its locale
  // placeholder (mm/dd/yyyy) rather than a zero date.
  it.each([
    ['empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['MariaDB null sentinel', '0000-00-00'],
    ['zero-date placeholder', '0/0/0'],
    ['partial year sentinel', '0000-01-01'],
    ['whitespace only', '   '],
    ['non-date text', 'not-a-date'],
    ['wrong separator', '2026/08/01'],
    ['unpadded month/day', '2026-8-1'],
    ['numeric timestamp', 1723075200000],
  ])('renders empty for %s', (_label, input) => {
    renderField({ value: input as string | number | null });

    expect((screen.getByTestId('date-filter') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('date-filter').getAttribute('data-empty')).toBe('true');
  });

  it('passes a strict YYYY-MM-DD value straight through', () => {
    renderField({ value: '2026-08-01' });
    expect((screen.getByTestId('date-filter') as HTMLInputElement).value).toBe('2026-08-01');
  });

  it('strips the time portion of an ISO datetime', () => {
    renderField({ value: '2026-08-01T00:00:00.000Z' });
    expect((screen.getByTestId('date-filter') as HTMLInputElement).value).toBe('2026-08-01');
  });
});

describe('DateFilterField — round-trip', () => {
  it('reports the selected date to onChange and reflects it once the parent re-renders', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [value, setValue] = useState('');
      return (
        <DateFilterField
          label="From"
          id="rt-from"
          value={value}
          onChange={setValue}
          data-testid="rt"
        />
      );
    }

    render(<Harness />);
    const input = screen.getByTestId('rt') as HTMLInputElement;

    await user.type(input, '2026-08-01');

    // Full round-trip: typed → onChange → state → rendered value, and the field is
    // no longer advertised as "nothing selected".
    expect(input.value).toBe('2026-08-01');
    expect(input.getAttribute('data-empty')).toBe('false');
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('returns to the empty/inactive state when the user clears the field', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [value, setValue] = useState('2026-08-01');
      return (
        <DateFilterField label="From" id="clr" value={value} onChange={setValue} data-testid="clr" />
      );
    }

    render(<Harness />);
    const input = screen.getByTestId('clr') as HTMLInputElement;
    expect(input.value).toBe('2026-08-01');

    await user.clear(input);

    expect(input.value).toBe('');
    expect(input.getAttribute('data-empty')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('forwards min/max bounds to the native picker', () => {
    renderField({ min: '1900-01-01', max: '2026-12-31' });

    const input = screen.getByTestId('date-filter') as HTMLInputElement;
    expect(input.min).toBe('1900-01-01');
    expect(input.max).toBe('2026-12-31');
  });
});
