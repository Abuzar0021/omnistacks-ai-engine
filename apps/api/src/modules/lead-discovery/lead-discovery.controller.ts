import { asyncHandler } from '../../lib/async-handler.js';
import {
  jobIdParamSchema,
  listJobsQuerySchema,
  startDiscoverySchema,
} from './lead-discovery.schemas.js';
import { leadDiscoveryService } from './lead-discovery.service.js';

export const startDiscovery = asyncHandler(async (req, res) => {
  const input = startDiscoverySchema.parse(req.body);
  const job = await leadDiscoveryService.start(input);
  res.status(202).json({ data: job });
});

export const listDiscoveryJobs = asyncHandler(async (req, res) => {
  const { page, limit } = listJobsQuerySchema.parse(req.query);
  const result = await leadDiscoveryService.list(page, limit);
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
export const getDiscoveryJob = asyncHandler(async (req, res) => {
  const { id } = jobIdParamSchema.parse(req.params);
  const job = await leadDiscoveryService.getById(id);
  res.json({ data: job });
});
