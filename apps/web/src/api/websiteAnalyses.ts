import type { Pagination } from '../types/business';
import type { ScreenshotMeta, WebsiteAnalysis } from '../types/websiteAnalysis';
import { apiFetch } from './client';

export interface ListWebsiteAnalysesResponse {
  data: WebsiteAnalysis[];
  pagination: Pagination;
}

export async function startWebsiteAnalysis(businessId: string): Promise<WebsiteAnalysis> {
  const res = await apiFetch<{ data: WebsiteAnalysis }>(
    `/businesses/${businessId}/website-analyses`,
    {
      method: 'POST',
    },
  );
  return res.data;
}

export async function getWebsiteAnalysis(id: string): Promise<WebsiteAnalysis> {
  const res = await apiFetch<{ data: WebsiteAnalysis }>(`/website-analyses/${id}`);
  return res.data;
}

export function listWebsiteAnalyses(
  businessId: string,
  page = 1,
  limit = 10,
): Promise<ListWebsiteAnalysesResponse> {
  return apiFetch<ListWebsiteAnalysesResponse>(
    `/businesses/${businessId}/website-analyses?page=${page}&limit=${limit}`,
  );
}

export async function getScreenshotMeta(id: string): Promise<ScreenshotMeta> {
  const res = await apiFetch<{ data: ScreenshotMeta }>(`/website-analyses/${id}/screenshot`);
  return res.data;
}
