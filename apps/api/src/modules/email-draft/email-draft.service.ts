import type { Business, BusinessAudit, EmailDraft } from '@prisma/client';
import { env } from '../../config/env.js';
import { ConcurrencyLimiter } from '../../lib/concurrency-limiter.js';
import { NotFoundError, UnprocessableError } from '../../lib/errors.js';
import { callJsonWithRetry, type ChatFn } from '../../lib/llm-json.js';
import { logger } from '../../lib/logger.js';
import { chatCompletion } from '../../lib/openrouter.js';
import { triggerOutreachSend, type N8nClient } from '../../lib/n8n-client.js';
import {
  businessAuditRepository,
  type BusinessAuditRepository,
} from '../business-audit/business-audit.repository.js';
import {
  businessRepository,
  type BusinessRepository,
} from '../businesses/businesses.repository.js';
import {
  assembleEmailBody,
  buildEmailPrompt,
  buildRetryMessage,
  emailResponseSchema,
  PROMPT_VERSION,
} from './prompt.js';
import { emailDraftRepository, type EmailDraftRepository } from './email-draft.repository.js';

export interface EmailDraftListResult {
  items: EmailDraft[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SendResult {
  draft: EmailDraft;
  triggered: boolean;
}

export class EmailDraftService {
  private readonly limiter: ConcurrencyLimiter;

  constructor(
    private readonly repo: EmailDraftRepository = emailDraftRepository,
    private readonly businesses: BusinessRepository = businessRepository,
    private readonly audits: BusinessAuditRepository = businessAuditRepository,
    private readonly chat: ChatFn = chatCompletion,
    private readonly n8n: N8nClient = triggerOutreachSend,
    limiter: ConcurrencyLimiter = new ConcurrencyLimiter(env.EMAIL_DRAFT_MAX_CONCURRENCY),
  ) {
    this.limiter = limiter;
  }

  /** Creates a PENDING draft and starts it in the background; returns immediately. */
  async start(businessId: string): Promise<EmailDraft> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new NotFoundError(`Business ${businessId} not found`);

    const audit = await this.audits.findLatestCompleted(businessId);
    if (!audit) {
      throw new UnprocessableError(
        'Business has no completed audit to draft from — run an audit first',
      );
    }

    const draft = await this.repo.create({
      businessId,
      businessAuditId: audit.id,
      status: 'PENDING',
      promptVersion: PROMPT_VERSION,
    });

    void this.limiter
      .run(() => this.execute(draft.id, business, audit))
      .catch((error: unknown) => {
        logger.error({ draftId: draft.id, err: error }, 'unhandled email draft execution error');
      });

    return draft;
  }

  async getById(id: string): Promise<EmailDraft> {
    const draft = await this.repo.findById(id);
    if (!draft) throw new NotFoundError(`Email draft ${id} not found`);
    return draft;
  }

  async listByBusiness(
    businessId: string,
    page: number,
    limit: number,
  ): Promise<EmailDraftListResult> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new NotFoundError(`Business ${businessId} not found`);

    const { items, total } = await this.repo.listByBusiness({
      businessId,
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  /** Triggers the n8n outreach-send workflow for a COMPLETED, unsent draft. */
  async send(draftId: string): Promise<SendResult> {
    const draft = await this.repo.findById(draftId);
    if (!draft) throw new NotFoundError(`Email draft ${draftId} not found`);
    if (draft.status !== 'COMPLETED') {
      throw new UnprocessableError('Only a completed draft can be sent');
    }

    const business = await this.businesses.findById(draft.businessId);
    if (!business) throw new NotFoundError(`Business ${draft.businessId} not found`);
    if (!business.email) {
      throw new UnprocessableError('Business has no email address configured');
    }

    const triggered = await this.n8n({
      businessId: draft.businessId,
      emailDraftId: draft.id,
      to: business.email,
      subject: draft.subject ?? '',
      body: draft.body ?? '',
    });

    return { draft, triggered };
  }

  private async execute(draftId: string, business: Business, audit: BusinessAudit): Promise<void> {
    const startedAt = new Date();
    await this.repo.update(draftId, { status: 'RUNNING', startedAt });
    logger.info({ draftId, businessId: business.id }, 'email draft started');

    try {
      const messages = buildEmailPrompt({
        businessContext: env.BUSINESS_CONTEXT,
        business: {
          name: business.name,
          industry: business.industry,
          country: business.country,
          city: business.city,
        },
        audit,
        tone: 'professional',
      });

      const { result, model, usage } = await callJsonWithRetry(
        this.chat,
        messages,
        emailResponseSchema,
        { temperature: 0.7, maxTokens: 2048 },
        buildRetryMessage,
      );
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const body = assembleEmailBody(env.OUTREACH_EMAIL_TEMPLATE, {
        opener: result.opener,
        senderName: env.OUTREACH_SENDER_NAME,
      });

      await this.repo.update(draftId, {
        status: 'COMPLETED',
        subject: result.subject,
        opener: result.opener,
        factUsed: result.factUsed ?? null,
        body,
        model,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        totalTokens: usage?.total_tokens ?? null,
        finishedAt,
        durationMs,
      });

      logger.info({ draftId, businessId: business.id, durationMs }, 'email draft completed');

      await this.promoteToEmailDrafted(business.id);
    } catch (error) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { draftId, businessId: business.id, durationMs, err: error },
        'email draft failed',
      );
      await this.repo.update(draftId, { status: 'FAILED', error: message, finishedAt, durationMs });
    }
  }

  /** Advances AUDITED -> EMAIL_DRAFTED (idempotent past AUDITED). */
  private async promoteToEmailDrafted(businessId: string): Promise<void> {
    const business = await this.businesses.findById(businessId);
    if (!business) return;
    if (business.status === 'AUDITED') {
      await this.businesses.update(businessId, { status: 'EMAIL_DRAFTED' });
    }
  }
}

export const emailDraftService = new EmailDraftService();
