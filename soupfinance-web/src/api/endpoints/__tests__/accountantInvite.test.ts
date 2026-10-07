/**
 * SOUPFIN-101 — accountant invite API.
 *
 * Pins the wire contract in plans/soupfin-101-accountant-invite-backend.md:
 *  - admin side under /rest/accountantInvite/* (apiClient, baseURL /rest)
 *  - only save carries a CSRF token; resend and revoke are plain POST commands
 *  - the public accept step goes through /account/* (never /rest/account/*)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import apiClient, { getCsrfToken } from '../../client';
import { accountantInviteApi } from '../settings';
import type { AccountantInvite } from '../../../types/settings';

vi.mock('../../client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../client')>();
  return {
    ...actual,
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
    accountClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
    getCsrfToken: vi.fn(),
    getCsrfTokenForEdit: vi.fn(),
  };
});

const pending: AccountantInvite = {
  id: 'inv-1',
  email: 'ama@ledgerworks.example',
  firstName: 'Ama',
  lastName: 'Owusu',
  status: 'PENDING',
};

describe('accountantInviteApi (SOUPFIN-101)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('GETs index.json newest first and returns the invites', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: [pending] });

      const result = await accountantInviteApi.list();

      const url = vi.mocked(apiClient.get).mock.calls[0][0] as string;
      expect(url.startsWith('/accountantInvite/index.json?')).toBe(true);
      const params = new URLSearchParams(url.split('?')[1]);
      expect(params.get('sort')).toBe('dateCreated');
      expect(params.get('order')).toBe('desc');
      expect(params.get('max')).toBe('100');
      expect(result).toEqual([pending]);
    });

    it('returns an empty list as-is (zero invites is a real state)', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
      await expect(accountantInviteApi.list()).resolves.toEqual([]);
    });

    it('throws instead of rendering "no invites" when the body is not an array', async () => {
      // A session-expired 302 resolves to login HTML (see SOUPFIN-23).
      vi.mocked(apiClient.get).mockResolvedValue({ data: '<html>Login</html>' });
      await expect(accountantInviteApi.list()).rejects.toThrow(/could not be loaded/);
    });

    it('passes a 404 through so the page can say the feature is not available', async () => {
      const notFound = { isAxiosError: true, response: { status: 404, data: {} } };
      vi.mocked(apiClient.get).mockRejectedValue(notFound);
      await expect(accountantInviteApi.list()).rejects.toBe(notFound);
    });

    it('caller params override the defaults', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
      await accountantInviteApi.list({ max: 10, offset: 20 });
      const params = new URLSearchParams((vi.mocked(apiClient.get).mock.calls[0][0] as string).split('?')[1]);
      expect(params.get('max')).toBe('10');
      expect(params.get('offset')).toBe('20');
    });
  });

  describe('invite', () => {
    it('fetches a CSRF token, then POSTs save.json with the token in the query string', async () => {
      vi.mocked(getCsrfToken).mockResolvedValue({ SYNCHRONIZER_TOKEN: 'tok', SYNCHRONIZER_URI: '/accountantInvite/save' });
      vi.mocked(apiClient.post).mockResolvedValue({ data: pending });

      const result = await accountantInviteApi.invite({
        email: '  Ama@LedgerWorks.example ',
        firstName: ' Ama ',
        lastName: 'Owusu',
      });

      expect(getCsrfToken).toHaveBeenCalledWith('accountantInvite');
      const [url, body] = vi.mocked(apiClient.post).mock.calls[0];
      expect(url).toBe(
        '/accountantInvite/save.json?SYNCHRONIZER_TOKEN=tok&SYNCHRONIZER_URI=%2FaccountantInvite%2Fsave'
      );
      // Trimmed and lower-cased so "Ama@" and "ama@" never become two invites.
      expect(body).toEqual({ email: 'ama@ledgerworks.example', firstName: 'Ama', lastName: 'Owusu' });
      expect(result).toEqual(pending);
    });

    it('omits blank optional names rather than sending empty strings', async () => {
      vi.mocked(getCsrfToken).mockResolvedValue({ SYNCHRONIZER_TOKEN: 't', SYNCHRONIZER_URI: 'u' });
      vi.mocked(apiClient.post).mockResolvedValue({ data: pending });

      await accountantInviteApi.invite({ email: 'a@b.co', firstName: '   ', lastName: '' });

      expect(vi.mocked(apiClient.post).mock.calls[0][1]).toEqual({ email: 'a@b.co' });
    });

    it('surfaces a 409 duplicate from the backend unchanged', async () => {
      vi.mocked(getCsrfToken).mockResolvedValue({ SYNCHRONIZER_TOKEN: 't', SYNCHRONIZER_URI: 'u' });
      const conflict = { isAxiosError: true, response: { status: 409, data: { message: 'Already invited' } } };
      vi.mocked(apiClient.post).mockRejectedValue(conflict);
      await expect(accountantInviteApi.invite({ email: 'a@b.co' })).rejects.toBe(conflict);
    });
  });

  describe('resend and revoke', () => {
    it('resend POSTs resend/{id}.json without a CSRF token', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: { ...pending, sendCount: 2 } });

      const result = await accountantInviteApi.resend('inv-1');

      expect(apiClient.post).toHaveBeenCalledWith('/accountantInvite/resend/inv-1.json');
      expect(getCsrfToken).not.toHaveBeenCalled();
      expect(result.sendCount).toBe(2);
    });

    it('revoke POSTs revoke/{id}.json and returns the REVOKED invite', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: { ...pending, status: 'REVOKED' } });

      const result = await accountantInviteApi.revoke('inv-1');

      expect(apiClient.post).toHaveBeenCalledWith('/accountantInvite/revoke/inv-1.json');
      expect(getCsrfToken).not.toHaveBeenCalled();
      expect(result.status).toBe('REVOKED');
    });
  });
});

describe('accountant invite acceptance (SOUPFIN-101, public /account/*)', () => {
  function mockAccountAxios() {
    const get = vi.fn();
    const post = vi.fn();
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get,
      post,
    });
    return { get, post };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAccountantInvite GETs /account/accountantInvite.json with the token URL-encoded', async () => {
    const { get } = mockAccountAxios();
    get.mockResolvedValue({ data: { status: 'PENDING', email: 'ama@x.co', existingUser: false } });
    vi.resetModules();
    const { getAccountantInvite } = await import('../registration');

    const result = await getAccountantInvite('a+b/c=');

    expect(get).toHaveBeenCalledWith('/account/accountantInvite.json?token=a%2Bb%2Fc%3D');
    expect(result.existingUser).toBe(false);
  });

  it('acceptAccountantInvite POSTs /account/acceptAccountantInvite.json (not /rest/)', async () => {
    const { post } = mockAccountAxios();
    post.mockResolvedValue({ data: { success: true, username: 'ama@x.co' } });
    vi.resetModules();
    const { acceptAccountantInvite } = await import('../registration');

    const body = { token: 't', password: 'Secret123', confirmPassword: 'Secret123' };
    const result = await acceptAccountantInvite(body);

    expect(post).toHaveBeenCalledWith('/account/acceptAccountantInvite.json', body);
    expect(result).toEqual({ success: true, username: 'ama@x.co' });
  });
});
