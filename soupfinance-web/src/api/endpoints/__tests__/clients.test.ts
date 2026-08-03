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

    it('injects the created AccountServices FK when the show re-fetch omits it (SOUPFIN-28)', async () => {
      // Regression for SOUPFIN-28: the backend `/rest/client/show` endpoint omits
      // `accountServices` from portfolio entries. Before the fix, createClient()
      // discarded the AccountServices object returned by step 3 and relied solely
      // on the re-fetch — so the FK was lost and the invoice form saw the client as
      // having no linked account services. The captured AccountServices id must be
      // back-filled into portfolioList[0].accountServices.
      const clientId = 'omit-client-uuid';
      const accountServicesId = 'omit-as-uuid';

      mockGet
        // CSRF for client/save
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 'c-tok', SYNCHRONIZER_URI: '/u' },
        })
        // CSRF for accountServices/save
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 'as-tok', SYNCHRONIZER_URI: '/u' },
        })
        // Re-fetch: portfolio entry EXISTS but has NO accountServices (the bug)
        .mockResolvedValueOnce({
          data: {
            id: clientId,
            name: 'Omit Co',
            clientType: 'CORPORATE',
            portfolioList: [{ id: 'cp-uuid', serialised: 'Portfolio' }],
          },
        });

      mockPost
        .mockResolvedValueOnce({
          data: { id: clientId, name: 'Omit Co', clientType: 'CORPORATE' },
        })
        .mockResolvedValueOnce({
          data: {
            id: accountServicesId,
            serialised: 'Direct Account : Corporate(Omit Co)',
            class: 'soupbroker.kyc.AccountServices',
          },
        });

      vi.resetModules();
      const { createClient } = await import('../clients');

      const result = await createClient({
        clientType: 'CORPORATE',
        name: 'Omit Co',
      });

      // The captured AccountServices id is present despite the show omission,
      // so the invoice form's portfolioList[0].accountServices.id resolves.
      expect(result.portfolioList?.[0]?.accountServices?.id).toBe(accountServicesId);
      expect(result.portfolioList?.[0]?.accountServices?.serialised).toBe(
        'Direct Account : Corporate(Omit Co)'
      );
      // The existing portfolio-entry metadata is preserved (back-fill, not replace).
      expect(result.portfolioList?.[0]?.id).toBe('cp-uuid');
      expect(result.portfolioList?.[0]?.serialised).toBe('Portfolio');
    });

    it('creates a portfolio entry when the show re-fetch returns no portfolioList (SOUPFIN-28)', async () => {
      // Edge case: the show endpoint returns a client with no portfolioList at all.
      // The captured AccountServices must still be attached so the FK resolves.
      const clientId = 'no-portfolio-uuid';
      const accountServicesId = 'no-portfolio-as-uuid';

      mockGet
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 'c-tok', SYNCHRONIZER_URI: '/u' },
        })
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 'as-tok', SYNCHRONIZER_URI: '/u' },
        })
        // Re-fetch with NO portfolioList field at all
        .mockResolvedValueOnce({
          data: { id: clientId, name: 'No PL Co', clientType: 'INDIVIDUAL' },
        });

      mockPost
        .mockResolvedValueOnce({
          data: { id: clientId, name: 'No PL Co', clientType: 'INDIVIDUAL' },
        })
        .mockResolvedValueOnce({
          data: { id: accountServicesId, serialised: 'Direct Account : Individual(No PL Co)' },
        });

      vi.resetModules();
      const { createClient } = await import('../clients');

      const result = await createClient({
        clientType: 'INDIVIDUAL',
        name: 'No PL Co',
      });

      expect(result.portfolioList).toHaveLength(1);
      expect(result.portfolioList?.[0]?.accountServices?.id).toBe(accountServicesId);
      // Falls back to the known domain class when the backend omits `class`.
      expect(result.portfolioList?.[0]?.accountServices?.class).toBe(
        'soupbroker.kyc.AccountServices'
      );
    });

    it('preserves a backend-supplied accountServices FK on the re-fetch (SOUPFIN-28)', async () => {
      // When the backend show endpoint DOES include accountServices (already fixed
      // server-side), the injection must not clobber it — keep what the backend sent.
      const clientId = 'preserve-client-uuid';
      const backendAsId = 'backend-as-uuid';
      const createdAsId = 'created-as-uuid';

      mockGet
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 'c-tok', SYNCHRONIZER_URI: '/u' },
        })
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 'as-tok', SYNCHRONIZER_URI: '/u' },
        })
        // Re-fetch already carries the FK — the backend supplied it
        .mockResolvedValueOnce({
          data: {
            id: clientId,
            name: 'Preserve Co',
            clientType: 'CORPORATE',
            portfolioList: [
              {
                id: 'cp-uuid',
                accountServices: { id: backendAsId, serialised: 'Backend AS' },
              },
            ],
          },
        });

      mockPost
        .mockResolvedValueOnce({
          data: { id: clientId, name: 'Preserve Co', clientType: 'CORPORATE' },
        })
        .mockResolvedValueOnce({
          data: { id: createdAsId, serialised: 'Created AS' },
        });

      vi.resetModules();
      const { createClient } = await import('../clients');

      const result = await createClient({
        clientType: 'CORPORATE',
        name: 'Preserve Co',
      });

      // The backend-supplied FK wins over the freshly-created one.
      expect(result.portfolioList?.[0]?.accountServices?.id).toBe(backendAsId);
    });

    it('still returns a resolvable link when the show re-fetch fails (SOUPFIN-28)', async () => {
      // If the client re-fetch throws, fall back to the save response and STILL
      // inject the captured AccountServices so the FK is resolvable.
      const clientId = 'refetch-fail-uuid';
      const accountServicesId = 'refetch-fail-as-uuid';

      mockGet
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 'c-tok', SYNCHRONIZER_URI: '/u' },
        })
        .mockResolvedValueOnce({
          data: { SYNCHRONIZER_TOKEN: 'as-tok', SYNCHRONIZER_URI: '/u' },
        })
        // Re-fetch (GET /client/show) rejects
        .mockRejectedValueOnce(new Error('show re-fetch failed (500)'));

      mockPost
        .mockResolvedValueOnce({
          data: { id: clientId, name: 'Refetch Fail Co', clientType: 'INDIVIDUAL' },
        })
        .mockResolvedValueOnce({
          data: { id: accountServicesId, serialised: 'Direct Account' },
        });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.resetModules();
      const { createClient } = await import('../clients');

      const result = await createClient({
        clientType: 'INDIVIDUAL',
        name: 'Refetch Fail Co',
      });

      expect(result.id).toBe(clientId);
      expect(result.portfolioList?.[0]?.accountServices?.id).toBe(accountServicesId);
      warnSpy.mockRestore();
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

  // ==========================================================================
  // SOUPFIN-27: portfolio-based accountServices resolution + display name
  // ==========================================================================
  describe('getClientPortfolio (SOUPFIN-27)', () => {
    it('GETs /clientPortfolio/show/{id}.json and returns the nested accountServices FK', async () => {
      mockGet.mockResolvedValueOnce({
        data: { id: 'pf-1', accountServices: { id: 'as-9', serialised: 'Acme' } },
      });
      vi.resetModules();
      const { getClientPortfolio } = await import('../clients');

      const result = await getClientPortfolio('pf-1');

      expect(mockGet).toHaveBeenCalledWith('/clientPortfolio/show/pf-1.json');
      expect(result.accountServices?.id).toBe('as-9');
    });
  });

  describe('resolveAccountServicesId (SOUPFIN-27)', () => {
    it('returns the nested FK directly when the list already carries it (no fetch)', async () => {
      vi.resetModules();
      const { resolveAccountServicesId } = await import('../clients');
      const client = {
        id: 'c-1',
        name: 'Has Nested',
        clientType: 'CORPORATE' as const,
        portfolioList: [{ id: 'pf-1', accountServices: { id: 'as-nested' } }],
      };

      const id = await resolveAccountServicesId(client as never);

      expect(id).toBe('as-nested');
      // No portfolio fetch needed when the FK is already present.
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('fetches the portfolio detail when the list omits accountServices (the real backend shape)', async () => {
      mockGet.mockResolvedValueOnce({
        data: { id: 'pf-2', accountServices: { id: 'as-fetched' } },
      });
      vi.resetModules();
      const { resolveAccountServicesId } = await import('../clients');
      const client = {
        id: 'c-2',
        name: 'Bare Ref',
        clientType: 'CORPORATE' as const,
        portfolioList: [{ id: 'pf-2', serialised: 'ref only' }], // no accountServices
      };

      const id = await resolveAccountServicesId(client as never);

      expect(mockGet).toHaveBeenCalledWith('/clientPortfolio/show/pf-2.json');
      expect(id).toBe('as-fetched');
    });

    it('returns empty string when the client has no portfolio at all', async () => {
      vi.resetModules();
      const { resolveAccountServicesId } = await import('../clients');
      const client = { id: 'c-3', name: 'No Portfolio', clientType: 'CORPORATE' as const };

      const id = await resolveAccountServicesId(client as never);

      expect(id).toBe('');
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('getClientDisplayName (SOUPFIN-27)', () => {
    it('prefers the client name when present', async () => {
      vi.resetModules();
      const { getClientDisplayName } = await import('../clients');
      expect(getClientDisplayName({ name: 'Acme Corp' } as never)).toBe('Acme Corp');
    });

    it('falls back to firstName + lastName for individuals with a blank name', async () => {
      vi.resetModules();
      const { getClientDisplayName } = await import('../clients');
      expect(
        getClientDisplayName({ name: '', firstName: 'Ada', lastName: 'Lovelace' } as never)
      ).toBe('Ada Lovelace');
    });

    it('falls back to companyName, then email, then a stable placeholder', async () => {
      vi.resetModules();
      const { getClientDisplayName } = await import('../clients');
      expect(getClientDisplayName({ name: '', companyName: 'Globex' } as never)).toBe('Globex');
      expect(getClientDisplayName({ name: '', email: 'a@b.co' } as never)).toBe('a@b.co');
      expect(getClientDisplayName({ name: '' } as never)).toBe('Unnamed client');
    });
  });
});
