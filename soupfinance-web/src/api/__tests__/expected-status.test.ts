import { describe, it, expect } from 'vitest';
import { isExpectedStatus } from '../client';

// Added: a 404 the caller falls back from (corporate/current.json) must not be
// reported to the backend as a front-end error.
describe('isExpectedStatus', () => {
  it('matches a status the caller listed', () => {
    expect(isExpectedStatus({ expectedStatuses: [404] }, 404)).toBe(true);
  });

  it('does not hide other statuses on the same request', () => {
    expect(isExpectedStatus({ expectedStatuses: [404] }, 500)).toBe(false);
    expect(isExpectedStatus({ expectedStatuses: [404] }, 401)).toBe(false);
  });

  it('treats no config, no list, an empty list or no status as unexpected', () => {
    expect(isExpectedStatus(undefined, 404)).toBe(false);
    expect(isExpectedStatus({}, 404)).toBe(false);
    expect(isExpectedStatus({ expectedStatuses: [] }, 404)).toBe(false);
    expect(isExpectedStatus({ expectedStatuses: [404] }, undefined)).toBe(false);
  });

  it('handles a long list', () => {
    const many = Array.from({ length: 1000 }, (_, i) => 1000 + i);
    expect(isExpectedStatus({ expectedStatuses: [...many, 404] }, 404)).toBe(true);
    expect(isExpectedStatus({ expectedStatuses: many }, 404)).toBe(false);
  });
});
