import type { Prisma, PrismaClient, WebsiteAnalysis } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export interface WebsiteAnalysisListParams {
  businessId: string;
  skip: number;
  take: number;
}

/** Data access for website analyses. All Prisma calls for the module live here. */
export class WebsiteAnalysisRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  create(data: Prisma.WebsiteAnalysisUncheckedCreateInput): Promise<WebsiteAnalysis> {
    return this.db.websiteAnalysis.create({ data });
  }

  findById(id: string): Promise<WebsiteAnalysis | null> {
    return this.db.websiteAnalysis.findUnique({ where: { id } });
  }

  /** Most recent successfully completed analysis for a business, if any. */
  findLatestCompleted(businessId: string): Promise<WebsiteAnalysis | null> {
    return this.db.websiteAnalysis.findFirst({
      where: { businessId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listByBusiness(
    params: WebsiteAnalysisListParams,
  ): Promise<{ items: WebsiteAnalysis[]; total: number }> {
    const where = { businessId: params.businessId };
    const [items, total] = await this.db.$transaction([
      this.db.websiteAnalysis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.db.websiteAnalysis.count({ where }),
    ]);
    return { items, total };
  }

  update(id: string, data: Prisma.WebsiteAnalysisUncheckedUpdateInput): Promise<WebsiteAnalysis> {
    return this.db.websiteAnalysis.update({ where: { id }, data });
  }
}

export const websiteAnalysisRepository = new WebsiteAnalysisRepository();
