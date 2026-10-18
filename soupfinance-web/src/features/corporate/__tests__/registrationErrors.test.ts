import { describe, it, expect } from 'vitest';
import { plainRegistrationMessage, registrationErrorsToFields } from '../registrationErrors';

describe('registrationErrorsToFields', () => {
  it('turns the backend list into one visible form message', () => {
    const got = registrationErrorsToFields([
      'Property [{0}] of class [{1}] with value [{2}] is not a valid e-mail address',
    ]);
    expect(got).toEqual({ form: 'That email address is not valid. Check it and try again.' });
  });

  it('keeps a plain backend message as it is', () => {
    expect(registrationErrorsToFields(['An account with this email already exists']))
      .toEqual({ form: 'An account with this email already exists' });
  });

  it('passes a field map through', () => {
    expect(registrationErrorsToFields({ email: 'taken' })).toEqual({ email: 'taken' });
  });

  it('returns null for nothing usable', () => {
    for (const v of [undefined, null, [], [''], ['   '], {}, { a: 1 }, 'text', 7]) {
      expect(registrationErrorsToFields(v)).toBeNull();
    }
  });

  it('caps a flood of messages and drops repeats', () => {
    const many = Array.from({ length: 10000 }, (_, i) => `Problem ${i % 7}`);
    many.push(...Array(500).fill('Property [{0}] of class [{1}] cannot be blank'));
    const got = registrationErrorsToFields(many)!;
    expect(got.form).toContain('(and 5 more)');
    expect(got.form.length).toBeLessThan(400);
  });

  it('hides any other unfilled template', () => {
    expect(plainRegistrationMessage('Property [{0}] of class [{1}] is odd')).not.toContain('{0}');
  });

  it('trims a huge message', () => {
    expect(plainRegistrationMessage('x'.repeat(100000)).length).toBe(300);
  });
});
