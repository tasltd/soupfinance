/**
 * Unit tests for apiErrors helpers.
 *
 * Covers both AxiosError instances (real network errors) and plain
 * AxiosError-shaped objects (common in mocked tests). The latter must be
 * supported because Vitest mocks frequently throw `Object.assign(new Error('...'), { response })`
 * instead of real Axios instances.
 */
import { describe, expect, it } from 'vitest';
import { getStatus, isForbiddenError, isModuleDisabledError } from '../apiErrors';

// Duck-typed AxiosError shape — global axios mock prevents using real AxiosError.
// Real Axios errors at runtime carry the same `response.status` field, which is
// all our helpers depend on.
function buildAxiosError(status: number): { name: string; message: string; response: { status: number } } {
  return {
    name: 'AxiosError',
    message: `Request failed with status code ${status}`,
    response: { status },
  };
}

describe('getStatus', () => {
  it('returns status from a real AxiosError instance', () => {
    expect(getStatus(buildAxiosError(403))).toBe(403);
    expect(getStatus(buildAxiosError(500))).toBe(500);
  });

  it('returns status from AxiosError-shaped plain object (test mocks)', () => {
    const mockErr = { response: { status: 403 } };
    expect(getStatus(mockErr)).toBe(403);
  });

  it('returns undefined when input has no response', () => {
    expect(getStatus(new Error('boom'))).toBeUndefined();
    expect(getStatus(undefined)).toBeUndefined();
    expect(getStatus(null)).toBeUndefined();
    expect(getStatus('not an error')).toBeUndefined();
  });

  it('returns undefined when response exists but has no numeric status', () => {
    expect(getStatus({ response: {} })).toBeUndefined();
    expect(getStatus({ response: { status: 'oops' } })).toBeUndefined();
  });
});

describe('isForbiddenError', () => {
  it('returns true only for status 403', () => {
    expect(isForbiddenError(buildAxiosError(403))).toBe(true);
    expect(isForbiddenError({ response: { status: 403 } })).toBe(true);
  });

  it('returns false for other 4xx/5xx statuses', () => {
    for (const s of [400, 401, 402, 404, 500, 502]) {
      expect(isForbiddenError(buildAxiosError(s))).toBe(false);
    }
  });

  it('returns false for non-Axios errors', () => {
    expect(isForbiddenError(new Error('network'))).toBe(false);
    expect(isForbiddenError(undefined)).toBe(false);
    expect(isForbiddenError(null)).toBe(false);
  });
});

describe('isModuleDisabledError', () => {
  it('returns true for 403 — module-disabled signal on read endpoints', () => {
    expect(isModuleDisabledError(buildAxiosError(403))).toBe(true);
    expect(isModuleDisabledError({ response: { status: 403 } })).toBe(true);
  });

  it('returns false for non-403 errors (those are real failures, not module-disabled)', () => {
    expect(isModuleDisabledError(buildAxiosError(500))).toBe(false);
    expect(isModuleDisabledError(buildAxiosError(404))).toBe(false);
    expect(isModuleDisabledError(new Error('Network'))).toBe(false);
    expect(isModuleDisabledError(undefined)).toBe(false);
  });
});
