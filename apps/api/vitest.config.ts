import { defineConfig } from 'vitest/config';

export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://omnistacks:omnistacks@localhost:5432/omnistacks_test';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './vitest.global-setup.ts',
    // Integration tests share one database — keep files serial.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testDatabaseUrl,
      SCREENSHOT_STORAGE_DIR: './storage/test-screenshots',
      ANALYSIS_NAVIGATION_TIMEOUT_MS: '3000',
      ANALYSIS_STABLE_TIMEOUT_MS: '500',
      LEAD_DISCOVERY_NAVIGATION_TIMEOUT_MS: '3000',
      // Unreachable by default so tests never hit the real internet; tests that
      // need real scraping pass an explicit baseUrl to scrapeBusinesses(),
      // which overrides this (see lead-discovery/scraper.integration.test.ts).
      YELP_BASE_URL: 'http://127.0.0.1:1',
    },
    // Real Playwright navigations + polling for async analysis completion.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
