import type { LeadDiscoveryJob } from '@prisma/client';
import { env } from '../../config/env.js';
import { ConcurrencyLimiter } from '../../lib/concurrency-limiter.js';
import { NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  businessRepository,
  type BusinessRepository,
  type BusinessRecord,
} from '../businesses/businesses.repository.js';
import { normalizeDomain } from '../businesses/domain.js';
import {
  leadDiscoveryRepository,
  type LeadDiscoveryRepository,
} from './lead-discovery.repository.js';
import type { StartDiscoveryInput } from './lead-discovery.schemas.js';
import { scrapeBusinesses, type ScrapedBusiness } from './scraper.js';

export type ScrapeFn = typeof scrapeBusinesses;

export interface LeadDiscoveryListResult {
  items: LeadDiscoveryJob[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PersistResult {
  createdCount: number;
  duplicateCount: number;
}

export class LeadDiscoveryService {
  private readonly limiter: ConcurrencyLimiter;

  constructor(
    private readonly repo: LeadDiscoveryRepository = leadDiscoveryRepository,
    private readonly businesses: BusinessRepository = businessRepository,
    private readonly scrape: ScrapeFn = scrapeBusinesses,
    limiter: ConcurrencyLimiter = new ConcurrencyLimiter(env.LEAD_DISCOVERY_MAX_CONCURRENCY),
  ) {
    this.limiter = limiter;
  }

  /** Creates a PENDING job and starts it in the background; returns immediately. */
  async start(input: StartDiscoveryInput): Promise<LeadDiscoveryJob> {
    const job = await this.repo.create({
      status: 'PENDING',
      industry: input.industry,
      location: input.location,
      country: input.country ?? null,
      limit: input.limit,
    });

    void this.limiter
      .run(() => this.execute(job.id, input))
      .catch((error: unknown) => {
        logger.error({ jobId: job.id, err: error }, 'unhandled lead discovery execution error');
      });

    return job;
  }

  async getById(id: string): Promise<LeadDiscoveryJob> {
    const job = await this.repo.findById(id);
    if (!job) throw new NotFoundError(`Lead discovery job ${id} not found`);
    return job;
  }

  async list(page: number, limit: number): Promise<LeadDiscoveryListResult> {
    const { items, total } = await this.repo.list({ skip: (page - 1) * limit, take: limit });
    return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  private async execute(jobId: string, input: StartDiscoveryInput): Promise<void> {
    const startedAt = new Date();
    await this.repo.update(jobId, { status: 'RUNNING', startedAt });
    logger.info(
      { jobId, industry: input.industry, location: input.location },
      'lead discovery started',
    );

    try {
      const scraped = await this.scrape({
        industry: input.industry,
        location: input.location,
        limit: input.limit,
      });

      const { createdCount, duplicateCount } = await this.persist(
        scraped,
        input.industry,
        input.country ?? null,
        input.location,
      );

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      await this.repo.update(jobId, {
        status: 'COMPLETED',
        foundCount: scraped.length,
        createdCount,
        duplicateCount,
        finishedAt,
        durationMs,
      });
      logger.info(
        { jobId, foundCount: scraped.length, createdCount, duplicateCount, durationMs },
        'lead discovery completed',
      );
    } catch (error) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ jobId, err: error, durationMs }, 'lead discovery failed');
      await this.repo.update(jobId, { status: 'FAILED', error: message, finishedAt, durationMs });
    }
  }

  /** Dedupes by domain (same rule CSV import uses) and bulk-inserts new NEW businesses. */
  private async persist(
    scraped: ScrapedBusiness[],
    industry: string,
    country: string | null,
    location: string,
  ): Promise<PersistResult> {
    const candidates: BusinessRecord[] = scraped
      .filter((business) => business.name.trim() !== '')
      .map((business) => ({
        name: business.name,
        website: business.website,
        domain: normalizeDomain(business.website),
        phone: business.phone,
        industry,
        country,
        city: business.city,
        notes: `Discovered via lead search (industry: ${industry}, location: ${location})`,
      }));

    const withDomain = candidates.filter(
      (candidate): candidate is BusinessRecord & { domain: string } => candidate.domain !== null,
    );
    const withoutDomain = candidates.filter((candidate) => candidate.domain === null);

    const existingDomains = await this.businesses.findExistingDomains(
      withDomain.map((candidate) => candidate.domain),
    );
    const duplicates = withDomain.filter((candidate) => existingDomains.has(candidate.domain));
    const toInsert = [
      ...withDomain.filter((candidate) => !existingDomains.has(candidate.domain)),
      ...withoutDomain,
    ];

    const createdCount = await this.businesses.createMany(toInsert);
    return { createdCount, duplicateCount: duplicates.length };
  }
}

export const leadDiscoveryService = new LeadDiscoveryService();
