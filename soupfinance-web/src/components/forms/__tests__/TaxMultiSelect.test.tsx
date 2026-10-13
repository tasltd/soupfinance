/**
 * Added (SOUPFIN-168): unit tests for the per-line tax multi-select.
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaxMultiSelect, type TaxMultiSelectOption } from '../TaxMultiSelect';

const OPTIONS: TaxMultiSelectOption[] = [
  { id: '', name: 'No Tax', rate: 0 },
  { id: 'nhil', name: 'NHIL', rate: 2.5 },
  { id: 'getfl', name: 'GETFund', rate: 2.5 },
  { id: 'vat', name: 'Value Added Tax', rate: 15, shortName: 'VAT' },
];

/** Controlled wrapper, so clicks change what is rendered. */
function Harness({
  initial = [],
  options = OPTIONS,
  onChange,
  disabled,
}: {
  initial?: string[];
  options?: TaxMultiSelectOption[];
  onChange?: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <div>
      <button type="button">elsewhere</button>
      <TaxMultiSelect
        options={options}
        value={value}
        onChange={(ids) => {
          setValue(ids);
          onChange?.(ids);
        }}
        ariaLabel="Taxes for line 1"
        testId="tax"
        disabled={disabled}
      />
    </div>
  );
}

describe('TaxMultiSelect', () => {
  it('shows "No Tax" with nothing selected and never offers the No Tax sentinel as a checkbox', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByTestId('tax-empty')).toHaveTextContent('No Tax');

    await user.click(screen.getByTestId('tax-toggle'));
    const boxes = within(screen.getByTestId('tax-menu')).getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: 'NHIL (2.5%)' })).not.toBeChecked();
  });

  it('ticking boxes adds chips in pick order; unticking removes them', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByTestId('tax-toggle'));
    await user.click(screen.getByRole('checkbox', { name: 'Value Added Tax (15%)' }));
    await user.click(screen.getByRole('checkbox', { name: 'NHIL (2.5%)' }));
    expect(onChange).toHaveBeenLastCalledWith(['vat', 'nhil']);
    // The chip uses the short name, so a stack fits in the cell; the full name is its title.
    expect(screen.getByTestId('tax-chip-vat')).toHaveTextContent('VAT 15%');
    expect(screen.getByTestId('tax-chip-nhil')).toHaveTextContent('NHIL 2.5%');

    await user.click(screen.getByRole('checkbox', { name: 'Value Added Tax (15%)' }));
    expect(onChange).toHaveBeenLastCalledWith(['nhil']);
    expect(screen.queryByTestId('tax-chip-vat')).not.toBeInTheDocument();
  });

  it('"Done" closes the menu and keeps it closed', async () => {
    // The menu is portalled, but React bubbles its clicks to the trigger, which opens it.
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('tax-toggle'));
    await user.click(screen.getByTestId('tax-done'));
    expect(screen.queryByTestId('tax-menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('tax-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape and on a click outside', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('tax-toggle'));
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('tax-menu')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('tax-toggle'));
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByTestId('tax-menu')).not.toBeInTheDocument();
  });

  it('a chip remove button removes only that tax and does not open the menu', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['nhil', 'getfl', 'vat']} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Remove GETFund' }));
    expect(onChange).toHaveBeenCalledWith(['nhil', 'vat']);
    expect(screen.queryByTestId('tax-menu')).not.toBeInTheDocument();
  });

  it('"No tax" clears every selection and is disabled when nothing is selected', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['nhil', 'vat']} />);
    await user.click(screen.getByTestId('tax-toggle'));
    await user.click(screen.getByTestId('tax-clear'));
    expect(screen.getByTestId('tax-empty')).toBeInTheDocument();
    expect(screen.getByTestId('tax-clear')).toBeDisabled();
  });

  it('ignores a selected id that is not in the options rather than rendering a blank chip', () => {
    render(<Harness initial={['gone', 'vat']} />);
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);
    await user.click(screen.getByTestId('tax'));
    expect(screen.queryByTestId('tax-menu')).not.toBeInTheDocument();
  });

  it('zero options: says no entries are set up', async () => {
    const user = userEvent.setup();
    render(<Harness options={[{ id: '', name: 'No Tax', rate: 0 }]} />);
    await user.click(screen.getByTestId('tax-toggle'));
    expect(screen.getByTestId('tax-menu')).toHaveTextContent('No tax entries are set up.');
  });

  it('overflow: 100 options, all selected, render 100 chips and 100 checked boxes', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, name: `Levy ${i}`, rate: 1 }));
    render(<Harness options={many} initial={many.map((t) => t.id)} />);
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(100);
    await user.click(screen.getByTestId('tax-toggle'));
    const boxes = within(screen.getByTestId('tax-menu')).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.filter((b) => b.checked)).toHaveLength(100);
  });
});

// Added (SOUPFIN-168): found against the LXC backend, whose tenant has ~25 tax entries.
// A fixed menu below a trigger near the bottom of the screen ran off the viewport, and a
// fixed element cannot be scrolled into view, so "Done" could not be clicked.
describe('TaxMultiSelect menu placement', () => {
  function placeTrigger(top: number, bottom: number, left = 100, width = 220) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top, bottom, left, right: left + width, width, height: bottom - top, x: left, y: top,
      toJSON: () => ({}),
    } as DOMRect);
  }

  it('opens downward, capped to the room below, when the trigger is high on the screen', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    placeTrigger(100, 140);
    render(<Harness />);
    await user.click(screen.getByTestId('tax-toggle'));
    const menu = screen.getByTestId('tax-menu');
    expect(menu.style.top).toBe('144px');
    expect(menu.style.bottom).toBe('');
    expect(menu.style.maxHeight).toBe('648px'); // 800 - 140 - 4 - 8
  });

  it('opens upward when the trigger is near the bottom, so Done stays on screen', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
    placeTrigger(500, 540);
    render(<Harness />);
    await user.click(screen.getByTestId('tax-toggle'));
    const menu = screen.getByTestId('tax-menu');
    expect(menu.style.top).toBe('');
    expect(menu.style.bottom).toBe('224px'); // 720 - 500 + 4
    expect(menu.style.maxHeight).toBe('488px'); // 500 - 4 - 8
    // The actions sit outside the scrolling list.
    expect(within(menu).getByTestId('tax-done').closest('.overflow-y-auto')).toBeNull();
  });

  it('stays inside the right edge of the window', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    placeTrigger(100, 140, 900, 120);
    render(<Harness />);
    await user.click(screen.getByTestId('tax-toggle'));
    expect(screen.getByTestId('tax-menu').style.left).toBe('792px'); // 1024 - 224 - 8
  });
});
