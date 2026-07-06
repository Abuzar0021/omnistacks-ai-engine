import type {
  Business,
  BusinessInput,
  BusinessStatus,
  ImportSummary,
  Pagination,
} from '../types/business';
import { apiFetch } from './client';

export interface ListBusinessesParams {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  status?: BusinessStatus | '';
  industry?: string;
  country?: string;
  tag?: string;
}

export interface BusinessListResponse {
  data: Business[];
  pagination: Pagination;
}

export function listBusinesses(params: ListBusinessesParams): Promise<BusinessListResponse> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== null) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return apiFetch<BusinessListResponse>(`/businesses${query ? `?${query}` : ''}`);
}

export async function getBusiness(id: string): Promise<Business> {
  const res = await apiFetch<{ data: Business }>(`/businesses/${id}`);
  return res.data;
}

export async function createBusiness(input: BusinessInput): Promise<Business> {
  const res = await apiFetch<{ data: Business }>('/businesses', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateBusiness(id: string, input: BusinessInput): Promise<Business> {
  const res = await apiFetch<{ data: Business }>(`/businesses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return res.data;
}

export function deleteBusiness(id: string): Promise<void> {
  return apiFetch<void>(`/businesses/${id}`, { method: 'DELETE' });
}

export async function importBusinessesCsv(csvText: string): Promise<ImportSummary> {
  const res = await apiFetch<{ data: ImportSummary }>('/businesses/import', {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
  return res.data;
}
