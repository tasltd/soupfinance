/**
 * getClientDisplayName — resolve a never-blank display name for a KYC Client.
 *
 * Why this exists (SOUP-1929 / SOUPFIN-14):
 * The backend `/rest/client/index.json` (and sometimes `show`) payload omits the
 * computed `name` field. Anywhere we show a client's name — table rows, the
 * delete confirmation dialog, the detail header — must fall back so the UI never
 * renders blank (the delete dialog was showing "Are you sure you want to
 * delete ?" with no name).
 *
 * Fallback order: name → firstName + lastName → companyName → email → placeholder.
 * Pure function so it can be reused by ClientListPage + ClientDetailPage and unit
 * tested in isolation.
 */
import type { Client } from '../../types';

export function getClientDisplayName(client: Pick<
  Client,
  'name' | 'firstName' | 'lastName' | 'companyName' | 'email'
>): string {
  if (client.name?.trim()) return client.name.trim();
  const fullName = `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
  if (fullName) return fullName;
  if (client.companyName?.trim()) return client.companyName.trim();
  return client.email?.trim() || 'Unnamed client';
}
