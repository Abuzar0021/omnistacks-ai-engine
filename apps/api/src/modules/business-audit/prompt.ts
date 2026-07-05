import type { WebsiteAnalysis } from '@prisma/client';
import { z } from 'zod';
import type { ChatMessage } from '../../lib/openrouter.js';

/** Must match docs/PROMPTS.md exactly — that document is the source of truth. */
export const PROMPT_VERSION = 'business-audit-v1';

const FINDING_CATEGORIES = [
  'seo',
  'performance',
  'design',
  'content',
  'technology',
  'contact',
  'trust',
  'other',
] as const;

const findingSchema = z
  .object({
    category: z.enum(FINDING_CATEGORIES),
    severity: z.enum(['low', 'medium', 'high']),
    description: z.string().max(300),
  })
  .strict();

export const auditResponseSchema = z
  .object({
    summary: z.string().max(500),
    findings: z.array(findingSchema),
    score: z.number().int().min(0).max(100),
    confidence: z.enum(['low', 'medium', 'high']),
    reasons: z.array(z.string().max(200)).min(1).max(5),
    disqualifiers: z.array(z.string().max(200)).optional(),
  })
  .strict();

export type AuditResponse = z.infer<typeof auditResponseSchema>;

const SYSTEM_PROMPT = `You are a B2B opportunity auditor. Given a description of our business and our ideal
customers, and structured data collected from a prospect's website, assess how well they
fit and what opportunity exists to help them. Every finding must cite something present in
the provided data — do not invent facts.

Respond with a single JSON object matching exactly this schema — no prose, no markdown
fences, no extra keys, no renamed keys:
{
  "summary": string (max 500 chars),
  "findings": [{ "category": "seo" | "performance" | "design" | "content" | "technology" | "contact" | "trust" | "other", "severity": "low" | "medium" | "high", "description": string (max 300 chars) }],
  "score": integer 0-100,
  "confidence": "low" | "medium" | "high",
  "reasons": string[] (1 to 5 items, each max 200 chars),
  "disqualifiers": string[] (optional, each max 200 chars) — hard blockers if any (wrong geography, competitor, already a client, ...)
}`;

export interface BusinessSummary {
  name: string;
  industry: string | null;
  country: string | null;
  city: string | null;
}

interface AnalysisSummary {
  title: string | null;
  metaDescription: string | null;
  headings: { h1: string[]; h2: string[] };
  technologies: unknown;
  internalLinkCount: number;
  externalLinkCount: number;
  hasContactForm: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasSocialLinks: boolean;
}

function jsonArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Trims a WebsiteAnalysis down to what the audit prompt needs — keeps the
 * prompt small and avoids paying to re-send data the model doesn't use.
 */
export function summarizeAnalysisForPrompt(analysis: WebsiteAnalysis): AnalysisSummary {
  const headings = analysis.headings as { h1?: string[]; h2?: string[] } | null;

  return {
    title: analysis.title,
    metaDescription: analysis.metaDescription,
    headings: { h1: headings?.h1 ?? [], h2: headings?.h2 ?? [] },
    technologies: analysis.technologies ?? [],
    internalLinkCount: jsonArrayLength(analysis.internalLinks),
    externalLinkCount: jsonArrayLength(analysis.externalLinks),
    hasContactForm: jsonArrayLength(analysis.contactForms) > 0,
    hasEmail: jsonArrayLength(analysis.emails) > 0,
    hasPhone: jsonArrayLength(analysis.phones) > 0,
    hasSocialLinks: jsonArrayLength(analysis.socialLinks) > 0,
  };
}

export function buildAuditPrompt(params: {
  businessContext: string;
  business: BusinessSummary;
  analysis: WebsiteAnalysis;
}): ChatMessage[] {
  const summary = summarizeAnalysisForPrompt(params.analysis);
  const userPrompt = `About us and our ideal customers:
${params.businessContext}

Prospect:
${JSON.stringify(params.business)}

Website data collected:
${JSON.stringify(summary)}`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
}

/** Appended to the conversation on a validation-failure retry. */
export function buildRetryMessage(validationError: string): ChatMessage {
  return {
    role: 'user',
    content: `Your previous response did not match the required schema: ${validationError}\nRespond again with ONLY a single valid JSON object matching the schema — no prose, no markdown fences.`,
  };
}
