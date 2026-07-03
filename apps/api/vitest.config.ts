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
    },
  },
});
