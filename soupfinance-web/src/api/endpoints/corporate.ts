/**
 * Corporate API endpoints
 * Maps to soupmarkets-web /rest/corporate/* endpoints
 * Handles corporate KYC onboarding flow
 */
import apiClient, { toQueryString } from '../client';
import type { Corporate, CorporateAccountPerson, CorporateDocuments, ListParams } from '../../types';

const CORPORATE_URL = '/corporate';
const PERSON_URL = '/corporateAccountPerson';
const DOCUMENTS_URL = '/corporateDocuments';

// =============================================================================
// Corporate CRUD
// =============================================================================

/**
 * Create new corporate registration
 * POST /rest/corporate/save.json
 */
export async function createCorporate(data: Partial<Corporate>): Promise<Corporate> {
  const response = await apiClient.post<Corporate>(`${CORPORATE_URL}/save.json`, data);
  return response.data;
}

/**
 * Get single corporate by ID
 * GET /rest/corporate/show/:id.json
 */
export async function getCorporate(id: string): Promise<Corporate> {
  const response = await apiClient.get<Corporate>(`${CORPORATE_URL}/show/${id}.json`);
  return response.data;
}

/**
 * Update existing corporate
 * PUT /rest/corporate/update/:id.json
 */
export async function updateCorporate(id: string, data: Partial<Corporate>): Promise<Corporate> {
  const response = await apiClient.put<Corporate>(`${CORPORATE_URL}/update/${id}.json`, { ...data, id });
  return response.data;
}

/**
 * Get current user's corporate (for onboarding flow)
 * GET /rest/corporate/current.json
 */
export async function getCurrentCorporate(): Promise<Corporate | null> {
  try {
    const response = await apiClient.get<Corporate>(`${CORPORATE_URL}/current.json`);
    return response.data;
  } catch {
    // Returns null if no corporate found for current user
    return null;
  }
}

// =============================================================================
// Corporate Account Persons (Directors/Signatories)
// =============================================================================

/**
 * List directors/signatories for a corporate
 * GET /rest/corporateAccountPerson/index.json?corporate.id=:id
 */
export async function listDirectors(corporateId: string, params?: ListParams): Promise<CorporateAccountPerson[]> {
  const baseParams = { 'corporate.id': corporateId, ...params };
  const query = `?${toQueryString(baseParams)}`;
  const response = await apiClient.get<CorporateAccountPerson[]>(`${PERSON_URL}/index.json${query}`);
  return response.data;
}

/**
 * Get single director by ID
 * GET /rest/corporateAccountPerson/show/:id.json
 */
export async function getDirector(id: string): Promise<CorporateAccountPerson> {
  const response = await apiClient.get<CorporateAccountPerson>(`${PERSON_URL}/show/${id}.json`);
  return response.data;
}

/**
 * Add new director/signatory
 * POST /rest/corporateAccountPerson/save.json
 */
export async function addDirector(data: Partial<CorporateAccountPerson>): Promise<CorporateAccountPerson> {
  const response = await apiClient.post<CorporateAccountPerson>(`${PERSON_URL}/save.json`, data);
  return response.data;
}

/**
 * Update existing director/signatory
 * PUT /rest/corporateAccountPerson/update/:id.json
 */
export async function updateDirector(id: string, data: Partial<CorporateAccountPerson>): Promise<CorporateAccountPerson> {
  const response = await apiClient.put<CorporateAccountPerson>(`${PERSON_URL}/update/${id}.json`, { ...data, id });
  return response.data;
}

/**
 * Remove director/signatory (soft delete)
 * DELETE /rest/corporateAccountPerson/delete/:id.json
 */
export async function deleteDirector(id: string): Promise<void> {
  await apiClient.delete(`${PERSON_URL}/delete/${id}.json`);
}

// =============================================================================
// Corporate Documents
// =============================================================================

/**
 * List documents for a corporate
 * GET /rest/corporateDocuments/index.json?corporate.id=:id
 */
export async function listDocuments(corporateId: string): Promise<CorporateDocuments[]> {
  const response = await apiClient.get<CorporateDocuments[]>(
    `${DOCUMENTS_URL}/index.json?corporate.id=${corporateId}`
  );
  return response.data;
}

/**
 * Upload document for corporate
 * POST /rest/corporateDocuments/save.json
 * NOTE: Uses multipart/form-data for file upload
 */
export async function uploadDocument(
  corporateId: string,
  file: File,
  documentType: CorporateDocuments['documentType']
): Promise<CorporateDocuments> {
  const formData = new FormData();
  formData.append('corporate.id', corporateId);
  formData.append('documentType', documentType);
  formData.append('file', file);
  formData.append('fileName', file.name);

  const response = await apiClient.post<CorporateDocuments>(`${DOCUMENTS_URL}/save.json`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
}

/**
 * Delete document (soft delete)
 * DELETE /rest/corporateDocuments/delete/:id.json
 */
export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`${DOCUMENTS_URL}/delete/${id}.json`);
}

// =============================================================================
// KYC Status & Actions
// =============================================================================

/**
 * Submit corporate KYC for review
 * POST /rest/corporate/submitKyc/:id.json
 */
export async function submitKyc(corporateId: string): Promise<Corporate> {
  const response = await apiClient.post<Corporate>(`${CORPORATE_URL}/submitKyc/${corporateId}.json`);
  return response.data;
}
