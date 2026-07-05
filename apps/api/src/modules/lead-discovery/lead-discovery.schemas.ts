import { z } from 'zod';

export const MAX_DISCOVERY_LIMIT = 50;

export const startDiscoverySchema = z.object({
  industry: z.string().trim().min(1, 'Industry is required').max(120),
  location: z.string().trim().min(1, 'Location is required').max(120),
  country: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_DISCOVERY_LIMIT).default(20),
});

export const jobIdParamSchema = z.object({
  id: z.string().min(1),
});

export const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export type StartDiscoveryInput = z.infer<typeof startDiscoverySchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
