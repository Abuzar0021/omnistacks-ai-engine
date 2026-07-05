import type { LeadDiscoveryJob, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export interface ListJobsParams {
  skip: number;
  take: number;
}

/** Data access for lead-discovery jobs. All Prisma calls for the module live here. */
export class LeadDiscoveryRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  create(data: Prisma.LeadDiscoveryJobUncheckedCreateInput): Promise<LeadDiscoveryJob> {
    return this.db.leadDiscoveryJob.create({ data });
  }

  findById(id: string): Promise<LeadDiscoveryJob | null> {
    return this.db.leadDiscoveryJob.findUnique({ where: { id } });
  }

  async list(params: ListJobsParams): Promise<{ items: LeadDiscoveryJob[]; total: number }> {
    const [items, total] = await this.db.$transaction([
      this.db.leadDiscoveryJob.findMany({
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.db.leadDiscoveryJob.count(),
    ]);
    return { items, total };
  }

  update(id: string, data: Prisma.LeadDiscoveryJobUncheckedUpdateInput): Promise<LeadDiscoveryJob> {
    return this.db.leadDiscoveryJob.update({ where: { id }, data });
  }
}

export const leadDiscoveryRepository = new LeadDiscoveryRepository();
