/**
 * Unit tests for the DatePicker component (SOUPFIN-19).
 *
 * The shared date picker must never surface a "0/0/0" value: when used as a
 * controlled input with a null / sentinel / malformed value it should render an
 * empty field (the browser's standard placeholder), while still forwarding a
 * valid date unchanged.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DatePicker } from '../DatePicker';

describe('DatePicker (SOUPFIN-19 — no "0/0/0" placeholder)', () => {
  it('renders an empty value when given the "0000-00-00" sentinel', () => {
    render(<DatePicker label="Fiscal Year" value="0000-00-00" onChange={() => {}} />);
    const input = screen.getByLabelText('Fiscal Year') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.value).toBe('');
  });

  it('renders an empty value for a malformed date string', () => {
    render(<DatePicker label="Start" value={'01/01/2024' as unknown as string} onChange={() => {}} />);
    const input = screen.getByLabelText('Start') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders an empty value when the controlled value is an empty string', () => {
    render(<DatePicker label="End" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('End') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('forwards a valid YYYY-MM-DD value unchanged', () => {
    render(<DatePicker label="Due" value="2024-06-17" onChange={() => {}} />);
    const input = screen.getByLabelText('Due') as HTMLInputElement;
    expect(input.value).toBe('2024-06-17');
  });

  it('strips the time portion of an ISO datetime value', () => {
    render(<DatePicker label="Created" value="2024-06-17T09:30:00.000Z" onChange={() => {}} />);
    const input = screen.getByLabelText('Created') as HTMLInputElement;
    expect(input.value).toBe('2024-06-17');
  });

  it('leaves an uncontrolled input untouched (no value prop)', () => {
    render(<DatePicker label="Picked" defaultValue="2024-02-02" />);
    const input = screen.getByLabelText('Picked') as HTMLInputElement;
    // Uncontrolled: defaultValue is honoured and the component does not force value.
    expect(input.value).toBe('2024-02-02');
  });
});
