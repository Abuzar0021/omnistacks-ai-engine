import type { Prisma, WebsiteAnalysis } from '@prisma/client';
import { env } from '../../config/env.js';
import { ConcurrencyLimiter } from '../../lib/concurrency-limiter.js';
import { NotFoundError, UnprocessableError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  businessRepository,
  type BusinessRepository,
} from '../businesses/businesses.repository.js';
import { captureWebsite } from './capture.js';
import { buildAnalysisResult } from './result-mapper.js';
import { saveScreenshot } from './screenshot-storage.js';
import { NavigationError } from './types.js';
import {
  websiteAnalysisRepository,
  type WebsiteAnalysisRepository,
} from './website-analyzer.repository.js';

export type CaptureFn = typeof captureWebsite;

export interface WebsiteAnalysisListResult {
  items: WebsiteAnalysis[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class WebsiteAnalysisService {
  private readonly limiter: ConcurrencyLimiter;

  constructor(
    private readonly repo: WebsiteAnalysisRepository = websiteAnalysisRepository,
    private readonly businesses: BusinessRepository = businessRepository,
    private readonly capture: CaptureFn = captureWebsite,
    limiter: ConcurrencyLimiter = new ConcurrencyLimiter(env.ANALYSIS_MAX_CONCURRENCY),
  ) {
    this.limiter = limiter;
  }

  /** Creates a PENDING analysis and starts it in the background; returns immediately. */
  async start(businessId: string): Promise<WebsiteAnalysis> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new NotFoundError(`Business ${businessId} not found`);
    if (!business.website) {
      throw new UnprocessableError('Business has no website to analyze');
    }

    const analysis = await this.repo.create({
      businessId,
      requestedUrl: business.website,
      status: 'PENDING',
    });

    const website = business.website;
    void this.limiter
      .run(() => this.execute(analysis.id, businessId, website))
      .catch((error: unknown) => {
        logger.error({ analysisId: analysis.id, err: error }, 'unhandled analysis execution error');
      });

    return analysis;
  }

  async getById(id: string): Promise<WebsiteAnalysis> {
    const analysis = await this.repo.findById(id);
    if (!analysis) throw new NotFoundError(`Website analysis ${id} not found`);
    return analysis;
  }

  async listByBusiness(
    businessId: string,
    page: number,
    limit: number,
  ): Promise<WebsiteAnalysisListResult> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new NotFoundError(`Business ${businessId} not found`);

    const { items, total } = await this.repo.listByBusiness({
      businessId,
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async getScreenshot(id: string): Promise<WebsiteAnalysis> {
    const analysis = await this.getById(id);
    if (!analysis.screenshotPath) {
      throw new NotFoundError(`Website analysis ${id} has no screenshot`);
    }
    return analysis;
  }

  private async execute(analysisId: string, businessId: string, url: string): Promise<void> {
    const startedAt = new Date();
    await this.repo.update(analysisId, { status: 'RUNNING', startedAt });
    logger.info({ analysisId, businessId, url }, 'website analysis started');

    try {
      const capture = await this.capture(url);
      const result = buildAnalysisResult(capture);
      const screenshot = await saveScreenshot(analysisId, capture.screenshot);
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      // The mapper's output is plain JSON-serializable data; TS can't verify
      // structural assignability to Prisma's Json input types without an
      // `unknown` hop (its object interfaces lack index signatures).
      await this.repo.update(analysisId, {
        status: 'COMPLETED',
        ...result,
        screenshotPath: screenshot.path,
        screenshotWidth: screenshot.width,
        screenshotHeight: screenshot.height,
        screenshotByteSize: screenshot.byteSize,
        screenshotMimeType: screenshot.mimeType,
        finishedAt,
        durationMs,
      } as unknown as Prisma.WebsiteAnalysisUncheckedUpdateInput);

      if (result.redirectCount > 0) {
        logger.info(
          {
            analysisId,
            requestedUrl: url,
            finalUrl: result.finalUrl,
            redirectCount: result.redirectCount,
          },
          'website analysis followed redirects',
        );
      }
      logger.info({ analysisId, businessId, durationMs }, 'website analysis completed');

      await this.promoteBusinessStatus(businessId);
    } catch (error) {
      await this.recordFailure(analysisId, businessId, url, startedAt, error);
    }
  }

  private async promoteBusinessStatus(businessId: string): Promise<void> {
    const business = await this.businesses.findById(businessId);
    if (business?.status === 'NEW') {
      await this.businesses.update(businessId, { status: 'ANALYZED' });
    }
  }

  private async recordFailure(
    analysisId: string,
    businessId: string,
    url: string,
    startedAt: Date,
    error: unknown,
  ): Promise<void> {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const message = error instanceof Error ? error.message : String(error);
    const category = error instanceof NavigationError ? error.category : 'UNKNOWN';

    if (category === 'TIMEOUT') {
      logger.warn({ analysisId, businessId, url, durationMs }, 'website analysis timed out');
    } else {
      logger.error(
        { analysisId, businessId, url, durationMs, category, err: error },
        'website analysis failed',
      );
    }

    await this.repo.update(analysisId, {
      status: 'FAILED',
      error: message,
      finishedAt,
      durationMs,
    });
  }
}

export const websiteAnalysisService = new WebsiteAnalysisService();
