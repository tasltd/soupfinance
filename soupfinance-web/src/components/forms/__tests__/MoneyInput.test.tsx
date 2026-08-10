/**
 * Unit tests for MoneyInput (SOUPFIN-30 #16).
 *
 * Covers the two reported defects plus the edge cases around them:
 *  - money fields must REJECT letters (`e`/`E`) and signs (`+`/`-`) that a bare
 *    <input type="number"> silently accepts
 *  - the currency prefix must reflect the TENANT's currency, not a hardcoded "$"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyInput } from '../MoneyInput';

// The symbol is read from the account store; mock it so each test can pick one.
const currencySymbolMock = vi.fn(() => '$');
vi.mock('../../../stores', () => ({
  useCurrencySymbol: () => currencySymbolMock(),
}));

describe('MoneyInput — currency symbol (SOUPFIN-30 #16)', () => {
  beforeEach(() => {
    currencySymbolMock.mockReturnValue('$');
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the tenant currency symbol for USD', () => {
    currencySymbolMock.mockReturnValue('$');
    render(<MoneyInput label="Debit" />);
    expect(screen.getByTestId('money-input-currency-symbol')).toHaveTextContent('$');
  });

  it('renders the Ghana cedi symbol when the tenant currency is GHS', () => {
    // The reported bug: "say I chose ghanacedi I should see the cedi sign".
    currencySymbolMock.mockReturnValue('₵');
    render(<MoneyInput label="Debit" />);
    expect(screen.getByTestId('money-input-currency-symbol')).toHaveTextContent('₵');
  });

  it('supports multi-character symbols (e.g. CFA) without truncation', () => {
    currencySymbolMock.mockReturnValue('CFA');
    render(<MoneyInput label="Debit" />);
    expect(screen.getByTestId('money-input-currency-symbol')).toHaveTextContent('CFA');
  });

  it('lets an explicit currencySymbol prop override the tenant currency', () => {
    currencySymbolMock.mockReturnValue('$');
    render(<MoneyInput label="Debit" currencySymbol="€" />);
    expect(screen.getByTestId('money-input-currency-symbol')).toHaveTextContent('€');
  });

  // A fixed `pl-8` clipped the typed value behind wider prefixes such as "GH₵"
  // (observed in the E2E screenshot: "GH₵50.25" for a value of 150.25).
  it.each([
    ['$', 'pl-8'],
    ['₵', 'pl-8'],
    ['R', 'pl-8'],
    ['KSh', 'pl-14'],
    ['GH₵', 'pl-14'],
    ['CFA', 'pl-14'],
  ])('pads the input to clear a "%s" prefix', (symbol, expectedPadding) => {
    currencySymbolMock.mockReturnValue(symbol);
    render(<MoneyInput label="Debit" data-testid="amount" />);
    expect(screen.getByTestId('amount').className).toContain(expectedPadding);
  });

  it('uses the intermediate padding step for a two-character symbol', () => {
    currencySymbolMock.mockReturnValue('R$');
    render(<MoneyInput label="Debit" data-testid="amount" />);
    expect(screen.getByTestId('amount').className).toContain('pl-11');
  });

  it('falls back to the narrow padding for an empty symbol', () => {
    currencySymbolMock.mockReturnValue('');
    render(<MoneyInput label="Debit" data-testid="amount" />);
    expect(screen.getByTestId('amount').className).toContain('pl-8');
  });
});

describe('MoneyInput — rejects non-numeric input (SOUPFIN-30 #16)', () => {
  beforeEach(() => {
    currencySymbolMock.mockReturnValue('$');
  });

  it.each(['e', 'E', '+', '-'])('blocks the "%s" key', (key) => {
    render(<MoneyInput label="Debit" data-testid="amount" />);
    const input = screen.getByTestId('amount');
    const event = fireEvent.keyDown(input, { key });
    // fireEvent returns false when preventDefault() was called.
    expect(event).toBe(false);
  });

  // Regression guard (Firefox): Chromium silently drops letters typed into an
  // <input type="number">, Firefox keeps them in the raw buffer and only
  // reports `.value` as "". Relying on the browser therefore left the reported
  // "money field accepts letters" bug alive on Firefox — the component must
  // reject them itself.
  it.each(['a', 'z', 'A', 'Z', 'q', 'x'])('blocks the letter "%s"', (key) => {
    render(<MoneyInput label="Debit" data-testid="amount" />);
    expect(fireEvent.keyDown(screen.getByTestId('amount'), { key })).toBe(false);
  });

  it.each(['$', ',', '/', ' ', '*', '(', '#'])('blocks the symbol "%s"', (key) => {
    render(<MoneyInput label="Debit" data-testid="amount" />);
    expect(fireEvent.keyDown(screen.getByTestId('amount'), { key })).toBe(false);
  });

  it.each(['0', '5', '9', '.', 'Backspace', 'Tab', 'ArrowLeft', 'Delete'])(
    'allows the "%s" key',
    (key) => {
      render(<MoneyInput label="Debit" data-testid="amount" />);
      const input = screen.getByTestId('amount');
      expect(fireEvent.keyDown(input, { key })).toBe(true);
    }
  );

  it.each(['Home', 'End', 'Enter', 'ArrowRight', 'ArrowUp', 'Shift'])(
    'allows the navigation/editing key "%s"',
    (key) => {
      render(<MoneyInput label="Debit" data-testid="amount" />);
      expect(fireEvent.keyDown(screen.getByTestId('amount'), { key })).toBe(true);
    }
  );

  // Blocking every printable non-digit must not break copy/paste/select-all,
  // whose letters arrive as ordinary single-character keys with a modifier.
  it.each([
    ['v', { ctrlKey: true }],
    ['c', { ctrlKey: true }],
    ['a', { ctrlKey: true }],
    ['v', { metaKey: true }],
    ['x', { metaKey: true }],
  ])('allows the "%s" shortcut when a modifier is held', (key, modifiers) => {
    render(<MoneyInput label="Debit" data-testid="amount" />);
    expect(fireEvent.keyDown(screen.getByTestId('amount'), { key, ...modifiers })).toBe(true);
  });

  it('still calls a caller-supplied onKeyDown for allowed keys', () => {
    const onKeyDown = vi.fn();
    render(<MoneyInput label="Debit" data-testid="amount" onKeyDown={onKeyDown} />);
    fireEvent.keyDown(screen.getByTestId('amount'), { key: '5' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('still calls a caller-supplied onKeyDown for blocked keys', () => {
    const onKeyDown = vi.fn();
    render(<MoneyInput label="Debit" data-testid="amount" onKeyDown={onKeyDown} />);
    fireEvent.keyDown(screen.getByTestId('amount'), { key: 'a' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it.each(['12.50', '0', '1000'])('allows pasting the valid amount "%s"', (text) => {
    render(<MoneyInput label="Debit" data-testid="amount" />);
    const paste = fireEvent.paste(screen.getByTestId('amount'), {
      clipboardData: { getData: () => text },
    });
    expect(paste).toBe(true);
  });

  it.each(['abc', '12abc', '-5', '1e10', '$12.00', '1,000'])(
    'blocks pasting the invalid value "%s"',
    (text) => {
      render(<MoneyInput label="Debit" data-testid="amount" />);
      const paste = fireEvent.paste(screen.getByTestId('amount'), {
        clipboardData: { getData: () => text },
      });
      expect(paste).toBe(false);
    }
  );
});

describe('MoneyInput — accessibility and states (SOUPFIN-30 #6)', () => {
  beforeEach(() => {
    currencySymbolMock.mockReturnValue('$');
  });

  it('associates the visible label with the input via id/htmlFor', () => {
    render(<MoneyInput label="Debit amount" />);
    const input = screen.getByLabelText('Debit amount');
    expect(input).toBeInTheDocument();
    expect(input.getAttribute('id')).toBeTruthy();
  });

  it('falls back to an "Amount" aria-label when no visible label is given', () => {
    render(<MoneyInput />);
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
  });

  it('prefers an explicit aria-label over the fallback', () => {
    render(<MoneyInput aria-label="Line 1 credit amount" />);
    expect(screen.getByLabelText('Line 1 credit amount')).toBeInTheDocument();
  });

  it('renders the error message when one is supplied', () => {
    render(<MoneyInput label="Debit" error="Cannot be negative" />);
    expect(screen.getByText('Cannot be negative')).toBeInTheDocument();
  });

  it('renders no error node when error is undefined', () => {
    render(<MoneyInput label="Debit" />);
    expect(screen.queryByText(/cannot be/i)).not.toBeInTheDocument();
  });

  it('marks the input disabled when disabled is set', () => {
    render(<MoneyInput label="Debit" disabled data-testid="amount" />);
    expect(screen.getByTestId('amount')).toBeDisabled();
  });

  it('constrains input to non-negative decimals via native attributes', () => {
    render(<MoneyInput label="Debit" data-testid="amount" />);
    const input = screen.getByTestId('amount');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('step', '0.01');
    expect(input).toHaveAttribute('inputMode', 'decimal');
  });
});
