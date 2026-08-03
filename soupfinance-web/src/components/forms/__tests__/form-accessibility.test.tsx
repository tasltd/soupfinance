/**
 * Unit tests for the shared form-control accessibility fix (SOUPFIN-30 #6).
 *
 * The reported console warnings were:
 *   "No label associated with a form field (count: 8)"
 *   "A form field element should have an id or name attribute (count: 8)"
 *
 * Every shared control must therefore render with an `id` and an explicitly
 * associated label (or an aria-label fallback when there is no visible label).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '../Input';
import { Select } from '../Select';
import { Textarea } from '../Textarea';
import { DatePicker } from '../DatePicker';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

describe('Shared form controls always have an id (SOUPFIN-30 #6)', () => {
  it.each([
    ['Input', <Input key="i" label="Company name" data-testid="f" />],
    ['Select', <Select key="s" label="Company name" options={OPTIONS} data-testid="f" />],
    ['Textarea', <Textarea key="t" label="Company name" data-testid="f" />],
    ['DatePicker', <DatePicker key="d" label="Company name" data-testid="f" />],
  ])('%s renders a non-empty id attribute', (_name, element) => {
    render(element);
    expect(screen.getByTestId('f').getAttribute('id')).toBeTruthy();
  });

  it.each([
    ['Input', <Input key="i" label="Company name" />],
    ['Select', <Select key="s" label="Company name" options={OPTIONS} />],
    ['Textarea', <Textarea key="t" label="Company name" />],
    ['DatePicker', <DatePicker key="d" label="Company name" />],
  ])('%s associates its visible label with the control', (_name, element) => {
    render(element);
    expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
  });

  it.each([
    ['Input', <Input key="i" id="explicit-input" label="X" data-testid="f" />],
    ['Select', <Select key="s" id="explicit-select" label="X" options={OPTIONS} data-testid="f" />],
    ['Textarea', <Textarea key="t" id="explicit-textarea" label="X" data-testid="f" />],
    ['DatePicker', <DatePicker key="d" id="explicit-date" label="X" data-testid="f" />],
  ])('%s honours a caller-supplied id instead of generating one', (_name, element) => {
    render(element);
    expect(screen.getByTestId('f').getAttribute('id')).toMatch(/^explicit-/);
  });

  it('generates DISTINCT ids for two instances of the same control', () => {
    render(
      <>
        <Input label="First" data-testid="one" />
        <Input label="Second" data-testid="two" />
      </>
    );
    const idOne = screen.getByTestId('one').getAttribute('id');
    const idTwo = screen.getByTestId('two').getAttribute('id');
    expect(idOne).toBeTruthy();
    expect(idTwo).toBeTruthy();
    expect(idOne).not.toBe(idTwo);
  });
});

describe('Unlabelled controls fall back to an accessible name (SOUPFIN-30 #6)', () => {
  it('Input uses its placeholder when no visible label is given', () => {
    render(<Input placeholder="Search clients" />);
    expect(screen.getByLabelText('Search clients')).toBeInTheDocument();
  });

  it('Select uses its placeholder when no visible label is given', () => {
    render(<Select options={OPTIONS} placeholder="Filter by type" />);
    expect(screen.getByLabelText('Filter by type')).toBeInTheDocument();
  });

  it('Textarea uses its placeholder when no visible label is given', () => {
    render(<Textarea placeholder="Add notes" />);
    expect(screen.getByLabelText('Add notes')).toBeInTheDocument();
  });

  it('DatePicker falls back to "Date" when there is no label or placeholder', () => {
    render(<DatePicker />);
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });

  it('an explicit aria-label wins over the placeholder fallback', () => {
    render(<Input placeholder="Search clients" aria-label="Client search field" />);
    expect(screen.getByLabelText('Client search field')).toBeInTheDocument();
  });

  it('does NOT add a redundant aria-label when a visible label exists', () => {
    // A visible <label> already supplies the accessible name; duplicating it in
    // aria-label would let the two drift apart.
    render(<Input label="Company name" data-testid="f" />);
    expect(screen.getByTestId('f')).not.toHaveAttribute('aria-label');
  });
});

describe('Existing control behaviour is preserved', () => {
  it('Input still renders its error message', () => {
    render(<Input label="Email" error="Invalid email" />);
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
  });

  it('Select still renders all options plus the placeholder', () => {
    render(<Select label="Type" options={OPTIONS} placeholder="Choose..." />);
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Choose...' })).toBeInTheDocument();
  });

  it('Select renders an empty list without crashing', () => {
    render(<Select label="Type" options={[]} placeholder="Choose..." />);
    // Queried by ACCESSIBLE NAME rather than getByLabelText: RTL's label-text
    // matcher concatenates the nested <option> text into the label's content,
    // so an exact-string label query is unreliable for <select>.
    expect(screen.getByRole('combobox', { name: /type/i })).toBeInTheDocument();
  });

  it('DatePicker still sanitises a zero-date sentinel to an empty value', () => {
    render(<DatePicker label="Bill date" value="0000-00-00" onChange={() => {}} data-testid="f" />);
    expect((screen.getByTestId('f') as HTMLInputElement).value).toBe('');
  });

  it('Textarea still honours the rows prop', () => {
    render(<Textarea label="Notes" rows={7} data-testid="f" />);
    expect(screen.getByTestId('f')).toHaveAttribute('rows', '7');
  });

  it('controls still render as disabled when disabled is set', () => {
    render(<Input label="Email" disabled data-testid="f" />);
    expect(screen.getByTestId('f')).toBeDisabled();
  });
});
