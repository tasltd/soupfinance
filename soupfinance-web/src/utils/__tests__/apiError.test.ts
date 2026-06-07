/**
 * Unit tests for the apiError normalization utility (SOUPFIN-2).
 *
 * The global test setup (`src/test/setup.ts`) installs an axios mock that
 * provides `isAxiosError` — we just rely on it here. Tests construct plain
 * objects with `isAxiosError: true` to simulate axios errors.
 */
import { describe, it, expect } from 'vitest';
import { normalizeApiError, getApiErrorMessage } from '../apiError';

interface FakeAxiosError {
  isAxiosError: true;
  message: string;
  response?: {
    status: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: unknown;
  };
}

function makeAxiosError(payload: {
  status?: number;
  data?: unknown;
  message?: string;
  noResponse?: boolean;
}): FakeAxiosError {
  return {
    isAxiosError: true,
    message: payload.message ?? 'Request failed',
    response: payload.noResponse
      ? undefined
      : {
          status: payload.status ?? 500,
          statusText: 'Server Error',
          headers: {},
          data: payload.data,
        },
  };
}

describe('normalizeApiError', () => {
  it('returns generic fallback for null', () => {
    const result = normalizeApiError(null);
    expect(result.message).toBe('Something went wrong. Please try again.');
    expect(result.isNetwork).toBe(false);
  });

  it('uses Error.message for thrown Error', () => {
    const result = normalizeApiError(new Error('boom'));
    expect(result.message).toBe('boom');
  });

  it('uses raw string when a string is thrown', () => {
    const result = normalizeApiError('something failed');
    expect(result.message).toBe('something failed');
  });

  it('extracts { message } from backend JSON body', () => {
    const err = makeAxiosError({
      status: 500,
      data: { message: 'SbUserSbRole.exists() failed' },
    });
    const result = normalizeApiError(err);
    expect(result.message).toBe('SbUserSbRole.exists() failed');
    expect(result.status).toBe(500);
    expect(result.isNetwork).toBe(false);
  });

  it('extracts { error } from backend JSON body', () => {
    const err = makeAxiosError({ status: 422, data: { error: 'Validation failed' } });
    expect(normalizeApiError(err).message).toBe('Validation failed');
  });

  it('joins multiple field errors and exposes fieldErrors map', () => {
    const err = makeAxiosError({
      status: 422,
      data: {
        errors: [
          { field: 'username', message: 'is required' },
          { field: 'email', message: 'must be valid' },
        ],
      },
    });
    const result = normalizeApiError(err);
    expect(result.message).toBe('is required; must be valid');
    expect(result.fieldErrors).toEqual({
      username: 'is required',
      email: 'must be valid',
    });
  });

  it('strips HTML tags from plain-text body', () => {
    const err = makeAxiosError({
      status: 500,
      data: '<html><body><h1>Server Error</h1></body></html>',
    });
    const result = normalizeApiError(err);
    expect(result.message).toContain('Server Error');
  });

  it('produces a friendly fallback for 403 without body', () => {
    const err = makeAxiosError({ status: 403 });
    expect(normalizeApiError(err).message).toMatch(/permission/i);
  });

  it('produces a friendly fallback for 5xx without body', () => {
    const err = makeAxiosError({ status: 502 });
    expect(normalizeApiError(err).message).toMatch(/server is having trouble/i);
  });

  it('marks network errors with isNetwork=true', () => {
    const err = makeAxiosError({ noResponse: true, message: 'Network Error' });
    const result = normalizeApiError(err);
    expect(result.isNetwork).toBe(true);
    expect(result.message).toBe('Network Error');
  });
});

describe('getApiErrorMessage', () => {
  it('returns the extracted message', () => {
    const err = makeAxiosError({ status: 500, data: { message: 'boom' } });
    expect(getApiErrorMessage(err)).toBe('boom');
  });

  it('returns the default friendly fallback when nothing extractable', () => {
    expect(getApiErrorMessage(undefined)).toMatch(/something went wrong/i);
  });
});
