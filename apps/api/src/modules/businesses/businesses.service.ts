import type { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  businessRepository,
  type BusinessRepository,
  type BusinessWithTags,
} from './businesses.repository.js';
import type {
  CreateBusinessInput,
  ListBusinessesQuery,
  UpdateBusinessInput,
} from './businesses.schemas.js';
import { analyzeCsv, type CsvDuplicate, type CsvRowError } from './csv-import.js';
import { normalizeDomain } from './domain.js';

export interface BusinessListResult {
  items: BusinessWithTags[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ImportSummary {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: CsvRowError[];
  duplicates: CsvDuplicate[];
}

export class BusinessService {
  constructor(private readonly repo: BusinessRepository = businessRepository) {}

  async list(query: ListBusinessesQuery): Promise<BusinessListResult> {
    const where: Prisma.BusinessWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.industry) where.industry = { equals: query.industry, mode: 'insensitive' };
    if (query.country) where.country = { equals: query.country, mode: 'insensitive' };
    if (query.tag) where.tags = { some: { name: { equals: query.tag, mode: 'insensitive' } } };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { domain: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { city: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const descending = query.sort.startsWith('-');
    const sortField = descending ? query.sort.slice(1) : query.sort;
    const orderBy = { [sortField]: descending ? 'desc' : 'asc' };

    const { items, total } = await this.repo.list({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async getById(id: string): Promise<BusinessWithTags> {
    const business = await this.repo.findById(id);
    if (!business) throw new NotFoundError(`Business ${id} not found`);
    return business;
  }

  async create(input: CreateBusinessInput): Promise<BusinessWithTags> {
    const domain = this.resolveDomain(input.website);
    if (domain) await this.assertDomainAvailable(domain);

    const { tags, website, ...fields } = input;
    const created = await this.repo.create(
      { ...fields, website: website ?? null, domain },
      normalizeTags(tags),
    );
    logger.info({ businessId: created.id, domain }, 'business created');
    return created;
  }

  async update(id: string, input: UpdateBusinessInput): Promise<BusinessWithTags> {
    const existing = await this.getById(id);

    const data: Prisma.BusinessUpdateInput = {};
    for (const field of [
      'name',
      'email',
      'phone',
      'industry',
      'country',
      'city',
      'status',
      'notes',
    ] as const) {
      if (Object.hasOwn(input, field)) {
        data[field] = input[field] as never;
      }
    }

    if (Object.hasOwn(input, 'website')) {
      const domain = this.resolveDomain(input.website);
      if (domain && domain !== existing.domain) await this.assertDomainAvailable(domain);
      data.website = input.website ?? null;
      data.domain = domain;
    }

    const tagNames = Object.hasOwn(input, 'tags') ? normalizeTags(input.tags) : undefined;
    const updated = await this.repo.update(id, data, tagNames);
    logger.info({ businessId: id, fields: Object.keys(input) }, 'business updated');
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    await this.repo.delete(id);
    logger.info({ businessId: id }, 'business deleted');
  }

  async importCsv(csvText: string): Promise<ImportSummary> {
    const startedAt = Date.now();
    const analysis = analyzeCsv(csvText);

    const domains = analysis.candidates
      .map((candidate) => candidate.domain)
      .filter((domain): domain is string => domain !== null);
    const existingDomains = await this.repo.findExistingDomains(domains);

    const duplicates = [...analysis.duplicates];
    const toInsert = analysis.candidates.filter((candidate) => {
      if (candidate.domain && existingDomains.has(candidate.domain)) {
        duplicates.push({ row: candidate.row, domain: candidate.domain, reason: 'already_exists' });
        return false;
      }
      return true;
    });

    const imported = await this.repo.createMany(toInsert.map((candidate) => candidate.data));

    const summary: ImportSummary = {
      totalRows: analysis.totalRows,
      imported,
      skipped: analysis.totalRows - imported,
      errors: analysis.errors,
      duplicates: duplicates.sort((a, b) => a.row - b.row),
    };

    logger.info(
      {
        totalRows: summary.totalRows,
        imported: summary.imported,
        skipped: summary.skipped,
        invalidRows: summary.errors.length,
        duplicateRows: summary.duplicates.length,
        durationMs: Date.now() - startedAt,
      },
      'csv import completed',
    );
    if (summary.errors.length > 0) {
      logger.debug({ errors: summary.errors }, 'csv import row errors');
    }

    return summary;
  }

  /** Derives the canonical domain from a website value; throws on unusable input. */
  private resolveDomain(website: string | null | undefined): string | null {
    if (website === null || website === undefined) return null;
    const domain = normalizeDomain(website);
    if (!domain) {
      throw new ValidationError('Request validation failed', [
        { path: 'website', message: `Invalid website URL: "${website}"` },
      ]);
    }
    return domain;
  }

  private async assertDomainAvailable(domain: string): Promise<void> {
    const existing = await this.repo.findByDomain(domain);
    if (existing) {
      throw new ConflictError(`A business with domain "${domain}" already exists`);
    }
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== ''))];
}

export const businessService = new BusinessService();
