/**
 * Unit tests for the admin login() flow (SOUPFIN-29)
 *
 * Validates the full round-trip: apiClient.post rejects with an AxiosError →
 * login() rethrows an Error whose `.message` is a user-friendly string, NOT the
 * raw "Request failed with status code 401" that used to leak to the login form.
 *
 * Note: axios is mocked globally in test/setup.ts; we mock apiClient directly so
 * we control the rejection shape. errors.ts (getLoginErrorMessage) is NOT mocked —
 * this is a real round-trip through the translation layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login } from '../auth';
import apiClient from '../client';

vi.mock('../client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
  toFormData: vi.fn(),
}));

// Build a duck-typed AxiosError (parseApiError/getLoginErrorMessage check `isAxiosError`).
function makeAxiosError(status: number | undefined, data?: unknown): unknown {
  const err = new Error(`Request failed with status code ${status ?? 'NA'}`) as Error & {
    isAxiosError: boolean;
    config: { url: string };
    response?: { status: number; data: unknown };
  };
  err.isAxiosError = true;
  err.config = { url: '/api/login' };
  if (status !== undefined) {
    err.response = { status, data };
  }
  return err;
}

describe('login() error translation (SOUPFIN-29)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('throws "Invalid username or password." on a bare 401 (the reported bug)', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(makeAxiosError(401));

    await expect(login('user@test.com', 'wrong')).rejects.toThrow('Invalid username or password.');

    // Regression guard: the raw axios message must never surface.
    await expect(login('user@test.com', 'wrong')).rejects.not.toThrow(/status code/);
  });

  it('replaces a generic "Bad credentials" body with the friendly message', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeAxiosError(401, { error: 'Bad credentials' }),
    );

    await expect(login('user@test.com', 'wrong')).rejects.toThrow('Invalid username or password.');
  });

  it('surfaces a descriptive backend message verbatim (email not confirmed)', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(
      makeAxiosError(401, { error_description: 'Your email is not confirmed.' }),
    );

    await expect(login('user@test.com', 'pw')).rejects.toThrow('Your email is not confirmed.');
  });

  it('maps a network failure (no response) to a connection message, not credentials', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(makeAxiosError(undefined));

    await expect(login('user@test.com', 'pw')).rejects.toThrow(/could not reach the server/i);
  });

  it('maps a 500 to a server-error message, never "Session expired" or a raw status', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(makeAxiosError(500));

    await expect(login('user@test.com', 'pw')).rejects.toThrow(/something went wrong/i);
    await expect(login('user@test.com', 'pw')).rejects.not.toThrow(/Session expired|status code/);
  });

  it('stores the token and returns the user on a successful login (happy path intact)', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        access_token: 'tok-123',
        token_type: 'Bearer',
        username: 'user@test.com',
        roles: ['ROLE_USER'],
      },
    });

    const user = await login('user@test.com', 'correct', true);

    expect(user).toEqual({ username: 'user@test.com', email: 'user@test.com', roles: ['ROLE_USER'] });
    // rememberMe=true → localStorage
    expect(localStorage.getItem('access_token')).toBe('tok-123');
    expect(sessionStorage.getItem('access_token')).toBeNull();
  });
});
