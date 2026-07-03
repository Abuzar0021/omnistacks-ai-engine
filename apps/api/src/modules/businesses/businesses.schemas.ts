import { BusinessStatus } from '@prisma/client';
import { z } from 'zod';

/** Treats '' (or whitespace-only) as null so cleared form fields clear the column. */
function emptyAsNull<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    schema,
  );
}

export const businessStatusSchema = z.nativeEnum(BusinessStatus);

export const createBusinessSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    website: emptyAsNull(z.string().trim().max(2048).nullish()),
    email: emptyAsNull(z.string().trim().email('Invalid email').max(320).nullish()),
    phone: emptyAsNull(z.string().trim().max(50).nullish()),
    industry: emptyAsNull(z.string().trim().max(120).nullish()),
    country: emptyAsNull(z.string().trim().max(120).nullish()),
    city: emptyAsNull(z.string().trim().max(120).nullish()),
    status: businessStatusSchema.optional(),
    notes: emptyAsNull(z.string().trim().max(10_000).nullish()),
    tags: z.array(z.string().trim().min(1).max(60)).max(25).optional(),
  })
  .strict();

export const updateBusinessSchema = createBusinessSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const businessIdParamSchema = z.object({
  id: z.string().min(1),
});

const SORTABLE = ['name', 'createdAt', 'updatedAt', 'status'] as const;
const SORT_VALUES = SORTABLE.flatMap((field) => [field, `-${field}`] as const);

export const listBusinessesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(SORT_VALUES as [string, ...string[]]).default('-createdAt'),
  status: businessStatusSchema.optional(),
  industry: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().min(1).max(120).optional(),
  tag: z.string().trim().min(1).max(60).optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

/**
 * One CSV data row (headers are lowercased by the parser). Unknown columns
 * are ignored; empty strings mean "not provided". `status` accepts any case.
 */
export const csvRowSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  website: emptyAsNull(z.string().trim().max(2048).nullish()),
  email: emptyAsNull(z.string().trim().email('Invalid email').max(320).nullish()),
  phone: emptyAsNull(z.string().trim().max(50).nullish()),
  industry: emptyAsNull(z.string().trim().max(120).nullish()),
  country: emptyAsNull(z.string().trim().max(120).nullish()),
  city: emptyAsNull(z.string().trim().max(120).nullish()),
  status: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() !== ''
        ? value
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, '_')
        : undefined,
    businessStatusSchema.optional(),
  ),
  notes: emptyAsNull(z.string().trim().max(10_000).nullish()),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type ListBusinessesQuery = z.infer<typeof listBusinessesQuerySchema>;
export type CsvRow = z.infer<typeof csvRowSchema>;
