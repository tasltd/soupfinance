/**
 * Client API endpoints
 * Maps to soupmarkets-web /rest/client/* endpoints
 *
 * Added: Client CRUD operations for invoice recipients
 * Added: Client payment summary endpoint
 */
import apiClient, { toFormData, toQueryString } from '../client';
import type { Client, ListParams } from '../../types';

const BASE_URL = '/client';

// =============================================================================
// Client CRUD
// =============================================================================

/**
 * List clients with pagination
 * GET /rest/client/index.json
 */
export async function listClients(params?: ListParams & { search?: string }): Promise<Client[]> {
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
 * Create new client
 * POST /rest/client/save.json
 */
export async function createClient(data: Partial<Client>): Promise<Client> {
  const formData = toFormData(data as Record<string, unknown>);
  const response = await apiClient.post<Client>(`${BASE_URL}/save.json`, formData);
  return response.data;
}

/**
 * Update existing client
 * PUT /rest/client/update/:id.json
 */
export async function updateClient(id: string, data: Partial<Client>): Promise<Client> {
  const formData = toFormData({ ...data, id } as Record<string, unknown>);
  const response = await apiClient.put<Client>(`${BASE_URL}/update/${id}.json`, formData);
  return response.data;
}

/**
 * Delete client (soft delete)
 * DELETE /rest/client/delete/:id.json
 */
export async function deleteClient(id: string): Promise<void> {
  await apiClient.delete(`${BASE_URL}/delete/${id}.json`);
}

// =============================================================================
// Client Reports
// =============================================================================

/**
 * Get client invoice summary
 * GET /rest/client/invoiceSummary/:id.json
 */
export async function getClientInvoiceSummary(clientId: string): Promise<{
  client: Client;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  invoices: Array<{ id: string; invoiceNumber: string; amount: number; status: string }>;
}> {
  const response = await apiClient.get(`${BASE_URL}/invoiceSummary/${clientId}.json`);
  return response.data;
}
