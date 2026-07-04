import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load .env from the workspace directory or the repo root (first match wins).
config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().default('change-me'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-sonnet-4.5'),

  // Business audits (docs/PROMPTS.md "business-audit-v1")
  BUSINESS_CONTEXT: z
    .string()
    .default(
      'We help small and mid-sized businesses improve their website, SEO, and online presence. Ideal customers have an outdated or underperforming website and no in-house web/marketing team.',
    ),
  AUDIT_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),

  // Website analyzer (Playwright-driven data collection)
  PLAYWRIGHT_HEADLESS: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
  PLAYWRIGHT_BROWSERS_PATH: z.string().optional(),
  ANALYSIS_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
  ANALYSIS_NAVIGATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  ANALYSIS_STABLE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  SCREENSHOT_STORAGE_DIR: z.string().default('./storage/screenshots'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
