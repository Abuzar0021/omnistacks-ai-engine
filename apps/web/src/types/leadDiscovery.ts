export type LeadDiscoveryJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface LeadDiscoveryJob {
  id: string;
  status: LeadDiscoveryJobStatus;
  industry: string;
  location: string;
  country: string | null;
  limit: number;
  foundCount: number | null;
  createdCount: number | null;
  duplicateCount: number | null;
  durationMs: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartLeadDiscoveryInput {
  industry: string;
  location: string;
  country?: string;
  limit?: number;
}
