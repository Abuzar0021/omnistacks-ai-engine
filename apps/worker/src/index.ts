import { env } from './config/env.js';

/**
 * Worker entrypoint.
 *
 * TODO (business logic — intentionally not implemented in the scaffold):
 *   - Poll the ScrapeJob table for PENDING jobs.
 *   - Dispatch jobs to handlers in src/jobs/ (scraping via src/browser.ts,
 *     enrichment via OpenRouter, etc.).
 *   - Persist results and update job status.
 */
async function main(): Promise<void> {
  console.log(
    `[worker] OmniStacks worker started (env=${env.NODE_ENV}, concurrency=${env.WORKER_CONCURRENCY})`,
  );
  console.log('[worker] No job handlers registered yet — idle.');

  // Keep the process alive until job polling is implemented.
  const heartbeat = setInterval(() => {
    console.log('[worker] heartbeat');
  }, 60_000);

  const shutdown = (signal: string): void => {
    console.log(`[worker] Received ${signal}, shutting down...`);
    clearInterval(heartbeat);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[worker] Fatal error:', error);
  process.exit(1);
});
