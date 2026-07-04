import type { Pagination } from '../types/business';
import type { BusinessAudit } from '../types/businessAudit';
import { apiFetch } from './client';

export interface ListBusinessAuditsResponse {
  data: BusinessAudit[];
  pagination: Pagination;
}

export async function startBusinessAudit(businessId: string): Promise<BusinessAudit> {
  const res = await apiFetch<{ data: BusinessAudit }>(`/businesses/${businessId}/audits`, {
    method: 'POST',
  });
  return res.data;
}

export async function getBusinessAudit(id: string): Promise<BusinessAudit> {
  const res = await apiFetch<{ data: BusinessAudit }>(`/business-audits/${id}`);
  return res.data;
}

export function listBusinessAudits(
  businessId: string,
  page = 1,
  limit = 10,
): Promise<ListBusinessAuditsResponse> {
  return apiFetch<ListBusinessAuditsResponse>(
    `/businesses/${businessId}/audits?page=${page}&limit=${limit}`,
  );
}
