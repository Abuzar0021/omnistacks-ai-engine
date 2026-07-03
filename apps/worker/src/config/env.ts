import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load .env from the workspace directory or the repo root (first match wins).
config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  PLAYWRIGHT_HEADLESS: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
