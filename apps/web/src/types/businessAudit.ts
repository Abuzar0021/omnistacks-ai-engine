export type BusinessAuditStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface AuditFinding {
  category:
    'seo' | 'performance' | 'design' | 'content' | 'technology' | 'contact' | 'trust' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface BusinessAudit {
  id: string;
  businessId: string;
  websiteAnalysisId: string;
  status: BusinessAuditStatus;
  promptVersion: string;
  model: string | null;
  summary: string | null;
  findings: AuditFinding[] | null;
  score: number | null;
  confidence: 'low' | 'medium' | 'high' | null;
  reasons: string[] | null;
  disqualifiers: string[] | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
