export const BUSINESS_STATUSES = [
  'NEW',
  'ANALYZED',
  'AUDITED',
  'EMAIL_DRAFTED',
  'EMAIL_SENT',
  'RESPONDED',
  'MEETING_BOOKED',
  'CLIENT',
  'ARCHIVED',
] as const;

export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

export interface Business {
  id: string;
  name: string;
  website: string | null;
  domain: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  status: BusinessStatus;
  /** Denormalized from the latest completed business audit. */
  score: number | null;
  notes: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface BusinessInput {
  name?: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  status?: BusinessStatus;
  notes?: string | null;
  tags?: string[];
}

export interface ImportSummary {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; field?: string; message: string }>;
  duplicates: Array<{ row: number; domain: string; reason: string }>;
}
