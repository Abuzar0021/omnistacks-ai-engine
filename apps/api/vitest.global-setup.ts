import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './vitest.config.js';

/** Applies migrations to the test database before the suite runs. */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });
}
