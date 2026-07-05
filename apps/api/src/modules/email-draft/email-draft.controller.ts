import { asyncHandler } from '../../lib/async-handler.js';
import {
  businessIdParamSchema,
  draftIdParamSchema,
  listDraftsQuerySchema,
} from './email-draft.schemas.js';
import { emailDraftService } from './email-draft.service.js';

export const startDraft = asyncHandler(async (req, res) => {
  const { businessId } = businessIdParamSchema.parse(req.params);
  const draft = await emailDraftService.start(businessId);
  res.status(202).json({ data: draft });
});

export const listDrafts = asyncHandler(async (req, res) => {
  const { businessId } = businessIdParamSchema.parse(req.params);
  const { page, limit } = listDraftsQuerySchema.parse(req.query);
  const result = await emailDraftService.listByBusiness(businessId, page, limit);
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
export const getDraft = asyncHandler(async (req, res) => {
  const { id } = draftIdParamSchema.parse(req.params);
  const draft = await emailDraftService.getById(id);
  res.json({ data: draft });
});

export const sendDraft = asyncHandler(async (req, res) => {
  const { id } = draftIdParamSchema.parse(req.params);
  const { draft, triggered } = await emailDraftService.send(id);
  res.status(202).json({ data: draft, triggered });
});
