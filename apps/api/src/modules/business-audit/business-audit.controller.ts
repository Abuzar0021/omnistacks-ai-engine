import { asyncHandler } from '../../lib/async-handler.js';
import {
  auditIdParamSchema,
  businessIdParamSchema,
  listAuditsQuerySchema,
} from './business-audit.schemas.js';
import { businessAuditService } from './business-audit.service.js';

export const startAudit = asyncHandler(async (req, res) => {
  const { businessId } = businessIdParamSchema.parse(req.params);
  const audit = await businessAuditService.start(businessId);
  res.status(202).json({ data: audit });
});

export const listAudits = asyncHandler(async (req, res) => {
  const { businessId } = businessIdParamSchema.parse(req.params);
  const { page, limit } = listAuditsQuerySchema.parse(req.query);
  const result = await businessAuditService.listByBusiness(businessId, page, limit);
  res.json({
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

/** Serves both "check status" and "retrieve results" — the same resource carries both. */
export const getAudit = asyncHandler(async (req, res) => {
  const { id } = auditIdParamSchema.parse(req.params);
  const audit = await businessAuditService.getById(id);
  res.json({ data: audit });
});
