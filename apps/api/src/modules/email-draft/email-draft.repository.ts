import type { EmailDraft, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export interface EmailDraftListParams {
  businessId: string;
  skip: number;
  take: number;
}

/** Data access for email drafts. All Prisma calls for the module live here. */
export class EmailDraftRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  create(data: Prisma.EmailDraftUncheckedCreateInput): Promise<EmailDraft> {
    return this.db.emailDraft.create({ data });
  }

  findById(id: string): Promise<EmailDraft | null> {
    return this.db.emailDraft.findUnique({ where: { id } });
  }

  async listByBusiness(
    params: EmailDraftListParams,
  ): Promise<{ items: EmailDraft[]; total: number }> {
    const where = { businessId: params.businessId };
    const [items, total] = await this.db.$transaction([
      this.db.emailDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.db.emailDraft.count({ where }),
    ]);
    return { items, total };
  }

  update(id: string, data: Prisma.EmailDraftUncheckedUpdateInput): Promise<EmailDraft> {
    return this.db.emailDraft.update({ where: { id }, data });
  }
}

export const emailDraftRepository = new EmailDraftRepository();
