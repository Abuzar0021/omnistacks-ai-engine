import type { BusinessStatus } from '@prisma/client';
import { NotFoundError, UnprocessableError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  businessRepository,
  type BusinessRepository,
} from '../businesses/businesses.repository.js';
import { advanceStatus } from '../businesses/status-pipeline.js';
import {
  emailDraftRepository,
  type EmailDraftRepository,
} from '../email-draft/email-draft.repository.js';
import type { EmailReplyWebhookInput } from './webhooks.schemas.js';

const CLASSIFICATION_TARGET: Record<EmailReplyWebhookInput['classification'], BusinessStatus> = {
  replied: 'RESPONDED',
  meeting_booked: 'MEETING_BOOKED',
};

/**
 * Handlers for n8n -> API status callbacks (see docs/N8N.md). Both handlers
 * are idempotent: re-delivery of the same event is a no-op, and status
 * transitions only ever move forward (see status-pipeline.ts).
 */
export class WebhooksService {
  constructor(
    private readonly businesses: BusinessRepository = businessRepository,
    private readonly emailDrafts: EmailDraftRepository = emailDraftRepository,
  ) {}

  async handleEmailSent(businessId: string, emailDraftId: string): Promise<void> {
    const draft = await this.emailDrafts.findById(emailDraftId);
    if (!draft) throw new NotFoundError(`Email draft ${emailDraftId} not found`);
    if (draft.businessId !== businessId) {
      throw new UnprocessableError('emailDraftId does not belong to businessId');
    }

    const business = await this.businesses.findById(businessId);
    if (!business) throw new NotFoundError(`Business ${businessId} not found`);

    if (!draft.sentAt) {
      await this.emailDrafts.update(emailDraftId, { sentAt: new Date() });
    }

    const nextStatus = advanceStatus(business.status, 'EMAIL_SENT');
    if (nextStatus !== business.status) {
      await this.businesses.update(businessId, { status: nextStatus });
    }

    logger.info({ businessId, emailDraftId }, 'email-sent webhook processed');
  }

  async handleEmailReply(
    businessId: string,
    classification: EmailReplyWebhookInput['classification'],
  ): Promise<void> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new NotFoundError(`Business ${businessId} not found`);

    const target = CLASSIFICATION_TARGET[classification];
    const nextStatus = advanceStatus(business.status, target);
    if (nextStatus !== business.status) {
      await this.businesses.update(businessId, { status: nextStatus });
    }

    logger.info({ businessId, classification }, 'email-reply webhook processed');
  }
}

export const webhooksService = new WebhooksService();
