/**
 * SOUPFIN-177: payment rows are labelled from the PaymentMethod record and the
 * Grails `serialised` strings, not from a hard-coded enum map.
 */
import { describe, it, expect } from 'vitest';
import {
  getPaymentMethodName,
  getPaymentMethodBadgeStyle,
  describeInvoiceRef,
  describeBillRef,
  describeAccountRef,
  NO_METHOD_LABEL,
  NO_METHOD_BADGE_STYLE,
} from '../paymentDisplay';
import type { PaymentMethod } from '../../../types';

const methods: PaymentMethod[] = [
  { id: 'pm-1', name: 'Bank Transfer' },
  { id: 'pm-2', name: 'MTN Mobile Money' },
];

describe('getPaymentMethodName', () => {
  it('prefers the PaymentMethod record name, matched by id', () => {
    expect(getPaymentMethodName({ id: 'pm-2', serialised: 'stale text' }, methods)).toBe('MTN Mobile Money');
  });

  it('uses the FK serialised string when the record list has not loaded or lacks the id', () => {
    // The REST index sends only { id, class, serialised } — this is the real shape.
    expect(getPaymentMethodName({ id: 'pm-x', serialised: 'Cheque' }, undefined)).toBe('Cheque');
    expect(getPaymentMethodName({ id: 'pm-x', serialised: 'Cheque' }, methods)).toBe('Cheque');
  });

  it('uses an inline name before the serialised string', () => {
    expect(getPaymentMethodName({ id: 'pm-x', name: 'Card', serialised: 'other' })).toBe('Card');
  });

  it('labels a payment with no method instead of rendering a blank badge', () => {
    expect(getPaymentMethodName(undefined, methods)).toBe(NO_METHOD_LABEL);
    expect(getPaymentMethodName(null)).toBe(NO_METHOD_LABEL);
    expect(getPaymentMethodName({ id: '' })).toBe(NO_METHOD_LABEL);
  });

  it('handles a free-text name the old enum map never knew', () => {
    const long = 'Standard Chartered Ghana interbank RTGS transfer (same-day value) '.repeat(4).trim();
    expect(getPaymentMethodName({ id: 'pm-long' }, [{ id: 'pm-long', name: long }])).toBe(long);
  });
});

describe('getPaymentMethodBadgeStyle', () => {
  it('is stable for the same id', () => {
    expect(getPaymentMethodBadgeStyle({ id: 'abc' })).toBe(getPaymentMethodBadgeStyle({ id: 'abc', serialised: 'x' }));
  });

  it('gives every method a coloured style, and no method the neutral one', () => {
    expect(getPaymentMethodBadgeStyle(undefined)).toBe(NO_METHOD_BADGE_STYLE);
    expect(getPaymentMethodBadgeStyle({ id: 'ff808181791a8d4901791fc17f1b0004' })).not.toBe(NO_METHOD_BADGE_STYLE);
  });

  it('spreads many ids across more than one colour', () => {
    const styles = new Set(
      Array.from({ length: 200 }, (_, i) => getPaymentMethodBadgeStyle({ id: `method-${i}` }))
    );
    expect(styles.size).toBeGreaterThan(4);
  });

  it('every style has a dark-mode pair', () => {
    for (let i = 0; i < 50; i++) {
      expect(getPaymentMethodBadgeStyle({ id: `m${i}` })).toMatch(/dark:bg-/);
    }
  });
});

describe('describeInvoiceRef', () => {
  it('reads number and client from the backend serialised string', () => {
    expect(
      describeInvoiceRef({
        id: 'i1',
        serialised:
          'Invoice(number:2025001, accountServices:Direct Account : Corporate(Pan African Developers Pte Ltd), currency:USD, total:6095.00)',
      })
    ).toEqual({ label: 'Invoice #2025001', party: 'Pan African Developers Pte Ltd' });
  });

  it('keeps the account string when it does not name a Corporate/Individual', () => {
    expect(describeInvoiceRef({ serialised: 'Invoice(number:7, accountServices:Walk-in, total:1.00)' })).toEqual({
      label: 'Invoice #7',
      party: 'Walk-in',
    });
  });

  it('falls back to "Invoice" with no serialised string', () => {
    expect(describeInvoiceRef({ id: 'i1' })).toEqual({ label: 'Invoice', party: undefined });
    expect(describeInvoiceRef(undefined)).toEqual({ label: 'Invoice', party: undefined });
  });
});

describe('describeBillRef', () => {
  it('reads vendor and number from Bill((vendor)[TYPE], prefix, number)', () => {
    expect(
      describeBillRef({ serialised: 'Bill((805 Restaurant ctl1592573)[PROVIDER], LGC numberprefix PZYOC241, 43)' })
    ).toEqual({ label: 'Bill #43', party: '805 Restaurant ctl1592573' });
  });

  it('handles a bill with no prefix', () => {
    expect(describeBillRef({ serialised: 'Bill((Office Supplies Co)[SUPPLIER], 1200)' })).toEqual({
      label: 'Bill #1200',
      party: 'Office Supplies Co',
    });
  });

  it('falls back to "Bill"', () => {
    expect(describeBillRef({ id: 'b1' })).toEqual({ label: 'Bill', party: undefined });
  });
});

describe('describeAccountRef', () => {
  it('shows code and name when the record carries them', () => {
    expect(describeAccountRef({ id: 'a', name: 'Main Bank Account', code: '1000' })).toBe('1000 · Main Bank Account');
    expect(describeAccountRef({ id: 'a', name: 'Cash on Hand' })).toBe('Cash on Hand');
  });

  it('shows the serialised string for a bare FK', () => {
    expect(describeAccountRef({ id: 'a', serialised: 'GT Bank USD' })).toBe('GT Bank USD');
  });

  it('returns undefined when there is nothing to show', () => {
    expect(describeAccountRef(undefined)).toBeUndefined();
    expect(describeAccountRef({ id: 'a' })).toBeUndefined();
  });
});
