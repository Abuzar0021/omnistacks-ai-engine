import type { BusinessStatus } from '@prisma/client';

/**
 * Forward order of the core pipeline. ARCHIVED is a terminal side-branch
 * reachable from any stage (see docs/DATABASE.md) and is intentionally
 * excluded — it must never be auto-advanced into or out of by pipeline logic.
 */
export const PIPELINE_ORDER: readonly BusinessStatus[] = [
  'NEW',
  'ANALYZED',
  'AUDITED',
  'EMAIL_DRAFTED',
  'EMAIL_SENT',
  'RESPONDED',
  'MEETING_BOOKED',
  'CLIENT',
];

/**
 * Returns `target` if it is strictly ahead of `current` in the pipeline order;
 * otherwise returns `current` unchanged. Used by webhook-driven transitions
 * (email sent, reply received) where delivery can be out of order or
 * duplicated — this makes advancing idempotent and never regresses a business
 * that has already moved further down the pipeline (or been ARCHIVED).
 */
export function advanceStatus(current: BusinessStatus, target: BusinessStatus): BusinessStatus {
  const currentRank = PIPELINE_ORDER.indexOf(current);
  const targetRank = PIPELINE_ORDER.indexOf(target);
  if (currentRank === -1 || targetRank === -1) return current;
  return targetRank > currentRank ? target : current;
}
