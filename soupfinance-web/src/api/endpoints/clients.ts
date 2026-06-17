/**
 * Client API endpoints for SoupFinance
 *
 * ARCHITECTURE:
 * In SoupFinance, "clients" are KYC Client entities from the Grails backend
 * (soupbroker.kyc.Client). Each Client can own one or more AccountServices.
 *
 * Invoices reference accountServices.id as the FK, but client metadata
 * (name, email, phone, address) comes from the Client entity.
 *
 * Endpoints:
 *   - /rest/client/index.json         → List KYC clients
 *   - /rest/client/show/:id.json      → Get single KYC client
 *   - /rest/client/save.json          → Create new KYC client
 *   - /rest/accountServices/show/:id.json → Get single account services
 */
import apiClient, { toQueryString, getCsrfToken, csrfQueryString } from '../client';
import type { ListParams, AccountServices, Client } from '../../types';

const BASE_URL = '/client';

// =============================================================================
// AccountServices (the invoice FK reference)
// =============================================================================

/**
 * Get single account services by ID
 * GET /rest/accountServices/show/:id.json
 */
export async function getAccountServices(id: string): Promise<AccountServices> {
  const response = await apiClient.get<AccountServices>(`/accountServices/show/${id}.json`);
  return response.data;
}

/**
 * Create an AccountServices record linked to an existing Client.
 * POST /rest/accountServices/save.json?forClient={clientId}
 *
 * The backend `AccountServicesService.doSave` automatically creates a
 * ClientPortfolio join row when the `forClient` query param is present
 * (see soupmarkets-web AccountServicesService.groovy doSave).
 *
 * Used by `createClient` to ensure every newly-created Client has at least
 * one AccountServices, since invoices reference accountServices.id as FK.
 */
export async function createAccountServicesForClient(clientId: string): Promise<AccountServices> {
  const csrf = await getCsrfToken('accountServices');
  const queryParams = new URLSearchParams({
    forClient: clientId,
    SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
    SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
  });
  const response = await apiClient.post<AccountServices>(
    `/accountServices/save.json?${queryParams.toString()}`,
    {}
  );
  return response.data;
}

// =============================================================================
// Client CRUD (KYC Client - the billing recipient with metadata)
// =============================================================================

/**
 * List clients
 * GET /rest/client/index.json
 *
 * Returns Client entities with name, email, phone, address, clientType.
 * Each Client is linked to AccountServices for invoice FK reference.
 */
export async function listClients(
  params?: ListParams & { search?: string; q?: string; clientType?: string }
): Promise<Client[]> {
  // Fix (SOUP-1836): The clients quick-search must use the `q` parameter, NOT
  // `search`. The backend ClientService.searchList (SOUP-1818) only matches the
  // KYC subtype name fields (Individual firstName/lastName, Corporate/ITF name)
  // when it receives `q` — it mirrors `q` onto both the subtype-name match AND
  // the base `serialised` match. The plain `search` param only hits the base
  // Client.serialised/id path, so a first-name query like "alice" returned
  // "No clients match your filters" even though the client exists. Map any
  // caller-supplied `search` onto `q` so both paths run.
  const normalized: Record<string, unknown> | undefined = params
    ? { ...params }
    : undefined;
  if (normalized) {
    const term = normalized.q ?? normalized.search;
    if (term) normalized.q = term;
    delete normalized.search;
  }
  const query = normalized ? `?${toQueryString(normalized)}` : '';
  const response = await apiClient.get<Client[]>(`${BASE_URL}/index.json${query}`);
  return response.data;
}

/**
 * Get single client by ID
 * GET /rest/client/show/:id.json
 */
export async function getClient(id: string): Promise<Client> {
  const response = await apiClient.get<Client>(`${BASE_URL}/show/${id}.json`);
  return response.data;
}

/**
 * Create a new client AND its initial AccountServices.
 * POST /rest/client/save.json + POST /rest/accountServices/save.json?forClient={id}
 *
 * Fix (SOUPFIN-1): The backend `ClientController.save` only saves the Client —
 * it does NOT auto-create AccountServices. Since invoices reference
 * `accountServices.id` as their FK, a Client without AccountServices cannot
 * have invoices raised against it ("This client has no linked account services").
 *
 * This function performs the full two-step create so the returned Client always
 * has at least one entry in `portfolioList[].accountServices`.
 *
 * Steps:
 *   1. POST /rest/client/save.json (CSRF-protected) → creates the Client
 *   2. POST /rest/accountServices/save.json?forClient={id} → creates AccountServices
 *      and the ClientPortfolio join row that links them
 *   3. GET /rest/client/show/{id}.json → re-fetch so portfolioList is populated
 *
 * If step 2 fails the Client is still returned (it can be repaired later via the
 * full Client management page), but the caller will see the missing-AccountServices
 * warning until the link is created.
 */
export async function createClient(data: Record<string, unknown>): Promise<Client> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('client');

  // Step 2: POST with CSRF token as query params (Grails withForm pattern)
  const response = await apiClient.post<Client>(
    `${BASE_URL}/save.json?${csrfQueryString(csrf)}`,
    data
  );
  const newClient = response.data;

  // Step 3 (Fix SOUPFIN-1): Create the AccountServices and ClientPortfolio link.
  // Without this, the new Client has no `portfolioList[].accountServices` and
  // cannot be selected as an invoice recipient.
  try {
    await createAccountServicesForClient(newClient.id);
  } catch (error) {
    // Non-fatal: the Client exists and can be repaired manually. Surface a
    // warning so the user-facing error path stays informative.
    console.warn(
      `[createClient] Client ${newClient.id} created but AccountServices link failed:`,
      error
    );
    return newClient;
  }

  // Step 4: Re-fetch so `portfolioList` reflects the new ClientPortfolio row.
  return await getClient(newClient.id);
}

/**
 * Update an existing client
 * PUT /rest/client/update/:id.json
 */
export async function updateClient(id: string, data: Record<string, unknown>): Promise<Client> {
  const response = await apiClient.put<Client>(
    `${BASE_URL}/update/${id}.json`,
    data
  );
  return response.data;
}

/**
 * Delete a client
 * DELETE /rest/client/delete/:id.json
 */
export async function deleteClient(id: string): Promise<void> {
  await apiClient.delete(`${BASE_URL}/delete/${id}.json`);
}

/**
 * Extract display name from an AccountServices serialised string.
 * e.g. "Direct Account : Corporate(Acme Corp) | Growth Portfolio" → uses as-is
 */
export function getAccountServicesDisplayName(serialised?: string): string {
  if (!serialised) return 'N/A';
  return serialised;
}

// =============================================================================
// Re-exports from types (for backward compatibility imports)
// =============================================================================

// Changed: Renamed from InvoiceClient/InvoiceClientType to Client/ClientType
export type { Client, ClientType } from '../../types';
export type ClientInput = Record<string, unknown>;
