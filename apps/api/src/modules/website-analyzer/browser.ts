import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

/**
 * Falls back to any chromium build under PLAYWRIGHT_BROWSERS_PATH if the
 * exact build this Playwright version expects isn't present. A no-op in
 * normal deployments (the pinned build always matches there); only matters
 * in environments that pre-seed a browser cache from a different Playwright
 * version.
 */
function resolveExecutablePath(): string | undefined {
  const expected = chromium.executablePath();
  if (existsSync(expected)) return undefined;

  const browsersPath = env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersPath || !existsSync(browsersPath)) return undefined;

  const candidate = readdirSync(browsersPath)
    .filter((entry) => entry.startsWith('chromium-'))
    .sort()
    .reverse()
    .map((entry) => join(browsersPath, entry, 'chrome-linux', 'chrome'))
    .find((path) => existsSync(path));

  if (candidate) {
    logger.warn(
      { expected, candidate },
      'pinned chromium build missing; falling back to discovered build',
    );
  }
  return candidate;
}

/**
 * Launches a Chromium instance for website analysis.
 * All Playwright browser launches in this module go through this helper so
 * launch behaviour (headless mode, executable resolution) stays consistent.
 */
export async function launchBrowser(options: LaunchOptions = {}): Promise<Browser> {
  return chromium.launch({
    headless: env.PLAYWRIGHT_HEADLESS,
    executablePath: resolveExecutablePath(),
    ...options,
  });
}
