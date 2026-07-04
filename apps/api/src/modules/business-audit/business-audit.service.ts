import type { Business, BusinessAudit, Prisma, WebsiteAnalysis } from '@prisma/client';
import { env } from '../../config/env.js';
import { ConcurrencyLimiter } from '../../lib/concurrency-limiter.js';
import { NotFoundError, UnprocessableError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { chatCompletion, type ChatMessage } from '../../lib/openrouter.js';
import {
  businessRepository,
  type BusinessRepository,
} from '../businesses/businesses.repository.js';
import {
  websiteAnalysisRepository,
  type WebsiteAnalysisRepository,
} from '../website-analyzer/website-analyzer.repository.js';
import {
  auditResponseSchema,
  buildAuditPrompt,
  buildRetryMessage,
  PROMPT_VERSION,
  type AuditResponse,
} from './prompt.js';
import {
  businessAuditRepository,
  type BusinessAuditRepository,
} from './business-audit.repository.js';

export type ChatFn = typeof chatCompletion;

export interface BusinessAuditListResult {
  items: BusinessAudit[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ModelCallResult {
  result: AuditResponse;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

const MAX_ATTEMPTS = 2;

export class BusinessAuditService {
  private readonly limiter: ConcurrencyLimiter;

  constructor(
    private readonly repo: BusinessAuditRepository = businessAuditRepository,
    private readonly businesses: BusinessRepository = businessRepository,
    private readonly analyses: WebsiteAnalysisRepository = websiteAnalysisRepository,
    private readonly chat: ChatFn = chatCompletion,
    limiter: ConcurrencyLimiter = new ConcurrencyLimiter(env.AUDIT_MAX_CONCURRENCY),
  ) {
    this.limiter = limiter;
  }

  /** Creates a PENDING audit and starts it in the background; returns immediately. */
  async start(businessId: string): Promise<BusinessAudit> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new NotFoundError(`Business ${businessId} not found`);

    const analysis = await this.analyses.findLatestCompleted(businessId);
    if (!analysis) {
      throw new UnprocessableError(
        'Business has no completed website analysis to audit — run an analysis first',
      );
    }

    const audit = await this.repo.create({
      businessId,
      websiteAnalysisId: analysis.id,
      status: 'PENDING',
      promptVersion: PROMPT_VERSION,
    });

    void this.limiter
      .run(() => this.execute(audit.id, business, analysis))
      .catch((error: unknown) => {
        logger.error({ auditId: audit.id, err: error }, 'unhandled audit execution error');
      });

    return audit;
  }

  async getById(id: string): Promise<BusinessAudit> {
    const audit = await this.repo.findById(id);
    if (!audit) throw new NotFoundError(`Business audit ${id} not found`);
    return audit;
  }

  async listByBusiness(
    businessId: string,
    page: number,
    limit: number,
  ): Promise<BusinessAuditListResult> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new NotFoundError(`Business ${businessId} not found`);

    const { items, total } = await this.repo.listByBusiness({
      businessId,
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  private async execute(
    auditId: string,
    business: Business,
    analysis: WebsiteAnalysis,
  ): Promise<void> {
    const startedAt = new Date();
    await this.repo.update(auditId, { status: 'RUNNING', startedAt });
    logger.info({ auditId, businessId: business.id }, 'business audit started');

    try {
      const messages = buildAuditPrompt({
        businessContext: env.BUSINESS_CONTEXT,
        business: {
          name: business.name,
          industry: business.industry,
          country: business.country,
          city: business.city,
        },
        analysis,
      });

      const { result, model, usage } = await this.callWithRetry(messages);
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      await this.repo.update(auditId, {
        status: 'COMPLETED',
        summary: result.summary,
        findings: result.findings,
        score: result.score,
        confidence: result.confidence,
        reasons: result.reasons,
        disqualifiers: result.disqualifiers ?? [],
        model,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        totalTokens: usage?.total_tokens ?? null,
        finishedAt,
        durationMs,
      } as unknown as Prisma.BusinessAuditUncheckedUpdateInput);

      logger.info(
        { auditId, businessId: business.id, score: result.score, durationMs },
        'business audit completed',
      );

      await this.recordScore(business.id, result.score);
    } catch (error) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { auditId, businessId: business.id, durationMs, err: error },
        'business audit failed',
      );
      await this.repo.update(auditId, { status: 'FAILED', error: message, finishedAt, durationMs });
    }
  }

  /** Calls the model, validates the JSON response, and retries once on failure. */
  private async callWithRetry(initialMessages: ChatMessage[]): Promise<ModelCallResult> {
    let messages = initialMessages;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await this.chat(messages, { temperature: 0, maxTokens: 1024 });
      const content = response.choices[0]?.message.content ?? '';

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (cause) {
        if (attempt < MAX_ATTEMPTS) {
          const message = cause instanceof Error ? cause.message : String(cause);
          messages = [...messages, buildRetryMessage(`Response was not valid JSON: ${message}`)];
          continue;
        }
        throw new Error('Model returned invalid JSON after retry — never stored');
      }

      const validated = auditResponseSchema.safeParse(parsed);
      if (!validated.success) {
        if (attempt < MAX_ATTEMPTS) {
          messages = [...messages, buildRetryMessage(validated.error.message)];
          continue;
        }
        throw new Error('Model response failed schema validation after retry — never stored');
      }

      return { result: validated.data, model: response.model, usage: response.usage };
    }

    // Unreachable: the loop always returns or throws on its final iteration.
    throw new Error('Model call exhausted retries without a result');
  }

  /** Denormalizes the score and advances ANALYZED -> AUDITED (idempotent past ANALYZED). */
  private async recordScore(businessId: string, score: number): Promise<void> {
    const business = await this.businesses.findById(businessId);
    if (!business) return;

    const data: Prisma.BusinessUpdateInput = { score };
    if (business.status === 'ANALYZED') data.status = 'AUDITED';
    await this.businesses.update(businessId, data);
  }
}

export const businessAuditService = new BusinessAuditService();
