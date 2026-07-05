import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { UnauthenticatedError } from '../../lib/errors.js';

/** Constant-time string comparison — avoids leaking secret length/content via timing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Rejects requests missing a valid X-Webhook-Secret header (see docs/N8N.md). */
export function requireWebhookSecret(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.header('X-Webhook-Secret');
  if (!provided || !safeEqual(provided, env.N8N_WEBHOOK_SECRET)) {
    throw new UnauthenticatedError('Missing or invalid webhook secret');
  }
  next();
}
