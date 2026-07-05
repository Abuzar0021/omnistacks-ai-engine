import type { Pagination } from '../types/business';
import type { EmailDraft } from '../types/emailDraft';
import { apiFetch } from './client';

export interface ListEmailDraftsResponse {
  data: EmailDraft[];
  pagination: Pagination;
}

export interface SendEmailDraftResponse {
  data: EmailDraft;
  triggered: boolean;
}

export async function startEmailDraft(businessId: string): Promise<EmailDraft> {
  const res = await apiFetch<{ data: EmailDraft }>(`/businesses/${businessId}/email-drafts`, {
    method: 'POST',
  });
  return res.data;
}

export async function getEmailDraft(id: string): Promise<EmailDraft> {
  const res = await apiFetch<{ data: EmailDraft }>(`/email-drafts/${id}`);
  return res.data;
}

export function listEmailDrafts(
  businessId: string,
  page = 1,
  limit = 10,
): Promise<ListEmailDraftsResponse> {
  return apiFetch<ListEmailDraftsResponse>(
    `/businesses/${businessId}/email-drafts?page=${page}&limit=${limit}`,
  );
}

export function sendEmailDraft(id: string): Promise<SendEmailDraftResponse> {
  return apiFetch<SendEmailDraftResponse>(`/email-drafts/${id}/send`, { method: 'POST' });
}
