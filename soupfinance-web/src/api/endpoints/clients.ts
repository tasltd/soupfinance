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
export async function listClients(params?: ListParams & { search?: string; clientType?: string }): Promise<Client[]> {
  const query = params ? `?${toQueryString(params)}` : '';
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
 * Create a new client
 * POST /rest/client/save.json
 *
 * CSRF Token Required: Calls create.json first to get SYNCHRONIZER_TOKEN.
 * Backend creates a KYC Client entity with associated AccountServices.
 */
export async function createClient(data: Record<string, unknown>): Promise<Client> {
  // Step 1: Get CSRF token from create endpoint
  const csrf = await getCsrfToken('client');

  // Step 2: POST with CSRF token as query params (Grails withForm pattern)
  const response = await apiClient.post<Client>(
    `${BASE_URL}/save.json?${csrfQueryString(csrf)}`,
    data
  );
  return response.data;
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
