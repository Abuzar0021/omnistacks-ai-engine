import type { Pagination } from '../types/business';
import type { LeadDiscoveryJob, StartLeadDiscoveryInput } from '../types/leadDiscovery';
import { apiFetch } from './client';

export interface ListLeadDiscoveryJobsResponse {
  data: LeadDiscoveryJob[];
  pagination: Pagination;
}

export async function startLeadDiscovery(
  input: StartLeadDiscoveryInput,
): Promise<LeadDiscoveryJob> {
  const res = await apiFetch<{ data: LeadDiscoveryJob }>('/lead-discovery', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function getLeadDiscoveryJob(id: string): Promise<LeadDiscoveryJob> {
  const res = await apiFetch<{ data: LeadDiscoveryJob }>(`/lead-discovery/${id}`);
  return res.data;
}

export function listLeadDiscoveryJobs(
  page = 1,
  limit = 10,
): Promise<ListLeadDiscoveryJobsResponse> {
  return apiFetch<ListLeadDiscoveryJobsResponse>(`/lead-discovery?page=${page}&limit=${limit}`);
}
