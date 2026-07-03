import { Prisma, type BusinessStatus, type PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export type BusinessWithTags = Prisma.BusinessGetPayload<{ include: { tags: true } }>;

export interface BusinessListParams {
  where: Prisma.BusinessWhereInput;
  orderBy: Prisma.BusinessOrderByWithRelationInput;
  skip: number;
  take: number;
}

export interface BusinessRecord {
  name: string;
  website?: string | null;
  domain?: string | null;
  email?: string | null;
  phone?: string | null;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  status?: BusinessStatus;
  notes?: string | null;
}

/**
 * Data access for businesses/tags. All Prisma calls for the module live
 * here — services depend on this class, never on the Prisma client.
 */
export class BusinessRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(params: BusinessListParams): Promise<{ items: BusinessWithTags[]; total: number }> {
    const [items, total] = await this.db.$transaction([
      this.db.business.findMany({
        where: params.where,
        orderBy: params.orderBy,
        skip: params.skip,
        take: params.take,
        include: { tags: true },
      }),
      this.db.business.count({ where: params.where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<BusinessWithTags | null> {
    return this.db.business.findUnique({ where: { id }, include: { tags: true } });
  }

  findByDomain(domain: string): Promise<BusinessWithTags | null> {
    return this.db.business.findUnique({ where: { domain }, include: { tags: true } });
  }

  /** Returns the subset of the given domains that already exist. */
  async findExistingDomains(domains: string[]): Promise<Set<string>> {
    if (domains.length === 0) return new Set();
    const rows = await this.db.business.findMany({
      where: { domain: { in: domains } },
      select: { domain: true },
    });
    return new Set(rows.map((row) => row.domain).filter((d): d is string => d !== null));
  }

  create(data: BusinessRecord, tagNames: string[] = []): Promise<BusinessWithTags> {
    return this.db.business.create({
      data: { ...data, tags: connectOrCreateTags(tagNames) },
      include: { tags: true },
    });
  }

  update(
    id: string,
    data: Prisma.BusinessUpdateInput,
    tagNames?: string[],
  ): Promise<BusinessWithTags> {
    return this.db.business.update({
      where: { id },
      data: {
        ...data,
        ...(tagNames !== undefined ? { tags: { set: [], ...connectOrCreateTags(tagNames) } } : {}),
      },
      include: { tags: true },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.business.delete({ where: { id } });
  }

  /** Bulk insert for CSV import. skipDuplicates guards against races on domain. */
  async createMany(rows: BusinessRecord[]): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await this.db.business.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }
}

function connectOrCreateTags(names: string[]) {
  if (names.length === 0) return undefined;
  return {
    connectOrCreate: names.map((name) => ({ where: { name }, create: { name } })),
  };
}

export const businessRepository = new BusinessRepository();
