import { z } from 'zod';

export const businessIdParamSchema = z.object({
  businessId: z.string().min(1),
});

export const analysisIdParamSchema = z.object({
  id: z.string().min(1),
});

export const listAnalysesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export type ListAnalysesQuery = z.infer<typeof listAnalysesQuerySchema>;
