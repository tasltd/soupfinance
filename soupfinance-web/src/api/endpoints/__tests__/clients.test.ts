/**
 * Unit tests for clients API module
 *
 * Covers SOUPFIN-1: Quick Add Client must also create the AccountServices
 * record (and the ClientPortfolio link) so the new Client can be selected
 * as an invoice recipient. Without this, the invoice form shows
 * "This client has no linked account services."
 *
 * Note: axios is mocked globally via test/setup.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

describe('clients API', () => {
  // Tracked mock functions — assigned per test so we can inspect calls per endpoint
  let mockGet: ReturnType<typeof vi.fn>;
  let mockPost: ReturnType<typeof vi.fn>;

  // The axios instance returned by axios.create() — both apiClient and
  // accountClient share the same shape so a single mock services both.
  function installAxiosMock() {
    mockGet = vi.fn();
    mockPost = vi.fn();
    (axios.create as ReturnType<typeof vi.fn>).mockReturnValue({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: mockGet,
      post: mockPost,
      put: vi.fn(),
      delete: vi.fn(),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    installAxiosMock();
  });

  describe('createClient (SOUPFIN-1)', () => {
    it('creates the Client AND its AccountServices, then returns the enriched Client', async () => {
      // Arrange — sequence of HTTP calls expected:
      //   1. GET  /client/create.json           → CSRF for client/save
      //   2. POST /client/save.json?<csrf>      → creates Client
      //   3. GET  /accountServices/create.json  → CSRF for accountServices/save
      //   4. POST /accountServices/save.json?forClient={id}&<csrf> → creates AS + ClientPortfolio
      //   5. GET  /client/show/{id}.json        → re-fetch with populated portfolioList
      const clientId = 'new-client-uuid';
      const accountServicesId = 'new-as-uuid';

      mockGet
        // CSRF for client/save
        .mockResolvedValueOnce({
          data: {
            SYNCHRONIZER_TOKEN: 'csrf-client-token',
            SYNCHRONIZER_URI: '/rest/client/create',
          },
        })
        // CSRF for accountServices/save
        .mockResolvedValueOnce({
          data: {
            SYNCHRONIZER_TOKEN: 'csrf-as-token',
            SYNCHRONIZER_URI: '/rest/accountServices/create',
          },
        })
        // Final re-fetch of client returns populated portfolioList
        .mockResolvedValueOnce({
          data: {
            id: clientId,
            name: 'Acme Corp',
            clientType: 'CORPORATE',
            portfolioList: [
              {
                id: 'cp-uuid',
                accountServices: {
                  id: accountServicesId,
                  serialised: 'Direct Account : Corporate(Acme Corp)',
                },
              },
            ],
          },
        });

      mockPost
        // POST /client/save.json returns the new Client (no portfolioList yet)
        .mockResolvedValueOnce({
          data: { id: clientId, name: 'Acme Corp', clientType: 'CORPORATE' },
        })
        // POST /accountServices/save.json returns the new AccountServices
        .mockResolvedValueOnce({
          data: { id: accountServicesId, serialised: 'Direct Account : Corporate(Acme Corp)' },
        });

      vi.resetModules();
      const { createClient } = await import('../clients');

      // Act
      const result = await createClient({
        clientType: 'CORPORATE',
        name: 'Acme Corp',
        companyName: 'Acme Corp',
        email: 'billing@acme.test',
      });

      // Assert — Client was created with CSRF on the URL
      expect(mockPost).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/^\/client\/save\.json\?.*SYNCHRONIZER_TOKEN=csrf-client-token/),
        expect.objectContaining({ name: 'Acme Corp', clientType: 'CORPORATE' })
      );

      // Assert — AccountServices was created with forClient + CSRF on the URL
      const accountServicesCall = mockPost.mock.calls[1];
      expect(accountServicesCall[0]).toMatch(/^\/accountServices\/save\.json\?/);
      expect(accountServicesCall[0]).toContain(`forClient=${clientId}`);
      expect(accountServicesCall[0]).toContain('SYNCHRONIZER_TOKEN=csrf-as-token');
      // Empty body — backend creates a minimal AccountServices and ClientPortfolio
      expect(accountServicesCall[1]).toEqual({});

      // Assert — final re-fetch via GET /client/show/{id}.json
      const showCall = mockGet.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('/client/show/')
      );
      expect(showCall?.[0]).toBe(`/client/show/${clientId}.json`);

      // Assert — returned client has the populated portfolioList so the invoice
      // form's `client.portfolioList[0].accountServices.id` resolution works.
      expect(result.id).toBe(clientId);
      expect(result.portfolioList?.[0]?.accountServices?.id).toBe(accountServicesId);
    });

    it('makes the AccountServices call only AFTER the Client save resolves', async () => {
      // Arrange — we control resolution order to prove the dependency.
      const clientId = 'sequence-client-uuid';
      let clientSaveResolved = false;
      let asPostCalled = false;

      mockGet
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 't1', SYNCHRONIZER_URI: '/u1' },
        })
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 't2', SYNCHRONIZER_URI: '/u2' },
        })
        .mockResolvedValueOnce({
          data: { id: clientId, portfolioList: [{ accountServices: { id: 'as-1' } }] },
        });

      mockPost.mockImplementation((url: string) => {
        if (url.startsWith('/client/save')) {
          return new Promise((resolve) => {
            setTimeout(() => {
              clientSaveResolved = true;
              resolve({ data: { id: clientId, name: 'Seq Co' } });
            }, 10);
          });
        }
        if (url.startsWith('/accountServices/save')) {
          asPostCalled = true;
          // If we get here before the Client save settles, the ordering is wrong.
          expect(clientSaveResolved).toBe(true);
          return Promise.resolve({ data: { id: 'as-1' } });
        }
        return Promise.resolve({ data: {} });
      });

      vi.resetModules();
      const { createClient } = await import('../clients');

      // Act
      await createClient({ clientType: 'INDIVIDUAL', name: 'Seq Co' });

      // Assert
      expect(asPostCalled).toBe(true);
      expect(clientSaveResolved).toBe(true);
    });

    it('returns the Client even when AccountServices creation fails (graceful degradation)', async () => {
      // Arrange — Client save succeeds, AccountServices save throws.
      // The user should still see their new Client (they can repair the link later
      // via the Client management page), rather than seeing the whole save error out.
      const clientId = 'partial-client-uuid';

      mockGet
        // CSRF for client/save
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 'c-tok', SYNCHRONIZER_URI: '/u' },
        })
        // CSRF for accountServices/save
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 'as-tok', SYNCHRONIZER_URI: '/u' },
        });

      mockPost
        .mockResolvedValueOnce({
          data: { id: clientId, name: 'Partial Co', clientType: 'INDIVIDUAL' },
        })
        .mockRejectedValueOnce(new Error('AccountServices save failed (500)'));

      // Silence the console.warn we emit on failure so test output stays clean.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.resetModules();
      const { createClient } = await import('../clients');

      // Act
      const result = await createClient({
        clientType: 'INDIVIDUAL',
        name: 'Partial Co',
      });

      // Assert — the function does NOT throw; it returns the Client (without
      // portfolioList) so the caller can decide how to surface the partial state.
      expect(result.id).toBe(clientId);
      expect(result.portfolioList).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(clientId),
        expect.any(Error)
      );

      // The show.json re-fetch must NOT have been attempted — we returned the
      // raw save response instead.
      const showCalls = mockGet.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === 'string' && (c[0] as string).startsWith('/client/show/')
      );
      expect(showCalls).toHaveLength(0);

      warnSpy.mockRestore();
    });

    it('propagates errors from the Client save itself (no AccountServices attempted)', async () => {
      // Arrange — first POST (Client save) rejects with a validation error.
      // The function must NOT swallow this — the user needs to see why the
      // Client could not be created.
      mockGet.mockResolvedValueOnce({
        data: { SYNCHRONIZER_TOKEN: 't', SYNCHRONIZER_URI: '/u' },
      });
      mockPost.mockRejectedValueOnce(new Error('Validation: email is required'));

      vi.resetModules();
      const { createClient } = await import('../clients');

      // Act + Assert
      await expect(
        createClient({ clientType: 'INDIVIDUAL', name: 'Bad' })
      ).rejects.toThrow(/email is required/);

      // Only the Client save POST was attempted; AccountServices was never touched.
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost.mock.calls[0][0]).toContain('/client/save');
    });
  });

  describe('listClients quick-search param (SOUP-1836)', () => {
    it('sends the search term as `q`, not `search`', async () => {
      // The backend ClientService.searchList only matches KYC subtype name fields
      // (firstName/lastName/companyName) when it receives `q`. A plain `search`
      // param only hits the base serialised match, so a name query like "alice"
      // returned no results. The endpoint must forward the term as `q`.
      mockGet.mockResolvedValueOnce({ data: [] });

      vi.resetModules();
      const { listClients } = await import('../clients');

      await listClients({ search: 'alice', clientType: 'CORPORATE' });

      expect(mockGet).toHaveBeenCalledTimes(1);
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('q=alice');
      expect(url).not.toContain('search=');
      // The type filter must still be forwarded for server-side filtering.
      expect(url).toContain('clientType=CORPORATE');
    });

    it('forwards an explicit `q` param unchanged', async () => {
      mockGet.mockResolvedValueOnce({ data: [] });

      vi.resetModules();
      const { listClients } = await import('../clients');

      await listClients({ q: 'beta corp' });

      const url = mockGet.mock.calls[0][0] as string;
      // URLSearchParams encodes the space as '+'.
      expect(url).toContain('q=beta+corp');
      expect(url).not.toContain('search=');
    });

    it('omits the search param entirely when no term is supplied', async () => {
      mockGet.mockResolvedValueOnce({ data: [] });

      vi.resetModules();
      const { listClients } = await import('../clients');

      await listClients({ max: 50, sort: 'name', order: 'asc' });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).not.toContain('q=');
      expect(url).not.toContain('search=');
      expect(url).toContain('max=50');
    });
  });

  describe('createAccountServicesForClient', () => {
    it('POSTs to /accountServices/save.json with forClient and CSRF on the URL', async () => {
      // Arrange
      mockGet.mockResolvedValueOnce({
        data: {
          SYNCHRONIZER_TOKEN: 'as-csrf-xyz',
          SYNCHRONIZER_URI: '/rest/accountServices/create',
        },
      });
      mockPost.mockResolvedValueOnce({
        data: { id: 'as-100', serialised: 'New AS' },
      });

      vi.resetModules();
      const { createAccountServicesForClient } = await import('../clients');

      // Act
      const result = await createAccountServicesForClient('client-100');

      // Assert — CSRF was fetched from create.json
      expect(mockGet).toHaveBeenCalledWith('/accountServices/create.json');

      // Assert — POST URL contains forClient + CSRF query params
      expect(mockPost).toHaveBeenCalledTimes(1);
      const [postUrl, postBody] = mockPost.mock.calls[0];
      expect(postUrl).toContain('/accountServices/save.json?');
      expect(postUrl).toContain('forClient=client-100');
      expect(postUrl).toContain('SYNCHRONIZER_TOKEN=as-csrf-xyz');
      // The backend service creates the AS + ClientPortfolio without needing
      // any custom fields when forClient is provided, so the body is empty.
      expect(postBody).toEqual({});

      // Assert — return value comes straight from response.data
      expect(result.id).toBe('as-100');
    });
  });
});
