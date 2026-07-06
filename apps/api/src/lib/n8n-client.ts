import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface OutreachSendPayload {
  businessId: string;
  emailDraftId: string;
  to: string;
  subject: string;
  body: string;
}

export type N8nClient = typeof triggerOutreachSend;

/**
 * Fire-and-forget trigger into n8n's outreach-send webhook (see docs/N8N.md,
 * workflow 01). Per that document, the API treats n8n as unavailable-tolerant:
 * a failed trigger call must never fail the caller's request — it's logged
 * and the return value tells the caller whether it actually reached n8n, so
 * the UI can surface a retry rather than silently claiming success.
 */
export async function triggerOutreachSend(payload: OutreachSendPayload): Promise<boolean> {
  try {
    const response = await fetch(`${env.N8N_API_BASE_URL}/webhook/outreach-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': env.N8N_WEBHOOK_SECRET },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`n8n outreach-send webhook failed (${response.status}): ${text}`);
    }
    return true;
  } catch (error) {
    logger.warn(
      { businessId: payload.businessId, emailDraftId: payload.emailDraftId, err: error },
      'failed to trigger n8n outreach-send webhook',
    );
    return false;
  }
}
