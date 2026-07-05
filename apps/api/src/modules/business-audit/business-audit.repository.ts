import type { BusinessAudit, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export interface BusinessAuditListParams {
  businessId: string;
  skip: number;
  take: number;
}

/** Data access for business audits. All Prisma calls for the module live here. */
export class BusinessAuditRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  create(data: Prisma.BusinessAuditUncheckedCreateInput): Promise<BusinessAudit> {
    return this.db.businessAudit.create({ data });
  }

  findById(id: string): Promise<BusinessAudit | null> {
    return this.db.businessAudit.findUnique({ where: { id } });
  }

  /** Most recent successfully completed audit for a business, if any. */
  findLatestCompleted(businessId: string): Promise<BusinessAudit | null> {
    return this.db.businessAudit.findFirst({
      where: { businessId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listByBusiness(
    params: BusinessAuditListParams,
  ): Promise<{ items: BusinessAudit[]; total: number }> {
    const where = { businessId: params.businessId };
    const [items, total] = await this.db.$transaction([
      this.db.businessAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.db.businessAudit.count({ where }),
    ]);
    return { items, total };
  }

  update(id: string, data: Prisma.BusinessAuditUncheckedUpdateInput): Promise<BusinessAudit> {
    return this.db.businessAudit.update({ where: { id }, data });
  }
}

export const businessAuditRepository = new BusinessAuditRepository();
