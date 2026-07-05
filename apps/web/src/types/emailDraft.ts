export type EmailDraftStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface EmailDraft {
  id: string;
  businessId: string;
  businessAuditId: string;
  status: EmailDraftStatus;
  promptVersion: string;
  model: string | null;
  subject: string | null;
  opener: string | null;
  factUsed: string | null;
  body: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}
