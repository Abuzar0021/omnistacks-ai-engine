import { asyncHandler } from '../../lib/async-handler.js';
import { ValidationError } from '../../lib/errors.js';
import type { BusinessWithTags } from './businesses.repository.js';
import {
  businessIdParamSchema,
  createBusinessSchema,
  listBusinessesQuerySchema,
  updateBusinessSchema,
} from './businesses.schemas.js';
import { businessService } from './businesses.service.js';

/** API representation: tags flattened to names. */
function toBusinessDto(business: BusinessWithTags) {
  return { ...business, tags: business.tags.map((tag) => tag.name).sort() };
}

export const listBusinesses = asyncHandler(async (req, res) => {
  const query = listBusinessesQuerySchema.parse(req.query);
  const result = await businessService.list(query);
  res.json({
    data: result.items.map(toBusinessDto),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

export const getBusiness = asyncHandler(async (req, res) => {
  const { id } = businessIdParamSchema.parse(req.params);
  res.json({ data: toBusinessDto(await businessService.getById(id)) });
});

export const createBusiness = asyncHandler(async (req, res) => {
  const input = createBusinessSchema.parse(req.body);
  res.status(201).json({ data: toBusinessDto(await businessService.create(input)) });
});

export const updateBusiness = asyncHandler(async (req, res) => {
  const { id } = businessIdParamSchema.parse(req.params);
  const input = updateBusinessSchema.parse(req.body);
  res.json({ data: toBusinessDto(await businessService.update(id, input)) });
});

export const deleteBusiness = asyncHandler(async (req, res) => {
  const { id } = businessIdParamSchema.parse(req.params);
  await businessService.delete(id);
  res.status(204).end();
});

export const importBusinesses = asyncHandler(async (req, res) => {
  if (typeof req.body !== 'string') {
    throw new ValidationError('Import expects a text/csv request body');
  }
  const summary = await businessService.importCsv(req.body);
  res.status(200).json({ data: summary });
});
