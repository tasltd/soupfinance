/**
 * Unit tests for getClientDisplayName (SOUP-1929).
 *
 * The KYC client payload frequently omits the computed `name` field, which used
 * to leave the delete confirmation dialog rendering "delete ?" with no name.
 * This pure resolver guarantees a non-blank label for every client shape.
 */
import { describe, it, expect } from 'vitest';
import { getClientDisplayName } from '../getClientDisplayName';

describe('getClientDisplayName', () => {
  it('uses the computed `name` when populated', () => {
    expect(getClientDisplayName({ name: 'Alice Smith' })).toBe('Alice Smith');
  });

  it('trims surrounding whitespace on `name`', () => {
    expect(getClientDisplayName({ name: '  Alice Smith  ' })).toBe('Alice Smith');
  });

  it('falls back to firstName + lastName when `name` is blank (individual)', () => {
    expect(
      getClientDisplayName({ name: '', firstName: 'Alice', lastName: 'Smith' }),
    ).toBe('Alice Smith');
  });

  it('falls back to firstName alone when only firstName is present', () => {
    expect(getClientDisplayName({ name: '', firstName: 'Alice' })).toBe('Alice');
  });

  it('falls back to companyName for corporate clients with no name', () => {
    expect(
      getClientDisplayName({ name: '', firstName: '', lastName: '', companyName: 'Acme Corp' }),
    ).toBe('Acme Corp');
  });

  it('falls back to email when no name or company is available', () => {
    expect(getClientDisplayName({ name: '', email: 'unknown@example.com' })).toBe(
      'unknown@example.com',
    );
  });

  it('returns the "Unnamed client" placeholder as the last resort', () => {
    expect(getClientDisplayName({ name: '', email: '' })).toBe('Unnamed client');
  });

  it('treats whitespace-only fields as empty', () => {
    expect(
      getClientDisplayName({ name: '   ', firstName: ' ', lastName: ' ', companyName: '  ' }),
    ).toBe('Unnamed client');
  });
});
