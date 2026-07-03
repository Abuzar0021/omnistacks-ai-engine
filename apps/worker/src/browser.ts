import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { env } from './config/env.js';

/**
 * Launches a Chromium instance for scraping jobs.
 * Job implementations (in src/jobs/) should obtain browsers through this
 * helper so launch behaviour stays consistent across the worker.
 */
export async function launchBrowser(options: LaunchOptions = {}): Promise<Browser> {
  return chromium.launch({
    headless: env.PLAYWRIGHT_HEADLESS,
    ...options,
  });
}
