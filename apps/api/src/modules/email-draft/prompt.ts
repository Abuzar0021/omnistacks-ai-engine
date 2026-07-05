import type { BusinessAudit } from '@prisma/client';
import { z } from 'zod';
import type { ChatMessage } from '../../lib/openrouter.js';

/** Must match docs/PROMPTS.md exactly — that document is the source of truth. */
export const PROMPT_VERSION = 'email-personalization-v1';

export const emailResponseSchema = z
  .object({
    subject: z.string().max(80),
    opener: z.string().max(300),
    factUsed: z.string().max(200).optional(),
  })
  .strict();

export type EmailResponse = z.infer<typeof emailResponseSchema>;

const SYSTEM_PROMPT = `You write concise, specific B2B outreach openers. Use one concrete fact about the
prospect or their website from the provided audit — never generic flattery. No emojis, no
exclamation marks, under 40 words for the opener.

Respond with a single JSON object matching exactly this schema — no prose, no markdown
fences, no extra keys, no renamed keys:
{
  "subject": string (max 80 chars),
  "opener": string (max 300 chars),
  "factUsed": string (optional, max 200 chars) — the concrete fact referenced, for QA/review
}`;

export interface BusinessSummary {
  name: string;
  industry: string | null;
  country: string | null;
  city: string | null;
}

interface AuditSummary {
  summary: string | null;
  score: number | null;
  reasons: unknown;
}

/**
 * Trims a BusinessAudit down to what the email prompt needs — the full
 * findings/disqualifiers detail isn't necessary to write a one-line opener.
 */
export function summarizeAuditForPrompt(audit: BusinessAudit): AuditSummary {
  return {
    summary: audit.summary,
    score: audit.score,
    reasons: audit.reasons ?? [],
  };
}

export function buildEmailPrompt(params: {
  businessContext: string;
  business: BusinessSummary;
  audit: BusinessAudit;
  tone: string;
}): ChatMessage[] {
  const auditSummary = summarizeAuditForPrompt(params.audit);
  const userPrompt = `About us and our ideal customers:
${params.businessContext}

Prospect:
${JSON.stringify(params.business)}

Our audit of their site:
${JSON.stringify(auditSummary)}

Tone: ${params.tone}`;

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

/**
 * Assembles the final email body from the operator's OUTREACH_EMAIL_TEMPLATE
 * (see docs/PROMPTS.md) by substituting the model-generated opener and the
 * configured sender name. The template body is never model-generated —
 * only the opener is personalized per docs/PROMPTS.md's design.
 */
export function assembleEmailBody(
  template: string,
  vars: { opener: string; senderName: string },
): string {
  return template
    .replaceAll('{{opener}}', vars.opener)
    .replaceAll('{{senderName}}', vars.senderName);
}
