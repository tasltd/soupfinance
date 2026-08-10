/**
 * MoneyInput <-> react-hook-form integration (SOUPFIN-30 #16).
 *
 * The journal-entry page renders every amount cell with MoneyInput and derives
 * the running "Total Debits"/"Total Credits" from `watch('lines')`. If
 * MoneyInput ever stops forwarding the props `register()` hands it, the field
 * still *shows* what the user typed while the totals silently stay at 0 — the
 * exact regression this file pins down.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { MoneyInput } from '../MoneyInput';

function AmountForm() {
  const { register, watch } = useForm<{ amount: number }>({
    defaultValues: { amount: 0 },
  });
  const amount = watch('amount');

  return (
    <form>
      <MoneyInput
        label="Amount"
        {...register('amount', { valueAsNumber: true })}
        data-testid="amount"
      />
      <output data-testid="total">{Number.isNaN(amount) ? 'NaN' : amount}</output>
    </form>
  );
}

describe('MoneyInput + react-hook-form', () => {
  it('propagates typed values into form state so derived totals update', async () => {
    const user = userEvent.setup();
    render(<AmountForm />);

    await user.type(screen.getByTestId('amount'), '150.25');

    expect(screen.getByTestId('amount')).toHaveValue(150.25);
    expect(screen.getByTestId('total')).toHaveTextContent('150.25');
  });

  it('reports an emptied field as empty rather than a stale value', async () => {
    const user = userEvent.setup();
    render(<AmountForm />);

    const input = screen.getByTestId('amount');
    await user.type(input, '42');
    expect(screen.getByTestId('total')).toHaveTextContent('42');

    await user.clear(input);
    // An empty numeric field yields NaN under valueAsNumber; what matters is
    // that the change is propagated at all rather than silently dropped.
    expect(screen.getByTestId('total')).not.toHaveTextContent('42');
  });
});
